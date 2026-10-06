# Road Movement Route Card Maker (React)

Browser app that plans a road move over OpenStreetMap data and produces a route card with an
INSTRUCTIONS block (items 1–16) and a ROUTE DETAILS table: Ser, From, To, Route, Dir, Distance,
Total Distance and Total Time.

The INSTRUCTIONS items follow the short-form field book: 1. Move From, 2. Move To,
3. Time/Date at Start Point, 4. Location of Start Point, 5. Location of Release Point,
6. Average speed, 7. Packet Intervals, 8. Vehicle Distances (Day/Night × M/Way/A Roads),
9. Halts, 10. Lights, 11. Traffic, 12. Medical, 13. Recovery, 14. Convoy Flags (Front Vehicle,
Rear Vehicle, Breakdown), 15. Contact Telephone (Sqn Ops, TP Comd), 16. Critical Points.
New cards are pre-filled with these defaults: vehicle distances of 100 m (Day, M/Way) and 50 m otherwise,
Lights Dipped, Traffic Varying, and Blue/Green/Yellow flags. Cards saved in the old 1–17 layout (`schemaVersion` 1) are
converted when imported.

**4. Location of Start Point** and **5. Location of Release Point** follow the route table while
they are left blank. SP is the grid reference of the first From (b), e.g. `SP 863 422`. Rel Pt is
the grid reference of the last To (c), the last controlled point before the destination. The form
shows the value it will use; type your own value to override it, and clear the field to go back to
the route table value. The Excel module follows the same rule. The old date and time past SP are combined into item 3, each day/night distance fills both road types,
the old convoy flags text goes to Front Vehicle, and the old contact tel goes to Sqn Ops.

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
   - the serial mode: **waypoint** gives one serial per leg, **auto** splits at major road changes,
     and **junctions & bends** gives one serial per junction or turn, for ATAK (see below);
   - the location format: lat/long, OS grid, or both;
   - the vehicle dimensions (height, width, length, weight, axle load, HGV).
3. Click **Plan route**. You can then edit, merge, split or delete serials. Manual edits survive
   when the card is recomputed.
4. Click **Check HGV restrictions**. This queries Overpass for limits along the route: `maxheight`,
   `maxweight`, `maxaxleload`, `maxwidth`, `maxlength`, `hgv=no` and height restrictors. Matches
   appear on the map and are added to **16. Critical Points**. Any limit your vehicle breaks is
   prefixed with `!!`.
5. Fill in the instructions, then use **Print / PDF** or **Export JSON**. To get an `.xlsx`, run
   `../powershell` (`New-RouteCardXlsx`) on the exported JSON.
6. Optionally, click **Export GPX for ATAK** to download the route as a GPX file (see below).

## GPX export for ATAK

**Export GPX for ATAK** writes a [GPX 1.1](https://www.topografix.com/GPX/1/1/) file that contains
one named route (`<rte>`) and its points (`<rtept>`, in WGS84), in serial order. It is meant for
non-sensitive demonstrations and training. It is **not** an approved operational tool.

### What goes into the file

- **Points, in order.** The From of leg 1, then the To of every leg.
  - Where one leg's To and the next leg's From are the same place, that point appears once.
  - If the route returns to a place later on, that place appears again.
  - A leg that starts and ends in the same place adds no new point; the panel shows a warning.
- **Checkpoint names.** Each From and To cell in the Route details editor has an optional
  checkpoint name field. Only points you name get a `<name>`; nothing is named automatically.
  - At a shared point, a name entered on either leg is kept.
  - If the two legs give that point different names, export is blocked until you choose one.
  - Checkpoint names are saved in the JSON (`fromCp` and `toCp`) but are not printed on the card.
- **Text.** The route name, plus an optional route description.
  - You can also tick a box to copy each serial's Route (d) text into its start point's
    `<desc>`; this is off by default.
  - ATAK's importer ignores `<desc>`, so do not expect descriptions to become navigation cues.
- **Never written:** date, contact telephone, vehicle details, driver or vehicle identifiers,
  timestamps and author. Special characters are XML-escaped. The file name contains only
  `A-Z a-z 0-9 _ -`.
- **Offline.** Validation, coordinate conversion and GPX generation all happen in the browser.
  Coordinates and card data are not sent to any geocoding, routing or other service.

### Supported From/To inputs

A leg endpoint is taken from:

1. **The map point**, if the leg came from **Plan route** and you have not edited that cell.
2. Otherwise, **the text in the cell**, which must contain one of:

| Input | Examples | Precision |
|---|---|---|
| OS grid reference with its two-letter 100 km square, as 4, 6, 8 or 10 figures, with or without spaces (any case) | `SU 1225 4219`, `ST668664`, `NN 16670 71250` | 1 km, 100 m, 10 m or 1 m square |
| Decimal latitude, longitude (WGS84); both values need a decimal point | `51.39578, -2.47742` | as typed |

- **Other text is fine.** A cell can contain a place name as well, for example
  `Saltford - ST 668 664 (51.39578, -2.47742)`.
- **Grid ref and lat/long together.** Both must agree to within the grid square size plus 25 m,
  and the lat/long is then used.
- **Bare numbers are rejected**, for example `668 664` or `668664`. The same digits occur in every
  100 km square, so they cannot be located without the letters.
- **Other rejected inputs:** odd numbers of digits, unequal easting and northing lengths, 2- or
  12-figure references, and unknown squares.
- **Errors name the leg and cell.** Every rejected input produces an error such as
  "Leg 3 To (c): …". Points are never skipped or replaced silently.

### Conversion accuracy

- **Square centres.** A grid reference identifies a square, and the export uses the **centre** of
  that square. A 6-figure reference can therefore be up to about 70 m from the real spot. Use 8 or
  10 figures for checkpoints.
- **Datum transformation.** OSGB36 is converted to WGS84 by [proj4js](https://github.com/proj4js/proj4js)
  using the standard 7-parameter Helmert transformation (EPSG:27700 with `towgs84`). Ordnance Survey
  describes this as accurate to a few metres.
- **Measured error.** Against OS's definitive OSTN15 transformation (via PROJ), the error was
  0.3–4.3 m at the test points from Land's End to Lerwick. The tests allow 8 m.
- **Not survey grade.** OSTN15 itself is not used, because it needs a large grid file.

### Connectivity checks and the straight-line limitation

- **Gaps block export.** Each leg's From must be the same place as the previous leg's To. Two points
  count as the same place if they are within the larger grid square of the two, or within 5 m for
  map points and lat/long. If the gap is larger, export is blocked and the panel says which legs
  are disconnected and by how far. Gaps are never bridged automatically.
- **At least two different points** are required.
- **Straight lines between points.** ATAK joins route points with **straight lines**, and the import
  does not snap them to roads. In the **waypoint** and **auto** serial modes the GPX contains only
  the leg endpoints. **No mode produces an HGV-safe route.**
  - To follow bends and junctions more closely, use the **Junctions & bends** mode (below), or split
    long serials or add manual legs, leaving those intermediate points unnamed.
  - Always check the route against the route card, the map and a recce.

### Junctions & bends serial mode

Choose **Settings → Serials → Junctions & bends (for ATAK GPX)** before (or after) **Plan route**.

- **One serial per junction or turn** reported by the router. Steps shorter than 25 m (for example
  a short slip road), and unnamed steps shorter than 100 m (mostly roundabouts), are folded into the
  next serial.
- **Junctions are named checkpoints.** Each junction gets a `toCp` such as `J3 A342/A303`, the first
  point is named after the start waypoint, and the end of each waypoint leg after that waypoint.
  ATAK imports each named point as a checkpoint. You can rename or clear any of them in the editor.
- **Bends are unnamed points.** The router's road line for each serial is simplified so that no
  part of it is more than the **Bend tolerance** (default 20 m) from the exported line. The
  remaining bend points are written to the GPX as unnamed `<rtept>`s between the junctions; they
  are not shown on the card. A smaller tolerance follows the road more closely but adds more
  points. Points closer than 1 m together are dropped, as ATAK would drop them.
- **Edited endpoints.** If you type over a serial's From or To, its bend points are left out (they
  may no longer apply) and the panel warns that the serial exports as a straight line. Merging
  serials keeps their bend points but drops the inner junction name.
- **Still not HGV-safe.** The points follow the router's road geometry, but the router may be
  wrong, and OSM data is incomplete. Check the route on the ground.

### Importing into ATAK

The steps below are based on the ATAK-CIV source code, not on a confirmed device trial. Menu names
and icons vary between ATAK versions.

From the ATAK-CIV source
([`RouteGpxIO.java`](https://github.com/deptofdefense/AndroidTacticalAssaultKit-CIV/blob/main/atak/ATAK/app/src/main/java/com/atakmap/android/routes/RouteGpxIO.java),
[`RouteMapReceiver.java`](https://github.com/deptofdefense/AndroidTacticalAssaultKit-CIV/blob/main/atak/ATAK/app/src/main/java/com/atakmap/android/routes/RouteMapReceiver.java)):

- **How the file is read.**
  - Each GPX `<rte>` (and each `<trk>`) becomes an ATAK route, and its `<name>` becomes the route
    title.
  - `<desc>`, `<metadata>` and `<extensions>` are not used.
  - Consecutive points less than 1 m apart are dropped.
- **Checkpoints.** The route preference **GPX Import Checkpoints** (`gpxImportCheckpointsForNamedRoutePoints`,
  on by default) makes every route point with a non-empty `<name>` a checkpoint. Unnamed points
  become ordinary route control points.
- **Lines and method.** Points are joined directly, and the route method defaults to *Driving*.

**Trial procedure:**

1. Copy the `.gpx` file to the device, for example over USB into the device's Downloads folder or
   ATAK's import folder.
2. In ATAK's settings, open the Route preferences and confirm that **GPX Import Checkpoints** is
   enabled.
3. Open the **Routes** tool, choose import, then **Select From File**, and pick the `.gpx` file.
   Alternatively, use ATAK's Import Manager.
4. Check the following by hand. The automated tests cannot check these:
   - the route appears in the route list under the expected name;
   - the points are in the right positions and order, compared against the printed card;
   - named points appear as checkpoints with the right names, and unnamed points do not.

### Sample

[`../schema/sample-atak-demo-route.json`](../schema/sample-atak-demo-route.json) is a **fictional**
five-leg route card from Bath (Royal Crescent) to Bristol (Temple Meads) along the A4. It uses only
public places and has four named checkpoints. Load it with **Import JSON**, then choose **Export GPX
for ATAK**.

The expected output is
[`../schema/sample-atak-demo-route.gpx`](../schema/sample-atak-demo-route.gpx), exported under the
route name `EX DEMO - Bath to Bristol (fictional)`. A unit test keeps the two files in step, and
the GPX validates against the official GPX 1.1 XSD.

## Layout

Drag the bar under the map to change its height, and the bar between the map and the side panel to
change the panel width. Double-click a bar to reset it. Sizes are remembered in localStorage. The
restrictions list can be resized from its corner.

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
- Public Overpass servers often answer 504/429 even to small queries. The app splits long routes into
  ~50 km sections and retries each across overpass-api.de, z.overpass-api.de, lz4.overpass-api.de and
  other mirrors with backoff (up to 4 rounds). Progress shows in the status bar. For reliable use, set
  your own Overpass URL in Settings.
- Map data © OpenStreetMap contributors (ODbL). Geocoding is by Nominatim; keep usage light.

## Dev note

On Windows, Jest finds no tests if the project path contains `\.` (for example `C:\Users\me\.copilot\...`).
Copy the project to a plain path to run the tests.
