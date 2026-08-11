# Product Sense

## User Mental Model

The user expects a concise Windows notification only when OpenCode needs attention: an answer finished, an approval is required, or a TUI selection menu is waiting. A notification must not disclose conversation content on a lock screen or distract the user with subagent activity.

## Product Principles

- Attention is scarce: deduplicate aggressively and omit uncertain events.
- Privacy is a product feature: use fixed, localized messages rather than dynamic context.
- Native behavior beats terminal-specific workarounds for the Windows target.
- Reliability means the host keeps working even when notification delivery does not.

## Prioritization

Prioritize confirmed host contracts and notification correctness over feature breadth. Do not add error toasts, dynamic copy, or configuration until stable host identifiers make their behavior safe and testable.

Menu-question attention belongs to the TUI entrypoint registered through TUI configuration. Keep the server entrypoint focused on idle and permission signals, and disable built-in host attention notifications with `attention.notifications:false` where duplicate desktop attention would otherwise occur.
