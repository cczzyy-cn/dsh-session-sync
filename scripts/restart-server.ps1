# Restart the local `dsh web` host after a Host-half change.
#
# A Host package is read at boot, so installing one — or changing its
# `lib/index.js` — needs a fresh process. This script does that from outside the
# host, which is the only way it can work: the agent that asks for the restart
# runs inside the process being restarted.
#
# Ordering is the whole design, and it took two attempts on a real host:
#
#  1. Killing the host also tears down the process tree that launched this
#     script, so nothing after the kill is guaranteed to run. The first version
#     relied on the host's own supervisor to come back, which took minutes.
#  2. So the replacement is armed BEFORE the kill: phase one detaches phase two
#     (`-RelaunchOnly`) as far outside this process tree as Windows allows, and
#     that phase polls for the port to free and launches immediately. The gap is
#     then one node boot rather than one supervisor reaction.

param(
  [string]$Checkout = 'C:\Users\14339\Desktop\git\deepseek-harness',
  [int]$Port = 3080,
  [int]$DelaySeconds = 30,
  [switch]$RelaunchOnly
)

$ErrorActionPreference = 'Continue'
$workspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$log = Join-Path $workspace 'dsh-restart.log'
$urlFile = Join-Path $workspace 'dsh-url.txt'
$stdout = Join-Path $workspace 'dsh-server.out.log'
$stderr = Join-Path $workspace 'dsh-server.err.log'

function Note([string]$message) {
  "$(Get-Date -Format o)  $message" | Out-File -FilePath $log -Append -Encoding utf8
}

function Test-Listening([int]$candidate) {
  return [bool](Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue)
}

function Get-ListeningPid([int]$candidate) {
  $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) { return $listener.OwningProcess }
  return $null
}

if ($RelaunchOnly) {
  # Phase two: wait for the port to free, then bind it. Nothing here assumes the
  # caller survived.
  Note "relauncher armed; waiting for port $Port to free"
  for ($i = 0; $i -lt 600; $i++) {
    if (-not (Test-Listening $Port)) { break }
    Start-Sleep -Milliseconds 300
  }
  Start-Sleep -Milliseconds 400
  Note "port $Port is free; starting the host"
  Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
  $env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
  $process = Start-Process -FilePath 'node' `
    -ArgumentList '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--port', "$Port" `
    -WorkingDirectory $Checkout `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
    -WindowStyle Hidden -PassThru
  Note "host started, pid $($process.Id)"

  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (-not (Test-Path $stdout)) { continue }
    $match = Select-String -Path $stdout -Pattern "http://127\.0\.0\.1:$Port/\?token=\S+" -ErrorAction SilentlyContinue |
      Select-Object -Last 1
    if ($match) { $url = $match.Matches[0].Value; break }
  }
  if ($url) {
    $url | Out-File -FilePath $urlFile -Encoding utf8
    Note "up at $url (also written to $urlFile)"
  } else {
    Note "no URL within 90s; see $stderr"
  }
  return
}

Note "scheduled; waiting ${DelaySeconds}s before restarting the host on port $Port"
Start-Sleep -Seconds $DelaySeconds

$target = Get-ListeningPid $Port
if ($null -eq $target) {
  Note "nothing was listening on $Port; nothing to do"
  return
}

# Arm the replacement first, while this process is still alive to launch it.
# `cmd /c start` is what puts it outside this process tree.
Start-Process -FilePath 'cmd' -ArgumentList @(
  '/c', 'start', '""', '/b',
  'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', "`"$PSCommandPath`"",
  '-RelaunchOnly', '-Port', "$Port", '-Checkout', "`"$Checkout`""
) -WindowStyle Hidden
Note "relauncher detached; about to stop pid $target"

Stop-Process -Id $target -Force -ErrorAction SilentlyContinue
Note "stop issued; this script may not survive to log again"
