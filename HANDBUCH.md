# FindMyAIDA – Handbuch

[← Zur Übersicht](README.md) · [English](MANUAL.md)

Terminal-App zum Vergleichen **aller Buchungsoptionen einer AIDA-Reise**: Kabinen(-unter)kategorien × Tarife ×
Personenbelegung × Anreise (AIDA Flug ab allen Flughäfen, Gabelflüge, Einzelflüge, eigene Anreise). Bedienbar mit
Tastatur und Maus.

Die Preise kommen live aus derselben Preisengine, die auch der AIDA-Buchungsassistent nutzt. Stichprobe vom
15.11.2026: Innenkabine CLASSIC, Berlin ⇄ Berlin 1.998 € und Hamburg ⇄ Hamburg 2.098 €, identisch mit dem Assistenten.

## Inhalt

- [Installation](#installation)
  - [Für die Entwicklung](#für-die-entwicklung)
  - [Zugriff auf aida.de](#zugriff-auf-aidade)
  - [Chrome-Erweiterung einrichten (nur für den dritten Weg, einmalig)](#chrome-erweiterung-einrichten-nur-für-den-dritten-weg-einmalig)
- [Benutzung](#benutzung)
  - [Bildschirme](#bildschirme)
  - [Suchbefehle](#suchbefehle)
  - [Schulferien](#schulferien)
  - [Favoriten und Preisbeobachtung](#favoriten-und-preisbeobachtung)
  - [Einstellungen](#einstellungen)
  - [Vergleich: Tasten und Maus](#vergleich-tasten-und-maus)
- [Wie die Daten abgefragt werden](#wie-die-daten-abgefragt-werden)
  - [Grenzen](#grenzen)
- [Entwicklung](#entwicklung)

## Installation

Eine Zeile genügt; Node.js, Browser-Einrichtung oder Admin-Rechte sind nicht nötig. Das Archiv bringt die offizielle
Node.js-Laufzeit mit.

```bash
curl -fsSL https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.sh | sh     # macOS, Linux
```

```powershell
irm https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.ps1 | iex          # Windows (PowerShell)
```

Danach startet FindMyAIDA auf zwei Wegen:

- **Terminal-Befehl:** `findmyaida` (kurz `fma`) in jedem neuen Terminalfenster.
- **Per Klick:** „FindMyAIDA“ in Launchpad/Spotlight (macOS, `~/Applications/FindMyAIDA.app`), im Startmenü und auf
  dem Desktop (Windows) bzw. im App-Menü (Linux). Das Symbol öffnet ein Terminal in passender Größe.

`findmyaida update` aktualisiert, `findmyaida uninstall` entfernt Programm, Befehle, Startsymbol und PATH-Eintrag;
Einstellungen und Favoriten bleiben (`--purge` beim Installer löscht auch sie). Installiert wird nach
`~/.local/share/findmyaida` mit Befehlen in `~/.local/bin`, unter Windows nach `%LOCALAPPDATA%\Programs\FindMyAIDA`.

Bei einem privaten Fork lädt der Installer über eine angemeldete GitHub-CLI (`gh auth login`); mit
`--from <Ordner>` (Windows: `-From`) installiert er aus lokal gebauten Archiven.

### Für die Entwicklung

Voraussetzungen: Node.js ≥ 20; optional Firefox (zweiter Zugriffsweg) oder Google Chrome mit der mitgelieferten
Erweiterung (dritter).

```bash
npm install
npm run build
npm link        # optional: stellt die Befehle `findmyaida` und `fma` global bereit
```

Release-Archive für alle Plattformen baut `npm run release` (nach `release/`); bei einem Tag `v*` übernimmt das der
Workflow `.github/workflows/release.yml` samt Test des Installers auf macOS, Linux und Windows.

### Zugriff auf aida.de

FindMyAIDA braucht im Normalfall keinen Browser und keine Einrichtung. Es versucht drei Wege in dieser Reihenfolge
und wechselt selbst weiter, wenn aida.de einen Weg ablehnt:

1. **Direkt:** Abruf aus Node, mit einem User-Agent, der das Werkzeug beim Namen nennt.
2. **Firefox ohne Fenster:** FindMyAIDA startet ein installiertes Firefox unsichtbar mit einem Wegwerf-Profil und
   fragt aus der aida.de-Seite heraus ab. Dein eigenes Firefox-Profil wird nicht angefasst.
3. **Chrome mit Erweiterung:** Abfragen über einen normalen aida.de-Tab in deinem Chrome (Einrichtung unten).

Welche Wege aida.de annimmt, kann sich jederzeit ändern, deshalb die Reihenfolge. Kein Weg wird getarnt: FindMyAIDA
ahmt keinen Browser nach und stimmt nichts darauf ab, eine Ablehnung zu vermeiden.

Mit `--via direct`, `--via firefox` oder `--via extension` lässt sich ein Weg festlegen. Die Statuszeile oben rechts
zeigt, welcher gerade genutzt wird. Liegt Firefox an einem ungewöhnlichen Ort, nennt die Umgebungsvariable
`FINDMYAIDA_FIREFOX` den Pfad.

### Chrome-Erweiterung einrichten (nur für den dritten Weg, einmalig)

1. `chrome://extensions` öffnen und oben rechts den **Entwicklermodus** einschalten.
2. **„Entpackte Erweiterung laden“** wählen und den Ordner `extension/` dieses Projekts auswählen.
3. aida.de in Chrome öffnen (oder offen lassen). Sobald FindMyAIDA diesen Weg nutzt, zeigt das Erweiterungssymbol
   **ON**.

Die Erweiterung verbindet sich nur mit `ws://127.0.0.1:47831` und führt ausschließlich vier lesende Anfragen aus:
Filterdaten, Reisesuche, Reisedetails und Preisabfrage. Die Liste der erlaubten Pfade steht in
`extension/background.js` und `src/api/endpoints.ts`, ein Test prüft, dass beide übereinstimmen. Dieselbe Liste gilt
für alle drei Wege. Gibt es keinen aida.de-Tab, öffnet die Erweiterung einen angehefteten Tab im Hintergrund.

## Benutzung

```bash
findmyaida               # oder: fma · npm run dev
findmyaida --demo        # ohne Netz, mit aufgezeichneten echten Beispieldaten (Ausschnitt)
findmyaida --via firefox # Zugriffsweg festlegen: direct, firefox oder extension
findmyaida --no-mouse    # ohne Mausbedienung (Text lässt sich dann normal markieren)
findmyaida prices PR07261128 -a 2 -c 1    # Preisliste auf der Kommandozeile
findmyaida prices PR07261128 --json       # vollständige Matrix als JSON
```

Das Tool merkt sich Belegung, Filter, Ansicht, die letzte Suche und die zuletzt angesehenen Reisen
(`~/.config/findmyaida/state.json`; ein vorhandener Zustand aus `~/.config/aida-tui` wird übernommen).
Favoriten mit Angebotskonfiguration und Preis beim Merken liegen getrennt davon in
`~/.config/findmyaida/favorites.json`, die Einstellungen in `~/.config/findmyaida/settings.json`.

### Bildschirme

1. **Startseite**: Schnellsuche. Tippen, mit `Tab` einen Vorschlag übernehmen, `⏎` zeigt die gefilterte Liste. `⏎`
   bei leerer Eingabe (oder Klick auf „Alle Reisen anzeigen“) zeigt alle Reisen. Darunter stehen die Favoriten
   (siehe unten) und die drei zuletzt angesehenen Reisen; mit `↓` geht es in diese Liste, `⏎` öffnet.
2. **Reisen**: Liste mit Vorschau (Route, Schiff, weitere Termine). Dasselbe Suchfeld; Spaltenköpfe sortieren per
   Klick. `⏎` oder Doppelklick öffnet den Vergleich, `Esc` führt zurück.
3. **Vergleich**: Preistabelle mit Angebotsdetails rechts (bei schmalem Terminal unten).
4. **Einstellungen**: über `/einstellungen` im Suchfeld oder das Zahnrad ⚙ oben rechts (siehe unten).

### Suchbefehle

| Befehl | Beispiel | Hinweis |
|---|---|---|
| `region:` / `r:` | `region:kanaren` | wird einmalig bei AIDA nachgeladen |
| `monat:` / `m:` | `monat:dez`, `monat:2027-03` | |
| `dauer:` / `d:` | `dauer:7`, `dauer:8-14`, `dauer:15+` | |
| `schiff:` / `s:` | `schiff:cosma` | |
| `land:` / `bl:` | `land:by`, `land:nrw`, `land:bayern` | Bundesland für Schulferien; Chip zeigt das Kürzel |
| `ferien:` / `f:` | `ferien:sommer`, `ferien:herbst` | erst sichtbar, wenn ein Bundesland gewählt ist |
| `/alle` `/einstellungen` `/hilfe` `/beenden` | | Slash-Befehle |

Vorschläge kommen auch ohne Präfix: „kan“ → Region Kanaren, „cos“ → Schiff AIDAcosma, „dez“ → Monat Dezember.
Gleiche Kategorie wird mit ODER verknüpft, verschiedene Kategorien mit UND.

### Schulferien

Mit `land:` erscheint in der Reiseübersicht die Spalte **FERIEN**. Sie zeigt, mit welchen Ferien sich die Reise
überschneidet und wie viele Schultage sie kostet (Mo–Fr ohne Ferien, freie Tage und gesetzliche Feiertage;
Abfahrts- und Rückkehrtag zählen mit). Die Spalte lässt sich per Klick sortieren.

- **Mehrere Bundesländer** bedeuten *gemeinsame Ferien*: Eine Reise muss in jedem Land Ferien berühren.
  Gibt es keine gemeinsame Zeit oder fehlt eine Ferienart in einem Land, steht das als Fehler (✕) bzw. Hinweis (!)
  unter dem Suchfeld.
- **Hover** über den Feriennamen zeigt Zeiträume und gemeinsame Zeit je Land, Hover über die roten Schultage einen
  (bewusst übertrieben förmlichen) „Amtlichen Hinweis“ mit den Schulpflicht-Paragrafen des Landes. `Ctrl+T` öffnet
  beides per Tastatur. Das ist kein Rechtsrat; über Beurlaubungen entscheidet die Schule.
- Landesspezifische Namen werden zugeordnet: Frühjahrsferien BY → Winter, HH → Ostern; Fastnachtsferien (SL) und
  Halbjahresferien (HB, NI) → Winter; eintägige „Pfingstferien“ zählen als freier Tag. MV: allgemeinbildende Schulen,
  SH: Festlandtermine (Inseln abweichend).

Quellen: Ferien und Feiertage aus der [OpenHolidays API](https://www.openholidaysapi.org) (Open Data), als Schnappschuss
in `src/data/school-holidays.json` (aktualisieren mit `npx tsx scripts/update-holidays.ts`). Die Rechtsgrundlagen in
`src/domain/schoolLaw.ts` stammen aus den amtlichen Landesrecht-Portalen der 16 Länder (Stand 15.11.2026), jeweils mit Quell-URL.

### Favoriten und Preisbeobachtung

Im Vergleich merkt `m` oder ein Klick auf den Stern oben rechts im Angebotsfenster (`☆ merken` → `★ gemerkt`) die
angezeigte Konfiguration: Reise, Belegung, Tarif, Anreise mit Flughäfen und Kabine – ohne Unterkategorien die
Kabinenkategorie (z. B. günstigste Balkonkabine), mit Unterkategorien (`u`) genau diese. Der Preis beim Merken ist
der feste Vergleichswert; bewertet wird immer das günstigste Angebot, das zur Konfiguration passt.

- **Startseite:** Beim Start fragt das Tool die Preise aller Favoriten ab (eine Anfrage je Reise und Belegung,
  nacheinander) und zeigt den aktuellen Preis mit der Änderung seit dem Merken (grün gefallen, rot gestiegen).
  Solange ein Vergleich offen ist, pausiert die Prüfung. Ohne Verbindung steht der letzte Stand mit Datum da.
- **Nicht mehr verfügbar:** Gibt es die Kombination nicht mehr, steht der Grund da (z. B. „Tarif VARIO nicht mehr
  verfügbar“, „Flug ab FRA nicht mehr verfügbar“, „Für 2 Erw. + 1 Kind nicht mehr buchbar“) – ohne Preisvergleich.
  Begonnene Reisen erscheinen als „abgefahren“ und werden nicht mehr abgefragt.
- **Bedienung:** `⏎` oder Doppelklick öffnet den Favoriten in der Ansicht „Anreise × Tarif“ mit seiner Auswahl.
  `⌫` oder ein Klick auf `★` entfernt ihn; bis zum Verlassen der Startseite holt dieselbe Taste bzw. ein Klick ihn
  zurück. Die Liste hat kein Limit und scrollt.

### Einstellungen

Alle Einstellungen stehen auf einer Seite untereinander; die Navigation links springt zum Abschnitt.
`↑↓` wählt, `←→` ändert, `⏎` bzw. Leertaste schaltet um oder öffnet, `Tab` springt zum nächsten Abschnitt, `Esc`
führt zurück. Mit der Maus sind Navigation, Schalter, Segmente, Pfeile und Schaltflächen direkt anklickbar.

| Abschnitt | Einstellungen |
|---|---|
| Darstellung | Farbschema (Automatisch, Dunkel, Hell), Kontrast (Standard, Hoch, Grundfarben), großes Logo, Sprüche im Suchfeld, Preise mit Cent |
| Bedienung | Maus, Infos beim Überfahren, Startbildschirm (Startseite, Reisen, letzte Reise), Anzahl „Zuletzt angesehen“ (0–5) |
| Standardwerte | feste Belegung beim Start, Heimatflughäfen, Anreiseart, Ansicht und Unterkategorien beim Öffnen, Bundesland für Schulferien |
| Favoriten | Preisprüfung beim Start, Änderung in Euro oder Prozent, farbig ab einem Betrag, abgefahrene ausblenden, Sortierung |
| Zugriff | Zugriffsweg, Firefox-Programm, Port der Chrome-Brücke (gelten ab dem nächsten Start) |
| Daten | Cache leeren, Verlauf löschen, Favoriten exportieren (JSON nach `~/Downloads`) und importieren |
| Info | Version, Zugriffsweg, Speicherort, alle Einstellungen zurücksetzen |

- **Farbschema:** „Automatisch“ fragt beim Start die Hintergrundfarbe des Terminals ab (OSC 11, ersatzweise
  `COLORFGBG`). Passt ein fest gewähltes Schema nicht zum Terminal, übermalt die App Vorder- und Hintergrund.
- **Kommandozeile hat Vorrang:** `--via`, `--port` und `--no-mouse` übersteuern die Einstellungen für diese Sitzung,
  ebenso die Umgebungsvariable `FINDMYAIDA_FIREFOX`.
- **Heimatflughäfen und Anreiseart** sind die Standardfilter im Vergleich; `x` setzt darauf zurück.

### Vergleich: Tasten und Maus

| Taste | Funktion |
|---|---|
| `Esc` `/` | zurück zu den Reisen (bzw. aus dem Drilldown zurück) |
| `-` `+` `⇧←` `⇧→` | vorheriger / nächster Termin derselben Route (Filter und Auswahl bleiben) |
| `D` | Terminliste der Route |
| `1`–`4` `Tab` | Ansicht: **Kabine × Tarif**, **Anreise × Tarif**, **Anreise × Kabine**, **Alle Angebote** |
| Pfeiltasten | Zelle wählen. Die Auswahl gilt in allen Ansichten (Kabine/Tarif/Anreise bleiben synchron). |
| `<` `>` | in Ansicht 2/3 die festgehaltene Kabine bzw. den Tarif wechseln |
| `⏎` / `Esc` | alle Einzelangebote der Zelle anzeigen / zurück |
| `u` | Kabinen-Unterkategorien (z. B. IA, IB, MB, VG, DL, Flexkabinen) auf-/zuklappen |
| `f` (`a` `F` `t` `k`) | Filterdialog: Anreiseart, Abflughafen, Rückflughafen, Tarif, Kabine (gespeichert) |
| `x` | Filter zurücksetzen (Standard: Hin- & Rückflug gleicher Flughafen + eigene Anreise) |
| `b` | Belegung: Erwachsene, Jugendliche (16–24), Kinder (2–15), Babys (unter 2), mit Schnellwahl |
| `p` / `d` | Gesamtpreis ↔ pro Person / Differenz zum günstigsten |
| `s` `S` | Sortierung der Angebotsliste |
| `o` / `y` | Buchungsassistent mit diesem Angebot im Browser öffnen / Link kopieren |
| `m` | angezeigte Konfiguration als Favorit merken bzw. entfernen (Stern im Angebotsfenster) |
| `r` | Preise neu laden · `?` Hilfe · `q` Ende |

**Maus:** Klick wählt Zelle, Zeile, Tab, Chip oder Button. Ein zweiter Klick auf die gewählte Zelle bzw. ein
Doppelklick zeigt ihre Angebote. Das Mausrad scrollt, ein Klick neben einen Dialog schließt ihn. Filter-Chips,
Termin-Pfeile, Belegung, „Gesamt │ p.P.“, „Δ“, „Unterkat.“, Spaltenköpfe, der Stern sowie „Buchen“ und „Link“ sind
klickbar.
Zum Markieren von Text im Terminal die Wahltaste (⌥) bzw. Shift gedrückt halten oder mit `--no-mouse` starten.

Ist ein bevorzugter Flughafen bei einer Reise nicht verfügbar, zeigt das Tool alle Flughäfen und einen Hinweis.

## Wie die Daten abgefragt werden

Alle Endpunkte liegen unter `https://aida.de/content/aida-search-and-booking/requests/`:

| Endpunkt | Inhalt |
|---|---|
| `GET search.filter.json` | Schiffe, Flughäfen, Regionen, Häfen |
| `GET search.cruise.json/size=100/p={n}/…` | Katalog: alle Routen mit Terminen (~1.900 Termine, 6 Seiten) |
| `POST player.proxy.json` | **Preisengine des Buchungsprozesses** („SearchHub“). Ein Aufruf liefert für eine Reise alle Tarife × Kabinen-Unterkategorien × Flugvarianten (z. B. 1.189 Angebote für AIDAprima, 7 Tage Kanaren). |

Die Anfrage an `player.proxy.json` ist in `src/api/prices.ts` (`buildPriceRequest`) dokumentiert. Reisende
werden wie im AIDA-SPA als Alter übergeben (Erwachsene 40, Jugendliche 20, Kinder 10, Babys 1).

Fair Use: höchstens eine Anfrage gleichzeitig, mindestens 300 ms Abstand, Cache für Katalog (6 h) und Preise
(15 min) in `~/.cache/findmyaida`. Massenabfragen über viele Reisen hinweg sind bewusst nicht eingebaut; einzige
Ausnahme ist die Prüfung der eigenen Favoriten einmal beim Start, nacheinander und über dieselbe Drossel. Das Tool
ist für den persönlichen Gebrauch gedacht.

### Grenzen

- Angezeigt werden Preise für die Kabinenkategorie bzw. Unterkategorie (wie im Assistenten). Die Wahl einer
  konkreten Kabinennummer, Wunschflug, Bahnanreise und Versicherungen sind nicht enthalten.
- Altersabhängige Preise gelten für die Standardalter je Kategorie (siehe oben). Im Assistenten werden später
  die echten Geburtsdaten abgefragt.
- AIDA kann die Schnittstellen jederzeit ändern. Unerwartete Antworten werden als Fehler mit dem betroffenen Feld
  gemeldet.

## Entwicklung

```bash
npm test              # Vitest: Normalisierung, Filter/Pivot, Brücke, UI (ink-testing-library)
npm run typecheck
npm run check         # beides zusammen
npx tsx scripts/snapshot.tsx 2 "<down>" "<enter>"   # Bildschirm-Snapshot mit Demo-Daten
SCREEN=home npx tsx scripts/snapshot.tsx k a n "<tab>" "<enter>"   # auch Mausgesten: "<click:x,y>" "<wheel:down,x,y>" "<hover:x,y>"
```

`tests/fixtures/` enthält echte, gekürzte Antworten von aida.de (15.11.2026): Flughäfen auf BER/HAM/DUS
beschränkt, Katalog auf 14 Routen, Region Kanaren auf diese Routen.

Aufbau: `src/api` (Endpunkte, Schemas, Normalisierung, Client mit Drossel und Cache), `src/domain` (Typen, Tarife,
Kabinen, Belegung, Vergleich/Pivot, Deeplinks), `src/bridge` (Zugriffswege: direkt, Firefox ohne Fenster,
WebSocket-Brücke zur Erweiterung, Demo-Transport), `src/ui` (Ink-Oberfläche: `screens/` Startseite, Reisen,
Vergleich; `components/`; `mouse/` SGR-Maus und Klickflächen; `search/` Suchbefehle), `src/data` (Ferien-Schnappschuss), `extension/` (Chrome MV3).

„AIDA“ und die Farben der Logobuchstaben gehören AIDA Cruises. FindMyAIDA ist ein inoffizielles Open-Source-Projekt
unter der GPL-3.0 ([LICENSE](LICENSE)).
