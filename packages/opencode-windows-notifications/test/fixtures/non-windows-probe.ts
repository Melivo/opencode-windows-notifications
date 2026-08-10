import { mock } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk"

import type { PluginInput } from "@opencode-ai/plugin"
import type { EventSessionIdle } from "@opencode-ai/sdk"
import type { Notify } from "../../src/contract.js"

let hostCalls = 0
let transportCreations = 0

Object.defineProperty(process, "platform", { value: "linux" })
mock.module("../../src/transport/index.js", () => ({
  createNotify(): Notify {
    transportCreations += 1
    return async () => ({ delivered: true })
  },
}))

const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096",
  fetch: async () => {
    hostCalls += 1
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
const idle: EventSessionIdle = {
  type: "session.idle",
  properties: { sessionID: "session-root" },
}

const { plugin } = await import("../../src/index.js")
const hooks = await plugin(input)
await hooks.event?.({ event: idle })

console.log(JSON.stringify({ hostCalls, transportCreations }))
