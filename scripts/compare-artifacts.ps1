# Compare the committed bundles with the bundles these sources build to.
#
# tsdown's CSS-Modules pipeline fingerprints every local class name from the
# *absolute path* of the stylesheet (`<hash>_action`), and the emitted module
# carries that path too (`dsh-css:C:\…\src\client\sync.module.css.mjs`). Both are
# build-machine facts, so a byte comparison is not a statement about the sources:
# this repository's committed client bundle was built under `C:\Users\C\Desktop\…`
# while the tree here lives under `C:\Users\14339\Desktop\…`, and rebuilding it
# here changes 289 lines — exactly those paths and the class names derived from
# them (the prefixes are not even a fixed case shape: the committed bundle carries
# `o_HR-W_card` next to `SnSagW_card`). The Host bundle carries no such
# fingerprint and must match byte for byte.
#
# So this compares what actually matters and calls the build-root difference what
# it is:
#   identical            - byte for byte;
#   same apart from root - equal once the build root and its derived fingerprints
#                          are masked: the same sources, a different machine or
#                          directory (a restructured build would still differ here);
#   DIFFERENT            - the artifact is not what these sources compile to.
#
# The comparison reads the committed bytes *before* it builds. That is not a
# detail: a build overwrites the artifacts in place, so hashing them afterwards
# compares the rebuild with itself and every answer becomes "identical".
#
# The caller must be on a clean tree for the two artifacts — that is what defines
# "committed" here. `-Restore` puts them back after the comparison.
#
#   powershell -ExecutionPolicy Bypass -File scripts/compare-artifacts.ps1 [-Checkout <dsh checkout>] [-Restore]

param(
  [string]$Checkout = '',
  [switch]$Quiet,
  # Put the committed bundles back after the comparison. A caller that only wanted
  # the verdict uses this; a caller that is about to commit a rebuild does not.
  [switch]$Restore
)

$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
$artifacts = @('lib/index.js', 'client/client.js')

function Note([string]$message) { if (-not $Quiet) { Write-Host $message } }

function Get-NormalizedHash([string]$text) {
  # Line endings are normalized before hashing. Reading the committed bytes
  # through a PowerShell pipeline (`git show … | Out-String`) rewrites LF as CRLF,
  # which alone is a 7,873-character difference on this bundle — a difference in
  # how the bytes were *read*, not in what they are. (The committed blob and the
  # built file both use LF.)
  $text = $text.Replace("`r`n", "`n")
  $rootPattern = [regex]::Escape($package.Replace('\', '/'))
  $text = $text -replace $rootPattern, '<ROOT>'
  # Any other machine's path, in either separator style; always forward slashes,
  # while the class names below contain no slashes at all.
  $text = $text -replace '[A-Za-z]:[\\/](?:[^"''`\r\n]*[\\/])*', '<ROOT>/'
  # A CSS-Modules local prefix, in an identifier position: six or more identifier
  # characters, `_`, then the first letter of the field name. The prefix's case
  # mix is the hash's business, not this pattern's — `o_HR-W_card` is a real one
  # from the committed bundle, and an "at least one uppercase" heuristic missed it.
  # Anchoring on an identifier boundary is what keeps prose and identifiers like
  # `update_` or `cordis_update(` intact.
  $text = $text -replace '(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{6,}_', '<CSS>_'
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLower() }
  finally { $sha.Dispose() }
}

# The committed artifact as text, read as raw bytes rather than through a
# pipeline: `git show … | Out-String` rewrites LF as CRLF, which alone is a
# 7,873-character difference on this bundle — a difference in how the bytes were
# read, not in what they are. A native redirect writes the bytes out unchanged.
function Get-CommittedText([string]$relative) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) "dsh-committed-$([guid]::NewGuid().ToString('N')).bin"
  try {
    & cmd /c "git -C `"$package`" cat-file blob `"HEAD:$relative`" > `"$temp`""
    if ($LASTEXITCODE -ne 0) { throw "git cat-file HEAD:$relative exited $LASTEXITCODE" }
    return [IO.File]::ReadAllText($temp)
  } finally {
    Remove-Item $temp -ErrorAction SilentlyContinue
  }
}

# --- read the committed bytes first ------------------------------------------

Push-Location $package
try { $dirty = @(& git status --porcelain -- $artifacts) } finally { Pop-Location }
if ($dirty.Count -gt 0) {
  throw "the artifacts themselves have uncommitted changes, so 'committed' has no meaning here:`n$($dirty -join "`n")"
}

$before = @{}
foreach ($artifact in $artifacts) {
  $path = Join-Path $package $artifact
  if (-not (Test-Path $path)) { throw "no committed artifact at $artifact" }
  $committedText = Get-CommittedText $artifact
  $before[$artifact] = @{
    Bytes = (Get-FileHash $path -Algorithm SHA256).Hash
    Normalized = Get-NormalizedHash $committedText
  }
  if ($env:DSH_COMPARE_DEBUG) {
    Note "committed $artifact text len $($committedText.Length) normalized $($before[$artifact].Normalized.Substring(0,12))"
  }
}

if (-not $Checkout) {
  $candidates = @(
    (Join-Path $env:USERPROFILE 'Desktop\git\deepseek-harness'),
    (Join-Path $env:USERPROFILE 'git\deepseek-harness'),
    (Split-Path $package -Parent | Join-Path -ChildPath 'deepseek-harness')
  )
  $Checkout = @($candidates | Where-Object { Test-Path (Join-Path $_ 'node_modules\.bin\tsdown.cmd') })[0]
  if (-not $Checkout -and $env:DSH_CHECKOUT) { $Checkout = $env:DSH_CHECKOUT }
}
if (-not $Checkout) { throw 'no DSH checkout found (tried the usual paths); pass -Checkout or set DSH_CHECKOUT' }

# --- build, then compare -----------------------------------------------------

Note 'building to compare against the committed bundles ...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-and-install.ps1') -Checkout $Checkout | Out-Null
if ($LASTEXITCODE -ne 0) { throw "build-and-install.ps1 exited $LASTEXITCODE" }

$failed = @()
foreach ($artifact in $artifacts) {
  $path = Join-Path $package $artifact
  $after = @{
    Bytes = (Get-FileHash $path -Algorithm SHA256).Hash
    Normalized = Get-NormalizedHash ([IO.File]::ReadAllText($path))
  }
  $verdict = if ($after.Bytes -eq $before[$artifact].Bytes) { 'identical' }
    elseif ($after.Normalized -eq $before[$artifact].Normalized) { 'same apart from the build root' }
    else { 'DIFFERENT' }
  if ($env:DSH_COMPARE_DEBUG) {
    Note "  after  $($after.Bytes.Substring(0,12)) / $($after.Normalized.Substring(0,12))"
  }
  if ($verdict -eq 'DIFFERENT') { $failed += $artifact }
  Note "$artifact  $verdict"
}

if ($failed.Count -gt 0) {
  # Put the committed bytes back: a caller that asked a question should not be
  # left with a tree it did not ask to change.
  Push-Location $package
  try { & git checkout -- $artifacts 'client/client.js.map' | Out-Null } finally { Pop-Location }
  throw "$($failed -join ', ') differ from what these sources build to (the committed bundles were restored)"
}

if ($Restore) {
  Push-Location $package
  try { & git checkout -- $artifacts 'client/client.js.map' | Out-Null } finally { Pop-Location }
}
