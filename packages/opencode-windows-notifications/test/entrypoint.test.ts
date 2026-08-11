import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import type {
  EventMessageUpdated,
  EventPermissionAsked,
  EventSessionError,
  EventSessionIdle,
  Permission,
  Session,
} from "@opencode-ai/sdk"

import defaultPlugin, { plugin } from "../src/index.js"
import type { Notification } from "../src/contract.js"
import { createPlugin } from "../src/plugin.js"

const packageRoot = resolve(import.meta.dir, "..")

type HostHarnessOptions = Readonly<{
  failLogging?: boolean
  resolveSession?: (sessionID: string) => Session | undefined | Error
}>

function session(id: string, parentID?: string): Session {
  return {
    id,
    projectID: "project-1",
    directory: "C:/workspace",
    ...(parentID === undefined ? {} : { parentID }),
    title: "Test",
    version: "1.18.16",
    time: { created: 1, updated: 1 },
  }
}

function createHostHarness(options: HostHarnessOptions = {}) {
  const logs: unknown[] = []
  const sessionPaths: string[] = []
  const resolveSession = options.resolveSession ?? ((id: string) => session(id))
  const client = createOpencodeClient({
    baseUrl: "http://127.0.0.1:4096",
    fetch: async (request) => {
      const url = new URL(request.url)

      if (url.pathname.startsWith("/session/")) {
        const id = decodeURIComponent(url.pathname.slice("/session/".length))
        sessionPaths.push(id)
        const resolvedSession = resolveSession(id)
        if (resolvedSession instanceof Error) throw resolvedSession
        return Response.json(resolvedSession ?? null)
      }

      if (options.failLogging) throw new Error("simulated app.log rejection")

      const body: unknown = await request.json()
      if (typeof body === "object" && body !== null) logs.push(body)
      return Response.json(true)
    },
  })

  const input: PluginInput = {
    client,
    project: {
      id: "project-1",
      worktree: "C:/workspace",
      time: { created: 1 },
    },
    directory: "C:/workspace",
    worktree: "C:/workspace",
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://127.0.0.1:4096"),
    $: Bun.$,
  }

  return { input, logs, sessionPaths }
}

function assistantUpdated(
  sessionID: string,
  completed: number | "incomplete" = 2,
): EventMessageUpdated {
  return {
    type: "message.updated",
    properties: {
      info: {
        id: `response-${sessionID}`,
        sessionID,
        role: "assistant",
        time:
          completed === "incomplete"
            ? { created: 1 }
            : { created: 1, completed },
        parentID: "request-1",
        modelID: "model-1",
        providerID: "provider-1",
        mode: "build",
        path: { cwd: "C:/workspace", root: "C:/workspace" },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    },
  }
}

function userUpdated(sessionID: string): EventMessageUpdated {
  return {
    type: "message.updated",
    properties: {
      info: {
        id: `request-${sessionID}`,
        sessionID,
        role: "user",
        time: { created: 1 },
        agent: "build",
        model: { providerID: "provider-1", modelID: "model-1" },
      },
    },
  }
}

function sessionIdle(sessionID: string): EventSessionIdle {
  return { type: "session.idle", properties: { sessionID } }
}

function sessionError(sessionID: string): EventSessionError {
  return { type: "session.error", properties: { sessionID } }
}

function permission(sessionID: string, id = "permission-1"): Permission {
  return {
    id,
    type: "bash",
    sessionID,
    messageID: "message-1",
    title: "Run command",
    metadata: {},
    time: { created: 1 },
  }
}

function permissionAsked(
  sessionID: string,
  id = "permission-1",
): EventPermissionAsked {
  return {
    id: `event-${id}`,
    type: "permission.asked",
    properties: {
      id,
      sessionID,
      permission: "external_directory",
      patterns: ["C:/Users/phili/Downloads/**"],
      metadata: {},
      always: [],
    },
  }
}

async function requireEventHook(
  factory: ReturnType<typeof createPlugin>,
  input: PluginInput,
): Promise<NonNullable<Hooks["event"]>> {
  const hooks = await factory(input)
  if (!hooks.event) throw new Error("missing documented event hook")
  return hooks.event
}

async function runProbe(scenario: string) {
  const probe = Bun.spawn(
    [process.execPath, "test/fixtures/entrypoint-probe.ts", scenario],
    {
      cwd: packageRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ])

  expect(exitCode, stderr).toBe(0)
  return JSON.parse(stdout.trim())
}

describe("documented server plugin entrypoint", () => {
  test("exports a named Plugin function and only an identical default reference", () => {
    expect(typeof plugin).toBe("function")
    expect(defaultPlugin).toBe(plugin)
    expect("server" in plugin).toBe(false)
    expect("tui" in plugin).toBe(false)
  })

  test("packages the documented server entrypoint", async () => {
    const manifest = await Bun.file(resolve(packageRoot, "package.json")).json()

    expect(manifest.os).toEqual(["win32"])
    expect(manifest.exports["./server"]).toBeDefined()
    expect(manifest.main).toBe("./dist/src/index.js")
    expect(manifest.dependencies?.["@opencode-ai/plugin"]).toBeUndefined()
    expect(manifest.engines.opencode).toBe(">=1.18.16 <1.19.0")
    expect(manifest.devDependencies["@opencode-ai/plugin"]).toBe("1.18.16")
    expect(manifest.scripts["test:regular"]).toContain(
      "test/event-transport.test.ts",
    )
    expect(manifest.scripts["test:regular"]).not.toContain(
      "npm-load-smoke",
    )
    expect(manifest.scripts["test:loader"]).toContain(
      "test/npm-load-smoke.test.ts",
    )
  })

  test("keeps server event handling limited to idle and permission behavior", async () => {
    const entrypointSource = await Bun.file(
      resolve(packageRoot, "src/index.ts"),
    ).text()
    const factorySource = await Bun.file(
      resolve(packageRoot, "src/plugin.ts"),
    ).text()
    const contractSource = await Bun.file(
      resolve(packageRoot, "src/contract.ts"),
    ).text()
    const source = `${entrypointSource}\n${factorySource}`

    expect(entrypointSource).toContain('import type { Plugin }')
    expect(factorySource).toContain('import type { Hooks, Plugin, PluginInput }')
    expect(source).not.toContain("PluginModule")
    expect(source).not.toContain("@opencode-ai/plugin/tui")
    expect(factorySource).toContain('event.type !== "permission.asked"')
    expect(factorySource).not.toContain('"question.asked"')
    expect(factorySource).not.toContain('"question.v2.asked"')
    expect(factorySource).not.toContain("createOnQuestion")
    expect(factorySource).not.toContain('"tool.execute.before"')
    expect(contractSource).toContain("export type PermissionRequest")
    expect(source).not.toContain('case "session.error"')
    expect(source).not.toContain("console.")
    expect(source).not.toContain("process.stdout")
    expect(source).not.toContain("process.stderr")
  })

  test("uses path-based session lookup and body-wrapped host logging", async () => {
    const result = await runProbe("success")

    expect(result.sessionPaths).toEqual(Array(4).fill("session-root"))
    expect(result.notifications.map((entry: { event: string }) => entry.event))
      .toEqual(["session.idle", "permission.asked"])
    expect(result.logs[0]).toEqual({
      service: "opencode-windows-notifications",
      level: "info",
      message: "Server plugin initialized",
      extra: {
        buildMarker: "opencode-windows-notifications@0.0.0/server-v1",
      },
    })
  })

  test("contains app-log failures as a silent no-op", async () => {
    const result = await runProbe("logging-failure")

    expect(result.notifications).toHaveLength(2)
    expect(result.logs).toEqual([])
  })

  test("is inert on non-Windows hosts", async () => {
    const probe = Bun.spawn(
      [process.execPath, "test/fixtures/non-windows-probe.ts"],
      { cwd: packageRoot, stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ])

    expect(exitCode, stderr).toBe(0)
    expect(JSON.parse(stdout.trim())).toEqual({
      hostCalls: 0,
      transportCreations: 0,
    })
  })
})

describe("internal plugin factory", () => {
  test("keeps non-Windows initialization and hooks inert", async () => {
    const harness = createHostHarness()
    let transportCreations = 0
    const testPlugin = createPlugin({
      platform: "linux",
      createNotify() {
        transportCreations += 1
        return async () => ({ delivered: true })
      },
    })

    const onEvent = await requireEventHook(testPlugin, harness.input)
    await onEvent({ event: sessionIdle("session-root") })

    expect(transportCreations).toBe(0)
    expect(harness.logs).toEqual([])
    expect(harness.sessionPaths).toEqual([])
  })

  test("projects only completed assistant and idle events", async () => {
    const harness = createHostHarness()
    const notifications: Notification[] = []
    const testPlugin = createPlugin({
      platform: "win32",
      createNotify() {
        return async (notification) => {
          notifications.push(notification)
          return { delivered: true }
        }
      },
    })

    const onEvent = await requireEventHook(testPlugin, harness.input)
    await onEvent({ event: assistantUpdated("incomplete", "incomplete") })
    await onEvent({ event: userUpdated("user-message") })
    await onEvent({ event: sessionError("session-root") })
    await onEvent({ event: assistantUpdated("session-root") })
    await onEvent({ event: sessionIdle("session-root") })

    expect(notifications).toEqual([
      {
        event: "session.idle",
        title: "OpenCode",
        body: "Antwort abgeschlossen",
        sessionID: "session-root",
      },
    ])
    expect(harness.sessionPaths).toEqual(["session-root", "session-root"])
    expect(harness.logs).toEqual([
      {
        service: "opencode-windows-notifications",
        level: "info",
        message: "Server plugin initialized",
        extra: {
          buildMarker: "opencode-windows-notifications@0.0.0/server-v1",
        },
      },
    ])
  })

  test("handles permission events once and ignores server question events", async () => {
    const harness = createHostHarness()
    const notifications: Notification[] = []
    const testPlugin = createPlugin({
      platform: "win32",
      createNotify() {
        return async (notification) => {
          notifications.push(notification)
          return { delivered: true }
        }
      },
    })
    const hooks = await testPlugin(harness.input)
    const onEvent = hooks.event
    const onPermissionAsk = hooks["permission.ask"]
    if (!onEvent) throw new Error("missing documented event hook")
    if (!onPermissionAsk) throw new Error("missing typed permission.ask hook")
    const input = Object.freeze(permission("session-root"))
    const output: { status: "ask" | "deny" | "allow" } = Object.freeze({
      status: "ask",
    })

    await onEvent({ event: permissionAsked("session-root") })
    await onEvent({ event: permissionAsked("session-root") })
    await onPermissionAsk(input, output)
    await onEvent({ event: permissionAsked("session-root", " ") })
    await onEvent({ event: permissionAsked(" ", "permission-2") })
    const questionEvent = {
      id: "event-question-1",
      type: "question.v2.asked",
      properties: {
        id: "question-1",
        sessionID: "session-root",
        questions: [],
      },
    } as const
    await onEvent({ event: questionEvent as never })
    await onEvent({ event: questionEvent as never })

    expect(notifications).toEqual([
      {
        event: "permission.asked",
        title: "OpenCode",
        body: "Aktion erfordert deine Freigabe",
        sessionID: "session-root",
      },
    ])
    expect(harness.sessionPaths).toEqual([
      "session-root",
      "session-root",
      "session-root",
    ])
    expect(output).toEqual({ status: "ask" })
  })

  test("contains missing, rejected, and child-session lookups", async () => {
    const harness = createHostHarness({
      resolveSession(sessionID) {
        if (sessionID === "missing") return undefined
        if (sessionID === "rejected") return new Error("lookup failed")
        return session(sessionID, "session-parent")
      },
    })
    const notifications: Notification[] = []
    const testPlugin = createPlugin({
      platform: "win32",
      createNotify() {
        return async (notification) => {
          notifications.push(notification)
          return { delivered: true }
        }
      },
    })

    const onEvent = await requireEventHook(testPlugin, harness.input)
    for (const sessionID of ["missing", "rejected", "child"]) {
      await onEvent({ event: assistantUpdated(sessionID) })
      await onEvent({ event: sessionIdle(sessionID) })
    }

    expect(notifications).toEqual([])
    expect(harness.sessionPaths).toEqual([
      "missing",
      "missing",
      "rejected",
      "rejected",
      "child",
      "child",
    ])
  })

  test("contains initialization and transport logging failures as no-ops", async () => {
    const harness = createHostHarness({ failLogging: true })
    const notifications: Notification[] = []
    const testPlugin = createPlugin({
      platform: "win32",
      createNotify(dependencies) {
        return async (notification) => {
          notifications.push(notification)
          await dependencies?.log?.({
            eventType: notification.event,
            sessionID: "sha256:0123456789ab",
            category: "launch-failed",
          })
          return { delivered: false, category: "launch-failed" }
        }
      },
    })

    const onEvent = await requireEventHook(testPlugin, harness.input)
    await onEvent({ event: assistantUpdated("session-root") })
    await onEvent({ event: sessionIdle("session-root") })

    expect(notifications).toHaveLength(1)
    expect(harness.logs).toEqual([])
  })

  test("contains unexpected event-envelope failures", async () => {
    const harness = createHostHarness()
    const testPlugin = createPlugin({ platform: "win32" })
    const onEvent = await requireEventHook(testPlugin, harness.input)
    const event: EventSessionIdle = {
      type: "session.idle",
      properties: {
        get sessionID(): string {
          throw new Error("invalid host envelope")
        },
      },
    }

    await expect(onEvent({ event })).resolves.toBeUndefined()
    expect(harness.sessionPaths).toEqual([])
  })
})
