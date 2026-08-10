export type NotificationEvent =
  | "session.idle"
  | "session.error"
  | "permission.asked"

export type EligibleEvent =
  | Readonly<{
      type: "assistant.response.completed"
      sessionID: string
      assistantResponseID: string
    }>
  | Readonly<{
      type: "session.idle"
      sessionID: string
    }>

export type HostContext = Readonly<{
  resolveSession(
    sessionID: string,
  ): Promise<{ id: string; parentID?: string } | undefined>
}>

export type Notification = Readonly<{
  event: NotificationEvent
  title: "OpenCode"
  body:
    | "Antwort abgeschlossen"
    | "Sitzung fehlgeschlagen"
    | "Aktion erfordert deine Freigabe"
  sessionID: string
}>

export type NotificationResult =
  | Readonly<{ delivered: true }>
  | Readonly<{
      delivered: false
      category:
        | "unsupported-platform"
        | "launch-failed"
        | "powershell-blocked"
        | "runtime-failed"
        | "identity-unavailable"
    }>

export type Notify = (
  notification: Notification,
) => Promise<NotificationResult>

export type OnEvent = (
  event: EligibleEvent,
  hostContext: HostContext,
) => Promise<void>

export type CreateOnEvent = (
  dependencies: Readonly<{ notify: Notify }>,
) => OnEvent

export type PermissionRequest = Readonly<{
  id: string
  sessionID: string
}>

export type OnPermission = (
  permission: PermissionRequest,
  hostContext: HostContext,
) => Promise<void>

export type CreateOnPermission = (
  dependencies: Readonly<{ notify: Notify }>,
) => OnPermission
