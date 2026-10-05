# RouteCardExcel (PowerShell)

Builds a formatted route card `.xlsx` from the JSON exported by the web app, using
[ImportExcel](https://github.com/dfinke/ImportExcel). Excel itself is not required.

## Setup

```powershell
Install-Module ImportExcel -Scope CurrentUser
Import-Module .\RouteCardExcel.psm1
```

## Usage

```powershell
# JSON (from "Export JSON" in the web app) -> xlsx
New-RouteCardXlsx -Path .\my-card.json -OutputPath .\my-card.xlsx -Show

# Overwrite an existing workbook
New-RouteCardXlsx -Path .\my-card.json -OutputPath .\my-card.xlsx -Force

# Edited xlsx -> JSON (re-import into the web app with "Import JSON")
ConvertFrom-RouteCardXlsx -Path .\my-card.xlsx -OutputPath .\my-card.json
```

Try it with `..\schema\sample-route-card.json`.

## Workbook layout

- **Route Card**: the INSTRUCTIONS block (items 1–16, with sub-fields for Vehicle Distances, Convoy Flags and Contact Telephone) and the ROUTE DETAILS
  table (Ser, From, To, Route, Dir, Distance, Total Distance, Total Time, lettered (a)–(h)).
  It prints on A4 landscape, fitted to the page width, with the header rows repeated on each page.
- **Waypoints**, **Restrictions** and **Vehicle**: supporting data. Restrictions that conflict
  with the vehicle are highlighted.

## Tests

```powershell
Invoke-Pester -Path .\tests -Output Detailed   # Pester 5
```
