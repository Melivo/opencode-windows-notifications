import { Buffer } from "node:buffer"
import { describe, expect, spyOn, test } from "bun:test"

import type { Notification, NotificationResult } from "../src/contract.js"
import {
  createNotify,
  type SpawnProcess,
  type TransportLogEntry,
} from "../src/transport/index.js"

const notifications = {
  idle: {
    event: "session.idle",
    title: "OpenCode",
    body: "Antwort abgeschlossen",
    sessionID: "session-secret",
  },
  error: {
    event: "session.error",
    title: "OpenCode",
    body: "Sitzung fehlgeschlagen",
    sessionID: "session-secret",
  },
  permission: {
    event: "permission.asked",
    title: "OpenCode",
    body: "Aktion erfordert deine Freigabe",
    sessionID: "session-secret",
  },
  question: {
    event: "question.asked",
    title: "OpenCode",
    body: "Deine Auswahl wird benötigt",
    sessionID: "session-secret",
  },
} as const satisfies Record<string, Notification>

type Scenario =
  | { kind: "close"; code: number | null }
  | { kind: "child-error" }
  | { kind: "stdin-error" }
  | { kind: "no-stdin" }
  | { kind: "timeout" }

type SpawnCall = {
  executable: string
  args: readonly string[]
  options: Readonly<Record<string, unknown>>
  stdin?: string
}

function controlledSpawn(scenario: Scenario) {
  const calls: SpawnCall[] = []
  let killCount = 0

  const spawn: SpawnProcess = (executable, args, options) => {
    const call: SpawnCall = { executable, args: [...args], options }
    calls.push(call)
    const childListeners = new Map<string, (value: never) => void>()
    const stdinListeners = new Map<string, (value: never) => void>()

    const child = {
      stdin:
        scenario.kind === "no-stdin"
          ? null
          : {
              once(event: "error", listener: (error: unknown) => void) {
                stdinListeners.set(event, listener)
                return this
              },
              end(data: string) {
                call.stdin = data
                queueMicrotask(() => {
                  if (scenario.kind === "close") {
                    childListeners.get("close")?.(scenario.code as never)
                  } else if (scenario.kind === "child-error") {
                    childListeners.get("error")?.(
                      new Error("raw child secret") as never,
                    )
                  } else if (scenario.kind === "stdin-error") {
                    stdinListeners.get("error")?.(
                      new Error("raw stdin secret") as never,
                    )
                  }
                })
              },
            },
      once(event: string, listener: (...args: never[]) => void) {
        childListeners.set(event, listener)
        return this
      },
      kill() {
        killCount += 1
        return true
      },
    }

    return child
  }

  return { calls, get killCount() { return killCount }, spawn }
}

describe("Windows notification transport", () => {
  test("returns unsupported-platform without launching or logging", async () => {
    const launched: unknown[] = []
    const logs: TransportLogEntry[] = []
    const notify = createNotify({
      platform: "linux",
      spawn: ((...args: unknown[]) => {
        launched.push(args)
        throw new Error("must not launch")
      }) as SpawnProcess,
      log: (entry) => logs.push(entry),
    })

    await expect(notify(notifications.idle)).resolves.toEqual({
      delivered: false,
      category: "unsupported-platform",
    })
    expect(launched).toEqual([])
    expect(logs).toEqual([])
  })

  test("maps process outcomes to the fixed result categories", async () => {
    const cases: Array<[Scenario, NotificationResult]> = [
      [{ kind: "close", code: 0 }, { delivered: true }],
      [
        { kind: "close", code: 1 },
        { delivered: false, category: "powershell-blocked" },
      ],
      [
        { kind: "close", code: 41 },
        { delivered: false, category: "powershell-blocked" },
      ],
      [
        { kind: "close", code: 42 },
        { delivered: false, category: "identity-unavailable" },
      ],
      [
        { kind: "close", code: 43 },
        { delivered: false, category: "runtime-failed" },
      ],
      [
        { kind: "close", code: null },
        { delivered: false, category: "runtime-failed" },
      ],
      [
        { kind: "child-error" },
        { delivered: false, category: "launch-failed" },
      ],
      [
        { kind: "stdin-error" },
        { delivered: false, category: "runtime-failed" },
      ],
      [
        { kind: "no-stdin" },
        { delivered: false, category: "runtime-failed" },
      ],
    ]

    for (const [scenario, expected] of cases) {
      const process = controlledSpawn(scenario)
      const notify = createNotify({
        platform: "win32",
        spawn: process.spawn,
        log: () => undefined,
      })

      await expect(notify(notifications.idle)).resolves.toEqual(expected)
      expect(process.calls).toHaveLength(1)
    }
  })

  test("classifies a synchronous launch failure without retry or fallback", async () => {
    let spawnCount = 0
    const logs: TransportLogEntry[] = []
    const notify = createNotify({
      platform: "win32",
      spawn: (() => {
        spawnCount += 1
        throw new Error("executable path and payload secret")
      }) as SpawnProcess,
      log: (entry) => logs.push(entry),
    })

    await expect(notify(notifications.error)).resolves.toEqual({
      delivered: false,
      category: "launch-failed",
    })
    expect(spawnCount).toBe(1)
    expect(logs).toHaveLength(1)
  })

  test("uses an absolute PowerShell path, shell:false, static code, and stdin data", async () => {
    const first = controlledSpawn({ kind: "close", code: 0 })
    const second = controlledSpawn({ kind: "close", code: 0 })

    await createNotify({ platform: "win32", spawn: first.spawn })(
      notifications.idle,
    )
    await createNotify({ platform: "win32", spawn: second.spawn })(
      notifications.permission,
    )

    const idleCall = first.calls[0]
    const permissionCall = second.calls[0]
    expect(idleCall).toBeDefined()
    expect(permissionCall).toBeDefined()
    expect(idleCall!.executable).toMatch(
      /^[A-Za-z]:\\.*\\WindowsPowerShell\\v1\.0\\powershell\.exe$/,
    )
    expect(idleCall!.options).toEqual({
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
    })
    expect(idleCall!.args).toEqual(permissionCall!.args)
    expect(idleCall!.args.slice(0, 3)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
    ])
    expect(idleCall!.args.join(" ")).not.toContain("session-secret")

    const source = Buffer.from(idleCall!.args[3]!, "base64").toString("utf16le")
    expect(source).toContain("[Console]::In.ReadToEnd()")
    expect(source).toContain("ConvertFrom-Json")
    expect(source).toContain("CreateToastNotifier('ai.opencode.desktop')")
    expect(source).not.toContain("Invoke-Expression")
    expect(source).not.toContain("Add-Type")
    expect(source).not.toContain("session-secret")

    const payload = JSON.parse(
      Buffer.from(idleCall!.stdin!, "base64").toString("utf8"),
    )
    expect(payload).toEqual({
      event: "session.idle",
      title: "OpenCode",
      body: "Antwort abgeschlossen",
    })
    expect(idleCall!.stdin).not.toContain("session-secret")
  })

  test("encodes the exact Unicode question allowlist without a raw-template escape", async () => {
    const process = controlledSpawn({ kind: "close", code: 0 })

    await expect(
      createNotify({ platform: "win32", spawn: process.spawn })(
        notifications.question,
      ),
    ).resolves.toEqual({ delivered: true })

    const call = process.calls[0]
    expect(call).toBeDefined()
    const source = Buffer.from(call!.args[3]!, "base64").toString("utf16le")
    const unicodeEscape = "\\u" + "00F6"

    expect(source).not.toContain(unicodeEscape)
    expect(source).toContain(
      "$questionBody = 'Deine Auswahl wird ben' + [char]0x00F6 + 'tigt'",
    )
    expect(source).toContain(
      "(($eventType -ceq 'question.asked') -and ($body -ceq $questionBody))",
    )

    const payload = JSON.parse(
      Buffer.from(call!.stdin!, "base64").toString("utf8"),
    )
    expect(payload.body).toBe(
      "Deine Auswahl wird ben" + String.fromCharCode(0x00f6) + "tigt",
    )
    expect(payload.body).toBe(notifications.question.body)
  })

  test("keeps OSC, BEL, and ESC out of every spawn input and payload", async () => {
    const terminalControlCharacters = /[\u0007\u001b]/u

    for (const notification of Object.values(notifications)) {
      const process = controlledSpawn({ kind: "close", code: 0 })

      await expect(
        createNotify({ platform: "win32", spawn: process.spawn })(notification),
      ).resolves.toEqual({ delivered: true })

      expect(process.calls).toHaveLength(1)
      const call = process.calls[0]!
      const source = Buffer.from(call.args[3]!, "base64").toString("utf16le")
      const payloadText = Buffer.from(call.stdin!, "base64").toString("utf8")
      const payload = JSON.parse(payloadText)

      expect("env" in call.options).toBe(false)
      for (const value of [
        call.executable,
        ...call.args,
        JSON.stringify(call.options),
        call.stdin!,
        source,
        payloadText,
      ]) {
        expect(value).not.toMatch(terminalControlCharacters)
      }
      expect(payload).toEqual({
        event: notification.event,
        title: notification.title,
        body: notification.body,
      })
    }
  })

  test("spawns at most once per notify call on success and failure", async () => {
    for (const notification of Object.values(notifications)) {
      for (const code of [0, 43]) {
        const process = controlledSpawn({ kind: "close", code })
        const notify = createNotify({
          platform: "win32",
          spawn: process.spawn,
          log: () => undefined,
        })

        await notify(notification)
        await Promise.resolve()
        await Promise.resolve()

        expect(process.calls).toHaveLength(1)
      }
    }
  })

  test("rejects non-allowlisted mappings before spawn", async () => {
    const invalid: Notification[] = [
      { ...notifications.idle, title: "Other" } as unknown as Notification,
      { ...notifications.idle, body: "dynamic body" } as unknown as Notification,
      {
        ...notifications.idle,
        event: "session.created",
      } as unknown as Notification,
    ]

    for (const notification of invalid) {
      let spawnCount = 0
      const notify = createNotify({
        platform: "win32",
        spawn: (() => {
          spawnCount += 1
          throw new Error("must not launch")
        }) as SpawnProcess,
        log: () => undefined,
      })

      await expect(notify(notification)).resolves.toEqual({
        delivered: false,
        category: "runtime-failed",
      })
      expect(spawnCount).toBe(0)
    }
  })

  test("logs only redacted fixed fields and contains logger failures", async () => {
    const logs: TransportLogEntry[] = []
    const notify = createNotify({
      platform: "win32",
      spawn: (() => {
        throw new Error("raw process error")
      }) as SpawnProcess,
      log: (entry) => logs.push(entry),
    })

    await notify(notifications.permission)

    expect(logs).toEqual([
      {
        eventType: "permission.asked",
        sessionID: expect.stringMatching(/^sha256:[a-f0-9]{12}$/),
        category: "launch-failed",
      },
    ])
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain("session-secret")
    expect(serialized).not.toContain("Aktion erfordert")
    expect(serialized).not.toContain("raw process error")

    const syncLogFailure = createNotify({
      platform: "win32",
      spawn: (() => {
        throw new Error("launch")
      }) as SpawnProcess,
      log: () => {
        throw new Error("sync logger failure")
      },
    })
    const asyncLogFailure = createNotify({
      platform: "win32",
      spawn: (() => {
        throw new Error("launch")
      }) as SpawnProcess,
      log: async () => {
        throw new Error("async logger failure")
      },
    })

    await expect(syncLogFailure(notifications.error)).resolves.toEqual({
      delivered: false,
      category: "launch-failed",
    })
    await expect(asyncLogFailure(notifications.error)).resolves.toEqual({
      delivered: false,
      category: "launch-failed",
    })
  })

  test("uses a silent no-op when no logger is available", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined)
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined)
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined)

    try {
      const notify = createNotify({
        platform: "win32",
        spawn: (() => {
          throw new Error("primary transport failed")
        }) as SpawnProcess,
      })

      await expect(notify(notifications.idle)).resolves.toEqual({
        delivered: false,
        category: "launch-failed",
      })
      await Promise.resolve()

      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  test("terminates a primary failure without retry timers, loops, or fallback", async () => {
    const timeoutSpy = spyOn(globalThis, "setTimeout")
    const intervalSpy = spyOn(globalThis, "setInterval")
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined)
    let spawnCount = 0

    try {
      const notify = createNotify({
        platform: "win32",
        spawn: (() => {
          spawnCount += 1
          throw new Error("primary transport failed")
        }) as SpawnProcess,
      })

      await expect(notify(notifications.permission)).resolves.toEqual({
        delivered: false,
        category: "launch-failed",
      })
      await Promise.resolve()
      await Promise.resolve()

      expect(spawnCount).toBe(1)
      expect(timeoutSpy).not.toHaveBeenCalled()
      expect(intervalSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      timeoutSpy.mockRestore()
      intervalSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  test("times out once, kills once, and does not retry", async () => {
    const process = controlledSpawn({ kind: "timeout" })
    const notify = createNotify({
      platform: "win32",
      spawn: process.spawn,
      timeoutMs: 1,
      log: () => undefined,
    })

    await expect(notify(notifications.idle)).resolves.toEqual({
      delivered: false,
      category: "runtime-failed",
    })
    expect(process.calls).toHaveLength(1)
    expect(process.killCount).toBe(1)
  })

  test("bounds invalid and oversized timeouts without exposing them to PowerShell", async () => {
    const argumentSets: string[][] = []

    for (const timeoutMs of [Number.NaN, 0, 100_000]) {
      const process = controlledSpawn({ kind: "close", code: 0 })
      await createNotify({
        platform: "win32",
        spawn: process.spawn,
        timeoutMs,
      })(notifications.idle)

      expect(process.calls).toHaveLength(1)
      argumentSets.push([...process.calls[0]!.args])
    }

    expect(argumentSets[1]).toEqual(argumentSets[0])
    expect(argumentSets[2]).toEqual(argumentSets[0])
  })
})
