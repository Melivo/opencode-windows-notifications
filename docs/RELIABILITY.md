# Reliability Standards

## Availability Boundary

Notification delivery is non-critical. Hooks, session lookup, logging, child-process launch, stdin writes, process exits, and timeout cleanup must be contained so OpenCode continues unchanged.

## Operational Rules

- Start no more than one child process per eligible notification.
- Use a bounded child-process timeout; terminate only as best effort and return a contained failure.
- Do not retry, schedule a retry loop, or select a fallback transport.
- On non-Windows hosts, create inert behavior rather than probing or launching a process.
- Log only a failure category, event type, and reduced session identifier through the OpenCode host logger.

## Service Objective

The package has no delivery-rate SLO because Windows host configuration can prevent toasts. Its reliability objective is stronger: notification failures must contribute zero unhandled failures to the OpenCode event path.

## Incident Response

When delivery fails, inspect the redacted host diagnostic and transport category. Do not enable shell execution, dynamic payloads, or retries as an operational workaround.
