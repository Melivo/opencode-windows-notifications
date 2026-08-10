# OpenCode Windows Notifications

Native Windows toast notifications for [OpenCode](https://opencode.ai/).

The plugin sends fixed, privacy-safe notifications when an assistant response completes or OpenCode asks for a permission decision. It is Windows-only and notification failures never change OpenCode session state.

## Install

Install the plugin through OpenCode:

```powershell
opencode plugin opencode-windows-notifications
```

OpenCode adds the package to its `opencode.json` plugin array. To avoid duplicate host notifications, add the following setting once:

```json
{
  "attention": {
    "notifications": false
  }
}
```

## Notifications

| Signal | Fixed toast body |
| --- | --- |
| `session.idle` | `Antwort abgeschlossen` |
| `Hooks["permission.ask"]` | `Aktion erfordert deine Freigabe` |

Error notifications are intentionally not sent because OpenCode does not currently expose a stable error identifier for safe deduplication.

## Privacy And Reliability

- Toast text is fixed and never contains prompts, responses, file paths, commands, or raw errors.
- Only primary sessions are eligible. Subagent sessions are ignored.
- The plugin uses Windows-native delivery without shell interpolation, retries, fallback transports, or terminal escape sequences.
- On non-Windows systems, the plugin is inert.

## Troubleshooting

If OpenCode does not load the plugin after installation, reinstall it with:

```powershell
opencode plugin opencode-windows-notifications --force
```

Ensure the OpenCode version is between `1.18.16` and `1.19.0`, and verify that `attention.notifications` is disabled if duplicate notifications appear.

## License

[MIT](LICENSE)
