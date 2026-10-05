# RoadRouteCardMaker

Tools for producing military-style road movement route cards.

| Folder | What it is |
|---|---|
| `web-app-react/` | **Main app.** A React + Leaflet browser app. It plans routes over OpenStreetMap (Valhalla, OpenRouteService HGV or OSRM), builds serials, checks HGV height and weight restrictions via Overpass, and prints or exports the card. |
| `powershell/` | `RouteCardExcel` module. Converts the exported card JSON to a formatted `.xlsx` (and back) using ImportExcel. |
| `schema/` | JSON schema for the route card, plus a sample. This is the contract between the web app and PowerShell. |
| `desktop-app-electron/`, `cli-tool-python/`, `spreadsheet-template/` | Earlier prototypes. |

See the README in each folder for setup and usage.
