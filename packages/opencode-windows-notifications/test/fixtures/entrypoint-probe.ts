import { mock } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk"

import type { PluginInput } from "@opencode-ai/plugin"
import type {
  EventMessageUpdated,
  EventPermissionAsked,
  EventSessionError,
  EventSessionIdle,
  Session,
} from "@opencode-ai/sdk"
import type { Notification, Notify } from "../../src/contract.js"
import type { CreateNotifyDependencies } from "../../src/transport/index.js"

const scenario = process.argv[2] ?? "success"
const notifications: Notification[] = []
const logs: unknown[] = []
const sessionPaths: string[] = []
let transportCalls = 0

const createNotify = (dependencies: CreateNotifyDependencies = {}): Notify => {
  return async (notification) => {
    transportCalls += 1
    notifications.push(notification)

    if (scenario === "failure") {
      await dependencies.log?.({
        eventType: notification.event,
        sessionID: "sha256:0123456789ab",
        category: "launch-failed",
      })
      return { delivered: false, category: "launch-failed" }
    }

    return { delivered: true }
  }
}

mock.module("../../src/transport/index.js", () => ({ createNotify }))

const session = (id: string): Session => ({
  id,
  projectID: "project-1",
  directory: "C:/workspace",
  ...(scenario === "subsession" ? { parentID: "session-parent" } : {}),
  title: "Test",
  version: "1.18.16",
  time: { created: 1, updated: 1 },
})

const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096",
  fetch: async (request) => {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/session/")) {
      const id = decodeURIComponent(url.pathname.slice("/session/".length))
      sessionPaths.push(id)
      return Response.json(session(id))
    }

    if (scenario === "logging-failure") {
      throw new Error("simulated app.log rejection")
    }

    const body = await request.json()
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

const { plugin } = await import("../../src/index.js")
const hooks = await plugin(input)
if (!hooks.event) throw new Error("missing documented event hook")

const completed: EventMessageUpdated = {
  type: "message.updated",
  properties: {
    info: {
      id: "response-1",
      sessionID: "session-root",
      role: "assistant",
      time: { created: 1, completed: 2 },
      parentID: "request-1",
      modelID: "model-1",
      providerID: "provider-1",
      mode: "build",
      path: { cwd: "C:/workspace", root: "C:/workspace" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  },
}
const idle: EventSessionIdle = {
  type: "session.idle",
  properties: { sessionID: "session-root" },
}
const error: EventSessionError = {
  type: "session.error",
  properties: { sessionID: "session-root" },
}
const permission: EventPermissionAsked = {
  id: "event-permission-1",
  type: "permission.asked",
  properties: {
    id: "permission-1",
    sessionID: "session-root",
    permission: "bash",
    patterns: [],
    metadata: {},
    always: [],
  },
}

await hooks.event({ event: completed })
await hooks.event({ event: idle })
await hooks.event({ event: error })
await hooks.event({ event: permission })
await hooks.event({ event: permission })
await Promise.resolve()
await Bun.sleep(20)

console.log(JSON.stringify({ logs, notifications, sessionPaths, transportCalls }))
