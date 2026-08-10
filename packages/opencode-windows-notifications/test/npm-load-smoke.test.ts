import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { test } from "bun:test"

import {
  startLoopbackRegistry,
  type RegistryPackage,
} from "./fixtures/opencode-json-load/loopback-registry.js"

const PACKAGE_NAME = "opencode-windows-notifications"
const OPENCODE_VERSION = "1.18.16"
const PACKAGE_SPEC = `${PACKAGE_NAME}@latest`
const packageRoot = resolve(import.meta.dir, "..")

type CommandResult = Readonly<{
  exitCode: number
  stdout: string
  stderr: string
}>

function gateBlocked(reason: string, evidence = ""): never {
  const suffix = evidence.trim() ? `\n${evidence.trim()}` : ""
  throw new Error(`GATE BLOCKED: ${reason}${suffix}`)
}

function hash(algorithm: "sha1" | "sha256" | "sha512", bytes: Uint8Array) {
  const hasher = new Bun.CryptoHasher(algorithm)
  hasher.update(bytes)
  return hasher.digest("hex")
}

function countOccurrences(text: string, value: string): number {
  if (!value) return 0
  return text.split(value).length - 1
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === "" || (
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !resolve(pathFromRoot).startsWith(sep)
  )
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe")
    const killer = Bun.spawn([taskkill, "/PID", String(pid), "/T", "/F"], {
      stdout: "ignore",
      stderr: "ignore",
    })
    await killer.exited
    return
  }

  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    // The process may already have exited.
  }
}

async function run(
  command: readonly string[],
  options: Readonly<{
    cwd: string
    env?: Record<string, string>
    timeoutMs?: number
  }>,
): Promise<CommandResult> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
    ...(process.platform !== "win32" ? { detached: true } : {}),
  })
  const stdoutPromise = new Response(child.stdout).text()
  const stderrPromise = new Response(child.stderr).text()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const exitCode = await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("process timeout")), options.timeoutMs ?? 30_000)
      }),
    ])
    return {
      exitCode,
      stdout: await stdoutPromise,
      stderr: await stderrPromise,
    }
  } catch (error) {
    await terminateProcessTree(child.pid)
    await child.exited.catch(() => undefined)
    const stdout = await stdoutPromise.catch(() => "")
    const stderr = await stderrPromise.catch(() => "")
    gateBlocked(
      `real OpenCode process did not terminate safely: ${error instanceof Error ? error.message : String(error)}`,
      `${stdout}\n${stderr}`,
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readTarEntry(
  tar: string,
  tarball: string,
  entry: string,
): Promise<Uint8Array> {
  const result = await run([tar, "-xOf", tarball, entry], {
    cwd: packageRoot,
    timeoutMs: 15_000,
  })
  if (result.exitCode !== 0) {
    gateBlocked(`candidate tarball entry ${entry} is unreadable`, result.stderr)
  }
  return Buffer.from(result.stdout)
}

type PackageManifest = Readonly<Record<string, unknown>> & Readonly<{
  name: string
  version: string
}>

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isUnknownRecord(value) && Object.values(value).every((entry) => typeof entry === "string")
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return isUnknownRecord(value) &&
    typeof value.name === "string" && value.name.length > 0 &&
    typeof value.version === "string" && value.version.length > 0
}

function requirePackageManifest(value: unknown, source: string): PackageManifest {
  if (!isPackageManifest(value)) {
    gateBlocked(`${source} is not a package manifest with an exact name/version`)
  }
  return value
}

function parsePackageManifest(serialized: string, source: string): PackageManifest {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch (error) {
    gateBlocked(
      `${source} is not valid JSON`,
      error instanceof Error ? error.message : String(error),
    )
  }
  return requirePackageManifest(value, source)
}

function stringRecordProperty(
  manifest: PackageManifest,
  property: string,
): Readonly<Record<string, string>> | undefined {
  const value = manifest[property]
  if (value === undefined) return undefined
  if (!isStringRecord(value)) {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid ${property}`)
  }
  return value
}

function stringArrayProperty(
  manifest: PackageManifest,
  property: string,
): readonly string[] | undefined {
  const value = manifest[property]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid ${property}`)
  }
  return value
}

function objectProperty(
  manifest: PackageManifest,
  property: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = manifest[property]
  if (value === undefined) return undefined
  if (!isUnknownRecord(value)) {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid ${property}`)
  }
  return value
}

function stringProperty(manifest: PackageManifest, property: string): string | undefined {
  const value = manifest[property]
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid ${property}`)
  }
  return value
}

function peerDependencyIsOptional(manifest: PackageManifest, dependencyName: string): boolean {
  const metadataByDependency = objectProperty(manifest, "peerDependenciesMeta")
  const metadata = metadataByDependency?.[dependencyName]
  if (metadata === undefined) return false
  if (!isUnknownRecord(metadata)) {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid peer metadata for ${dependencyName}`)
  }
  const optional = metadata.optional
  if (optional !== undefined && typeof optional !== "boolean") {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid optional peer metadata for ${dependencyName}`)
  }
  return optional === true
}

function serverEntrypoint(manifest: PackageManifest): string | undefined {
  const exports = objectProperty(manifest, "exports")
  const server = exports?.["./server"]
  if (server === undefined) return stringProperty(manifest, "main")
  if (typeof server === "string") return server
  if (!isUnknownRecord(server)) {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid exports["./server"]`)
  }

  const imported = server.import
  const fallback = server.default
  if (imported !== undefined && typeof imported !== "string") {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid server import entrypoint`)
  }
  if (fallback !== undefined && typeof fallback !== "string") {
    gateBlocked(`${manifest.name}@${manifest.version} has invalid default server entrypoint`)
  }
  return imported ?? fallback ?? stringProperty(manifest, "main")
}

function runtimeDependencies(manifest: PackageManifest): string[] {
  const dependencies: string[] = []

  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    dependencies.push(...Object.keys(stringRecordProperty(manifest, section) ?? {}))
  }
  for (const section of ["bundledDependencies", "bundleDependencies"] as const) {
    dependencies.push(...(stringArrayProperty(manifest, section) ?? []))
  }
  return [...new Set(dependencies)].sort()
}

type RuntimeRequirement = Readonly<{
  name: string
  range: string
  optional: boolean
}>

type LoaderDependencyClosure = Readonly<{
  packages: readonly RegistryPackage[]
  optionalPackageMisses: readonly string[]
}>

function runtimeRequirements(manifest: PackageManifest): readonly RuntimeRequirement[] {
  const requirements = new Map<string, RuntimeRequirement>()
  const bundled = new Set<string>([
    ...(stringArrayProperty(manifest, "bundledDependencies") ?? []),
    ...(stringArrayProperty(manifest, "bundleDependencies") ?? []),
  ])

  for (const [name, range] of Object.entries(stringRecordProperty(manifest, "dependencies") ?? {})) {
    if (!bundled.has(name)) {
      requirements.set(name, { name, range, optional: false })
    }
  }
  for (const [name, range] of Object.entries(stringRecordProperty(manifest, "optionalDependencies") ?? {})) {
    if (!bundled.has(name) && !requirements.has(name)) {
      requirements.set(name, { name, range, optional: true })
    }
  }
  for (const [name, range] of Object.entries(stringRecordProperty(manifest, "peerDependencies") ?? {})) {
    if (!requirements.has(name)) {
      requirements.set(name, {
        name,
        range,
        optional: peerDependencyIsOptional(manifest, name),
      })
    }
  }
  return Object.freeze([...requirements.values()])
}

async function packRegistryPackage(
  tar: string,
  packageDirectory: string,
  destination: string,
): Promise<RegistryPackage> {
  const packed = await run([
    process.execPath,
    "pm",
    "pack",
    "--destination",
    destination,
    "--ignore-scripts",
    "--quiet",
  ], { cwd: packageDirectory, timeoutMs: 30_000 })
  if (packed.exitCode !== 0) {
    gateBlocked(`could not pack local closure package ${packageDirectory}`, packed.stderr)
  }

  const reportedTarballPath = packed.stdout.trim()
  const tarballPath = resolve(reportedTarballPath)
  if (!reportedTarballPath || !isWithin(destination, tarballPath)) {
    gateBlocked("closure pack command returned an unsafe tarball path", packed.stdout)
  }
  const tarball = await readFile(tarballPath)
  const manifest = parsePackageManifest(Buffer.from(
    await readTarEntry(tar, tarballPath, "package/package.json"),
  ).toString("utf8"), `closure tarball manifest ${tarballPath}`)

  return Object.freeze({
    packageName: manifest.name,
    version: manifest.version,
    manifest,
    tarball,
    tarballSha256: hash("sha256", tarball),
    tarballSha1: hash("sha1", tarball),
    tarballSha512Base64: Buffer.from(hash("sha512", tarball), "hex").toString("base64"),
  })
}

async function buildLoaderDependencyClosure(
  tar: string,
  destination: string,
): Promise<LoaderDependencyClosure> {
  // OpenCode 1.18.16 itself asks Arborist for this pinned SDK package while
  // installing configured npm plugins. It is loader infrastructure, not a
  // runtime dependency of the candidate tarball.
  const queue: RuntimeRequirement[] = [{
    name: "@opencode-ai/plugin",
    range: OPENCODE_VERSION,
    optional: false,
  }]
  const artifacts = new Map<string, RegistryPackage>()
  const optionalPackageMisses = new Set<string>()

  while (queue.length > 0) {
    const requirement = queue.shift()!
    const existing = artifacts.get(requirement.name)
    if (existing) {
      if (!Bun.semver.satisfies(existing.version, requirement.range)) {
        gateBlocked(
          `closure has incompatible requirements for ${requirement.name}: ${existing.version} vs ${requirement.range}`,
        )
      }
      continue
    }

    const packageDirectory = join(packageRoot, "node_modules", ...requirement.name.split("/"))
    try {
      await realpath(packageDirectory)
    } catch {
      if (requirement.optional) {
        optionalPackageMisses.add(requirement.name)
        continue
      }
      gateBlocked(`required local pinned closure package is unavailable: ${requirement.name}`)
    }

    const artifact = await packRegistryPackage(tar, packageDirectory, destination)
    if (
      artifact.packageName !== requirement.name ||
      !Bun.semver.satisfies(artifact.version, requirement.range)
    ) {
      gateBlocked(
        `local closure package does not satisfy ${requirement.name}@${requirement.range}: ${artifact.packageName}@${artifact.version}`,
      )
    }
    artifacts.set(requirement.name, artifact)
    queue.push(...runtimeRequirements(artifact.manifest))
  }

  return Object.freeze({
    packages: Object.freeze([...artifacts.values()]),
    optionalPackageMisses: Object.freeze([...optionalPackageMisses].sort()),
  })
}

async function makeIsolatedEnvironment(
  root: string,
  registryUrl: string,
  opencodeBin: string,
): Promise<Record<string, string>> {
  const paths = {
    home: join(root, "home"),
    appData: join(root, "appdata"),
    localAppData: join(root, "localappdata"),
    config: join(root, "xdg-config"),
    cache: join(root, "xdg-cache"),
    data: join(root, "xdg-data"),
    state: join(root, "xdg-state"),
    managed: join(root, "managed-config"),
    programData: join(root, "program-data"),
    npmCache: join(root, "npm-cache"),
    npmConfig: join(root, "npmrc"),
    npmGlobalConfig: join(root, "npm-globalrc"),
    temp: join(root, "temp"),
  }
  await Promise.all(Object.entries(paths)
    .filter(([key]) => key !== "npmConfig" && key !== "npmGlobalConfig")
    .map(([, path]) => mkdir(path, { recursive: true })))

  const registryConfig = [
    `registry=${registryUrl}/`,
    "audit=false",
    "fund=false",
    "ignore-scripts=true",
    "update-notifier=false",
    "",
  ].join("\n")
  await Promise.all([
    writeFile(paths.npmConfig, registryConfig, "utf8"),
    writeFile(paths.npmGlobalConfig, registryConfig, "utf8"),
  ])

  const systemRoot = process.env.SystemRoot ?? "C:\\Windows"
  const path = [dirname(opencodeBin), dirname(process.execPath), join(systemRoot, "System32")].join(";")

  // This is a positive allowlist. In particular, no OPENCODE_CONFIG*, console
  // token, credential, provider, proxy, HOME, npm, or user PATH value is inherited.
  return {
    APPDATA: paths.appData,
    BUN_INSTALL_CACHE_DIR: join(root, "bun-cache"),
    CI: "1",
    ComSpec: join(systemRoot, "System32", "cmd.exe"),
    HOME: paths.home,
    HTTP_PROXY: `${registryUrl}/deny-external`,
    HTTPS_PROXY: `${registryUrl}/deny-external`,
    ALL_PROXY: `${registryUrl}/deny-external`,
    LOCALAPPDATA: paths.localAppData,
    NO_PROXY: "127.0.0.1,localhost",
    NODE_ENV: "production",
    OPENCODE_AUTH_CONTENT: "{}",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_TEST_HOME: paths.home,
    OPENCODE_TEST_MANAGED_CONFIG_DIR: paths.managed,
    PATH: path,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    ProgramData: paths.programData,
    SystemRoot: systemRoot,
    TEMP: paths.temp,
    TMP: paths.temp,
    USERPROFILE: paths.home,
    WINDIR: systemRoot,
    XDG_CACHE_HOME: paths.cache,
    XDG_CONFIG_HOME: paths.config,
    XDG_DATA_HOME: paths.data,
    XDG_STATE_HOME: paths.state,
    npm_config_audit: "false",
    npm_config_cache: paths.npmCache,
    npm_config_fund: "false",
    npm_config_globalconfig: paths.npmGlobalConfig,
    npm_config_ignore_scripts: "true",
    npm_config_omit: "dev",
    npm_config_production: "true",
    npm_config_registry: `${registryUrl}/`,
    npm_config_update_notifier: "false",
    npm_config_userconfig: paths.npmConfig,
  }
}

test("loads the candidate exactly once through the isolated OpenCode 1.18.16 npm loader", async () => {
  const root = await mkdtemp(join(tmpdir(), "opencode-npm-load-"))
  let registry: ReturnType<typeof startLoopbackRegistry> | undefined

  try {
    if (process.platform !== "win32") {
      gateBlocked("the package and this loader proof require win32")
    }

    const opencodeBin = process.env.OPENCODE_BIN || Bun.which("opencode")
    const tar = Bun.which("tar")
    if (!opencodeBin) gateBlocked("real OpenCode executable was not found")
    if (!tar) gateBlocked("a local tar reader is required to audit the candidate")

    const manifestValue: unknown = await Bun.file(join(packageRoot, "package.json")).json()
    const manifest = requirePackageManifest(manifestValue, "candidate package.json")
    if (JSON.stringify(stringArrayProperty(manifest, "os")) !== JSON.stringify(["win32"])) {
      gateBlocked('packaging contract requires os === ["win32"]')
    }
    const exports = objectProperty(manifest, "exports")
    if (exports?.["./tui"] !== undefined) {
      gateBlocked("packaging contract forbids exports[\"./tui\"]")
    }
    if (exports?.["./server"] === undefined && stringProperty(manifest, "main") === undefined) {
      gateBlocked("packaging contract requires exports[\"./server\"] or main")
    }
    const engines = objectProperty(manifest, "engines")
    const opencodeRange = engines?.opencode
    if (opencodeRange !== undefined && typeof opencodeRange !== "string") {
      gateBlocked("packaging contract requires engines.opencode to be a string")
    }
    if (
      typeof opencodeRange === "string" &&
      !Bun.semver.satisfies(OPENCODE_VERSION, opencodeRange)
    ) {
      gateBlocked(`engines.opencode excludes ${OPENCODE_VERSION}`)
    }

    const build = await run([process.execPath, "run", "build"], {
      cwd: packageRoot,
      timeoutMs: 60_000,
    })
    if (build.exitCode !== 0) gateBlocked("candidate build failed", build.stderr)

    const packDirectory = join(root, "candidate")
    await mkdir(packDirectory, { recursive: true })
    const packed = await run([
      process.execPath,
      "pm",
      "pack",
      "--destination",
      packDirectory,
      "--ignore-scripts",
      "--quiet",
    ], { cwd: packageRoot, timeoutMs: 30_000 })
    if (packed.exitCode !== 0) gateBlocked("candidate tarball creation failed", packed.stderr)
    const reportedTarballPath = packed.stdout.trim()
    const tarballPath = resolve(reportedTarballPath)
    if (!reportedTarballPath || !isWithin(packDirectory, tarballPath)) {
      gateBlocked("candidate pack command returned an unsafe tarball path", packed.stdout)
    }

    const tarball = await readFile(tarballPath)
    const candidateSha256 = hash("sha256", tarball)
    const candidateSha1 = hash("sha1", tarball)
    const candidateSha512 = Buffer.from(hash("sha512", tarball), "hex").toString("base64")
    const packedManifest = parsePackageManifest(Buffer.from(
      await readTarEntry(tar, tarballPath, "package/package.json"),
    ).toString("utf8"), "candidate tarball package.json")
    const closure = runtimeDependencies(packedManifest)
    if (closure.length !== 0) {
      gateBlocked(`runtime dependency closure is not vendored by the fixture: ${closure.join(", ")}`)
    }

    const entrypoint = (serverEntrypoint(packedManifest) ?? "").replace(/^\.\//, "")
    if (!entrypoint) gateBlocked("candidate package has no server entrypoint")
    const candidateEntrypoint = await readTarEntry(tar, tarballPath, `package/${entrypoint}`)
    const candidateEntrypointSha256 = hash("sha256", candidateEntrypoint)
    const markerMatch = Buffer.from(candidateEntrypoint).toString("utf8").match(
      /opencode-windows-notifications@[0-9]+\.[0-9]+\.[0-9]+\/server-v[0-9]+/,
    )
    const buildMarker = markerMatch?.[0]
    if (!buildMarker) gateBlocked("deterministic build marker is absent from the packed entrypoint")

    // The candidate's packed manifest is the candidate-closure authority. T3
    // keeps @opencode-ai/plugin type-only, so its candidate runtime closure is
    // exactly empty. The separate pinned closure below exists only because the
    // real 1.18.16 loader asks Arborist for its own SDK package during install.
    const closureDirectory = join(root, "loader-dependency-closure")
    await mkdir(closureDirectory, { recursive: true })
    const dependencyClosure = await buildLoaderDependencyClosure(tar, closureDirectory)

    registry = startLoopbackRegistry({
      packageName: PACKAGE_NAME,
      version: packedManifest.version,
      manifest: packedManifest,
      tarball,
      tarballSha256: candidateSha256,
      tarballSha1: candidateSha1,
      tarballSha512Base64: candidateSha512,
      dependencyClosure: dependencyClosure.packages,
      optionalPackageMisses: dependencyClosure.optionalPackageMisses,
    })

    const childEnv = await makeIsolatedEnvironment(root, registry.url, opencodeBin)
    const configDirectory = join(childEnv.XDG_CONFIG_HOME, "opencode")
    await mkdir(configDirectory, { recursive: true })
    await writeFile(
      join(configDirectory, "opencode.json"),
      JSON.stringify({ plugin: [PACKAGE_NAME] }),
      "utf8",
    )

    const version = await run([opencodeBin, "--version"], {
      cwd: root,
      env: childEnv,
      timeoutMs: 15_000,
    })
    if (version.exitCode !== 0 || version.stdout.trim() !== OPENCODE_VERSION) {
      gateBlocked(
        `real loader must be exactly OpenCode ${OPENCODE_VERSION}`,
        `${version.stdout}\n${version.stderr}`,
      )
    }

    const loaded = await run([
      opencodeBin,
      "debug",
      "config",
      "--print-logs",
      "--log-level",
      "DEBUG",
    ], { cwd: root, env: childEnv, timeoutMs: 45_000 })
    if (loaded.exitCode !== 0) {
      gateBlocked("real OpenCode loader rejected the isolated candidate", loaded.stderr)
    }

    const audit = registry.audit()
    if (audit.blockedRequests.length !== 0) {
      gateBlocked(`registry/proxy denied unexpected access: ${JSON.stringify(audit.blockedRequests)}`)
    }
    if (audit.metadataRequests < 1 || audit.tarballRequests !== 1) {
      gateBlocked(
        `candidate registry resolution was not singular (metadata=${audit.metadataRequests}, tarball=${audit.tarballRequests})`,
      )
    }
    if (audit.servedTarballSha256 !== candidateSha256) {
      gateBlocked("served tarball SHA256 differs from the candidate SHA256")
    }
    for (const artifact of dependencyClosure.packages) {
      const requests = audit.packageRequests[artifact.packageName]
      if (!requests || requests.metadata < 1 || requests.tarball !== 1) {
        gateBlocked(
          `pinned closure artifact was not resolved exactly once: ${artifact.packageName}@${artifact.version}`,
        )
      }
      if (audit.servedTarballSha256ByPackage[artifact.packageName] !== artifact.tarballSha256) {
        gateBlocked(
          `pinned closure tarball SHA256 differs after serving: ${artifact.packageName}@${artifact.version}`,
        )
      }
    }

    const expectedResolverPath = join(
      childEnv.XDG_CACHE_HOME,
      "opencode",
      "packages",
      PACKAGE_SPEC,
      "node_modules",
      PACKAGE_NAME,
    )
    let resolvedPackagePath: string
    try {
      resolvedPackagePath = await realpath(expectedResolverPath)
    } catch {
      gateBlocked(`source-derived resolver path was not used: ${expectedResolverPath}`)
    }
    const isolatedRoot = await realpath(root)
    if (!isWithin(isolatedRoot, resolvedPackagePath)) {
      gateBlocked(`resolver escaped the isolated root: ${resolvedPackagePath}`)
    }

    const resolvedManifest = parsePackageManifest(
      await readFile(join(resolvedPackagePath, "package.json"), "utf8"),
      "resolved candidate package.json",
    )
    if (
      resolvedManifest.name !== PACKAGE_NAME ||
      resolvedManifest.version !== packedManifest.version ||
      runtimeDependencies(resolvedManifest).length !== 0
    ) {
      gateBlocked("resolved package identity or dependency closure differs from the candidate")
    }
    const resolvedEntrypoint = await readFile(join(resolvedPackagePath, entrypoint))
    if (hash("sha256", resolvedEntrypoint) !== candidateEntrypointSha256) {
      gateBlocked("resolved entrypoint hash differs from the candidate tarball entrypoint")
    }

    const loaderEvidence = `${loaded.stdout}\n${loaded.stderr}`
    const initializationCount = countOccurrences(loaderEvidence, "Server plugin initialized")
    const markerCount = countOccurrences(loaderEvidence, buildMarker)
    if (initializationCount !== 1 || markerCount !== 1) {
      gateBlocked(
        `single registration/build marker proof failed (initializations=${initializationCount}, markers=${markerCount})`,
        loaderEvidence,
      )
    }

    // The strict child environment and source-derived realpath checks are the
    // path audit: all user/config/cache/auth/state/npm roots are unique children
    // of the disposable root, and registry/proxy evidence contains only loopback.
    for (const key of [
      "HOME",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "XDG_CONFIG_HOME",
      "XDG_CACHE_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "ProgramData",
      "npm_config_cache",
    ]) {
      const value = childEnv[key]
      if (!value || !isWithin(isolatedRoot, await realpath(value))) {
        gateBlocked(`child environment path ${key} is not isolated`)
      }
    }
    for (const forbidden of [
      "OPENCODE_CONFIG",
      "OPENCODE_CONFIG_DIR",
      "OPENCODE_CONFIG_CONTENT",
      "OPENCODE_CONSOLE_TOKEN",
    ]) {
      if (forbidden in childEnv) gateBlocked(`forbidden child variable leaked: ${forbidden}`)
    }

    // A PASS reaches this line only through the real OpenCode process. This test
    // intentionally has no package import or dynamic-import fallback.
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("GATE BLOCKED:")) {
      throw error
    }
    gateBlocked(
      `isolated OpenCode ${OPENCODE_VERSION} loader environment could not be proven`,
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    try {
      registry?.stop()
    } catch (error) {
      gateBlocked(
        "loopback registry could not be stopped safely",
        error instanceof Error ? error.message : String(error),
      )
    }
    await chmod(root, 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true }).catch((error) => {
      gateBlocked(
        "isolated loader workspace could not be removed safely",
        error instanceof Error ? error.message : String(error),
      )
    })
  }
}, 90_000)
