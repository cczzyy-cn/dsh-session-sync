# End-to-end verification against two real `dsh web` instances.
#
# `tests/e2e-chain.spec.ts` runs the whole chain in one process with a Session
# controller stand-in. This script is the other tier: it builds the working tree,
# stages it into a throwaway profile, starts two real DSH instances in isolated
# homes — one acting as the sync server, one as an origin that publishes a real
# Session log — and then asks the *server's* own plugin state whether the Session
# arrived, whether the console can read it, and what version each side says it is
# running.
#
# What only this tier can catch: the plugin failing to load in a real DSH, a real
# `SessionController` behaving differently from the stand-in, and the version
# handshake across two separately-loaded halves.
#
# Rules this script exists to respect (each of them cost a session once):
#  - `DSH_HOME` is overwritten in any shell this harness runs, so an instance is
#    started from a wrapper `.ps1` that sets it inside the child process.
#  - `dsh plugin add` against a **junctioned** profile clears the real profile, so
#    nothing here is junctioned at the profile level: the temp profile is a real
#    directory whose plugin is a copy of the working tree, and only the entries
#    that are never written to (`.pnpm`, `vision`) are junctions.
#  - A junction is deleted with `cmd /c rmdir`, never `Remove-Item -Recurse`,
#    which walks through it and deletes what it points at.
#  - Instances are killed by matching their `--port` on the command line, because
#    killing the launcher leaves the node child alive and holding the port.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/e2e-dsh.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/e2e-dsh.ps1 -Keep
param(
  [switch]$Keep,
  [switch]$SkipOffline,
  [int]$ServerPort = 3099,
  [int]$OriginPort = 3098,
  [int]$SyncPort = 8793,
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$package = Split-Path $PSScriptRoot -Parent
$checkout = 'C:\Users\14339\Desktop\git\deepseek-harness'
$realHome = Join-Path $env:USERPROFILE '.dsh'
$realProfile = Join-Path $realHome 'profiles\web'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$root = Join-Path $env:TEMP "dsh-sync-e2e-$stamp"
$password = 'e2e-password'
$originName = 'e2e-origin'
$serverName = 'e2e-server'

$failures = New-Object System.Collections.Generic.List[string]

function Say([string]$message) { Write-Host "[e2e] $message" }
function Fail([string]$message) {
  $failures.Add($message) | Out-Null
  Write-Host "[e2e] FAIL $message" -ForegroundColor Red
}
function Assert-Equal($actual, $expected, [string]$what) {
  if ("$actual" -ne "$expected") { Fail "$what`: expected '$expected', got '$actual'" }
  else { Say "ok  $what = $actual" }
}
function Assert-True([bool]$condition, [string]$what) {
  if (-not $condition) { Fail $what } else { Say "ok  $what" }
}

# Build the working tree. The rig runs *these* bytes: a verification that ran the
# last released build would report on a deployment nobody is editing.
function Invoke-Build {
  $junction = Join-Path $package 'node_modules'
  $created = $false
  if (-not (Test-Path $junction)) {
    cmd /c mklink /J "$junction" "$checkout\node_modules" | Out-Null
    $created = $true
  }
  try {
    Push-Location $package
    try {
      & "$checkout\node_modules\.bin\tsdown.cmd" | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "tsdown exited $LASTEXITCODE" }
    } finally { Pop-Location }
  } finally {
    if ($created -and (Test-Path $junction)) { cmd /c rmdir "$junction" | Out-Null }
  }
}

# A temp profile: the real profile's shape, with the working tree's plugin in it.
function New-StagedProfile([string]$name) {
  $profile = Join-Path $root "$name\profiles\web"
  New-Item -ItemType Directory -Force -Path (Join-Path $profile 'node_modules') | Out-Null
  foreach ($entry in Get-ChildItem $realProfile -Force) {
    if ($entry.Name -eq 'node_modules') { continue }
    Copy-Item $entry.FullName (Join-Path $profile $entry.Name) -Recurse -Force
  }
  foreach ($entry in Get-ChildItem (Join-Path $realProfile 'node_modules') -Force) {
    # The plugin is staged from the working tree below, never linked: this is the
    # one directory the rig has to be able to replace.
    if ($entry.Name -eq 'dsh-session-sync') { continue }
    $target = Join-Path (Join-Path $profile 'node_modules') $entry.Name
    if ($entry.PSIsContainer) { cmd /c mklink /J "$target" "$($entry.FullName)" | Out-Null }
    else { Copy-Item $entry.FullName $target -Force }
  }
  $staged = Join-Path $profile 'node_modules\dsh-session-sync'
  New-Item -ItemType Directory -Force -Path $staged | Out-Null
  foreach ($file in 'package.json', 'cordis.patch.yml') {
    Copy-Item (Join-Path $package $file) (Join-Path $staged $file) -Force
  }
  foreach ($directory in 'lib', 'client') {
    Copy-Item (Join-Path $package $directory) (Join-Path $staged $directory) -Recurse -Force
  }
  if (-not (Test-Path (Join-Path $staged 'lib\index.js'))) { throw "staging failed for $name (no lib/index.js)" }
  return $profile
}

# One isolated home carrying the plugin's own settings document.
# `$home` is a PowerShell automatic variable and cannot be assigned — every name
# here that means one is `$instanceHome`.
function New-InstanceHome([string]$name, [hashtable]$config) {
  $instanceHome = Join-Path $root $name
  New-Item -ItemType Directory -Force -Path $instanceHome | Out-Null
  $document = @{
    listenHost = '127.0.0.1'
    listenPort = 0
    serverUrl = ''
    isServer = $false
    password = $password
    syncSessions = @{}
  }
  foreach ($key in $config.Keys) { $document[$key] = $config[$key] }
  $json = ($document | ConvertTo-Json -Depth 6)
  [IO.File]::WriteAllText((Join-Path $instanceHome 'dsh-session-sync.json'), $json, (New-Object Text.UTF8Encoding($false)))
  return $instanceHome
}

# One instance, launched through a wrapper so `DSH_HOME` is set inside the child.
function Start-Instance([string]$name, [string]$instanceHome, [int]$port) {
  $wrapper = Join-Path $root "run-$name.ps1"
  $log = Join-Path $root "$name.log"
  $body = @"
`$env:DSH_HOME = '$instanceHome'
Set-Location '$checkout'
& node --import tsx/esm apps/cli/src/bin.ts web --port $port --no-open *> '$log'
"@
  [IO.File]::WriteAllText($wrapper, $body, (New-Object Text.UTF8Encoding($false)))
  $process = Start-Process -FilePath 'powershell' -ArgumentList @(
    '-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $wrapper
  ) -WindowStyle Hidden -PassThru
  Say "started $name (launcher pid $($process.Id), port $port)"
  return @{ Process = $process; Log = $log; Port = $port; Name = $name }
}

# Kill an instance by its own command line, so a stray node child cannot survive.
function Stop-Instance([hashtable]$instance) {
  $pattern = "web --port $($instance.Port)"
  foreach ($node in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$pattern*" })) {
    try { Stop-Process -Id $node.ProcessId -Force -ErrorAction Stop; Say "stopped $($instance.Name) node pid $($node.ProcessId)" } catch { }
  }
  try { if (-not $instance.Process.HasExited) { Stop-Process -Id $instance.Process.Id -Force; Say "stopped $($instance.Name) launcher pid $($instance.Process.Id)" } } catch { }
}

function Wait-For([scriptblock]$check, [string]$what) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try { if (& $check) { Say "ok  $what"; return $true } } catch { }
    Start-Sleep -Milliseconds 750
  }
  Fail "timed out waiting for $what"
  return $false
}

# The GUI's own token gate, adopted exactly as a browser does it: the launch token
# from the instance's stdout is exchanged for the signed cookie the plugin's
# routes sit behind.
function Get-CookieJar([string]$log, [int]$port, [string]$cookie) {
  if (-not (Test-Path $log)) { return $false }
  $found = Select-String -Path $log -Pattern 'token=([A-Za-z0-9_-]+)' -Encoding UTF8 | Select-Object -Last 1
  if (-not $found) { return $false }
  & curl.exe -s -c $cookie -o NUL "http://127.0.0.1:$port/?token=$($found.Matches[0].Groups[1].Value)" | Out-Null
  return (Test-Path $cookie)
}

Say "root: $root"
New-Item -ItemType Directory -Force -Path $root | Out-Null

$instances = @()
$manifest = Get-Content (Join-Path $package 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
try {
  Invoke-Build
  Say "built $($manifest.version)"
  New-StagedProfile 'server' | Out-Null
  New-StagedProfile 'origin' | Out-Null
  Say "staged both profiles from the working tree"

  # A real Session log for the origin to publish. Copied, never moved: the
  # original belongs to the user's own DSH home. Sessions live two levels down —
  # `<home>/sessions/<cwd-slug>/<session-id>/session.v4.jsonl.zstd`.
  $source = Get-ChildItem (Join-Path $realHome 'sessions') -Directory |
    ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue } |
    ForEach-Object {
      $log = Get-ChildItem $_.FullName -Filter 'session.v4.jsonl.zstd' -File -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($log) { [pscustomobject]@{ Dir = $_; Log = $log } }
    } |
    Where-Object { $_.Log.Length -gt 20KB } |
    Sort-Object { $_.Log.Length } |
    Select-Object -First 1
  if (-not $source) { throw 'no usable v4 Session log in the real home to publish' }
  $sessionId = $source.Dir.Name
  Say "publishing '$sessionId' ($([int]($source.Log.Length / 1KB)) KB) from $($source.Dir.FullName)"

  $serverHome = New-InstanceHome 'server' @{
    machineName = $serverName
    isServer = $true
    listenPort = $SyncPort
    syncSessions = @{}
  }
  $originHome = New-InstanceHome 'origin' @{
    machineName = $originName
    serverUrl = "127.0.0.1:$SyncPort"
    listenPort = $SyncPort + 1
    syncSessions = @{ $sessionId = $true }
  }

  $copy = Join-Path $originHome "sessions\$($source.Dir.Parent.Name)\$sessionId"
  New-Item -ItemType Directory -Force -Path $copy | Out-Null
  Copy-Item (Join-Path $source.Dir.FullName 'session.v4.jsonl.zstd') $copy -Force
  Say 'copied the log into the origin own home'

  $instances += Start-Instance 'server' $serverHome $ServerPort
  $instances += Start-Instance 'origin' $originHome $OriginPort

  $serverCookie = Join-Path $root 'server.cookies'
  $originCookie = Join-Path $root 'origin.cookies'
  if (-not (Wait-For { Get-CookieJar (Join-Path $root 'server.log') $ServerPort $serverCookie } 'the server instance to serve its GUI')) { throw 'server never came up' }
  if (-not (Wait-For { Get-CookieJar (Join-Path $root 'origin.log') $OriginPort $originCookie } 'the origin instance to serve its GUI')) { throw 'origin never came up' }

  # The server's own plugin state — the reading a deployment is judged by.
  $state = $null
  $mirrored = Wait-For {
    $raw = & curl.exe -s -b $serverCookie "http://127.0.0.1:$ServerPort/dsh-session-sync/state"
    if (-not $raw) { return $false }
    $script:state = $raw | ConvertFrom-Json
    $machine = $script:state.state.machines | Where-Object { $_.machineName -eq $originName }
    if (-not $machine) { return $false }
    $session = $machine.sessions | Where-Object { $_.sessionId -eq $sessionId }
    return ($null -ne $session -and $session.eventCount -gt 0)
  } 'the server to mirror the published Session'
  if (-not $mirrored) { throw 'the Session never reached the mirror' }

  $machine = $state.state.machines | Where-Object { $_.machineName -eq $originName }
  $session = $machine.sessions | Where-Object { $_.sessionId -eq $sessionId }
  Say "mirrored: $($session.eventCount) events, missing $($session.missingEvents)"
  Assert-True ($session.eventCount -gt 0) 'the mirror holds events for the published Session'
  Assert-Equal $session.missingEvents 0 'the mirror reports no gap'

  # The plugin loads in a real DSH, and the staged build is the one running.
  Assert-Equal $state.state.pluginVersion $manifest.version 'the server states the staged build version'
  Assert-Equal $machine.pluginVersion $manifest.version 'the origin states the staged build version'

  # The console's own read of that Session.
  $transcript = (& curl.exe -s -b $serverCookie "http://127.0.0.1:$ServerPort/dsh-session-sync/transcript?machine=$originName&session=$sessionId&limit=5") | ConvertFrom-Json
  Assert-True ($transcript.transcript.events.Count -gt 0) 'the console can read the mirrored Session'

  # The origin's own view: the link is live and the mark is on.
  $originState = (& curl.exe -s -b $originCookie "http://127.0.0.1:$OriginPort/dsh-session-sync/state") | ConvertFrom-Json
  Assert-True ($originState.state.linked) 'the origin reports a live link'
  Assert-Equal $originState.state.published 1 'the origin reports one published Session'
  Assert-Equal $originState.state.pluginVersion $manifest.version 'the origin states the staged build version in its own view'

  # Honesty about a machine that is not there. The console dims an offline row and
  # says so, and both readings come from this one field — so the check is that a
  # machine which went away reads as offline rather than as a mirror that quietly
  # stopped changing, and that it recovers when it comes back.
  if (-not $SkipOffline) {
    $offlineOrigin = $instances | Where-Object { $_.Name -eq 'origin' }
    Stop-Instance $offlineOrigin
    $wentOffline = Wait-For {
      $raw = & curl.exe -s -b $serverCookie "http://127.0.0.1:$ServerPort/dsh-session-sync/state"
      if (-not $raw) { return $false }
      $script:state = $raw | ConvertFrom-Json
      $machine = $script:state.state.machines | Where-Object { $_.machineName -eq $originName }
      return ($null -ne $machine -and -not $machine.online)
    } 'the server to mark the origin offline'
    Assert-True $wentOffline 'a machine that went away reads as offline'

    $instances = @($instances | Where-Object { $_.Name -ne 'origin' })
    $instances += Start-Instance 'origin' $originHome $OriginPort
    $recovered = Wait-For {
      $raw = & curl.exe -s -b $serverCookie "http://127.0.0.1:$ServerPort/dsh-session-sync/state"
      if (-not $raw) { return $false }
      $script:state = $raw | ConvertFrom-Json
      $machine = $script:state.state.machines | Where-Object { $_.machineName -eq $originName }
      $session = $machine.sessions | Where-Object { $_.sessionId -eq $sessionId }
      return ($null -ne $machine -and $machine.online -and $null -ne $session -and $session.eventCount -gt 0)
    } 'the origin to come back and be mirrored again'
    Assert-True $recovered 'the mirror recovers when the machine returns'
  }
}
catch {
  Fail $_.Exception.Message
}
finally {
  if ($Keep) {
    Say '-Keep was given: leaving both instances up'
    Say "  server: http://127.0.0.1:$ServerPort  (log $root\server.log)"
    Say "  origin: http://127.0.0.1:$OriginPort  (log $root\origin.log)"
  }
  else {
    foreach ($instance in $instances) { Stop-Instance $instance }
    Start-Sleep -Milliseconds 500
    # Junctions first, by rmdir, then the tree they point away from.
    foreach ($name in 'server', 'origin') {
      $modules = Join-Path $root "$name\profiles\web\node_modules"
      if (Test-Path $modules) {
        foreach ($entry in Get-ChildItem $modules -Force) {
          if ($entry.LinkType) { cmd /c rmdir "$($entry.FullName)" | Out-Null }
        }
      }
    }
    if (Test-Path $root) { Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue }
    Say "cleaned up $root"
  }
}

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host "[e2e] $($failures.Count) check(s) failed:" -ForegroundColor Red
  foreach ($failure in $failures) { Write-Host "  - $failure" -ForegroundColor Red }
  exit 1
}
Write-Host ''
Write-Host '[e2e] all checks passed' -ForegroundColor Green
exit 0
