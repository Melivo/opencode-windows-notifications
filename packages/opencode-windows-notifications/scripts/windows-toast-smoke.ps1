<#
.SYNOPSIS
Records an honest, manual Windows toast visibility check in Windows Terminal or
an editor-integrated terminal.

.DESCRIPTION
Run this script once in each real target terminal. It refuses a mismatched or
unknown terminal and launches OpenCode exactly once. The operator must complete
one assistant response, wait for session.idle, exit OpenCode, and then confirm
that the fixed toast was personally observed exactly once.

This harness follows the documented server-plugin setup in which opencode.json
contains `"plugin": ["opencode-windows-notifications"]`. The package contract is
the named, typed Plugin export `plugin`; its default export is optional and is
not a prerequisite. This setup note is only a precondition for the visual check:
the harness does not prove the npm loader path or package/build identity.

Only session.idle is exercised because it is the currently implemented event.
Visibility and exactly-once delivery are recorded only after explicit operator
responses. The default result is not-confirmed. No visibility is simulated from
a process exit code, transport return value, or any other programmatic signal.
Evidence is appended outside the repository under the user's temporary folder.

Examples (run in the corresponding real terminal):
  pwsh -File scripts/windows-toast-smoke.ps1 -Target windows-terminal
  pwsh -File scripts/windows-toast-smoke.ps1 -Target editor-terminal
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('windows-terminal', 'editor-terminal')]
  [string]$Target,

  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })]
  [string]$Workspace = (Get-Location).Path,

  [string]$EvidencePath = (Join-Path $env:TEMP 'opencode-windows-notifications-smoke.jsonl')
)

$ErrorActionPreference = 'Stop'

function Get-DetectedTerminal {
  if (
    $env:TERM_PROGRAM -match 'vscode|cursor|zed|windsurf' -or
    $env:VSCODE_PID -or
    $env:CURSOR_TRACE_ID
  ) {
    return 'editor-terminal'
  }
  if ($env:WT_SESSION) {
    return 'windows-terminal'
  }
  return 'unknown'
}

function Add-Evidence([hashtable]$Record) {
  $parent = Split-Path -Parent $EvidencePath
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw "Evidence parent does not exist: $parent"
  }
  Add-Content -LiteralPath $EvidencePath -Value ($Record | ConvertTo-Json -Compress -Depth 8)
}

if (-not $IsWindows) {
  throw 'This smoke harness must run on Windows.'
}

$detectedTerminal = Get-DetectedTerminal
$record = @{
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  target = $Target
  detectedTerminal = $detectedTerminal
  verification = 'manual-windows-visual-check'
  event = 'session.idle'
  expected = @{ title = 'OpenCode'; body = 'Antwort abgeschlossen' }
  setupAcknowledged = 'not-confirmed'
  opencodeExitCode = $null
  visibility = 'not-confirmed'
  exactlyOnce = 'not-confirmed'
  npmLoader = 'not-evaluated'
}

if ($detectedTerminal -ne $Target) {
  $record.visibility = 'not-run-terminal-mismatch'
  Add-Evidence $record
  throw "Requested target '$Target', but detected '$detectedTerminal'. Run inside the real target terminal."
}

Write-Host "Target verified: $detectedTerminal"
Write-Host "Expected toast: title='OpenCode', body='Antwort abgeschlossen'"
Write-Warning 'Eine erfolgreiche Transport-Rueckgabe beweist keine Sichtbarkeit.'
Write-Warning 'Dieser Sichtbarkeits-Smoke bewertet weder den NPM-Loader noch die Paket- oder Build-Identitaet.'

$acknowledged = Read-Host 'Is the documented server-plugin package entry already configured in opencode.json? Type YES to acknowledge the precondition'
if ($acknowledged -cne 'YES') {
  Add-Evidence $record
  throw 'The server-plugin setup precondition was not acknowledged; the visual check was not run.'
}
$record.setupAcknowledged = 'operator-confirmed'

Write-Host 'Complete exactly one assistant response, wait for session.idle, observe the notification area, and then exit OpenCode.'
& opencode $Workspace
$record.opencodeExitCode = $LASTEXITCODE

$visible = Read-Host 'Was the exact toast visibly displayed? Type YES only if personally observed'
if ($visible -ceq 'YES') {
  $record.visibility = 'operator-confirmed'
  $once = Read-Host 'Was it displayed exactly once, without a duplicate or fallback? Type YES only if personally observed'
  if ($once -ceq 'YES') {
    $record.exactlyOnce = 'operator-confirmed'
  }
}

Add-Evidence $record
Write-Host ($record | ConvertTo-Json -Depth 8)
Write-Host "Evidence appended to: $EvidencePath"

if ($record.visibility -ne 'operator-confirmed' -or $record.exactlyOnce -ne 'operator-confirmed') {
  Write-Error 'Visibility or exactly-once delivery was not confirmed; the visibility smoke did not succeed.'
  exit 2
}

Write-Host 'Visibility smoke confirmed by explicit operator observation.'
