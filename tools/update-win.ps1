param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [Parameter(Mandatory=$true)][string]$Zip,
  [Parameter(Mandatory=$true)][string]$Sha,
  [Parameter(Mandatory=$true)][string]$AppDir,
  [Parameter(Mandatory=$true)][string]$Exe
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'pokepet-update.log'
function Write-Log($msg) {
  "$(Get-Date -Format o) $msg" | Out-File -FilePath $log -Append -Encoding utf8
}
function Restart-App {
  if (Test-Path -LiteralPath $Exe) { Start-Process -FilePath $Exe }
}
try {
  Set-Location $env:TEMP
  Write-Log "waiting for pid $TargetPid"
  Wait-Process -Id $TargetPid -Timeout 120 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Write-Log "hashing $Zip"
  $hash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $Sha.ToLower()) { throw "sha256 mismatch: $hash" }
  $stage = Join-Path $env:TEMP ("pokepet-stage-" + [guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $Zip -DestinationPath $stage -Force
  $newDir = Join-Path $stage 'TogepiPet'
  if (-not (Test-Path -LiteralPath $newDir)) {
    $newDir = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $newDir -or -not (Test-Path -LiteralPath $newDir)) { throw 'zip has no app folder' }
  $parent = Split-Path -Parent $AppDir
  $oldDir = Join-Path $parent ("TogepiPet.old-" + (Get-Date -Format 'yyyyMMddHHmmss'))
  Write-Log "replacing $AppDir"
  if (Test-Path -LiteralPath $AppDir) { Rename-Item -LiteralPath $AppDir -NewName (Split-Path -Leaf $oldDir) }
  Move-Item -LiteralPath $newDir -Destination $AppDir
  Write-Log "restarting $Exe"
  Start-Process -FilePath $Exe
  Start-Sleep -Seconds 2
  if (Test-Path -LiteralPath $oldDir) { Remove-Item -LiteralPath $oldDir -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
  Write-Log 'ok'
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  # 尝试回滚：如果新目录没搬成，旧目录还在
  try {
    if (-not (Test-Path -LiteralPath $AppDir)) {
      $cand = Get-ChildItem -LiteralPath (Split-Path -Parent $AppDir) -Directory -Filter 'TogepiPet.old-*' | Sort-Object Name -Descending | Select-Object -First 1
      if ($cand) { Rename-Item -LiteralPath $cand.FullName -NewName 'TogepiPet' }
    }
  } catch {}
  Restart-App
  exit 1
}
