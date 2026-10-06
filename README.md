# RoadRouteCardMaker

[![CI](https://github.com/PowerShellYoungTeam/RoadRouteCardMaker/actions/workflows/ci.yml/badge.svg)](https://github.com/PowerShellYoungTeam/RoadRouteCardMaker/actions/workflows/ci.yml)

Plan a road move on OpenStreetMap and produce a military-style **route card**: the INSTRUCTIONS
block (items 1-16, short-form field book wording) plus the ROUTE DETAILS table. It is built with big and heavy vehicles in mind
and flags height, weight and width limits along the route.

```
ROUTE DETAILS
Ser | From | To | Route | Dir | Distance | Total Distance | Total Time
(a) | (b)  | (c)| (d)   | (e) | (f)      | (g)            | (h)
```

## Features

- **Map-based planning.** Click or search to add waypoints, then drag them to adjust.
- **Pluggable routing:**
  - Valhalla, using truck costing (the default; no key needed).
  - OpenRouteService `driving-hgv` (needs a free API key).
  - OSRM (cars only).
- **Automatic serials.** One serial per waypoint leg, auto-split at major road changes, or one per
  junction (with road bends kept for the ATAK GPX). Each
  serial has a compass direction (Dir) and road summary, with locations as OS grid refs, lat/long
  or both. Every cell can be edited.
- **HGV restriction check.** Queries OSM (Overpass) for:
  - `maxheight`, `maxweight`, `maxaxleload`, `maxwidth` and `maxlength`;
  - `hgv=no` and similar access tags;
  - height barriers.

  Matches appear on the map and are added to **16. Critical Points**. Anything your vehicle exceeds
  is marked `!!`.
- **Output.** Print or save as PDF, export or import JSON, or build a formatted Excel workbook
  with PowerShell.
- **GPX export for ATAK.** Downloads a GPX 1.1 route with optional named checkpoints. The file is
  built entirely in the browser, and personal details are left out. Points are joined by straight
  lines; use the **Junctions & bends** serial mode to add named junctions and road bend points so
  the line follows the road. See the
  [web app README](Workfolder/web-app-react/README.md#gpx-export-for-atak).

## Quick start

**Web app** (requires Node.js 18 or later):

```powershell
cd Workfolder\web-app-react
npm ci
npm start            # http://localhost:3000
```

1. Add waypoints, set the vehicle dimensions in Settings, and click **Plan route**.
2. Click **Check HGV restrictions**, then fill in the instructions.
3. Click **Print / PDF** or **Export JSON**.

**Excel route card** (requires PowerShell 7 and ImportExcel; Excel itself is not needed):

```powershell
Install-Module ImportExcel -Scope CurrentUser
Import-Module .\Workfolder\powershell\RouteCardExcel.psm1
New-RouteCardXlsx -Path .\my-card.json -OutputPath .\my-card.xlsx -Show
```

To try it without the web app, use `Workfolder\schema\sample-route-card.json`.

## Repository layout

| Path | Contents |
|---|---|
| [`Workfolder/web-app-react`](Workfolder/web-app-react) | **Main app.** React + Leaflet route planner and card editor. |
| [`Workfolder/powershell`](Workfolder/powershell) | `RouteCardExcel` module: JSON to `.xlsx` and back, with Pester tests. |
| [`Workfolder/schema`](Workfolder/schema) | Route card JSON schema (the contract between the app and PowerShell), a sample card, and a fictional ATAK demo route (`.json` and `.gpx`). |
| `Workfolder/cli-tool-python`, `desktop-app-electron`, `spreadsheet-template` | Early prototypes and a manual Excel template. |

## Testing

```powershell
cd Workfolder\web-app-react; npm test                            # Jest unit tests
Invoke-Pester .\Workfolder\powershell\tests -Output Detailed     # Pester 5
```

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs Jest, the production build and
Pester on every pull request and push to `main`.

On Windows, Jest finds no tests if the repo path contains `\.` (for example `C:\Users\me\.copilot\...`).
Clone the repo to a plain path such as `C:\dev\` to run them.

## Important caveats

- **OSM data is incomplete.** Missing restriction tags are common, so treat the restriction check
  as a prompt for a proper route recce, never as clearance.
- **Public servers are rate-limited and often busy.** This applies to Overpass, Valhalla, OSRM and
  Nominatim. The app retries across Overpass mirrors. For regular use, self-host the services or
  set your own URLs in Settings.
- OS grid conversion is accurate to about 5 m.
- **GPX export is not a navigation route.** The points are joined by straight lines (closely
  spaced along the road in Junctions & bends mode), and the export is not checked for HGV safety. ATAK import has been checked against ATAK's source code
  only, not on a device. Use fictional or non-sensitive data for demonstrations.

## Licence and attribution

The code is licensed under [MIT](LICENSE). Map data is © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors and available under the ODbL.
