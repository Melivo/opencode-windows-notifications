# Native Windows Notifications

## User Problem

OpenCode TUI users on Windows need desktop attention signals when terminal notification escape sequences are unavailable or unsuitable.

## Product Behavior

- On Windows, a completed primary-session response can show `OpenCode: Antwort abgeschlossen`.
- A new permission request for a primary session can show `OpenCode: Aktion erfordert deine Freigabe`.
- Toasts are native Windows notifications using the OpenCode desktop notifier identity.

## Acceptance Criteria

- A subagent session, identified by non-empty `parentID`, never triggers a toast.
- Repeated completed-response or permission inputs with the same stable identity do not create duplicate notifications.
- Toast content never includes user or model content, file paths, commands, or raw errors.
- Non-Windows execution remains inert.
- Transport, lookup, and logging failures do not interrupt OpenCode.

## Explicit Exclusions

- `session.error` notifications are excluded until a stable host error-transition identifier is available.
- User-configurable messages, toast actions, retry delivery, and cross-platform notification transports are not implemented.
