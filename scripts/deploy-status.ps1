# Report which version each surface of this deployment is actually running.
#
# The failure this exists to prevent is recorded in PROGRESS.md §0: a change to
# `src/host/**` is read once, at boot, and frozen; installing a new package does
# not reach a process that is already running. So "what is installed", "what the
# bundle on disk is", and "what this process is running" are three different
# answers, and a deployment is judged by all of them, not by the one that is
# easiest to look at.
#
# Every line it prints is a reading, not a conclusion:
#   - the repository: version, HEAD, and the two artifact hashes;
#   - the local profile: the version in the installed copy of this package, plus
#     two markers for whether that copy even contains the settings layer
#     (`settings.describe` in its bundle, `config:` in its bundle patch);
#   - the local DSH checkout: whichever one the build scripts would use;
#   - the server: the pinned dependency, the installed package version, the unit
#     state, and the listening ports, read over SSH.
#
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-status.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-status.ps1 -SkipRemote
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-status.ps1 -VerifyBuild

param(
  [string]$RemoteHost = '210.16.120.228',
  [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519_dsh",
  [string]$Profile = 'web',
  [switch]$SkipRemote,
  # Rebuild the working tree in memory of the filesystem and report whether the
  # committed artifacts are the artifacts of these sources. Slower, and it writes
  # the two bundle files; without it only the hashes are reported.
  [switch]$VerifyBuild
)

$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
Set-Location $package

function Note([string]$message) { Write-Host $message }

function Get-ArtifactLine([string]$relative) {
  $path = Join-Path $package $relative
  if (-not (Test-Path $path)) { return "$relative  missing" }
  $file = Get-Item $path
  $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower().Substring(0, 12)
  return "$relative  $($file.Length) B  sha256 $hash"
}

# --- repository --------------------------------------------------------------

$manifest = Get-Content (Join-Path $package 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$head = (& git rev-parse --short HEAD).Trim()
$tags = @(& git tag --list --points-at HEAD)
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
$dirty = @(& git status --porcelain)

Note '== repository =='
Note "version     $($manifest.version)"
Note "HEAD        $head  ($branch)"
if ($tags.Count -gt 0) { Note "tag here    $($tags -join ', ')" }
else { Note 'tag here    (none)  <- this commit cannot be installed by a tag pin' }
Note "worktree    $(if ($dirty.Count -eq 0) { 'clean' } else { "$($dirty.Count) uncommitted change(s)" })"
Get-ArtifactLine 'lib/index.js' | ForEach-Object { Note $_ }
Get-ArtifactLine 'client/client.js' | ForEach-Object { Note $_ }

# What the installed Host half claims when it is loaded. This is the same reading
# the profile's `dsh-session-sync` version comes from, taken through node rather
# than read out of the manifest, because the manifest can be newer than the code.
$entry = (Join-Path $package 'lib/index.js') -replace '\\', '/'
try {
  $reported = (& node -e "import('file:///$entry').then(m => process.stdout.write(String(m.pluginVersion())))").Trim()
  Note "bundle says $reported"
} catch {
  Note "bundle says (could not load: $($_.Exception.Message))"
}

# --- local profile -----------------------------------------------------------

Note ''
Note "== local profile ($Profile) =="
$installed = Join-Path (Join-Path $env:USERPROFILE ".dsh\profiles\$Profile") 'node_modules\dsh-session-sync'
if (-not (Test-Path $installed)) {
  Note 'not installed in this profile'
} else {
  $installedManifest = Get-Content (Join-Path $installed 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  Note "installed   $($installedManifest.version)"
  $settingsMarkers = @(Select-String -Path (Join-Path $installed 'lib\index.js') -Pattern 'settings\.describe' -Encoding UTF8)
  Note "settings layer in installed bundle: $(if ($settingsMarkers.Count -gt 0) { 'yes' } else { 'no' })"
  $patch = Join-Path $installed 'cordis.patch.yml'
  if (Test-Path $patch) {
    $configLine = @(Select-String -Path $patch -Pattern 'config:' -Encoding UTF8)
    Note "config: mapping in installed patch:  $(if ($configLine.Count -gt 0) { 'yes' } else { 'no' })"
  }
  $profileManifest = Join-Path (Split-Path (Split-Path $installed -Parent) -Parent) 'package.json'
  if (Test-Path $profileManifest) {
    $spec = (Get-Content $profileManifest -Raw -Encoding UTF8 | ConvertFrom-Json).dependencies.'dsh-session-sync'
    Note "dependency spec: $spec"
    if ($spec -notmatch '#v\d') { Note '               ^ no tag pin: the next `pnpm update` can pull any commit' }
  }
}

# The settings layer's own store, in the Harness home. Its absence is what says
# the migration has never run on this machine. (`$HOME` is a read-only automatic
# variable in PowerShell — naming this one `$home` fails with VariableNotWritable,
# the same trap PROGRESS.md §1 records for `.ps1` parameter names.)
$harnessHome = Join-Path $env:USERPROFILE '.dsh'
$settingsYaml = Join-Path $harnessHome 'settings.yaml'
$legacyDocument = Join-Path $harnessHome 'dsh-session-sync.json'
Note "settings.yaml present: $(Test-Path $settingsYaml)"
Note "legacy json present:   $(Test-Path $legacyDocument)"
$archives = @(Get-ChildItem $harnessHome -Filter 'dsh-session-sync.json.imported-*.json' -ErrorAction SilentlyContinue)
if ($archives.Count -gt 0) { Note "import archives:       $($archives.Name -join ', ')" }

# --- local DSH checkout ------------------------------------------------------

$checkout = $env:DSH_CHECKOUT
if (-not $checkout) {
  $candidates = @(
    (Join-Path $env:USERPROFILE 'Desktop\git\deepseek-harness'),
    (Join-Path $env:USERPROFILE 'git\deepseek-harness'),
    (Split-Path $package -Parent | Join-Path -ChildPath 'deepseek-harness')
  )
  $checkout = @($candidates | Where-Object { Test-Path (Join-Path $_ 'node_modules\.bin\tsdown.cmd') })[0]
}
Note ''
Note '== local DSH checkout =='
if (-not $checkout) {
  Note 'none found (the build scripts and the gates that need tsc will refuse)'
} else {
  $dshManifest = Get-Content (Join-Path $checkout 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $settings = Test-Path (Join-Path $checkout 'packages\settings\settings')
  Note "checkout    $checkout"
  Note "dsh version $($dshManifest.version)"
  Note "settings package present: $settings"
}

# --- the server --------------------------------------------------------------

Note ''
Note "== server ($RemoteHost) =="
if ($SkipRemote) {
  Note 'skipped (-SkipRemote)'
} else {
  $helper = Join-Path $env:USERPROFILE '.dsh\skills\remote-ssh-ops\scripts\invoke-remote.ps1'
  if (-not (Test-Path $helper)) {
    Note "cannot check the server: no helper at $helper"
  } else {
    # The helper is loaded through `iex` rather than dot-sourced: PowerShell 5.1
    # reads a `.ps1` as ANSI without `-Encoding`, and that helper carries UTF-8
    # Chinese comments, so a plain dot-source fails to parse it.
    iex (Get-Content $helper -Raw -Encoding UTF8)
    # The DSH version on the server is read from the unit, not from `node_modules`:
# the unit runs `npx -y @deepseek-ai/dsh@<version>`, so the DSH build lives in the
# npx cache and the profile tree only ever holds this plugin. Reading the unit is
# also the only reading that says what the process was *pinned* to (an empty
# `node_modules/@deepseek-ai` here is how that was discovered).
$sh = @'
pkg=/root/.dsh/profiles/web/node_modules/dsh-session-sync/package.json
unit=/root/.dsh/profiles/web/package.json
echo "installed $(grep -m1 '"version"' $pkg 2>/dev/null | tr -dc '0-9.')"
echo "spec $(grep -m1 'dsh-session-sync' $unit 2>/dev/null | tr -d ' ,\"')"
echo "unit $(systemctl is-active dsh-web.service 2>/dev/null)"
echo "ports $(ss -lnt 2>/dev/null | grep -cE ':3080|:8791')"
echo "dsh $(grep -m1 -oE '@deepseek-ai/dsh@[0-9][0-9A-Za-z.-]*' /etc/systemd/system/dsh-web.service 2>/dev/null | head -1 | cut -d@ -f3)"
echo "settings_yaml $(test -f /root/.dsh/settings.yaml && echo yes || echo no)"
'@
    try {
      $remote = Invoke-Remote -RemoteHost $RemoteHost -Key $KeyPath -Sh $sh -Quiet
      if ($remote.Exit -ne 0) { Note "ssh exited $($remote.Exit)" }
      foreach ($line in ($remote.Output -split "`n")) {
        if ($line -match '^\s*(installed|spec|unit|ports|dsh|settings_yaml)\s+(.*)$') {
          Note ("{0,-14}{1}" -f $Matches[1], $Matches[2].Trim())
        }
      }
    } catch {
      Note "could not reach the server: $($_.Exception.Message)"
    }
  }
}

# --- optional: are the committed artifacts these sources? --------------------

if ($VerifyBuild) {
  Note ''
  Note '== artifact freshness =='
  if (-not $checkout) { throw 'no DSH checkout found; cannot rebuild' }
  # The comparison, not a hash equality: the client bundle contains the absolute
  # path it was built under, and its CSS-Module class names are fingerprinted from
  # that path, so only the Host bundle can be byte-identical across machines.
  # `-Restore` leaves the committed artifacts in place; a nonzero exit throws.
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'compare-artifacts.ps1') -Checkout $checkout -Restore
  if ($LASTEXITCODE -ne 0) { throw "compare-artifacts.ps1 exited $LASTEXITCODE" }
}
