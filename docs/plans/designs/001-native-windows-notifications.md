# Native Windows Notifications for OpenCode

## Status

Approved design. Implementation is out of scope for this document.

## Objective

Provide reliable native Windows toast notifications for primary OpenCode TUI sessions when OpenCode runs in Windows Terminal or in the integrated terminal of VS Code, VSCodium, or Code - OSS. The design bypasses terminal notification escape sequences, which Windows Terminal 1.24 does not support for this purpose.

## Scope

- Windows only.
- OpenCode TUI only, including a TUI hosted in an editor's integrated terminal.
- Events: `session.idle`, `session.error`, and `permission.asked`.
- Toasts are always requested, regardless of focus.
- Native Windows transport: Windows PowerShell and `Windows.UI.Notifications` with notifier identity `ai.opencode.desktop`.
- Toasts use these fixed messages:

| Event | Title | Body |
| --- | --- | --- |
| `session.idle` | `OpenCode` | `Antwort abgeschlossen` |
| `session.error` | `OpenCode` | `Sitzung fehlgeschlagen` |
| `permission.asked` | `OpenCode` | `Aktion erfordert deine Freigabe` |

## Non-goals

- OpenCode Desktop changes; its notification behavior already works.
- Notifications for subagent activity, tool calls, progress, or completion.
- Cross-platform notification support.
- Toast actions.
- User-facing plugin options in version 1.
- A persistent background notification bridge.

## Architecture

The deliverable is a published, TUI-targeted OpenCode plugin. It is not a server plugin and does not load in non-TUI OpenCode clients.

1. OpenCode delivers an eligible event to the TUI plugin.
2. The plugin resolves the associated session and rejects it when `parentID` is non-empty.
3. An event-state filter verifies that the event represents a new primary-session transition.
4. The event mapper produces only the fixed title and body listed above.
5. The native transport safely encodes the fixed structured toast payload and invokes a short-lived Windows PowerShell process.
6. PowerShell calls `Windows.UI.Notifications` with `ai.opencode.desktop`.
7. Transport failures are contained and logged; they never alter OpenCode session state or rethrow into the event path.

On non-Windows hosts the plugin remains inert. On systems where the required host capabilities are unavailable, it performs no toast action and emits a concise diagnostic.

## Event and Session Contracts

### Primary-session rule

- A session with a non-empty `parentID` is a subagent session.
- Every event for a subagent session is discarded.
- A subagent event must never infer or trigger completion of a parent session.
- A missing or unresolvable session produces no toast.

### Event eligibility

- `session.idle` is eligible only after at least one new assistant response since the prior delivered or observed idle transition for that session.
- Repeated idle events without a new assistant response are ignored.
- `session.error` is eligible once per unique error transition.
- `permission.asked` is eligible once per permission request.
- Unknown, malformed, incomplete, or uncorrelated events are ignored safely.

### Dedupe keys

- Idle: session ID plus an in-memory assistant-response epoch.
- Permission: session ID plus a host-provided permission-request ID.
- Error: session ID plus a host-provided error event ID or error-state revision.
- Dedupe state is per session and exists only for the active TUI runtime. It resets cleanly at TUI restart.
- If a required stable identifier is unavailable, the event is not delivered. Correctness takes precedence over a potentially duplicate toast.

## Transport and Security

- The plugin must launch PowerShell without shell interpolation.
- Event data must never form executable PowerShell source.
- Toast values must be safe for both process-argument and XML contexts.
- The transport must use bounded static notification text only; prompts, responses, file paths, commands, and raw error text are never included.
- A failed launch, PowerShell policy block, Windows Runtime failure, or unavailable notifier identity returns a contained failure result.
- Logging includes only event type, a safely reduced session identifier, and failure category. It excludes toast contents and sensitive session data.
- There is no OSC 777, BEL, or terminal escape-sequence fallback.

## Installation and Host Integration

OpenCode's supported TUI-plugin flow is authoritative:

```text
opencode plugin <package> --global
```

- `opencode plug <package>` is an equivalent alias.
- The package exposes the `exports["./tui"]` entrypoint and declares the validated `engines.opencode` compatibility range `>=1.18.15 <1.19.0`.
- Global installation updates the global OpenCode configuration and adds the plugin to `tui.json`.
- TUI plugins are not discovered merely by placing a file under `~/.config/opencode/plugins/`; that earlier PRD assumption is replaced by the installation flow above.
- The package applies only to OpenCode TUI sessions, including TUI sessions in editor terminals.

### Preventing duplicate delivery

The plugin replaces, rather than supplements, OpenCode's terminal-mediated desktop notification path. The installation documentation requires this one-time host setting:

```json
{
  "attention": {
    "notifications": false
  }
}
```

This disables terminal desktop-notification requests while leaving independent TUI sound behavior intact. The plugin installer must not silently overwrite existing host attention settings. If this setting is omitted and host attention is enabled, terminal-side duplicate notifications remain possible.

## Compatibility Gates

Implementation and release require verification of all five compatibility gates against the declared OpenCode version range `>=1.18.15 <1.19.0`:

- `gate-process-api`: the TUI plugin runtime offers a shell-free, Windows-safe way to start the required PowerShell process.
- `gate-event-data`: the event API exposes the data required for session resolution, subagent detection, assistant-response tracking, and stable permission/error dedupe identifiers.
- `gate-client-identity`: an authoritative `client === 'tui'` identity is available in the plugin context.
- `gate-entrypoint-install`: the plugin manifest's `exports["./tui"]` entrypoint is detected by the official global installation path, `opencode plugin <package> --global`.
- `gate-windows-toast`: a TUI process can deliver a toast through `ai.opencode.desktop` on the target Windows installation.

Failure of any gate blocks release. There is no fallback to terminal escape sequences.

## Edge Cases

| Condition | Required behavior |
| --- | --- |
| Non-Windows host | Load safely and do nothing. |
| Non-TUI OpenCode client or Desktop | Do not load the TUI plugin; no impact. |
| Subagent event | Ignore completely. |
| Session cannot be resolved | Do not toast. |
| Repeated idle event | Do not toast unless a new assistant response advanced the epoch. |
| Repeated permission/error | Deduplicate with the required stable transition identifier. |
| Out-of-order event | Make no unverified state inference; do not toast if eligibility cannot be established. |
| Concurrent primary sessions | Maintain independent state and dedupe keys per session. |
| PowerShell/Windows Runtime failure | Log minimally and continue the OpenCode session unchanged. |
| Windows toast identity unavailable | Log minimally; do not retry indefinitely or fall back to OSC. |

## Validation Strategy

- Unit tests cover event filtering, primary-versus-subagent selection, response-epoch idle gating, permission/error dedupe, payload encoding, and failure containment.
- Host-contract tests validate the event/session adapter against the supported OpenCode version range.
- Windows integration smoke tests verify native toast delivery through `ai.opencode.desktop` in Windows Terminal and in an integrated editor terminal.
- Installation tests verify the global `opencode plugin <package> --global` path and TUI-target detection.
- Regression tests verify that transport failures neither reject the event handler nor change OpenCode session behavior.

## Decisions

- Always request notification delivery; do not suppress on focus.
- Use a direct, short-lived PowerShell process per eligible event rather than a persistent bridge.
- Use native Windows notifications rather than OpenCode's terminal-mediated Attention notification transport.
- Use a TUI-targeted package to scope behavior to the TUI across Windows Terminal and editor terminals.
- Require documented disabling of `attention.notifications` to avoid duplicate host notifications.
