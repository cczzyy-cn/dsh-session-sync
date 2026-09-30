# Cut a release: verify, tag, push (branch + tag), then print the deploy step.
#
# Why this exists as a script: the tag is part of the deployment contract, not a
# label. A profile dependency pins `github:cczzyy-cn/dsh-session-sync#v<version>`,
# so a commit that never got a tag cannot be installed at all — and that failure
# shows up much later, as "the server will not take the new version". The
# previous releases did this in one-off scripts under `$env:TEMP`, which is why
# three commits here (0.10.29-0.10.31) were pushed and never tagged.
#
# What it checks before it tags anything, all of it locally:
#   1. the version in `package.json` is not already tagged here or on origin;
#   2. `lib/` and `client/` are the artifacts of these sources — the built Host
#      half reports the same version, and a rebuild produces the same artifacts
#      (the Host half byte for byte; the client half past the build root, which
#      its CSS-Module class names are fingerprinted from — see
#      `compare-artifacts.ps1`);
#   3. the two gates and the test suite pass.
# Only then does it tag. It never touches the repository's git config: the token
# is read from Windows Credential Manager and handed to git as a one-shot header.
#
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -MessageFile <path>
#
# `git commit -F <file>` is assumed to have happened already: this script pushes
# what is committed, and a dirty tree is a refusal, not something it cleans up.

param(
  # Commit message file for the annotated tag. Omit for a tag with no body.
  [string]$MessageFile = '',
  # Tag this version without pushing. Nothing leaves this machine.
  [switch]$NoPush,
  # Verify and report, tag nothing.
  [switch]$DryRun,
  # Skip the test suite (the gates and the artifact comparison still run).
  [switch]$SkipTests,
  # Skip the rebuild-and-compare step that proves the committed bundles are the
  # bundles of these sources. Only for a machine without a DSH checkout.
  [switch]$SkipBuildCheck,
  # Windows Credential Manager target holding the GitHub token.
  [string]$CredentialTarget = 'gh:github.com:cczzyy-cn'
)

$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
Set-Location $package

function Note([string]$message) { Write-Host $message }
function Fail([string]$message) { throw $message }

# --- 1. version and tag name -------------------------------------------------

$manifest = Get-Content (Join-Path $package 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { Fail "package.json version '$version' is not x.y.z" }
$tag = "v$version"
Note "version:  $version"
Note "tag:      $tag"

$head = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'not a git repository' }

# A dirty tree is a refusal: the tag would name a commit that does not contain
# what is on disk, and the deploy installs the commit.
$dirty = @(& git status --porcelain)
if ($dirty.Count -gt 0) {
  Fail "the working tree has $($dirty.Count) uncommitted change(s); commit them first:`n$($dirty -join "`n")"
}

# No gh on this machine and no TTY, so origin is asked over HTTPS with the token
# injected as a one-shot header (see §6 of PROGRESS.md for why the helper path
# and schannel both fail under the sandbox).
function Test-RemoteTag([string]$name) {
  $sig = @'
using System;
using System.Runtime.InteropServices;
public static class ReleaseCred {
  [StructLayout(LayoutKind.Sequential)] public struct CREDENTIAL { public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);
}
'@
  if (-not ('ReleaseCred' -as [type])) { Add-Type -TypeDefinition $sig }
  $ptr = [IntPtr]::Zero
  if (-not [ReleaseCred]::CredRead($CredentialTarget, 1, 0, [ref]$ptr)) {
    Fail "CredRead('$CredentialTarget') failed; is the token in Windows Credential Manager?"
  }
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][ReleaseCred+CREDENTIAL])
  $bytes = New-Object byte[] $cred.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
  # The blob is UTF-8, not UTF-16: decoding it as Unicode yields 20 mojibake
  # characters and GitHub answers 401.
  $token = [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0).Trim()
  [ReleaseCred]::CredFree($ptr)
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
  $env:GIT_TERMINAL_PROMPT = '0'
  $env:GCM_INTERACTIVE = 'never'
  $header = "http.https://github.com/.extraHeader=Authorization: Basic $basic"
  $lines = @(& git -c http.sslBackend=openssl -c $header ls-remote --tags origin "refs/tags/$name" 2>&1)
  if ($lines -match 'fatal|error|Authentication failed|could not read Username') {
    Fail "could not read origin tags: $($lines -join ' ')"
  }
  return ($lines | Where-Object { $_ -match "\S" }).Count -gt 0
}

$localExists = (git tag --list $tag) -match "\S"
if ($localExists) { Fail "tag $tag already exists locally; bump the version first" }

if (-not $NoPush) {
  if (Test-RemoteTag $tag) { Fail "tag $tag already exists on origin; bump the version first" }
  Note 'origin does not have this tag yet'
}

# --- 2. the artifacts must be the artifacts of these sources -----------------

$checkout = $env:DSH_CHECKOUT
if (-not $checkout) {
  $candidates = @(
    (Join-Path $env:USERPROFILE 'Desktop\git\deepseek-harness'),
    (Join-Path $env:USERPROFILE 'git\deepseek-harness'),
    (Split-Path $package -Parent | Join-Path -ChildPath 'deepseek-harness')
  )
  $checkout = @($candidates | Where-Object { Test-Path (Join-Path $_ 'node_modules\.bin\tsdown.cmd') })[0]
}

$entry = (Join-Path $package 'lib/index.js') -replace '\\', '/'
$reported = (& node -e "import('file:///$entry').then(m => process.stdout.write(String(m.pluginVersion())))").Trim()
if ($reported -ne $version) { Fail "lib/index.js states '$reported' but package.json says '$version'" }
Note "artifacts state $reported"

if (-not $SkipBuildCheck) {
  if (-not $checkout) { Fail 'no DSH checkout found for the artifact comparison; set DSH_CHECKOUT or pass -SkipBuildCheck' }
  # Byte identity is not the right question for the client bundle: tsdown
  # fingerprints its CSS-Module class names from the *absolute* source path, so
  # the committed bundle (built under another user's directory) can never match
  # byte for byte here. `compare-artifacts.ps1` compares past that and says which
  # of the two it found; it restores the committed bundles when it is done.
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'compare-artifacts.ps1') -Checkout $checkout -Restore
  if ($LASTEXITCODE -ne 0) {
    Fail 'the committed bundles are not what these sources build to; commit a rebuild (scripts/build-and-install.ps1)'
  }
}

# --- 3. the gates ------------------------------------------------------------

& node (Join-Path $PSScriptRoot 'check-encoding.mjs')
if ($LASTEXITCODE -ne 0) { Fail "check-encoding exited $LASTEXITCODE" }

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'typecheck.ps1')
if ($LASTEXITCODE -ne 0) { Fail "typecheck exited $LASTEXITCODE" }

if (-not $SkipTests) {
  & cmd /c 'npm test --silent'
  if ($LASTEXITCODE -ne 0) { Fail "npm test exited $LASTEXITCODE" }
}

# --- 4. tag and push ---------------------------------------------------------

$message = "dsh-session-sync $tag"
if ($MessageFile) {
  if (-not (Test-Path $MessageFile)) { Fail "no message file at $MessageFile" }
  $body = (Get-Content $MessageFile -Raw -Encoding UTF8).Trim()
  if ($body) { $message = "$message`n`n$body" }
}
$messageFile = Join-Path ([IO.Path]::GetTempPath()) "dsh-tag-$tag-$([guid]::NewGuid().ToString('N')).txt"
# Written without a BOM on purpose: a BOM would become the first bytes of the tag
# body, and `git tag -F` would record it.
[IO.File]::WriteAllText($messageFile, $message, (New-Object Text.UTF8Encoding($false)))

if ($DryRun) {
  Note "dry run: would tag $tag at $head and push"
  Remove-Item $messageFile -ErrorAction SilentlyContinue
  return
}

& git tag -a $tag -F $messageFile
if ($LASTEXITCODE -ne 0) { Fail "git tag exited $LASTEXITCODE" }
Remove-Item $messageFile -ErrorAction SilentlyContinue
Note "tagged $tag at $head"

if ($NoPush) {
  Note 'not pushed (-NoPush); to publish: git push origin main; git push origin ' + $tag
  return
}

# One more credential read for the push itself: `git tag` above needed none.
$sig = @'
using System;
using System.Runtime.InteropServices;
public static class ReleasePushCred {
  [StructLayout(LayoutKind.Sequential)] public struct CREDENTIAL { public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);
}
'@
if (-not ('ReleasePushCred' -as [type])) { Add-Type -TypeDefinition $sig }
$ptr = [IntPtr]::Zero
if (-not [ReleasePushCred]::CredRead($CredentialTarget, 1, 0, [ref]$ptr)) { Fail 'CredRead failed for the push' }
$cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][ReleasePushCred+CREDENTIAL])
$bytes = New-Object byte[] $cred.CredentialBlobSize
[Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
$token = [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0).Trim()
[ReleasePushCred]::CredFree($ptr)
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$header = "http.https://github.com/.extraHeader=Authorization: Basic $basic"

& git -c http.sslBackend=openssl -c $header push origin refs/heads/main
if ($LASTEXITCODE -ne 0) { Fail "branch push exited $LASTEXITCODE" }
& git -c http.sslBackend=openssl -c $header push origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { Fail "tag push exited $LASTEXITCODE" }
Note "pushed main and $tag"

# --- 5. what the deploy now looks like ---------------------------------------

Note ''
Note 'next: deploy the tag. The profile dependency pins the version, so a `pnpm update` alone'
Note '      re-resolves the same tag and changes nothing — the spec itself has to move.'
Note "  server:  pnpm --dir /root/.dsh/profiles/web add 'github:cczzyy-cn/dsh-session-sync#$tag'"
Note '           systemctl restart dsh-web.service'
Note '  local:   the profile dependency is checked by the deploy-status script; a Host-half change'
Note '           needs a restart of the local host (it kills the running Session).'
Note "  verify:  scripts/deploy-status.ps1 -RemoteHost <host> — every surface must report $version"
