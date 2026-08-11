# Product Sense

## User Mental Model

The user expects a concise Windows notification only when OpenCode needs attention: an answer finished or an approval is required. A notification must not disclose conversation content on a lock screen or distract the user with subagent activity.

## Product Principles

- Attention is scarce: deduplicate aggressively and omit uncertain events.
- Privacy is a product feature: use fixed, localized messages rather than dynamic context.
- Native behavior beats terminal-specific workarounds for the Windows target.
- Reliability means the host keeps working even when notification delivery does not.

## Prioritization

Prioritize confirmed host contracts and notification correctness over feature breadth. Do not add error toasts, dynamic copy, or configuration until stable host identifiers make their behavior safe and testable.
