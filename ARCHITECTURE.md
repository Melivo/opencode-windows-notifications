# Architecture

> Windows-only OpenCode server + TUI plugin package for privacy-safe native toast notifications.

## Domain Map

| Domain | Owns | Boundary |
| --- | --- | --- |
| Package entrypoints | Published server entrypoint, TUI subpath, and plugin identity | Exposes the typed server `plugin` function plus the TUI entrypoint exported as `exports["./tui"]` and registered by TUI configuration. |
| Host adapters | OpenCode server and TUI hook projection, session lookup, and host logging | Depends on documented OpenCode plugin contracts for each host surface. |
| Eligibility | Primary-session checks and bounded event deduplication | Produces only fixed notification contracts. |
| Transport | PowerShell lifecycle, payload validation, redacted diagnostics | Starts at most one Windows PowerShell process per eligible notification. |
| Windows Runtime | Native toast delivery | Uses `Windows.UI.Notifications` with `ai.opencode.desktop`. |

## Layers

```mermaid
flowchart LR
  H[OpenCode server events] --> A[Server adapter]
  Q[OpenCode TUI menu/question events] --> U[TUI adapter]
  A --> E[Eligibility]
  U --> E
  E --> T[Windows transport]
  T --> W[PowerShell and Windows Runtime]
  T -. contained diagnostic .-> A
  A -. client.app.log .-> H
```

Dependencies flow only left to right. `contract.ts` is the shared internal type boundary. The eligibility layer does not depend on OpenCode SDKs or process APIs; the transport does not receive raw host event payloads.

## Data Flow

1. The server adapter receives documented OpenCode server hooks.
2. The server adapter projects only completed assistant responses, idle events, and permission requests into the internal contract. It remains the idle/permission owner and ignores question events.
3. The TUI adapter is registered separately through `tui.json`/`tui.jsonc` using the package's TUI subpath export and is the sole owner of `question.asked` menu-open toasts.
4. Eligibility resolves the session, rejects missing or subagent sessions, and deduplicates in bounded per-session state.
5. Eligible notifications contain one of the fixed title/body pairs only.
6. The transport validates that allowlist, encodes the fixed payload through stdin, and invokes a short-lived PowerShell process with `shell: false`.
7. Delivery failures become redacted host-log entries and never reject into OpenCode.

## Integration Constraints

- The npm package publishes the server entrypoint through `exports["./server"]` and `main`, and publishes the TUI entrypoint through `exports["./tui"]`.
- The OpenCode SDK is type-only at package build time; runtime integration is through the host-provided plugin contract.
- Windows is both a package and runtime boundary. Other platforms return inert hooks and never start a fallback transport.
- `session.error` is represented in the internal transport allowlist but is not projected from the host because a stable error-transition identifier is unconfirmed.
- Host attention notifications should be disabled with `attention.notifications:false` so the package and OpenCode's built-in attention path do not compete for the same user attention moment.
- Primary-session detection uses a non-empty `parentID` exclusion. Subagent sessions are never eligible for server or TUI toasts.
