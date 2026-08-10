type RegistryRequest = Readonly<{
  method: string
  url: string
}>

export type LoopbackRegistryAudit = Readonly<{
  requests: readonly RegistryRequest[]
  metadataRequests: number
  tarballRequests: number
  packageRequests: Readonly<Record<string, Readonly<{
    metadata: number
    tarball: number
  }>>>
  blockedRequests: readonly RegistryRequest[]
  optionalMissRequests: readonly RegistryRequest[]
  servedTarballSha256: string | undefined
  servedTarballSha256ByPackage: Readonly<Record<string, string>>
}>

export type RegistryPackage = Readonly<{
  packageName: string
  version: string
  manifest: Readonly<Record<string, unknown>>
  tarball: Uint8Array
  tarballSha256: string
  tarballSha1: string
  tarballSha512Base64: string
}>

type RegistryOptions = RegistryPackage & Readonly<{
  dependencyClosure?: readonly RegistryPackage[]
  optionalPackageMisses?: readonly string[]
}>

export type LoopbackRegistry = Readonly<{
  url: string
  audit(): LoopbackRegistryAudit
  stop(): void
}>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  })
}

function hash(algorithm: "sha1" | "sha256" | "sha512", bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher(algorithm)
  hasher.update(bytes)
  return hasher.digest("hex")
}

export function startLoopbackRegistry(
  options: RegistryOptions,
): LoopbackRegistry {
  const requests: RegistryRequest[] = []
  const blockedRequests: RegistryRequest[] = []
  const optionalMissRequests: RegistryRequest[] = []
  let metadataRequests = 0
  let tarballRequests = 0
  let servedTarballSha256: string | undefined

  const packages = [options, ...(options.dependencyClosure ?? [])]
  const optionalPackageMisses = new Set(options.optionalPackageMisses ?? [])
  if (new Set(packages.map((entry) => entry.packageName)).size !== packages.length) {
    throw new Error("registry package names must be unique")
  }
  for (const entry of packages) {
    const sha256 = hash("sha256", entry.tarball)
    const sha1 = hash("sha1", entry.tarball)
    const sha512Base64 = Buffer.from(hash("sha512", entry.tarball), "hex").toString("base64")
    if (
      sha256 !== entry.tarballSha256 ||
      sha1 !== entry.tarballSha1 ||
      sha512Base64 !== entry.tarballSha512Base64
    ) {
      throw new Error(`registry tarball hash mismatch: ${entry.packageName}@${entry.version}`)
    }
  }
  const byName = new Map(packages.map((entry) => [entry.packageName, entry]))
  const packageRequests = new Map(packages.map((entry) => [
    entry.packageName,
    { metadata: 0, tarball: 0 },
  ]))
  const tarballPaths = new Map(packages.map((entry) => {
    const unscopedName = entry.packageName.split("/").at(-1)
    return [
      `/${entry.packageName}/-/${unscopedName}-${entry.version}.tgz`,
      entry,
    ] as const
  }))

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const observed = { method: request.method, url: request.url }
      requests.push(observed)

      const url = new URL(request.url)
      const isLoopback = url.hostname === "127.0.0.1"
      if (!isLoopback || (request.method !== "GET" && request.method !== "HEAD")) {
        blockedRequests.push(observed)
        return json({ error: "loopback registry request denied" }, 403)
      }

      const metadataName = decodeURIComponent(url.pathname.slice(1))
      const metadataPackage = byName.get(metadataName)
      if (metadataPackage) {
        const counts = packageRequests.get(metadataPackage.packageName)!
        counts.metadata += 1
        if (metadataPackage.packageName === options.packageName) metadataRequests += 1
        const unscopedName = metadataPackage.packageName.split("/").at(-1)
        const tarballPath = `/${metadataPackage.packageName}/-/${unscopedName}-${metadataPackage.version}.tgz`
        const tarballUrl = `http://127.0.0.1:${server.port}${tarballPath}`
        return json({
          name: metadataPackage.packageName,
          "dist-tags": { latest: metadataPackage.version },
          versions: {
            [metadataPackage.version]: {
              ...metadataPackage.manifest,
              name: metadataPackage.packageName,
              version: metadataPackage.version,
              dist: {
                integrity: `sha512-${metadataPackage.tarballSha512Base64}`,
                shasum: metadataPackage.tarballSha1,
                tarball: tarballUrl,
              },
            },
          },
        })
      }

      if (optionalPackageMisses.has(metadataName)) {
        optionalMissRequests.push(observed)
        return json({ error: "optional package is absent from this platform closure" }, 404)
      }

      const tarballPackage = tarballPaths.get(url.pathname)
      if (tarballPackage) {
        const counts = packageRequests.get(tarballPackage.packageName)!
        counts.tarball += 1
        if (tarballPackage.packageName === options.packageName) {
          tarballRequests += 1
          servedTarballSha256 = hash("sha256", tarballPackage.tarball)
        }
        return new Response(request.method === "HEAD" ? null : tarballPackage.tarball, {
          headers: {
            "cache-control": "no-store",
            "content-length": String(tarballPackage.tarball.byteLength),
            "content-type": "application/octet-stream",
          },
        })
      }

      blockedRequests.push(observed)
      return json({ error: "registry path not found" }, 404)
    },
  })

  return Object.freeze({
    url: `http://127.0.0.1:${server.port}`,
    audit: () => Object.freeze({
      requests: Object.freeze([...requests]),
      metadataRequests,
      tarballRequests,
      packageRequests: Object.freeze(Object.fromEntries(
        [...packageRequests].map(([name, counts]) => [name, Object.freeze({ ...counts })]),
      )),
      blockedRequests: Object.freeze([...blockedRequests]),
      optionalMissRequests: Object.freeze([...optionalMissRequests]),
      servedTarballSha256,
      servedTarballSha256ByPackage: Object.freeze(Object.fromEntries(
        packages
          .filter((entry) => packageRequests.get(entry.packageName)?.tarball)
          .map((entry) => [entry.packageName, hash("sha256", entry.tarball)]),
      )),
    }),
    stop: () => server.stop(true),
  })
}
