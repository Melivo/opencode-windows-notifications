# Tech Debt Tracker

## Active Items

| Priority | Item | Rationale | Proposed resolution |
| --- | --- | --- | --- |
| High | No authoritative TUI-client discriminator | The current primary-session rule excludes non-empty `parentID`, but does not prove the host client is the TUI. | Confirm and adopt a documented OpenCode client discriminator when available. |
| High | Error notifications excluded | No stable host error-transition identifier is confirmed, so safe deduplication is unavailable. | Add the event only after the OpenCode contract exposes a stable identifier and regression tests cover it. |
| Medium | Windows visibility is manually verified | Automated tests validate construction and containment, but cannot prove an end-user-visible Windows toast in every host configuration. | Maintain the manual smoke harness and add a supported Windows integration environment if one becomes available. |
