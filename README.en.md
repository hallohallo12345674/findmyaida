<!-- Graphics: .github/readme/, generated with `npm run readme` (scripts/readme-assets.ts) -->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/banner-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset=".github/readme/banner-light.svg">
    <img alt="Find My AIDA" src=".github/readme/banner-dark.svg" width="100%">
  </picture>
</p>

<h3 align="center">Every booking option of an AIDA cruise – compared in your terminal.</h3>

<p align="center">
  Cabins · fares · occupancy · flights from every airport – with the prices from AIDA's own booking process.
</p>

<p align="center">
  <a href="https://github.com/hallohallo12345674/findmyaida/releases/latest"><img alt="Download" src=".github/readme/btn-download.svg" height="56"></a>&nbsp;
  <a href="MANUAL.md"><img alt="Manual" src=".github/readme/btn-manual.svg" height="56"></a>&nbsp;
  <a href="https://github.com/hallohallo12345674/findmyaida/releases"><img alt="Releases" src=".github/readme/btn-releases.svg" height="56"></a>
</p>

<p align="center">
  <img alt="Version 0.4.0" src=".github/readme/badge-version.svg" height="22">&nbsp;
  <img alt="macOS · Linux · Windows" src=".github/readme/badge-platforms.svg" height="22">&nbsp;
  <img alt="Node 24 LTS bundled" src=".github/readme/badge-runtime.svg" height="22">
</p>

<p align="center">
  <a href="README.md"><img alt="Deutsch" src=".github/readme/lang-de.svg" height="28"></a>
  <a href="README.en.md"><img alt="English" src=".github/readme/lang-en-active.svg" height="28"></a>
</p>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screen-compare-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/readme/screen-compare-light.svg">
  <img alt="Comparison: cabin × fare with offer details and a saved favorite" src=".github/readme/screen-compare-dark.svg" width="100%">
</picture>

## Features

<table>
  <tr>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-compare.svg" width="48" alt=""><br>
      <b>Every option at a glance</b><br>
      Cabin × fare, travel × fare, travel × cabin or every single offer – for up to four people.
    </td>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-live.svg" width="48" alt=""><br>
      <b>Prices from the booking process</b><br>
      The same pricing engine as AIDA's booking assistant, including flights from every airport.
    </td>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-favorites.svg" width="48" alt=""><br>
      <b>Favorites with price watch</b><br>
      Save an offer; the start screen shows how much its price has gone up or down since.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-holidays.svg" width="48" alt=""><br>
      <b>German school holidays</b><br>
      <code>land:by ferien:sommer</code> finds matching cruises for all 16 states and counts missed school days.
    </td>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-controls.svg" width="48" alt=""><br>
      <b>Mouse, keyboard, light and dark</b><br>
      Click, scroll, use shortcuts – and 20 settings on a single page.
    </td>
    <td width="33%" valign="top">
      <img src=".github/readme/feature-install.svg" width="48" alt=""><br>
      <b>No setup</b><br>
      One line installs everything including the Node runtime; start with a command or an icon.
    </td>
  </tr>
</table>

## Screenshots

<table>
  <tr>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screen-home-dark.svg">
        <source media="(prefers-color-scheme: light)" srcset=".github/readme/screen-home-light.svg">
        <img alt="Start screen with favorites" src=".github/readme/screen-home-dark.svg" width="100%">
      </picture>
      <sub>Start screen with favorites</sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screen-trips-dark.svg">
        <source media="(prefers-color-scheme: light)" srcset=".github/readme/screen-trips-light.svg">
        <img alt="Cruise list filtered by Bavarian school holidays" src=".github/readme/screen-trips-dark.svg" width="100%">
      </picture>
      <sub>Cruises in the Christmas holidays (Bavaria)</sub>
    </td>
    <td width="33%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screen-settings-dark.svg">
        <source media="(prefers-color-scheme: light)" srcset=".github/readme/screen-settings-light.svg">
        <img alt="Settings" src=".github/readme/screen-settings-dark.svg" width="100%">
      </picture>
      <sub>Settings</sub>
    </td>
  </tr>
</table>

## Installation

One line, no admin rights, no Node.js required.

**macOS · Linux** (Terminal)

```bash
curl -fsSL https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.sh | sh
```

**Windows** (PowerShell)

```powershell
irm https://github.com/hallohallo12345674/findmyaida/releases/latest/download/install.ps1 | iex
```

## Usage

Start with `findmyaida` (short: `fma`) or via “FindMyAIDA” in Launchpad, the Start menu or your app menu.
To try it offline: `findmyaida --demo`. The app itself is in German.

| Key | Action |
|---|---|
| Type | search destination, port, ship or date, e.g. `kanaren monat:dez dauer:7` |
| `⏎` | open a cruise, or all offers of a cell |
| `1`–`4` | view: cabin × fare, travel × fare, travel × cabin, all offers |
| `m` | save offer ★ |
| `b` · `f` | occupancy · filters |
| `?` | all keys |

Update with `findmyaida update`, remove with `findmyaida uninstall`. Everything else is in the
**[manual](MANUAL.md)**.

## Project

- **Access:** directly from Node, falling back to a windowless Firefox or Chrome with the bundled extension. Nothing
  is disguised; the tool identifies itself by name.
- **Fair use:** at most one request at a time, at least 300 ms apart, with a cache; no bulk queries.
- **Development:** `npm install` · `npm run check` · `npm run dev -- --demo`
- **License:** [GPL-3.0](LICENSE) – use, modify and share it, modified too, under the same terms.

<br>

<p align="center">
  <sub>FindMyAIDA is an unofficial open-source project for personal use and is not affiliated with AIDA Cruises. “AIDA” and the colors of the logo letters belong to AIDA Cruises.</sub>
</p>
