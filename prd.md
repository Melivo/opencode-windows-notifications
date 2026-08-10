# PRD: Native Windows Notifications for OpenCode

## Overview

Create an OpenCode plugin that sends native Windows desktop notifications without relying on terminal escape-sequence support. It must work with the installed OpenCode TUI in Windows Terminal 1.24, where OSC 777 notifications are unavailable.

## Problem

OpenCode's TUI emits desktop notifications through the terminal's OSC 777 protocol. Windows Terminal 1.24 ignores this protocol, so users receive neither a Windows toast nor the Windows-configured notification sound.

## Goal

Deliver a Windows-only OpenCode plugin that uses the Windows notification API through Windows PowerShell to show reliable native toasts for relevant primary-session events.

## Users

- Windows users who run OpenCode in the TUI.
- Users who want Windows notification settings, including system notification sounds, to apply to OpenCode.

## Functional Requirements

### Notifications

The plugin must emit a native Windows toast for these events associated with a primary session:

| Event | Toast title | Toast body |
| --- | --- | --- |
| `session.idle` | `OpenCode` | `Antwort abgeschlossen` |
| `session.error` | `OpenCode` | `Sitzung fehlgeschlagen` |
| `permission.asked` | `OpenCode` | `Aktion erfordert deine Freigabe` |

### Subagent Exclusion

Events from subagents must never create notifications.

- Before sending a toast, resolve the event's session.
- Treat a session with a non-empty `parentID` as a subagent session.
- Skip every event attached to a subagent session, including `session.idle`, `session.error`, and `permission.asked`.
- Do not infer completion of a parent session from a subagent event.

### Native Toast Transport

- Use Windows PowerShell and the Windows Runtime `Windows.UI.Notifications` API.
- Use the registered application identity `ai.opencode.desktop` as the toast notifier ID.
- Do not emit OSC 777, BEL, or other terminal escape sequences.
- Do not depend on Windows Terminal version, profile settings, or foreground state.

### Failure Handling

- A failed toast must not interrupt OpenCode or alter its session state.
- Log a concise diagnostic through OpenCode's plugin logging API when toast delivery fails.
- On non-Windows hosts, load safely and perform no action.

## Configuration

Version 1 has no user-facing configuration. The plugin is enabled by being present in OpenCode's global plugin directory.

Future versions may add toggles for individual event types, notification text, and a custom application identity.

## Non-Goals

- Notifications for subagent progress, completion, errors, or tool calls.
- Cross-platform notification support.
- Replacing OpenCode's existing TUI sound packs.
- Adding or modifying Windows Terminal settings.
- Interacting with notification actions from a toast.

## Technical Constraints

- Plugin location: `~/.config/opencode/plugins/`.
- The plugin must use only APIs available in a default Windows installation and the existing OpenCode plugin runtime.
- PowerShell arguments and toast content must be safely encoded to avoid command injection and XML injection.
- Duplicate events must not produce duplicate toasts for the same session state transition.

## Acceptance Criteria

1. A completed primary OpenCode session produces one Windows toast with `Antwort abgeschlossen`.
2. A primary-session error produces one Windows toast with `Sitzung fehlgeschlagen`.
3. A primary-session permission prompt produces one Windows toast with `Aktion erfordert deine Freigabe`.
4. A subagent completion, error, or permission prompt produces no Windows toast.
5. The plugin works when OpenCode runs in Windows Terminal 1.24 without `compatibility.allowOSC777`.
6. Toast transport failures are logged and do not fail the OpenCode session.
7. Automated tests cover event filtering, subagent exclusion, duplicate suppression, and PowerShell payload construction.

## Open Questions

- Should notifications be suppressed while the OpenCode window is focused, or always shown?
- Should `session.idle` notifications be limited to sessions that received at least one assistant response since their prior idle state?
