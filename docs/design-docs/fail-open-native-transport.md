# Fail-Open Native Transport

## Status

Verified from `src/transport/index.ts`, adapter code, and transport tests.

## Context

The plugin needs Windows-native notifications while preserving OpenCode availability and preventing sensitive event data from becoming executable PowerShell or toast content.

## Decision

Use a short-lived Windows PowerShell process with a static encoded command, `shell: false`, and a base64-encoded fixed notification payload on stdin. Validate the payload again inside PowerShell before calling `Windows.UI.Notifications` for `ai.opencode.desktop`.

## Alternatives Rejected

- Terminal escape sequences: unsuitable for the target Windows Terminal behavior.
- Shell interpolation: would make event-to-command injection possible.
- Dynamic toast text: would weaken the privacy boundary.
- Retry loops or secondary transports: would make delivery behavior non-deterministic and could duplicate user notifications.

## Consequences

- At most one process is started for an eligible notification; a bounded timeout terminates a hung child.
- Failures are reduced to categories and a hashed session identifier for host logging.
- A missing stable error-transition identifier means `session.error` remains excluded from host event projection.
