# Architecture

> Windows-only OpenCode server plugin for privacy-safe native toast notifications.

## Domain Map

| Domain | Owns | Boundary |
| --- | --- | --- |
| Package entrypoint | Published server entrypoint and plugin identity | Exposes the typed `plugin` function. |
| Host adapter | OpenCode hook projection, session lookup, and host logging | Depends on the documented `@opencode-ai/plugin` API. |
| Eligibility | Primary-session checks and bounded event deduplication | Produces only fixed notification contracts. |
| Transport | PowerShell lifecycle, payload validation, redacted diagnostics | Starts at most one Windows PowerShell process per eligible notification. |
| Windows Runtime | Native toast delivery | Uses `Windows.UI.Notifications` with `ai.opencode.desktop`. |

## Layers

```mermaid
flowchart LR
  H[OpenCode host events] --> A[Plugin adapter]
  A --> E[Eligibility]
  E --> T[Windows transport]
  T --> W[PowerShell and Windows Runtime]
  T -. contained diagnostic .-> A
  A -. client.app.log .-> H
```

Dependencies flow only left to right. `contract.ts` is the shared internal type boundary. The eligibility layer does not depend on the OpenCode SDK or process APIs; the transport does not receive raw host event payloads.

## Data Flow

1. The plugin adapter receives documented OpenCode hooks.
2. It projects only completed assistant responses, idle events, and permission requests into the internal contract.
3. Eligibility resolves the session, rejects missing or subagent sessions, and deduplicates in bounded per-session state.
4. Eligible notifications contain one of the fixed title/body pairs only.
5. The transport validates that allowlist, encodes the fixed payload through stdin, and invokes a short-lived PowerShell process with `shell: false`.
6. Delivery failures become redacted host-log entries and never reject into OpenCode.

## Integration Constraints

- The npm package publishes the server entrypoint through `exports["./server"]` and `main`.
- The OpenCode SDK is type-only at package build time; runtime integration is through the host-provided plugin contract.
- Windows is both a package and runtime boundary. Other platforms return inert hooks and never start a fallback transport.
- `session.error` is represented in the internal transport allowlist but is not projected from the host because a stable error-transition identifier is unconfirmed.
- Primary-session detection uses a non-empty `parentID` exclusion. This is an observed proxy, not a confirmed TUI discriminator. <!-- TODO: confirm a future authoritative OpenCode client discriminator if it becomes available. -->
