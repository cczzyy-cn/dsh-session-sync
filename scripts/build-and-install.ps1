# Rebuild both halves and refresh the copy installed in the web profile.
#
# The profile install is a real copy, not a symlink (pnpm's `file:` dependency
# respects the package `files` list), so a rebuild in this directory does not
# reach the running server on its own. This script closes that gap: it builds,
# then copies the two artifact directories over the installed copy.
#
# A rebuilt `client/client.js` is picked up by the running server's HMR watcher
# within about half a second, so the browser half updates on a page reload with
# no restart. `lib/index.js` is the Host half: a change there needs a restart.

$ErrorActionPreference = 'Stop'

$package = Split-Path $PSScriptRoot -Parent
$checkout = 'C:\Users\14339\Desktop\git\deepseek-harness'
$installed = Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-session-sync'

# tsdown resolves `lightningcss` and its own runtime from the checkout's
# node_modules, because this package deliberately has none of its own.
$junction = Join-Path $package 'node_modules'
if (-not (Test-Path $junction)) {
  cmd /c mklink /J "$junction" "$checkout\node_modules" | Out-Null
}

try {
  # tsdown resolves its entry points against the process working directory, so
  # the build must run from the package root rather than from wherever the
  # caller happened to be.
  Push-Location $package
  try {
    & "$checkout\node_modules\.bin\tsdown.cmd"
    if ($LASTEXITCODE -ne 0) { throw "tsdown exited $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
} finally {
  # The junction must never survive into an install: pnpm would walk it.
  if (Test-Path $junction) { cmd /c rmdir "$junction" | Out-Null }
}

if (-not (Test-Path $installed)) {
  Write-Warning "not installed in the web profile yet; run: dsh plugin --profile web add file:$package"
  exit 0
}

foreach ($directory in 'lib', 'client') {
  $root = Join-Path $package $directory
  if (-not (Test-Path $root)) { continue }
  # File by file rather than `Copy-Item -Recurse` over the directory: the
  # destination already exists, and a recursive directory copy onto an existing
  # tree re-opens files it has just written.
  Get-ChildItem $root -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($package.Length + 1)
    $target = Join-Path $installed $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null

    # pnpm's `file:` dependency HARDLINKS the installed tree to this directory,
    # so an installed file and its source are often the same file object —
    # copying it onto itself is an error, and the bytes are already right
    # anyway. `tsdown`'s clean pass breaks those links for the artifacts it
    # rewrites, which is exactly when a real copy is needed. Removing the target
    # first unlinks without touching the data (the source holds it) and makes
    # the operation identical in both cases.
    $copied = $false
    for ($attempt = 1; $attempt -le 20 -and -not $copied; $attempt++) {
      try {
        if (Test-Path $target) { Remove-Item $target -Force -ErrorAction Stop }
        # A running server watches its plugin bundles, so replacing one races
        # with the watcher opening it. The window is milliseconds, and a bounded
        # retry is the honest fix — a skipped copy would serve stale bytes.
        Copy-Item -Force $_.FullName $target -ErrorAction Stop
        $copied = $true
      } catch {
        if ($attempt -eq 20) { throw }
        Start-Sleep -Milliseconds 150
      }
    }
  }
}

Write-Host "copied lib/ and client/ into $installed"
Write-Host 'reload the browser page; restart the server if the Host half changed.'
