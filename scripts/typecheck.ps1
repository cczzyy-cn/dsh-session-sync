# Typecheck this package for real.
#
# `tsc` here needs `node_modules` to exist, because the project's `types` includes
# `node` and its client half imports React and DSH packages. Without it, `tsc` stops
# at one `TS2688` ("cannot find type definition file for 'node'") and **checks
# nothing** - which is worse than no check at all, because the output looks like a
# clean run. Two shipped crashes (an undeclared `mirrored`, then an undeclared
# `authoritative`) got past exactly that way.
#
# So this script does two things the old one did not:
#   1. It refuses to certify a run that checked nothing. A `TS2688`, or a tsconfig
#      that resolves to zero files, is a failure - not a green line.
#   2. It finds the DSH checkout instead of pinning one machine's path. A gate that
#      cannot run is the same as no gate, and a pinned path made that the default
#      everywhere but its author's host.
#
# It then borrows the checkout's `node_modules` through a junction (the same thing
# `scripts/build-and-install.ps1` does for the bundler), runs `tsc`, and reports the
# codes that mean *this* source is wrong. Module-resolution noise is expected while
# the client half's upstream packages are only reachable through the bundler, so it
# is listed separately rather than mixed in.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1 -Checkout <path> -All
param(
  [string]$Checkout = '',
  [switch]$All
)

$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
$link = Join-Path $package 'node_modules'
$created = $false

if ($Checkout -eq '') {
  $candidates = @(
    (Join-Path $env:USERPROFILE 'Desktop\git\deepseek-harness'),
    (Join-Path $env:USERPROFILE 'git\deepseek-harness'),
    (Join-Path (Split-Path $package -Parent) 'deepseek-harness')
  )
  if ($env:DSH_CHECKOUT) { $candidates = @($env:DSH_CHECKOUT) + $candidates }
  $Checkout = @($candidates | Where-Object { Test-Path (Join-Path $_ 'node_modules\.bin\tsc.CMD') })[0]
  if (-not $Checkout) {
    Write-Host "typecheck: no DSH checkout found (tried: $($candidates -join '; '))" -ForegroundColor Red
    Write-Host 'typecheck: pass -Checkout <path> or set DSH_CHECKOUT' -ForegroundColor Red
    exit 1
  }
}
$tsc = Join-Path $Checkout 'node_modules\.bin\tsc.CMD'
if (-not (Test-Path $tsc)) {
  Write-Host "typecheck: no tsc at $tsc" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $link)) {
  cmd /c mklink /J "$link" "$Checkout\node_modules" | Out-Null
  $created = $true
}

try {
  Push-Location $package
  try {
    # `--showConfig` is cheap and answers the other no-op: a tsconfig that resolves
    # to no files would also report a clean run.
    $raw = (& $tsc --showConfig -p tsconfig.json 2>&1 | Out-String)
    $brace = $raw.IndexOf('{')
    $fileCount = -1
    if ($brace -ge 0) {
      try { $fileCount = @(($raw.Substring($brace) | ConvertFrom-Json).files).Count } catch { $fileCount = -1 }
    }
    if ($fileCount -le 0) {
      Write-Host "REFUSING TO CERTIFY: tsconfig.json resolved to $fileCount file(s), so nothing was checked." -ForegroundColor Red
      $raw.Trim() | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
      exit 1
    }

    $output = & $tsc --noEmit -p tsconfig.json 2>&1
  } finally {
    Pop-Location
  }

  $lines = @($output | ForEach-Object { $_.ToString() } | Where-Object { $_ -match 'error TS' })

  # The no-op this whole script exists to catch: no type definitions means the
  # compiler never got as far as the source, and a green line here would be a lie.
  $noTypes = @($lines | Where-Object { $_ -match 'TS2688' })
  if ($noTypes.Count -gt 0) {
    Write-Host ''
    Write-Host "REFUSING TO CERTIFY: no type definitions under $Checkout\node_modules, so tsc checked no code." -ForegroundColor Red
    $noTypes | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host 'Fix the checkout (or point -Checkout at one that has node_modules) and run again.' -ForegroundColor Red
    exit 1
  }

  # The gate: undeclared names. These cannot be produced by the unresolved upstream
  # half, and they are exactly what shipped two crashes (`mirrored`, then
  # `authoritative`) while every other check stayed green.
  $fatal = @($lines | Where-Object { $_ -match 'TS2304|TS2552' })
  # A missing *module* is this source's own typo only when the specifier is
  # relative. A bare one (`react`, `@deepseek-ai/*`) is the upstream half that only
  # the bundler resolves, and gating on those would make the check unusable.
  $badImport = @($lines | Where-Object { $_ -match 'TS2307' -and $_ -match "Cannot find module '\.\.?/" })
  # Plausible type mismatches - listed, but not gated on, because a JSX `key` on an
  # unresolved component type reports TS2322 here and is not a defect.
  $likely = @($lines | Where-Object { $_ -match 'TS2345|TS2739|TS2741|TS2769|TS2322' -and $_ -notmatch 'key:' })
  # Everything else is the unresolved upstream half (react, @deepseek-ai/*, CSS).
  $noise = @($lines | Where-Object { $fatal -notcontains $_ -and $badImport -notcontains $_ -and $likely -notcontains $_ })

  Write-Host "checked $fileCount file(s), $($lines.Count) diagnostic(s)"
  if ($fatal.Count -gt 0) {
    Write-Host ''
    Write-Host "UNDECLARED NAMES ($($fatal.Count)) - this is a runtime crash waiting:" -ForegroundColor Red
    $fatal | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  } else {
    Write-Host 'undeclared names: none' -ForegroundColor Green
  }
  if ($badImport.Count -gt 0) {
    Write-Host ''
    Write-Host "BROKEN LOCAL IMPORTS ($($badImport.Count)) - a relative path this package cannot resolve:" -ForegroundColor Red
    $badImport | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  } else {
    Write-Host 'relative imports: all resolve' -ForegroundColor Green
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
  if ($fatal.Count -gt 0 -or $badImport.Count -gt 0) { exit 1 }
  exit 0
} finally {
  if ($created -and (Test-Path $link)) { cmd /c rmdir "$link" | Out-Null }
}
