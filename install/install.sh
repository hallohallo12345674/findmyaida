#!/bin/sh
# FindMyAIDA – Installer für macOS und Linux.
#
#   curl -fsSL https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.sh | sh
#
# Installiert ohne Admin-Rechte nach ~/.local/share/findmyaida, legt die Befehle `findmyaida` und `fma` in
# ~/.local/bin an und ein Startsymbol (macOS: ~/Applications/FindMyAIDA.app, Linux: App-Menü).
#
# Optionen (bei `curl … | sh` mit `sh -s -- <optionen>`):
#   --update            auf die neueste Version aktualisieren (fragt nicht nach dem Start)
#   --uninstall         entfernen; Einstellungen und Favoriten bleiben
#   --purge             mit --uninstall: auch Einstellungen, Favoriten und Cache löschen
#   --version <v>       bestimmte Version, z. B. 0.4.0
#   --from <pfad>       aus einem lokalen Archiv oder Ordner mit Archiven installieren
#   --no-start          am Ende nicht fragen, ob FindMyAIDA starten soll
#
# Umgebung: FINDMYAIDA_REPO (GitHub owner/name), FINDMYAIDA_PREFIX (statt ~/.local/share/findmyaida),
# FINDMYAIDA_BIN (statt ~/.local/bin). Private Releases lädt das Skript über eine angemeldete GitHub-CLI (`gh`).

set -eu

REPO="${FINDMYAIDA_REPO:-hallohallo12345674/findmyaida}"
PREFIX="${FINDMYAIDA_PREFIX:-${FINDMYAIDA_HOME:-$HOME/.local/share/findmyaida}}"
BIN_DIR="${FINDMYAIDA_BIN:-$HOME/.local/bin}"
APPS_DIR="${FINDMYAIDA_APPS:-$HOME/Applications}"
MARK_BEGIN='# >>> FindMyAIDA >>>'
MARK_END='# <<< FindMyAIDA <<<'
WRAPPER_MARK='# FindMyAIDA-Starter (vom Installer angelegt)'

action=install
purge=0
version=latest
from=''
ask_start=1

say() { printf '%s\n' "$*"; }
# Pfad für Ausgaben und Shell-Dateien: unter dem Benutzerordner als ~ bzw. $HOME.
tilde() { case "$1" in "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }
fail() {
  printf 'FindMyAIDA: %s\n' "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --update) action=update; ask_start=0 ;;
    --uninstall) action=uninstall ;;
    --purge) purge=1 ;;
    --version) [ $# -ge 2 ] || fail '--version braucht einen Wert'; version="${2#v}"; shift ;;
    --from) [ $# -ge 2 ] || fail '--from braucht einen Pfad'; from="$2"; shift ;;
    --no-start) ask_start=0 ;;
    -h | --help) sed -n '2,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unbekannte Option: $1" ;;
  esac
  shift
done

# ---------------------------------------------------------------- Plattform

detect_target() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin)
      # Unter Rosetta meldet uname x86_64, obwohl der Rechner Apple Silicon hat.
      if [ "$arch" = x86_64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; fi
      case "$arch" in arm64) echo darwin-arm64 ;; x86_64) echo darwin-x64 ;; *) return 1 ;; esac
      ;;
    Linux)
      case "$arch" in x86_64 | amd64) echo linux-x64 ;; aarch64 | arm64) echo linux-arm64 ;; *) return 1 ;; esac
      ;;
    *) return 1 ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# ---------------------------------------------------------------- Entfernen

remove_path_block() {
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    [ -f "$rc" ] || continue
    if grep -qF "$MARK_BEGIN" "$rc"; then
      tmp="$rc.findmyaida.$$"
      awk -v b="$MARK_BEGIN" -v e="$MARK_END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip' "$rc" >"$tmp" && cat "$tmp" >"$rc"
      rm -f "$tmp"
    fi
  done
  rm -f "$HOME/.config/fish/conf.d/findmyaida.fish"
}

uninstall() {
  for f in "$BIN_DIR/findmyaida" "$BIN_DIR/fma"; do
    # Nur eigene Starter löschen, nie eine fremde Datei gleichen Namens.
    if [ -f "$f" ] && grep -qF "$WRAPPER_MARK" "$f"; then rm -f "$f"; fi
  done
  rm -rf "$APPS_DIR/FindMyAIDA.app" "$HOME/.local/share/applications/findmyaida.desktop" "$PREFIX"
  remove_path_block
  if [ "$purge" = 1 ]; then
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/findmyaida" "${XDG_CACHE_HOME:-$HOME/.cache}/findmyaida"
    say 'FindMyAIDA ist entfernt, samt Einstellungen, Favoriten und Cache.'
  else
    say 'FindMyAIDA ist entfernt. Einstellungen und Favoriten liegen weiter in ~/.config/findmyaida.'
  fi
}

if [ "$action" = uninstall ]; then
  uninstall
  exit 0
fi

# ---------------------------------------------------------------- Herunterladen

target=$(detect_target) || fail "Dieses System wird nicht unterstützt ($(uname -s) $(uname -m)). Unterstützt: macOS, Linux (x64, arm64)."
tmp=$(mktemp -d 2>/dev/null || mktemp -d -t findmyaida)
trap 'rm -rf "$tmp"' EXIT INT TERM

# Lädt SHA256SUMS und das passende Archiv nach $tmp. Öffentlich per curl, privat über die GitHub-CLI.
download() {
  if [ "$version" = latest ]; then base="https://github.com/$REPO/releases/latest/download"; else base="https://github.com/$REPO/releases/download/v$version"; fi
  if curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" 2>/dev/null; then
    file=$(grep -- "-$target.tar.gz\$" "$tmp/SHA256SUMS" | awk '{print $2}' | head -n 1)
    [ -n "$file" ] || fail "Im Release gibt es kein Archiv für $target."
    say "Lade $file …"
    curl -fL --progress-bar "$base/$file" -o "$tmp/$file" || fail 'Download fehlgeschlagen.'
    return
  fi
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    tag=''
    [ "$version" = latest ] || tag="v$version"
    say "Lade über die GitHub-CLI aus $REPO …"
    # shellcheck disable=SC2086
    gh release download $tag --repo "$REPO" --pattern SHA256SUMS --pattern "*-$target.tar.gz" --dir "$tmp" --clobber \
      || fail "Release in $REPO nicht gefunden."
    return
  fi
  fail "Release nicht erreichbar ($REPO). Ist das Repository privat, vorher bei der GitHub-CLI anmelden: gh auth login"
}

if [ -n "$from" ]; then
  if [ -d "$from" ]; then
    cp "$from"/findmyaida-*-"$target".tar.gz "$tmp/" 2>/dev/null || fail "Kein Archiv für $target in $from."
    [ -f "$from/SHA256SUMS" ] && cp "$from/SHA256SUMS" "$tmp/"
  elif [ -f "$from" ]; then
    cp "$from" "$tmp/"
    [ -f "$(dirname "$from")/SHA256SUMS" ] && cp "$(dirname "$from")/SHA256SUMS" "$tmp/"
  else
    fail "$from gibt es nicht."
  fi
else
  command -v curl >/dev/null 2>&1 || fail 'curl wird benötigt.'
  download
fi

archive=$(ls "$tmp"/findmyaida-*-"$target".tar.gz 2>/dev/null | head -n 1)
[ -n "$archive" ] || fail "Kein Archiv für $target gefunden."
name=$(basename "$archive")
if [ -f "$tmp/SHA256SUMS" ]; then
  expected=$(grep -- " $name\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n 1)
  [ -n "$expected" ] || fail "Keine Prüfsumme für $name."
  [ "$(sha256_of "$archive")" = "$expected" ] || fail "Prüfsumme von $name stimmt nicht – Download beschädigt?"
elif [ -z "$from" ]; then
  fail 'Ohne SHA256SUMS keine Installation.'
fi

# ---------------------------------------------------------------- Installieren

previous=''
[ -f "$PREFIX/current/VERSION" ] && previous=$(cat "$PREFIX/current/VERSION")

tar -xzf "$archive" -C "$tmp"
dir="$tmp/${name%.tar.gz}"
new=$(cat "$dir/VERSION")
mkdir -p "$PREFIX/versions" "$BIN_DIR"
rm -rf "$PREFIX/versions/$new"
mv "$dir" "$PREFIX/versions/$new"
ln -sfn "versions/$new" "$PREFIX/current"
# Fester Ort für die Chrome-Erweiterung: bleibt nach Updates gültig.
rm -rf "$PREFIX/extension"
cp -R "$PREFIX/versions/$new/extension" "$PREFIX/extension"
cp "$PREFIX/versions/$new/install.sh" "$PREFIX/install.sh"
cp "$PREFIX/versions/$new/assets/icon.png" "$PREFIX/icon.png"
# Ältere Versionen entfernen
for v in "$PREFIX"/versions/*; do
  [ "$(basename "$v")" = "$new" ] || rm -rf "$v"
done

for cmd in findmyaida fma; do
  cat >"$BIN_DIR/$cmd" <<EOF
#!/bin/sh
$WRAPPER_MARK
export FINDMYAIDA_HOME="$PREFIX"
export FINDMYAIDA_EXTENSION_DIR="$PREFIX/extension"
unset NODE_OPTIONS
exec "$PREFIX/current/node" "$PREFIX/current/app/findmyaida.mjs" "\$@"
EOF
  chmod 755 "$BIN_DIR/$cmd"
done

# ---------------------------------------------------------------- PATH

in_path=0
case ":$PATH:" in *":$BIN_DIR:"*) in_path=1 ;; esac
rc=''
if [ "$in_path" = 0 ]; then
  shell_name=$(basename "${SHELL:-sh}")
  case "$shell_name" in
    zsh) rc="$HOME/.zshrc" ;;
    bash) if [ "$(uname -s)" = Darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
    fish) rc="$HOME/.config/fish/conf.d/findmyaida.fish" ;;
    *) rc="$HOME/.profile" ;;
  esac
  if [ "$shell_name" = fish ]; then
    mkdir -p "$(dirname "$rc")"
    printf '%s\nfish_add_path -g %s\n%s\n' "$MARK_BEGIN" "$BIN_DIR" "$MARK_END" >"$rc"
  elif ! grep -qF "$MARK_BEGIN" "$rc" 2>/dev/null; then
    case "$BIN_DIR" in "$HOME"/*) path_entry="\$HOME${BIN_DIR#"$HOME"}" ;; *) path_entry="$BIN_DIR" ;; esac
    printf '\n%s\nexport PATH="%s:$PATH"\n%s\n' "$MARK_BEGIN" "$path_entry" "$MARK_END" >>"$rc"
  fi
fi

# ---------------------------------------------------------------- Startsymbol

if [ "$(uname -s)" = Darwin ]; then
  # Doppelklick-Start: ein kleines App-Bundle öffnet Terminal mit einer .command-Datei (keine Automations-Rückfrage).
  cat >"$PREFIX/FindMyAIDA.command" <<EOF
#!/bin/sh
printf '\033]0;FindMyAIDA\007\033[8;34;120t'
clear
exec "$BIN_DIR/findmyaida"
EOF
  chmod 755 "$PREFIX/FindMyAIDA.command"
  app="$APPS_DIR/FindMyAIDA.app"
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp "$PREFIX/versions/$new/assets/icon.icns" "$app/Contents/Resources/icon.icns"
  cat >"$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>FindMyAIDA</string>
  <key>CFBundleDisplayName</key><string>FindMyAIDA</string>
  <key>CFBundleIdentifier</key><string>local.findmyaida.launcher</string>
  <key>CFBundleVersion</key><string>$new</string>
  <key>CFBundleShortVersionString</key><string>$new</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>FindMyAIDA</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
  cat >"$app/Contents/MacOS/FindMyAIDA" <<EOF
#!/bin/sh
exec open -a Terminal "$PREFIX/FindMyAIDA.command"
EOF
  chmod 755 "$app/Contents/MacOS/FindMyAIDA"
  touch "$app"
  launcher_hint='oder „FindMyAIDA“ in Launchpad bzw. Spotlight (⌘ Leertaste)'
else
  apps="$HOME/.local/share/applications"
  mkdir -p "$apps"
  cat >"$apps/findmyaida.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=FindMyAIDA
Comment=AIDA-Kreuzfahrten: alle Preise und Buchungsoptionen vergleichen
Exec=$BIN_DIR/findmyaida
Icon=$PREFIX/icon.png
Terminal=true
Categories=Utility;
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
  launcher_hint='oder „FindMyAIDA“ im App-Menü'
fi

# ---------------------------------------------------------------- Abschluss

say ''
if [ -n "$previous" ] && [ "$previous" != "$new" ]; then
  say "✓ FindMyAIDA von $previous auf $new aktualisiert."
elif [ -n "$previous" ]; then
  say "✓ FindMyAIDA $new ist aktuell (neu installiert)."
else
  say "✓ FindMyAIDA $new ist installiert."
fi
if [ "$action" = install ]; then
  say ''
  say '  Starten:  findmyaida   (kurz: fma) – in jedem neuen Terminalfenster'
  say "            $launcher_hint"
  if [ "$in_path" = 0 ]; then
    say "  In diesem Fenster wirkt der Befehl erst nach einem neuen Fenster oder: source $(tilde "$rc")"
  fi
  say ''
fi

if [ "$ask_start" = 1 ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
  printf 'FindMyAIDA jetzt starten? [J/n] ' >/dev/tty
  read -r answer </dev/tty || answer=n
  case "$answer" in
    '' | j | J | ja | Ja | y | Y | yes)
      rm -rf "$tmp"
      trap - EXIT INT TERM
      exec "$BIN_DIR/findmyaida" </dev/tty >/dev/tty 2>&1
      ;;
  esac
fi
