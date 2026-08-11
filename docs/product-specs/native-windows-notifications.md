# Native Windows Notifications

## User Problem

OpenCode TUI users on Windows need desktop attention signals when terminal notification escape sequences are unavailable or unsuitable.

## Product Behavior

- On Windows, a completed primary-session response can show `OpenCode: Antwort abgeschlossen`.
- A new permission request for a primary session can show `OpenCode: Aktion erfordert deine Freigabe`.
- A newly opened TUI selection menu for a primary session can show `OpenCode: Deine Auswahl wird benötigt`.
- Toasts are native Windows notifications using the OpenCode desktop notifier identity.

## Acceptance Criteria

- A subagent session, identified by non-empty `parentID`, never triggers a toast.
- Repeated completed-response, permission, or question inputs with the same stable identity do not create duplicate notifications.
- `question.asked` toast ownership stays in the TUI entrypoint; the server plugin remains idle/permission-only.
- Toast content never includes user or model content, file paths, commands, or raw errors.
- Non-Windows execution remains inert.
- Transport, lookup, and logging failures do not interrupt OpenCode.
- Users should set `attention.notifications:false` in TUI configuration to avoid duplicate host attention notifications.

## Explicit Exclusions

- `session.error` notifications are excluded until a stable host error-transition identifier is available.
- User-configurable messages, toast actions, retry delivery, and cross-platform notification transports are not implemented.
- Retry loops and fallback notification transports remain excluded for all entrypoints.
