# OpenCode Windows Notifications

Native Windows toast notifications for OpenCode server plugins.

## Compatibility and scope

- Package name: `opencode-windows-notifications`.
- OpenCode version range: `>=1.18.16 <1.19.0` (`engines.opencode` in `package.json`). The package is compiled and verified against `@opencode-ai/plugin@1.18.16`.
- Entrypoint: `exports["./server"]` and `main` both point at `./dist/src/index.js`.
- Plugin contract: a named, typed `Plugin` export named `plugin`; the default export is optional and, in this package, is the same reference as `plugin` to avoid duplicate hook registration.
- Platform scope: Windows only (`os: ["win32"]`). On non-Windows hosts the runtime is inert and must not start PowerShell or any fallback transport.

## Installation through `opencode.json`

Use OpenCode's documented plugin array in `opencode.json`:

```json
{
  "plugin": ["opencode-windows-notifications"]
}
```

Alternative subpath loading and global CLI installation flows are not supported for this package. The verified OpenCode 1.18.16 npm server-plugin loader resolves the package through the configured plugin array and then loads `exports["./server"]` or `main`.

## One-time host setting

To avoid duplicate desktop notifications, set OpenCode's host attention notification flag once:

```json
{
  "attention": {
    "notifications": false
  }
}
```

If this setting is omitted while host attention notifications remain enabled, terminal-side duplicate notifications are possible. Installers or setup helpers must not overwrite existing `attention` settings; they may only document or prompt for the explicit `attention.notifications:false` change.

## Implemented events and fixed toast text

The package implements the typed `session.idle` event path and the dedicated permission hook:

| Typed host signal | Status | Title | Body |
| --- | --- | --- | --- |
| `session.idle` | Implemented | `OpenCode` | `Antwort abgeschlossen` |
| `Hooks["permission.ask"]` | Implemented | `OpenCode` | `Aktion erfordert deine Freigabe` |
| `session.error` | Excluded | n/a | n/a |

In `@opencode-ai/plugin@1.18.16`, `Hooks["permission.ask"]` accepts the SDK `Permission` input directly. The pinned `@opencode-ai/sdk@1.18.16` type declares required `Permission.id: string` and `Permission.sessionID: string` fields. The implementation reads those fields directly, rejects blank IDs, and does not use the unrelated event-based `permission.asked`, casts, `any`, `unknown` narrowing, or a local replacement permission union. Repeated delivery of the same stable permission ID in a primary session causes one transport attempt while that ID is retained in the bounded per-session dedupe set.

`session.error` is excluded because no stable, dedicated error transition or dedupe identifier has been confirmed. The generic event envelope ID is not treated as an error-transition ID.

The implementation also maps completed assistant-message updates into the same fixed completion toast path, but it does not expose dynamic prompt, response, file path, command, or raw error content.

## TUI and session eligibility limits

Only primary sessions are eligible. Sessions with a non-empty `parentID`, unknown sessions, and failed session lookups are ignored.

This is a primary-session proxy, not an authoritative TUI guarantee. OpenCode 1.18.16 does not expose a confirmed server-plugin `client === "tui"` discriminator for this package, so TUI-only behavior must be described as a residual risk rather than a guarantee.

## Logging and build identity

Host logging uses only:

```ts
client.app.log({ body })
```

If host logging fails synchronously or asynchronously, the fallback is a silent no-op. There is no `console.*` production fallback.

At initialization, the plugin logs the deterministic build marker `opencode-windows-notifications@0.0.0/server-v1` through the same host logging channel. The build marker is not exported as a separate module value, because OpenCode processes exported module values as plugin candidates and non-plugin values can fail module application.

## Security boundaries

- Toast payloads are fixed strings only; event data must not be included in toast title/body.
- Logs must not include prompts, model responses, file contents, command lines, raw errors, or other sensitive event payloads.
- Windows toast delivery uses the native Windows transport with notifier identity `ai.opencode.desktop`.
- PowerShell is started without shell interpolation.
- Non-Windows behavior is inert: no process start and no fallback transport.
- There is no OSC, BEL, terminal escape-sequence, retry-loop, or secondary-transport fallback.
- Transport, hook, lookup, and logging failures are contained and must not change OpenCode session state.
- Eligible events may cause at most one transport attempt; retries and fallback spawns are out of scope.

## Verification gates

Regular tests and loader verification are intentionally separate:

| Gate | Command | Meaning |
| --- | --- | --- |
| Regular suite | `bun run test:regular` | Type-level and product behavior tests for entrypoint, eligibility, transport, event-to-transport wiring, and safety invariants. |
| Loader gate | `bun run test:loader` | Real OpenCode npm load through `opencode.json` plugin array, isolated package/cache/config state, and build-marker identity. |

A blocked loader gate is not a regular-test pass or skip, and it is not a release pass.

The loader gate must prove that OpenCode loads the candidate package via the real npm server-plugin path, with a candidate tarball SHA256, a loopback-only registry or equivalent hermetic source, temporary XDG/cache/config/state roots, no inherited OpenCode config/auth state, and the loaded build marker matching the built artifact. If this cannot be isolated or observed, the gate is **BLOCKED**.

## Manual visibility smoke

The manual Windows smoke is only a visibility check: it can show whether a toast appears on the target desktop with the native Windows transport. It does **not** prove the npm loader path, package tarball identity, cache isolation, single registration, or build-marker match. Keep its result separate from the loader gate.

## Release status

Release still requires a passing loader gate and manual Windows visibility evidence. The release-scoped approval path is implemented through the typed `Hooks["permission.ask"]` contract; `session.error` remains excluded because no stable dedupe ID is confirmed.
