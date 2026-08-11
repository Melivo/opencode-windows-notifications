# Security Policy

## Trust Boundaries

- OpenCode event and session data is untrusted at the plugin boundary.
- The PowerShell process is a privileged execution boundary.
- Windows Runtime notification APIs are external platform dependencies.

## Required Controls

- Project host events only into typed, fixed notification contracts.
- Reject malformed, missing, or unstable identifiers and unknown sessions.
- Exclude subagent sessions using the non-empty `parentID` rule.
- Launch PowerShell by absolute path with `shell: false`; never interpolate event data into command source.
- Keep PowerShell source static and pass a length-bounded base64 payload through stdin.
- Revalidate title, event, and body against the allowlist inside PowerShell.
- Never include prompts, responses, paths, commands, file contents, or raw errors in toasts or diagnostics.
- Reduce logged session identifiers to a short SHA-256 digest.

## Review Triggers

Request focused review for changes to process arguments, PowerShell source, notification allowlists, host event projection, session eligibility, or log fields.
