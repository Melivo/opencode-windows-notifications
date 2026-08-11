# Quality Score

| Domain | Grade | Evidence | Gap |
| --- | --- | --- | --- |
| Type safety and package contract | A | Strict TypeScript build, typed named plugin export, entrypoint tests | Reconfirm when the supported OpenCode range changes. |
| Eligibility and deduplication | A | Bounded state, primary-session filtering, dedicated tests | TUI identity remains a proxy rather than a confirmed discriminator. |
| Transport safety | A | Static command, stdin encoding, allowlist, timeout, failure-containment tests | Real Windows visibility is not fully automated. |
| Loader verification | B | Isolated npm loader smoke test exists | Maintain it against OpenCode loader changes. |
| Product scope | B | Fixed messages and documented exclusions | `session.error` remains intentionally unsupported. |

Reassess these grades when the OpenCode plugin API, package entrypoint, or transport boundary changes.
