import { resolve } from "node:path"
import { describe, expect, mock, test } from "bun:test"
import { ModuleKind, transpileModule } from "typescript"
import type {
  TuiPluginApi,
  TuiPluginMeta,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"

import type { Notification } from "../src/contract.js"
import type { CreateNotifyDependencies } from "../src/transport/index.js"

const packageRoot = resolve(import.meta.dir, "..")
const notifications: Notification[] = []
const transportDependencies: CreateNotifyDependencies[] = []

mock.module("../src/transport/index.js", () => ({
  createNotify(dependencies: CreateNotifyDependencies = {}) {
    transportDependencies.push(dependencies)
    return async (notification: Notification) => {
      notifications.push(notification)
      return { delivered: true } as const
    }
  },
}))

const { default: entry } = await import("../src/tui-entry.js") as {
  default: TuiPluginModule
}

type EventHandler = (event: unknown) => void

function createTuiHarness() {
  const subscriptions: Array<Readonly<{ type: string; handler: EventHandler }>> = []
  const sessionIDs: string[] = []
  const sessions = new Map<string, Readonly<{ id: string; parentID?: string }>>([
    ["session-root", { id: "session-root" }],
    ["session-child", { id: "session-child", parentID: "session-root" }],
  ])
  const api = {
    event: {
      on(type: string, handler: EventHandler) {
        subscriptions.push({ type, handler })
        return () => undefined
      },
    },
    state: {
      session: {
        get(sessionID: string) {
          sessionIDs.push(sessionID)
          return sessions.get(sessionID)
        },
      },
    },
  } as unknown as TuiPluginApi

  return { api, sessionIDs, subscriptions }
}

async function initialize(api: TuiPluginApi): Promise<void> {
  await entry.tui(api, undefined, {} as TuiPluginMeta)
}

async function settleHandler(): Promise<void> {
  await Bun.sleep(0)
}

describe("documented external TUI plugin entrypoint", () => {
  test("default-exports only the documented shape with erased TUI types", async () => {
    const source = await Bun.file(resolve(packageRoot, "src/tui-entry.ts")).text()
    const emittedJavaScript = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext },
    }).outputText

    expect(Object.keys(entry).sort()).toEqual(["id", "tui"])
    expect(entry.id).toBe("opencode-windows-notifications@0.0.0/tui-v1")
    expect(typeof entry.tui).toBe("function")
    expect("server" in entry).toBe(false)
    expect(source).toContain(
      'import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"',
    )
    expect(source).not.toContain('from "@opencode-ai/plugin"')
    expect(emittedJavaScript).not.toContain("@opencode-ai/plugin/tui")
    expect(emittedJavaScript).not.toContain("TuiPlugin")
  })

  test("projects only question identity through existing eligibility and transport", async () => {
    notifications.length = 0
    transportDependencies.length = 0
    const harness = createTuiHarness()

    await initialize(harness.api)

    expect(harness.subscriptions.map(({ type }) => type)).toEqual([
      "question.asked",
    ])
    expect(transportDependencies).toHaveLength(1)
    expect(transportDependencies[0]?.platform).toBeUndefined()
    expect(typeof transportDependencies[0]?.log).toBe("function")
    expect(transportDependencies[0]?.log?.({
      eventType: "question.asked",
      sessionID: "sha256:0123456789ab",
      category: "runtime-failed",
    })).toBeUndefined()

    const handler = harness.subscriptions[0]?.handler
    if (!handler) throw new Error("missing question.asked subscription")

    let questionsReads = 0
    let toolReads = 0
    const properties = {
      id: "question-root",
      sessionID: "session-root",
      get questions(): never {
        questionsReads += 1
        throw new Error("questions must remain private")
      },
      get tool(): never {
        toolReads += 1
        throw new Error("tool must remain private")
      },
    }

    expect(() => handler({ type: "question.asked", properties })).not.toThrow()
    await settleHandler()
    handler({ type: "question.asked", properties })
    await settleHandler()
    handler({
      type: "question.asked",
      properties: { id: "question-root-2", sessionID: "session-root" },
    })
    await settleHandler()
    handler({
      type: "question.asked",
      properties: { id: "question-child", sessionID: "session-child" },
    })
    handler({
      type: "question.asked",
      properties: { id: "question-missing", sessionID: "session-missing" },
    })
    handler({
      type: "question.asked",
      properties: { id: " ", sessionID: "session-root" },
    })
    handler({
      type: "question.asked",
      properties: { id: "question-no-session", sessionID: " " },
    })
    await settleHandler()

    expect(questionsReads).toBe(0)
    expect(toolReads).toBe(0)
    expect(harness.sessionIDs).toEqual([
      "session-root",
      "session-root",
      "session-root",
      "session-child",
      "session-missing",
    ])
    expect(notifications).toEqual([
      {
        event: "question.asked",
        title: "OpenCode",
        body: "Deine Auswahl wird benötigt",
        sessionID: "session-root",
      },
      {
        event: "question.asked",
        title: "OpenCode",
        body: "Deine Auswahl wird benötigt",
        sessionID: "session-root",
      },
    ])
  })
})
