# FindMyAIDA - Installer fuer Windows.
#
#   irm https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.ps1 | iex
#
# Installiert ohne Admin-Rechte nach %LOCALAPPDATA%\Programs\FindMyAIDA, nimmt den Ordner in den Benutzer-PATH
# auf (Befehle `findmyaida` und `fma`) und legt Verknuepfungen im Startmenue und auf dem Desktop an.
#
# Optionen: -Update, -Uninstall, -Purge (mit -Uninstall: auch Einstellungen, Favoriten, Cache), -Version 0.4.0,
# -From <Archiv oder Ordner>, -NoStart. Ueber `irm | iex` gehen keine Parameter; dafuer:
#   & ([scriptblock]::Create((irm https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.ps1))) -Uninstall
# Umgebung: FINDMYAIDA_REPO (owner/name). Private Releases laedt das Skript ueber eine angemeldete GitHub-CLI (gh).

param(
  [switch]$Update,
  [switch]$Uninstall,
  [switch]$Purge,
  [string]$Version = 'latest',
  [string]$From = '',
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest ist mit Fortschrittsbalken um ein Vielfaches langsamer

$Repo = if ($env:FINDMYAIDA_REPO) { $env:FINDMYAIDA_REPO } else { 'hallohallo12345674/findmyaida' }
$Root = if ($env:FINDMYAIDA_HOME) { $env:FINDMYAIDA_HOME } else { Join-Path $env:LOCALAPPDATA 'Programs\FindMyAIDA' }
$Target = 'win-x64' # Windows auf ARM fuehrt x64-Programme aus
$StartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'FindMyAIDA.lnk'
$Desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'FindMyAIDA.lnk'
$Version = $Version.TrimStart('v')

# Text mit Umlauten ueber Zeichencodes: die Datei bleibt reines ASCII, egal wie `irm` sie dekodiert.
$ae = [char]0xE4; $oe = [char]0xF6; $ue = [char]0xFC; $ss = [char]0xDF; $dash = [char]0x2013; $dots = [char]0x2026
$ok = [char]0x2713; $lq = [char]0x201E; $rq = [char]0x201C

# throw statt exit: Bei `irm | iex` wuerde exit das ganze PowerShell-Fenster schliessen.
function Fail([string]$Message) {
  throw "FindMyAIDA: $Message"
}

function Test-GhLogin {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { return $false }
  & gh auth status *> $null
  return ($LASTEXITCODE -eq 0)
}

function Remove-FromUserPath([string]$Dir) {
  $path = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $path) { return }
  $parts = $path.Split(';') | Where-Object { $_ -and ($_.TrimEnd('\') -ne $Dir.TrimEnd('\')) }
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
}

# ---------------------------------------------------------------- Entfernen

if ($Uninstall) {
  Remove-Item -Force -ErrorAction SilentlyContinue $StartMenu, $Desktop
  Remove-FromUserPath $Root
  if ($Purge) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $HOME '.config\findmyaida'), (Join-Path $HOME '.cache\findmyaida')
  }
  try {
    Remove-Item -Recurse -Force $Root
  } catch {
    # Laeuft FindMyAIDA noch (z. B. `findmyaida uninstall`), ist node.exe gesperrt: kurz danach loeschen.
    Start-Process -WindowStyle Hidden cmd.exe -ArgumentList '/c', "ping -n 4 127.0.0.1 >nul & rmdir /s /q `"$Root`""
  }
  if ($Purge) { Write-Host "FindMyAIDA ist entfernt, samt Einstellungen, Favoriten und Cache." }
  else { Write-Host "FindMyAIDA ist entfernt. Einstellungen und Favoriten liegen weiter in $HOME\.config\findmyaida." }
  return
}

# ---------------------------------------------------------------- Herunterladen

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("findmyaida-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $Tmp | Out-Null

try {
  if ($From) {
    if (Test-Path $From -PathType Container) {
      Copy-Item (Join-Path $From "findmyaida-*-$Target.zip") $Tmp
      if (Test-Path (Join-Path $From 'SHA256SUMS')) { Copy-Item (Join-Path $From 'SHA256SUMS') $Tmp }
    } elseif (Test-Path $From -PathType Leaf) {
      Copy-Item $From $Tmp
      $sums = Join-Path (Split-Path $From) 'SHA256SUMS'
      if (Test-Path $sums) { Copy-Item $sums $Tmp }
    } else { Fail "$From gibt es nicht." }
  } else {
    $base = if ($Version -eq 'latest') { "https://github.com/$Repo/releases/latest/download" } else { "https://github.com/$Repo/releases/download/v$Version" }
    $public = $true
    try { Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS') } catch { $public = $false }
    if ($public) {
      $line = Get-Content (Join-Path $Tmp 'SHA256SUMS') | Where-Object { $_ -match "-$Target\.zip$" } | Select-Object -First 1
      if (-not $line) { Fail "Im Release gibt es kein Archiv f${ue}r $Target." }
      $file = ($line -split '\s+')[1]
      Write-Host "Lade $file $dots"
      Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile (Join-Path $Tmp $file)
    } elseif (Test-GhLogin) {
      Write-Host "Lade ${ue}ber die GitHub-CLI aus $Repo $dots"
      $tagArgs = if ($Version -eq 'latest') { @() } else { @("v$Version") }
      & gh release download @tagArgs --repo $Repo --pattern SHA256SUMS --pattern "*-$Target.zip" --dir $Tmp --clobber
      if ($LASTEXITCODE -ne 0) { Fail "Release in $Repo nicht gefunden." }
    } else {
      Fail "Release nicht erreichbar ($Repo). Ist das Repository privat, vorher bei der GitHub-CLI anmelden: gh auth login"
    }
  }

  $archive = Get-ChildItem $Tmp -Filter "findmyaida-*-$Target.zip" | Select-Object -First 1
  if (-not $archive) { Fail "Kein Archiv f${ue}r $Target gefunden." }
  $sumsFile = Join-Path $Tmp 'SHA256SUMS'
  if (Test-Path $sumsFile) {
    $line = Get-Content $sumsFile | Where-Object { $_ -match " $([regex]::Escape($archive.Name))$" } | Select-Object -First 1
    if (-not $line) { Fail "Keine Pr${ue}fsumme f${ue}r $($archive.Name)." }
    $expected = ($line -split '\s+')[0]
    $actual = (Get-FileHash -Algorithm SHA256 $archive.FullName).Hash.ToLower()
    if ($actual -ne $expected) { Fail "Pr${ue}fsumme von $($archive.Name) stimmt nicht $dash Download besch${ae}digt?" }
  } elseif (-not $From) { Fail "Ohne SHA256SUMS keine Installation." }

  # ---------------------------------------------------------------- Installieren

  $previous = $null
  $cmdFile = Join-Path $Root 'findmyaida.cmd'
  if (Test-Path (Join-Path $Root 'VERSION')) { $previous = (Get-Content (Join-Path $Root 'VERSION')).Trim() }

  Expand-Archive -Force $archive.FullName -DestinationPath $Tmp
  $dir = Join-Path $Tmp ($archive.BaseName)
  $new = (Get-Content (Join-Path $dir 'VERSION')).Trim()
  $versions = Join-Path $Root 'versions'
  New-Item -ItemType Directory -Force $versions | Out-Null
  $dest = Join-Path $versions $new
  if (Test-Path $dest) {
    try { Remove-Item -Recurse -Force $dest } catch { $dest = Join-Path $versions ("$new-" + (Get-Date -Format 'yyyyMMddHHmmss')) }
  }
  Move-Item $dir $dest
  # Aeltere Versionen entfernen; eine gerade laufende bleibt gesperrt und verschwindet beim naechsten Mal.
  Get-ChildItem $versions -Directory | Where-Object { $_.FullName -ne $dest } | ForEach-Object {
    try { Remove-Item -Recurse -Force $_.FullName } catch {}
  }
  # Fester Ort fuer die Chrome-Erweiterung: bleibt nach Updates gueltig.
  $ext = Join-Path $Root 'extension'
  if (Test-Path $ext) { Remove-Item -Recurse -Force $ext }
  Copy-Item -Recurse (Join-Path $dest 'extension') $ext
  Copy-Item -Force (Join-Path $dest 'install.ps1') (Join-Path $Root 'install.ps1')
  Copy-Item -Force (Join-Path $dest 'assets\icon.ico') (Join-Path $Root 'icon.ico')
  Set-Content -Encoding ASCII (Join-Path $Root 'VERSION') $new

  $rel = $dest.Substring($Root.Length).TrimStart('\')
  # Startskripte: setzen die Umgebung wie die Starter unter macOS/Linux und rufen das beigelegte Node auf.
  $cmd = @"
@echo off
setlocal
set "FINDMYAIDA_HOME=%~dp0"
set "FINDMYAIDA_HOME=%FINDMYAIDA_HOME:~0,-1%"
set "FINDMYAIDA_EXTENSION_DIR=%FINDMYAIDA_HOME%\extension"
set NODE_OPTIONS=
"%FINDMYAIDA_HOME%\$rel\node.exe" "%FINDMYAIDA_HOME%\$rel\app\findmyaida.mjs" %*
"@
  Set-Content -Encoding ASCII $cmdFile $cmd
  Set-Content -Encoding ASCII (Join-Path $Root 'fma.cmd') "@call `"%~dp0findmyaida.cmd`" %*"
  # Fuer die Verknuepfung ohne Windows Terminal: Konsolenfenster in passender Groesse
  Set-Content -Encoding ASCII (Join-Path $Root 'FindMyAIDA-start.cmd') "@echo off`r`ntitle FindMyAIDA`r`nmode con: cols=120 lines=34`r`ncall `"%~dp0findmyaida.cmd`""

  # ---------------------------------------------------------------- PATH und Verknuepfungen

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $inPath = $userPath -and ($userPath.Split(';') | Where-Object { $_.TrimEnd('\') -eq $Root.TrimEnd('\') })
  if (-not $inPath) {
    [Environment]::SetEnvironmentVariable('Path', ((@($userPath, $Root) | Where-Object { $_ }) -join ';'), 'User')
  }
  if (-not ($env:Path.Split(';') -contains $Root)) { $env:Path = "$env:Path;$Root" }

  $shell = New-Object -ComObject WScript.Shell
  $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
  foreach ($lnkPath in @($StartMenu, $Desktop)) {
    $lnk = $shell.CreateShortcut($lnkPath)
    if ($wt) {
      $lnk.TargetPath = $wt.Source
      $lnk.Arguments = "--size 120,34 --title FindMyAIDA `"$cmdFile`""
    } else {
      $lnk.TargetPath = Join-Path $Root 'FindMyAIDA-start.cmd'
      $lnk.Arguments = ''
    }
    $lnk.WorkingDirectory = $HOME
    $lnk.IconLocation = Join-Path $Root 'icon.ico'
    $lnk.Description = 'AIDA-Kreuzfahrten: alle Preise und Buchungsoptionen vergleichen'
    $lnk.Save()
  }

  # ---------------------------------------------------------------- Abschluss

  Write-Host ''
  if ($previous -and $previous -ne $new) { Write-Host "$ok FindMyAIDA von $previous auf $new aktualisiert." -ForegroundColor Green }
  elseif ($previous) { Write-Host "$ok FindMyAIDA $new ist aktuell (neu installiert)." -ForegroundColor Green }
  else { Write-Host "$ok FindMyAIDA $new ist installiert." -ForegroundColor Green }
  if (-not $Update) {
    Write-Host ''
    Write-Host "  Starten:  findmyaida   (kurz: fma) $dash in jedem neuen PowerShell- oder Terminalfenster"
    Write-Host "            oder ${ue}ber ${lq}FindMyAIDA${rq} im Startmen${ue} bzw. auf dem Desktop"
    Write-Host ''
  }
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Tmp
}

if (-not $Update -and -not $NoStart -and [Environment]::UserInteractive) {
  $answer = Read-Host 'FindMyAIDA jetzt starten? [J/n]'
  if ($answer -eq '' -or $answer -match '^(j|ja|y|yes)$') { & $cmdFile }
}
