# Core Beliefs

## Contain Host-Adjacent Failures

Plugin hooks, session lookups, logging, and transport delivery must fail open. A desktop notification is supplementary and must never alter OpenCode session state.

## Prefer Fixed, Verifiable Data

Notifications use a closed event/body allowlist. Prompt text, responses, paths, commands, and raw errors do not cross the eligibility-to-transport boundary.

## Separate Server And TUI Ownership

The package can expose both server and TUI entrypoints, but each host attention moment has one owner. Server hooks own idle and permission toasts; the TUI entrypoint owns menu/question toasts registered through TUI configuration.

## Reject Ambiguity

Unknown sessions, missing stable identifiers, malformed events, and unconfirmed error transitions produce no notification. Correct deduplication is preferred over best-effort delivery.

## Keep Platform Scope Explicit

The package is Windows-only and inert elsewhere. Native delivery is deliberate; terminal escape sequences and cross-platform fallback transports are outside the design.

## Test Runtime Boundaries

The test suite treats the host contract, process spawn boundary, and isolated npm loader as separate verification concerns. A manual toast smoke test proves visibility only, not package loading.
