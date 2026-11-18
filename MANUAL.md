# FindMyAIDA – Manual

[← README](README.en.md) · [Deutsch](HANDBUCH.md)

**Contents**

- [Installation](#installation): [For development](#for-development) · [Accessing aida.de](#accessing-aidade) ·
  [Chrome extension setup](#chrome-extension-setup-third-route-only-once)
- [Usage](#usage): [Screens](#screens) · [Search commands](#search-commands) · [School holidays](#school-holidays) ·
  [Favorites and price watch](#favorites-and-price-watch) · [Settings](#settings) ·
  [Comparison: keys and mouse](#comparison-keys-and-mouse)
- [How the data is fetched](#how-the-data-is-fetched): [Limitations](#limitations)
- [Development](#development)

The app itself is in German. On-screen texts are quoted in German below, with an English gloss where it helps.

## Installation

One line is enough; you need neither Node.js nor any browser setup nor admin rights. The archive ships with the
official Node.js runtime.

```bash
curl -fsSL https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.sh | sh     # macOS, Linux
```

```powershell
irm https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.ps1 | iex          # Windows (PowerShell)
```

After that, there are two ways to start FindMyAIDA:

- **Terminal command:** `findmyaida` (short: `fma`) in any new terminal window.
- **By click:** FindMyAIDA in Launchpad/Spotlight (macOS, `~/Applications/FindMyAIDA.app`), in the Start menu and on
  the desktop (Windows), or in the app menu (Linux). The icon opens a terminal at a suitable size.

`findmyaida update` updates; `findmyaida uninstall` removes the program, the commands, the launcher icon and the PATH
entry. Settings and favorites are kept (`--purge` with the installer deletes them as well). Everything is installed to
`~/.local/share/findmyaida` with the commands in `~/.local/bin`; on Windows to `%LOCALAPPDATA%\Programs\FindMyAIDA`.

For a private fork, the installer downloads through a signed-in GitHub CLI (`gh auth login`); with
`--from <Ordner>` (Windows: `-From`) it installs from locally built archives in that folder.

### For development

Requirements: Node.js ≥ 20; optionally Firefox (second access route) or Google Chrome with the bundled extension
(third).

```bash
npm install
npm run build
npm link        # optional: makes the commands `findmyaida` and `fma` available globally
```

`npm run release` builds release archives for all platforms (into `release/`); for a `v*` tag, the workflow
`.github/workflows/release.yml` does this, including a test of the installer on macOS, Linux and Windows.

### Accessing aida.de

FindMyAIDA normally needs no browser and no setup. It tries three routes in this order and moves on by itself when
aida.de rejects one:

1. **Direct:** fetches from Node, with a user agent that names the tool.
2. **Firefox without a window:** FindMyAIDA starts an installed Firefox invisibly with a throwaway profile and sends
   the requests from within the aida.de page. Your own Firefox profile is not touched.
3. **Chrome with extension:** requests go through a normal aida.de tab in your Chrome (setup below).

Which routes aida.de accepts can change at any time, hence the fallback order. No route is disguised: FindMyAIDA does
not imitate a browser and tunes nothing to avoid a rejection.

`--via direct`, `--via firefox` or `--via extension` pins a route. The status line at the top right shows which one is
currently in use. If Firefox lives in an unusual location, the environment variable `FINDMYAIDA_FIREFOX` gives its
path.

### Chrome extension setup (third route only, once)

1. Open `chrome://extensions` and switch on **Developer mode** at the top right.
2. Choose **Load unpacked** and select this project's `extension/` folder.
3. Open aida.de in Chrome (or keep it open). As soon as FindMyAIDA uses this route, the extension icon shows **ON**.

The extension connects only to `ws://127.0.0.1:47831` and performs only four read-only requests: filter data, cruise
search, cruise details and price lookup. The list of allowed paths is in `extension/background.js` and
`src/api/endpoints.ts`; a test checks that both match. The same list applies to all three routes. If there is no
aida.de tab, the extension opens a pinned tab in the background.

## Usage

```bash
findmyaida               # or: fma · npm run dev
findmyaida --demo        # offline, with recorded real sample data (excerpt)
findmyaida --via firefox # pin the access route: direct, firefox or extension
findmyaida --no-mouse    # without mouse control (text can then be selected normally)
findmyaida prices PR07261128 -a 2 -c 1    # price list on the command line
findmyaida prices PR07261128 --json       # full matrix as JSON
```

The tool remembers the occupancy (who is travelling), filters, view, the last search and the recently viewed cruises
(`~/.config/findmyaida/state.json`; existing state from `~/.config/aida-tui` is taken over). Favorites, with their
offer configuration and the price at the time of saving, are stored separately in `~/.config/findmyaida/favorites.json`,
the settings in `~/.config/findmyaida/settings.json`.

### Screens

1. **Home** („Startseite“): quick search. Type, accept a suggestion with `Tab`; `⏎` shows the filtered list. `⏎` with
   an empty input (or a click on „Alle Reisen anzeigen“, show all cruises) shows all cruises. Below are the favorites
   (see below) and the three most recently viewed cruises; `↓` moves into this list, `⏎` opens an entry.
2. **Cruises** („Reisen“): list with a preview (route, ship, other dates). Same search field; clicking a column header
   sorts by it. `⏎` or a double-click opens the comparison, `Esc` goes back.
3. **Comparison** („Vergleich“): price table with offer details on the right (at the bottom in a narrow terminal).
4. **Settings** („Einstellungen“): via `/einstellungen` in the search field or the gear ⚙ at the top right (see below).

### Search commands

| Command | Example | Note |
|---|---|---|
| `region:` / `r:` | `region:kanaren` | loaded from AIDA once |
| `monat:` / `m:` | `monat:dez`, `monat:2027-03` | month |
| `dauer:` / `d:` | `dauer:7`, `dauer:8-14`, `dauer:15+` | duration |
| `schiff:` / `s:` | `schiff:cosma` | ship |
| `land:` / `bl:` | `land:by`, `land:nrw`, `land:bayern` | German federal state for school holidays; the chip shows the abbreviation |
| `ferien:` / `f:` | `ferien:sommer`, `ferien:herbst` | school holidays; only shown once a state is selected |
| `/alle` `/einstellungen` `/hilfe` `/beenden` | | slash commands (all, settings, help, quit) |

Suggestions also appear without a prefix: `kan` → region Kanaren (Canary Islands), `cos` → ship AIDAcosma, `dez` →
month Dezember (December). Values of the same category are combined with OR, different categories with AND.

### School holidays

With `land:`, the cruise overview gains the column **FERIEN** (holidays). It shows which school holidays the cruise
overlaps and how many school days it costs (Mon–Fri, excluding holidays, days off and public holidays; the departure
and return days count). Click the column to sort by it.

- **Several states** mean *shared holidays*: a cruise must touch holidays in every state. If there is no shared
  period, or a type of holiday is missing in one state, an error (✕) or a note (!) appears below the search field.
- **Hovering** over the holiday name shows the periods and the shared time per state; hovering over the red school
  days shows a (deliberately over-formal) „Amtlicher Hinweis“ (official notice) citing the state's compulsory-schooling
  sections. `Ctrl+T` opens both from the keyboard. This is not legal advice; leave of absence is up to the school.
- State-specific names are mapped: Frühjahrsferien (spring holidays) BY → winter, HH → Easter; Fastnachtsferien (SL)
  and Halbjahresferien (HB, NI) → winter; one-day „Pfingstferien“ (Whitsun holidays) count as a day off.
  MV: general-education schools; SH: mainland dates (the islands differ).

Sources: school and public holidays from the [OpenHolidays API](https://www.openholidaysapi.org) (open data), as a
snapshot in `src/data/school-holidays.json` (update with `npx tsx scripts/update-holidays.ts`). The legal bases in
`src/domain/schoolLaw.ts` come from the official state-law portals of the 16 states (as of 15 November 2026), each
with its source URL.

### Favorites and price watch

In the comparison, `m` or a click on the star at the top right of the offer panel (`☆ merken` → `★ gemerkt`, save →
saved) saves the displayed configuration: cruise, occupancy, fare, travel to the ship (Anreise) including airports, and
cabin – without subcategories the cabin category (e.g. cheapest balcony cabin), with subcategories (`u`) exactly that
subcategory. The price at the time of saving is the fixed baseline; the comparison always uses the cheapest offer that
matches the configuration.

- **Home screen:** at startup the tool checks the prices of all favorites (one request per cruise and occupancy, one
  after another) and shows the current price with the change since saving (green: dropped, red: risen). While a
  comparison is open, the check pauses. Without a connection, the last known result is shown with its date.
- **No longer available:** if the combination no longer exists, the reason is shown (e.g. „Tarif VARIO nicht mehr
  verfügbar“, fare VARIO no longer available; „Flug ab FRA nicht mehr verfügbar“, flight from FRA no longer available;
  „Für 2 Erw. + 1 Kind nicht mehr buchbar“, no longer bookable for 2 adults + 1 child) – without a price comparison.
  Cruises that have already started appear as „abgefahren“ (departed) and are no longer checked.
- **Controls:** `⏎` or a double-click opens the favorite in the „Anreise × Tarif“ (travel × fare) view with its
  selection. `⌫` or a click on `★` removes it; until you leave the home screen, the same key or a click brings it
  back. The list has no limit and scrolls.

### Settings

All settings are on one page, one below the other; the navigation on the left jumps to a section. `↑↓` selects,
`←→` changes, `⏎` or Space toggles or opens, `Tab` jumps to the next section, `Esc` goes back. With the mouse, the
navigation, switches, segments, arrows and buttons can be clicked directly.

| Section | Settings |
|---|---|
| Darstellung (appearance) | color scheme (Automatisch, Dunkel, Hell: auto, dark, light), contrast (Standard, Hoch, Grundfarben: standard, high, basic colors), large logo, quips in the search field, prices with cents |
| Bedienung (controls) | mouse, info on hover, start screen (Startseite, Reisen, letzte Reise: home, cruises, last cruise), number of „Zuletzt angesehen“ (recently viewed) entries (0–5) |
| Standardwerte (defaults) | fixed occupancy at startup, home airports, travel mode, view and subcategories when opening, state for school holidays |
| Favoriten (favorites) | price check at startup, change in euros or percent, color only above a set amount, hide departed cruises, sort order |
| Zugriff (access) | access route, Firefox executable, port of the Chrome bridge (take effect at the next start) |
| Daten (data) | clear cache, delete history, export favorites (JSON to `~/Downloads`) and import them |
| Info | version, access route, storage location, reset all settings |

- **Color scheme:** „Automatisch“ (auto) asks the terminal for its background color at startup (OSC 11, falling back
  to `COLORFGBG`). If a fixed scheme does not match the terminal, the app paints over its foreground and background.
- **The command line wins:** `--via`, `--port` and `--no-mouse` override the settings for this session, as does the
  environment variable `FINDMYAIDA_FIREFOX`.
- **Home airports and travel mode** are the default filters in the comparison; `x` resets to them.

### Comparison: keys and mouse

| Key | Function |
|---|---|
| `Esc` `/` | back to the cruises (or back out of the drill-down) |
| `-` `+` `⇧←` `⇧→` | previous / next date of the same route (filters and selection stay) |
| `D` | list of dates for the route |
| `1`–`4` `Tab` | view: **Kabine × Tarif** (cabin × fare), **Anreise × Tarif** (travel × fare), **Anreise × Kabine** (travel × cabin), **Alle Angebote** (all offers) |
| Arrow keys | select a cell. The selection applies in all views (cabin/fare/travel stay in sync). |
| `<` `>` | in views 2/3, switch the fixed cabin or fare |
| `⏎` / `Esc` | show all individual offers in the cell / back |
| `u` | expand/collapse cabin subcategories (e.g. IA, IB, MB, VG, DL, Flexkabinen) |
| `f` (`a` `F` `t` `k`) | filter dialog: travel mode, departure airport, return airport, fare, cabin (saved) |
| `x` | reset filters (default: outbound and return flight via the same airport + own arrival) |
| `b` | occupancy: adults, youths (16–24), children (2–15), babies (under 2), with quick picks |
| `p` / `d` | total price ↔ per person / difference to the cheapest |
| `s` `S` | sort order of the offer list |
| `o` / `y` | open the booking assistant with this offer in the browser / copy the link |
| `m` | save the displayed configuration as a favorite, or remove it (star in the offer panel) |
| `r` | reload prices · `?` help · `q` quit |

**Mouse:** a click selects a cell, row, tab, chip or button. A second click on the selected cell, or a double-click,
shows its offers. The mouse wheel scrolls; clicking outside a dialog closes it. Filter chips, date arrows, occupancy,
„Gesamt │ p.P.“ (total │ per person), „Δ“, „Unterkat.“ (subcategories), column headers, the star, „Buchen“ (book) and
„Link“ are clickable.
To select text in the terminal, hold Option (⌥) or Shift, or start with `--no-mouse`.

If a preferred airport is not available for a cruise, the tool shows all airports and a note.

## How the data is fetched

All endpoints live under `https://aida.de/content/aida-search-and-booking/requests/`:

| Endpoint | Content |
|---|---|
| `GET search.filter.json` | ships, airports, regions, ports |
| `GET search.cruise.json/size=100/p={n}/…` | catalog: all routes with their dates (~1,900 dates, 6 pages) |
| `POST player.proxy.json` | **price engine of the booking process** (“SearchHub”). One call returns all fares × cabin subcategories × flight variants for a cruise (e.g. 1,189 offers for AIDAprima, 7 days Canary Islands). |

The request to `player.proxy.json` is documented in `src/api/prices.ts` (`buildPriceRequest`). Travellers are passed
as ages, as in the AIDA single-page app (adults 40, youths 20, children 10, babies 1).

Fair use: at most one request at a time, at least 300 ms apart, with a cache for the catalog (6 h) and prices (15 min)
in `~/.cache/findmyaida`. Bulk queries across many cruises are deliberately not built in; the only exception is
checking your own favorites once at startup, one after another and through the same throttle. The tool is meant for
personal use.

### Limitations

- Prices are shown per cabin category or subcategory (as in the booking assistant). Choosing a specific cabin number,
  preferred flights, rail travel and insurance are not included.
- Age-dependent prices assume the standard age of each category (see above). The booking assistant asks for the real
  dates of birth later.
- AIDA can change its interfaces at any time. Unexpected responses are reported as errors naming the affected field.

## Development

```bash
npm test              # Vitest: normalization, filter/pivot, bridge, UI (ink-testing-library)
npm run typecheck
npm run check         # both together
npx tsx scripts/snapshot.tsx 2 "<down>" "<enter>"   # screen snapshot with demo data
SCREEN=home npx tsx scripts/snapshot.tsx k a n "<tab>" "<enter>"   # mouse gestures too: "<click:x,y>" "<wheel:down,x,y>" "<hover:x,y>"
```

`tests/fixtures/` contains real, trimmed responses from aida.de (15 November 2026): airports limited to BER/HAM/DUS,
the catalog to 14 routes, region Kanaren to these routes.

Layout: `src/api` (endpoints, schemas, normalization, client with throttle and cache), `src/domain` (types, fares,
cabins, occupancy, comparison/pivot, deep links), `src/bridge` (access routes: direct, windowless Firefox, WebSocket
bridge to the extension, demo transport), `src/ui` (Ink interface: `screens/` home, cruises, comparison;
`components/`; `mouse/` SGR mouse and click areas; `search/` search commands), `src/data` (holiday snapshot),
`extension/` (Chrome MV3).

“AIDA” and the colors of the logo letters belong to AIDA Cruises. FindMyAIDA is an unofficial open-source
project under the GPL-3.0 ([LICENSE](LICENSE)).
