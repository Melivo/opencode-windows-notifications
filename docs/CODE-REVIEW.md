# Code Review Standards

## Checklist

- Confirm the named `plugin` export remains typed and any default export is the identical reference.
- Confirm events are fail-closed before eligibility and host-facing failures are fail-open.
- Confirm subagents, missing sessions, and unstable identifiers cannot reach the transport.
- Confirm notification title/body values remain fixed and allowlisted in TypeScript and PowerShell.
- Confirm PowerShell invocation remains absolute-path, `shell: false`, static-command, stdin-only data flow.
- Confirm no retry, fallback, terminal escape sequence, or raw/sensitive log data was added.
- Update tests at the same layer as the change, including integration tests for adapter-to-transport wiring.

## Severity

| Level | Meaning |
| --- | --- |
| Blocker | Can execute untrusted content, leak sensitive data, duplicate user notifications, or break OpenCode host behavior. |
| Major | Breaks a documented event, eligibility rule, package contract, or platform inertness. |
| Minor | Weakens diagnostics, test coverage, maintainability, or documented constraints without immediate unsafe behavior. |
| Nit | Non-functional consistency concern. |

## Human Review

Require human review for changes crossing the OpenCode SDK contract, npm loader assumptions, PowerShell/Windows Runtime boundary, or user-visible notification semantics. Routine internal refactors that preserve these invariants may be auto-approved after relevant tests pass.
