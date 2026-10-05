# Road Movement Route Card Maker (React)

Browser app that plans a road move over OpenStreetMap data and produces a route card with an
INSTRUCTIONS block (items 1–17) and a ROUTE DETAILS table: Ser, From, To, Route, Dir, Distance,
Total Distance and Total Time.

## Run

```bash
npm ci
npm start        # http://localhost:3000
npm test
npm run build
```

## Workflow

1. Click the map, or use the search box, to add waypoints. Drag the markers to adjust them.
2. In **Settings**, choose:
   - the routing engine;
   - the serial mode: **waypoint** gives one serial per leg, **auto** splits at major road changes;
   - the location format: lat/long, OS grid, or both;
   - the vehicle dimensions (height, width, length, weight, axle load, HGV).
3. Click **Plan route**. You can then edit, merge, split or delete serials. Manual edits survive
   when the card is recomputed.
4. Click **Check HGV restrictions**. This queries Overpass for limits along the route: `maxheight`,
   `maxweight`, `maxaxleload`, `maxwidth`, `maxlength`, `hgv=no` and height restrictors. Matches
   appear on the map and are added to **17. Critical pts**. Any limit your vehicle breaks is
   prefixed with `!!`.
5. Fill in the instructions, then use **Print / PDF** or **Export JSON**. To get an `.xlsx`, run
   `../powershell` (`New-RouteCardXlsx`) on the exported JSON.

## Routing engines

| Engine | Vehicle-aware | Notes |
|---|---|---|
| Valhalla (default) | Yes (truck costing) | Uses the public FOSSGIS server by default. Self-host for heavy use. |
| OpenRouteService | Yes (`driving-hgv`) | Needs a free API key, which is stored in localStorage. |
| OSRM | No (car) | Fast, but ignores vehicle dimensions. |

You can change the server URL for each engine in Settings, for example to point at a self-hosted instance.

## OSM restrictions and caveats

- OSM coverage of height, weight and width limits is incomplete. Treat the results as prompts for a
  proper route recce, not as clearance.
- Public Overpass servers are often busy. The app tries several mirrors (60 s timeout each). You can
  also set a custom Overpass URL in Settings.
- Map data © OpenStreetMap contributors (ODbL). Geocoding is by Nominatim; keep usage light.

## Dev note

On Windows, Jest finds no tests if the project path contains `\.` (for example `C:\Users\me\.copilot\...`).
Copy the project to a plain path to run the tests.
