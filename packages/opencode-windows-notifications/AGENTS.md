<!-- Parent: ../../AGENTS.md -->

# OpenCode Windows Notifications Package

> Published TypeScript server plugin that maps eligible OpenCode events to native Windows toasts.

## Constraints

- Keep `plugin` as the named, typed entrypoint; any default export must be the same reference.
- Use only fixed, allowlisted notification content and redacted diagnostics.
- Never interpolate event data into PowerShell, add a fallback transport, or retry delivery.
- Treat non-empty `parentID` sessions as subagents and do not notify for them.

## Working Here

- Keep OpenCode SDK adaptation in `src/plugin.ts` and internal contracts in `src/contract.ts`.
- Keep event eligibility and bounded deduplication independent of the SDK and process APIs.
- Keep process and Windows Runtime behavior isolated in `src/transport/`.
- Match tests to their boundary: entrypoint, eligibility, transport, integration, or loader.

## Dependencies

- Depends on: host-provided OpenCode plugin contract, Node runtime APIs, Windows PowerShell/Runtime.
- Depended on by: OpenCode installations that configure this package as a plugin.

<!-- MANUAL: Notes below this line are preserved on regeneration -->
