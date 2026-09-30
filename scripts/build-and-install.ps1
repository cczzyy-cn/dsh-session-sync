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

param(
  # The DSH checkout this package borrows `tsdown`/`lightningcss` from. Left empty
  # it is discovered, because the path is per-machine: a hardcoded one made this
  # script unrunnable anywhere but its author's host.
  [string]$Checkout = '',
  # The profile whose installed copy is refreshed.
  [string]$Profile = 'web',
  # Copy even when the profile's dependency is not a local `file:` path. Off by
  # default: the installed tree then comes from pnpm's store, and bytes written
  # here would silently diverge from what a fresh install gets. Turn it on only to
  # iterate against a machine whose profile depends on git.
  [switch]$ForceCopy
)

$ErrorActionPreference = 'Stop'

$package = Split-Path $PSScriptRoot -Parent
$installed = Join-Path (Join-Path $env:USERPROFILE ".dsh\profiles\$Profile") 'node_modules\dsh-session-sync'

if ($Checkout -eq '') {
  $candidates = @(
    (Join-Path $env:USERPROFILE 'Desktop\git\deepseek-harness'),
    (Join-Path $env:USERPROFILE 'git\deepseek-harness'),
    (Join-Path (Split-Path $package -Parent) 'deepseek-harness')
  )
  if ($env:DSH_CHECKOUT) { $candidates = @($env:DSH_CHECKOUT) + $candidates }
  $Checkout = @($candidates | Where-Object { Test-Path (Join-Path $_ 'node_modules\.bin\tsdown.cmd') })[0]
  if (-not $Checkout) {
    throw "no DSH checkout found (tried: $($candidates -join '; ')); pass -Checkout <path> or set DSH_CHECKOUT"
  }
}
$tsdown = Join-Path $Checkout 'node_modules\.bin\tsdown.cmd'
if (-not (Test-Path $tsdown)) { throw "no tsdown under $Checkout" }
Write-Host "checkout: $Checkout"
Write-Host "profile:  $Profile"

# tsdown resolves `lightningcss` and its own runtime from the checkout's
# node_modules, because this package deliberately has none of its own.
$junction = Join-Path $package 'node_modules'
if (-not (Test-Path $junction)) {
  cmd /c mklink /J "$junction" "$Checkout\node_modules" | Out-Null
}

# The Host half imports `@deepseek-ai/schemastery` for real — it builds the `Config`
# schema the Plugins page renders — and that import must be bundled rather than
# externalized, because it is not resolvable from a profile install (DSH ships it
# only as a vendor tree inside app.asar). Bundling needs the specifier to resolve
# here first, and the checkout hoists it only into the packages that use it
# (`packages/*/*/node_modules/@deepseek-ai/schemastery` → `vendor/schemastery`), not
# into the root the junction above points at. So the two links are added for the
# build and removed in the same `finally` as the junction: nothing that outlives
# this script changes, and the encoding gate's rule — no `node_modules` in the
# repository — still holds.
$linked = @()
$vendorRoot = Join-Path (Join-Path $Checkout 'node_modules') '@deepseek-ai'
foreach ($name in 'schemastery', 'cosmokit') {
  $link = Join-Path $vendorRoot $name
  if (Test-Path $link) { continue }
  $target = Join-Path (Join-Path $Checkout 'vendor') $name
  if (-not (Test-Path $target)) { throw "no $name under $Checkout\vendor; cannot build the Host half" }
  New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null
  cmd /c mklink /J "$link" "$target" | Out-Null
  $linked += $link
  Write-Host "linked $name for the build"
}

try {
  # The encoding gate runs here as well as in the `prebuild` hook, because this
  # script is the documented build path and a gate that one path skips is not a
  # gate. It scans the sources *and* the artifacts, so it also catches a bundle
  # that was committed from damaged sources.
  & node (Join-Path $PSScriptRoot 'check-encoding.mjs')
  if ($LASTEXITCODE -ne 0) { throw "check-encoding exited $LASTEXITCODE" }

  # tsdown resolves its entry points against the process working directory, so
  # the build must run from the package root rather than from wherever the
  # caller happened to be.
  Push-Location $package
  try {
    & $tsdown
    if ($LASTEXITCODE -ne 0) { throw "tsdown exited $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
} finally {
  # The junction must never survive into an install: pnpm would walk it.
  if (Test-Path $junction) { cmd /c rmdir "$junction" | Out-Null }
  foreach ($link in $linked) {
    if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null }
  }
}

# The version a build states is the one thing a deployment gets checked against,
# and the bundle reads it from `package.json` at runtime rather than embedding it
# — so the check is to ask the built module, not to grep for a string. It is also
# the reading `/state` reports and the settings page compares across machines.
$manifest = Get-Content (Join-Path $package 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$entry = (Join-Path $package 'lib/index.js') -replace '\\', '/'
$reported = & node -e "import('file:///$entry').then(m => { process.stdout.write(String(m.pluginVersion())) })"
if ($reported -ne $manifest.version) {
  throw "the bundle states version '$reported' but package.json says '$manifest.version'"
}
Write-Host "built $($manifest.version); the bundle states the same version"

if (-not (Test-Path $installed)) {
  Write-Warning "not installed in the web profile yet; run: dsh plugin --profile web add file:$package"
  exit 0
}

# What the profile holds decides whether a build here can reach the installed
# copy at all:
#  - `file:` — pnpm hardlinks the installed tree to this directory, so a rebuild
#    lands in place, and the copy below only repairs the links tsdown's clean
#    pass breaks.
#  - anything else (`github:…`, a registry range) — the installed tree comes
#    from the store, and nothing written here is visible to it. Copying anyway
#    would make the running server diverge silently from what a fresh install
#    gets, which is the opposite of what this script is for.
$profileDir = Split-Path (Split-Path $installed -Parent) -Parent
$spec = $null
try {
  $manifest = Get-Content (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json
  $spec = $manifest.dependencies.'dsh-session-sync'
} catch {
  # An unreadable manifest just means the guard below cannot confirm a local
  # dependency; treat it as not-local and say so rather than guessing.
}

if (-not ($spec -like 'file:*')) {
  if (-not $ForceCopy) {
    Write-Host "built. the profile dependency is '$spec', not a local path, so nothing was copied."
    Write-Host 'The installed copy comes from the store: a fresh install would not see these bytes.'
    Write-Host 'To iterate against these sources, temporarily:'
    Write-Host "  dsh plugin --profile $Profile add file:$package"
    Write-Host 'To publish instead, commit and push, then:'
    Write-Host "  pnpm --dir `"$profileDir`" update dsh-session-sync"
    Write-Host 'Or pass -ForceCopy to override this guard for a local check.'
    exit 0
  }
  Write-Warning "the profile dependency is '$spec', not a local path; -ForceCopy is overriding the guard."
  Write-Warning 'The installed copy now differs from what a fresh install would get, until these bytes are pushed.'
}

# `package.json` travels with the artifacts: the running process reads the version
# it reports from that manifest, so copying the code without it would leave the
# profile stating a version these bytes do not have.
foreach ($entry in 'lib', 'client', 'package.json') {
  $root = Join-Path $package $entry
  if (-not (Test-Path $root)) { continue }
  # File by file rather than `Copy-Item -Recurse` over the directory: the
  # destination already exists, and a recursive directory copy onto an existing
  # tree re-opens files it has just written.
  $sources = @()
  if ((Get-Item $root).PSIsContainer) { $sources = @(Get-ChildItem $root -Recurse -File) }
  else { $sources = @(Get-Item $root) }
  foreach ($source in $sources) {
    $relative = $source.FullName.Substring($package.Length + 1)
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
        Copy-Item -Force $source.FullName $target -ErrorAction Stop
        $copied = $true
      } catch {
        if ($attempt -eq 20) { throw }
        Start-Sleep -Milliseconds 150
      }
    }
  }
}

Write-Host "copied lib/, client/ and package.json into $installed"
Write-Host 'reload the browser page; restart the server if the Host half changed.'
