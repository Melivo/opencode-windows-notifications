# OpenCode Windows Notifications

Native Windows toast notifications for OpenCode server and TUI plugins.

## Compatibility and scope

- Package name: `opencode-windows-notifications`.
- OpenCode version range: `>=1.18.16 <1.19.0` (`engines.opencode` in `package.json`). The package is compiled and verified against `@opencode-ai/plugin@1.18.16`.
- Server entrypoint: `exports["./server"]` and `main` both point at `./dist/src/index.js`.
- TUI entrypoint: `exports["./tui"]` points at `./dist/src/tui-entry.js` for TUI-only `question.asked` menu attention.
- Server plugin contract: a named, typed `Plugin` export named `plugin`; the default export is optional and, in this package, is the same reference as `plugin` to avoid duplicate hook registration.
- TUI plugin contract: the default export is the TUI module shape with `id` and `tui` only.
- Platform scope: Windows only (`os: ["win32"]`). On non-Windows hosts the runtime is inert and must not start PowerShell or any fallback transport.

## Installation and registration

Install the published package through OpenCode:

```powershell
opencode plugin opencode-windows-notifications --global
```

OpenCode adds the package name to the documented server plugin array in `opencode.json`:

```json
{
  "plugin": ["opencode-windows-notifications"]
}
```

The verified OpenCode 1.18.16 npm server-plugin loader resolves the package through the configured plugin array and then loads `exports["./server"]` or `main`.

OpenCode also registers the same base package name in the documented TUI plugin configuration in `tui.json`/`tui.jsonc`:

```json
{
  "plugin": ["opencode-windows-notifications"]
}
```

Keep the server and TUI registrations separate by file: `opencode.json`/`opencode.jsonc` loads the server entrypoint, while `tui.json`/`tui.jsonc` loads the TUI entrypoint from the same base package name for TUI question/menu events.

## One-time host setting

To avoid duplicate desktop notifications, set OpenCode's TUI attention notification flag once in `~/.config/opencode/tui.jsonc`:

```json
{
  "attention": {
    "notifications": false
  }
}
```

If this setting is omitted while host attention notifications remain enabled, terminal-side duplicate notifications are possible. Installers or setup helpers must not overwrite existing `attention` settings; they may only document or prompt for the explicit `attention.notifications:false` change.

## Implemented events and fixed toast text

The package implements server notifications for completed/idle work and permissions, plus the TUI notification for selection-menu questions:

| Host signal | Owner | Status | Title | Body |
| --- | --- | --- | --- |
| Assistant message completion / `session.idle` | Server entrypoint | Implemented | `OpenCode` | `Antwort abgeschlossen` |
| `permission.asked` | Server entrypoint | Implemented | `OpenCode` | `Aktion erfordert deine Freigabe` |
| `question.asked` selection-menu open | TUI entrypoint | Implemented | `OpenCode` | `Deine Auswahl wird benötigt` |
| `session.error` | n/a | Excluded | n/a | n/a |

OpenCode 1.18.16 emits runtime permission requests as `permission.asked` events. The implementation validates the event's `id` and `sessionID`, rejects blank IDs, and routes them through the same primary-session eligibility and bounded deduplication path. Repeated delivery of the same stable permission ID causes one transport attempt.

TUI selection menus are emitted as `question.asked` events. The TUI entrypoint reads only the stable question `id` and `sessionID`, never the question text, menu labels, tool data, prompt, response, file path, command, or raw error content. The server entrypoint does not own question/menu notifications, so one menu-open event should have one native-toast owner when the TUI entrypoint is registered.

`session.error` is excluded because no stable, dedicated error transition or dedupe identifier has been confirmed. The generic event envelope ID is not treated as an error-transition ID.

The implementation maps completed assistant-message updates into the same fixed completion toast path, but it does not expose dynamic prompt, response, file path, command, menu, question, or raw error content.

## TUI and session eligibility limits

Only primary sessions are eligible. Sessions with a non-empty `parentID`, unknown sessions, and failed session lookups are ignored.

This is a primary-session proxy. The server entrypoint does not claim an authoritative TUI-only discriminator; TUI menu notifications are isolated in the separate TUI subpath entrypoint.

## Privacy and reliability

- Toast payloads are fixed strings only; event data must not be included in toast title/body.
- Logs must not include prompts, model responses, file contents, command lines, raw errors, or other sensitive event payloads.
- Windows toast delivery uses the native Windows transport with notifier identity `ai.opencode.desktop`.
- PowerShell is started without shell interpolation.
- Non-Windows behavior is inert: no process start and no fallback transport.
- There is no OSC, BEL, terminal escape-sequence, retry-loop, or secondary-transport fallback.
- Transport, hook, lookup, and logging failures are contained and must not change OpenCode session state.
- Eligible events may cause at most one transport attempt; retries and fallback spawns are out of scope.

If the plugin does not load after installation, reinstall it with:

```powershell
opencode plugin opencode-windows-notifications --global --force
```
