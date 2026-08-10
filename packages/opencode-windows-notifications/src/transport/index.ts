import { spawn as nodeSpawn } from "node:child_process"
import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { win32 } from "node:path"
import { env, platform as runtimePlatform } from "node:process"

import type {
  Notification,
  NotificationEvent,
  NotificationResult,
  Notify,
} from "../contract.js"

type FailureResult = Extract<NotificationResult, { delivered: false }>
type FailureCategory = FailureResult["category"]
type LoggedEventType = NotificationEvent | "invalid"

export type TransportLogEntry = Readonly<{
  eventType: LoggedEventType
  sessionID: string
  category: FailureCategory
}>

type TransportProcess = Readonly<{
  stdin: Readonly<{
    once(event: "error", listener: (error: unknown) => void): unknown
    end(data: string): void
  }> | null
  once(event: "error", listener: (error: unknown) => void): unknown
  once(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): unknown
  kill(): boolean
}>

type SpawnProcessOptions = Readonly<{
  shell: false
  windowsHide: true
  stdio: readonly ["pipe", "ignore", "ignore"]
}>

export type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnProcessOptions,
) => TransportProcess

export type CreateNotifyDependencies = Readonly<{
  spawn?: SpawnProcess
  platform?: string
  log?: (entry: TransportLogEntry) => void | Promise<void>
  timeoutMs?: number
}>

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 60_000
const MAX_STDIN_LENGTH = 2_048
const POWERSHELL_BLOCKED_EXIT_CODE = 41
const IDENTITY_UNAVAILABLE_EXIT_CODE = 42

const EXPECTED_BODIES = Object.freeze({
  "session.idle": "Antwort abgeschlossen",
  "session.error": "Sitzung fehlgeschlagen",
  "permission.asked": "Aktion erfordert deine Freigabe",
} satisfies Readonly<Record<NotificationEvent, Notification["body"]>>)

const POWERSHELL_SOURCE = String.raw`
$ErrorActionPreference = 'Stop'

try {
  $encodedPayload = [Console]::In.ReadToEnd()
  if ([String]::IsNullOrWhiteSpace($encodedPayload) -or $encodedPayload.Length -gt 2048) {
    exit 43
  }

  try {
    $payloadBytes = [Convert]::FromBase64String($encodedPayload)
    if ($payloadBytes.Length -gt 1024) {
      exit 43
    }
    $payload = [Text.Encoding]::UTF8.GetString($payloadBytes) | ConvertFrom-Json
  }
  catch {
    exit 43
  }

  $eventType = [string]$payload.event
  $title = [string]$payload.title
  $body = [string]$payload.body
  $isAllowed =
    (($eventType -ceq 'session.idle') -and ($body -ceq 'Antwort abgeschlossen')) -or
    (($eventType -ceq 'session.error') -and ($body -ceq 'Sitzung fehlgeschlagen')) -or
    (($eventType -ceq 'permission.asked') -and ($body -ceq 'Aktion erfordert deine Freigabe'))

  if (($title -cne 'OpenCode') -or (-not $isAllowed)) {
    exit 43
  }

  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  $toastXml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
    [Windows.UI.Notifications.ToastTemplateType]::ToastText02
  )
  $textNodes = $toastXml.GetElementsByTagName('text')
  $textNodes.Item(0).AppendChild($toastXml.CreateTextNode('OpenCode')) > $null
  $textNodes.Item(1).AppendChild($toastXml.CreateTextNode($body)) > $null
  $toast = New-Object Windows.UI.Notifications.ToastNotification $toastXml

  try {
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('ai.opencode.desktop')
    if ($null -eq $notifier) {
      exit 42
    }
  }
  catch {
    exit 42
  }

  $notifier.Show($toast)
  exit 0
}
catch [System.Management.Automation.PSSecurityException] {
  exit 41
}
catch [System.UnauthorizedAccessException] {
  exit 41
}
catch {
  exit 43
}
`.trim()

const ENCODED_COMMAND = Buffer.from(POWERSHELL_SOURCE, "utf16le").toString(
  "base64",
)
const POWERSHELL_ARGS = Object.freeze([
  "-NoProfile",
  "-NonInteractive",
  "-EncodedCommand",
  ENCODED_COMMAND,
])

const SPAWN_OPTIONS: SpawnProcessOptions = Object.freeze({
  shell: false,
  windowsHide: true,
  stdio: ["pipe", "ignore", "ignore"] as const,
})

function resolvePowerShellPath(): string {
  const configuredRoot = env.SystemRoot
  const windowsRoot =
    configuredRoot && win32.isAbsolute(configuredRoot)
      ? configuredRoot
      : String.raw`C:\Windows`

  return win32.resolve(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  )
}

function defaultSpawn(
  executable: string,
  args: readonly string[],
  options: SpawnProcessOptions,
): TransportProcess {
  return nodeSpawn(executable, [...args], options)
}

function defaultLog(): void {
  // A missing host logger is deliberately a fail-open no-op.
}

function failure(category: FailureCategory): FailureResult {
  return { delivered: false, category }
}

function eventTypeForLog(notification: Notification): LoggedEventType {
  return Object.prototype.hasOwnProperty.call(
    EXPECTED_BODIES,
    notification.event,
  )
    ? notification.event
    : "invalid"
}

function reducedSessionID(notification: Notification): string {
  const sessionID =
    typeof notification.sessionID === "string"
      ? notification.sessionID
      : "invalid"
  const digest = createHash("sha256").update(sessionID).digest("hex").slice(0, 12)

  return `sha256:${digest}`
}

function logFailure(
  log: (entry: TransportLogEntry) => void | Promise<void>,
  notification: Notification,
  category: FailureCategory,
): void {
  try {
    void Promise.resolve(
      log({
        eventType: eventTypeForLog(notification),
        sessionID: reducedSessionID(notification),
        category,
      }),
    ).catch(() => undefined)
  } catch {
    // Logging is deliberately fail-open.
  }
}

function isAllowedNotification(notification: Notification): boolean {
  if (
    notification.title !== "OpenCode" ||
    !Object.prototype.hasOwnProperty.call(EXPECTED_BODIES, notification.event)
  ) {
    return false
  }

  return EXPECTED_BODIES[notification.event] === notification.body
}

function encodePayload(notification: Notification): string | undefined {
  const payload = Buffer.from(
    JSON.stringify({
      event: notification.event,
      title: notification.title,
      body: notification.body,
    }),
    "utf8",
  ).toString("base64")

  return payload.length <= MAX_STDIN_LENGTH ? payload : undefined
}

function categoryForExitCode(code: number | null): NotificationResult {
  if (code === 0) return { delivered: true }
  if (code === 1 || code === POWERSHELL_BLOCKED_EXIT_CODE) {
    return failure("powershell-blocked")
  }
  if (code === IDENTITY_UNAVAILABLE_EXIT_CODE) {
    return failure("identity-unavailable")
  }

  return failure("runtime-failed")
}

function runPowerShell(
  spawn: SpawnProcess,
  payload: string,
  timeoutMs: number,
): Promise<NotificationResult> {
  return new Promise((resolve) => {
    let child: TransportProcess

    try {
      child = spawn(resolvePowerShellPath(), POWERSHELL_ARGS, SPAWN_OPTIONS)
    } catch {
      resolve(failure("launch-failed"))
      return
    }

    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const settle = (result: NotificationResult): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      resolve(result)
    }

    try {
      child.once("error", () => settle(failure("launch-failed")))
      child.once("close", (code) => settle(categoryForExitCode(code)))

      if (!child.stdin) {
        settle(failure("runtime-failed"))
        return
      }

      child.stdin.once("error", () => settle(failure("runtime-failed")))
      timeout = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // Process cleanup is best effort; the result is still contained.
        }
        settle(failure("runtime-failed"))
      }, timeoutMs)
      child.stdin.end(payload)
    } catch {
      settle(failure("runtime-failed"))
    }
  })
}

function boundedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
    return DEFAULT_TIMEOUT_MS
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(timeoutMs)))
}

export function createNotify(
  dependencies: CreateNotifyDependencies = {},
): Notify {
  const spawn = dependencies.spawn ?? defaultSpawn
  const platform = dependencies.platform ?? runtimePlatform
  const log = dependencies.log ?? defaultLog
  const timeoutMs = boundedTimeout(dependencies.timeoutMs)

  return async (notification) => {
    if (platform !== "win32") {
      return failure("unsupported-platform")
    }

    let result: NotificationResult

    try {
      if (!isAllowedNotification(notification)) {
        result = failure("runtime-failed")
      } else {
        const payload = encodePayload(notification)
        result = payload
          ? await runPowerShell(spawn, payload, timeoutMs)
          : failure("runtime-failed")
      }
    } catch {
      result = failure("runtime-failed")
    }

    if (!result.delivered) {
      logFailure(log, notification, result.category)
    }

    return result
  }
}

export const notify: Notify = createNotify()
