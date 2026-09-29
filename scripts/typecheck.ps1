# Typecheck this package for real.
#
# `tsc` here needs `node_modules` to exist, because the project's `types` includes
# `node` and its client half imports React and DSH packages. Without it, `tsc` stops
# at one `TS2688` ("cannot find type definition file for 'node'") and **checks
# nothing** - which is worse than no check at all, because the output looks like a
# clean run. Two shipped crashes (an undeclared `mirrored`, then an undeclared
# `authoritative`) got past exactly that way.
#
# So: borrow the DSH checkout's `node_modules` through a junction (the same thing
# `scripts/build-and-install.ps1` does for the bundler), run `tsc`, and report the
# codes that mean *this* source is wrong. Module-resolution noise is expected while
# the client half's upstream packages are only reachable through the bundler, so it
# is listed separately rather than mixed in.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
param(
  [string]$Checkout = 'C:\Users\14339\Desktop\git\deepseek-harness',
  [switch]$All
)

$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
$link = Join-Path $package 'node_modules'
$created = $false

if (-not (Test-Path $link)) {
  cmd /c mklink /J "$link" "$Checkout\node_modules" | Out-Null
  $created = $true
}

try {
  $tsc = Join-Path $Checkout 'node_modules\.bin\tsc.CMD'
  Push-Location $package
  try {
    $output = & $tsc --noEmit -p tsconfig.json 2>&1
  } finally {
    Pop-Location
  }

  $lines = @($output | ForEach-Object { $_.ToString() } | Where-Object { $_ -match 'error TS' })
  # The gate: undeclared names. These cannot be produced by the unresolved upstream
  # half, and they are exactly what shipped two crashes (`mirrored`, then
  # `authoritative`) while every other check stayed green.
  $fatal = $lines | Where-Object { $_ -match 'TS2304|TS2552' }
  # Plausible type mismatches - listed, but not gated on, because a JSX `key` on an
  # unresolved component type reports TS2322 here and is not a defect.
  $likely = $lines | Where-Object { $_ -match 'TS2345|TS2739|TS2741|TS2769|TS2322' -and $_ -notmatch 'key:' }
  # Everything else is the unresolved upstream half (react, @deepseek-ai/*, CSS).
  $noise = $lines | Where-Object { $fatal -notcontains $_ -and $likely -notcontains $_ }

  Write-Host "checked $($lines.Count) diagnostic(s)"
  if ($fatal.Count -gt 0) {
    Write-Host ''
    Write-Host "UNDECLARED NAMES ($($fatal.Count)) - this is a runtime crash waiting:" -ForegroundColor Red
    $fatal | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  } else {
    Write-Host 'undeclared names: none' -ForegroundColor Green
  }
  if ($likely.Count -gt 0) {
    Write-Host "type mismatches to look at ($($likely.Count)):"
    $likely | ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Host 'type mismatches: none (outside the JSX `key` artifacts)'
  }
  Write-Host "unresolved upstream imports and JSX artifacts: $($noise.Count) (expected without the bundler's resolution)"
  if ($All -and $noise.Count -gt 0) {
    $noise | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" }
  }
  if ($fatal.Count -gt 0) { exit 1 }
  exit 0
} finally {
  if ($created -and (Test-Path $link)) { cmd /c rmdir "$link" | Out-Null }
}
