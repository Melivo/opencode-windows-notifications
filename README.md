# OpenCode Windows Notifications

Native Windows toast notifications for [OpenCode](https://opencode.ai/).

The package has two OpenCode entrypoints: the server plugin owns idle and permission notifications, and the TUI plugin owns menu/question notifications. Every toast uses fixed, privacy-safe text, only primary sessions are eligible, Windows is the only active runtime, and notification failures never change OpenCode session state.

## Install

Install the plugin through OpenCode:

```powershell
opencode plugin opencode-windows-notifications --global
```

OpenCode registers the base package name `opencode-windows-notifications` in both the `opencode.json`/`opencode.jsonc` server plugin array and the `tui.json`/`tui.jsonc` TUI plugin configuration.

To avoid duplicate host attention notifications, add the following setting once:

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
| `session.idle` | `Answer finished` |
| `permission.asked` | `Action needs permission` |
| `question.asked` | `Your selection is needed` |

`question.asked` is intentionally handled only by the TUI entrypoint when a menu opens. The server plugin remains idle/permission-only and ignores question events so one menu prompt cannot create competing server and TUI toasts.

Error notifications are intentionally not sent because OpenCode does not currently expose a stable error identifier for safe deduplication.

## Privacy And Reliability

- Toast text is fixed and never contains prompts, responses, file paths, commands, or raw errors.
- Only primary sessions are eligible. Subagent sessions are ignored.
- The plugin uses Windows-native delivery without shell interpolation, retries, fallback transports, or terminal escape sequences.
- On non-Windows systems, the plugin is inert.

## Troubleshooting

If OpenCode does not load the plugin after installation, reinstall it with:

```powershell
opencode plugin opencode-windows-notifications --global --force
```

Ensure the OpenCode version is between `1.18.16` and `1.19.0`, verify that the base package name is registered through TUI plugin configuration, and confirm `attention.notifications` is disabled in `~/.config/opencode/tui.jsonc` if duplicate notifications appear.

## License

[MIT](LICENSE)
