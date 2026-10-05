#Requires -Version 5.1
#Requires -Modules ImportExcel
<#
    RouteCardExcel - build a formatted road movement route card .xlsx from the web app's
    route-card JSON (and read one back), using the ImportExcel module. Excel is NOT required.
#>

Set-StrictMode -Version Latest

# Fixed cell layout shared by New-RouteCardXlsx and ConvertFrom-RouteCardXlsx.
$script:Layout = @{
    Sheet          = 'Route Card'
    Title          = 'A1'
    Left           = [ordered]@{ # label cell -> value range (columns A:B label, C:D value)
        movFrom            = @{ Row = 4;  Label = '1. Move From' }
        movTo              = @{ Row = 5;  Label = '2. Move To' }
        timeDateSp         = @{ Row = 6;  Label = '3. Time/Date at Start Point' }
        sp                 = @{ Row = 7;  Label = '4. Location of Start Point' }
        relPt              = @{ Row = 8;  Label = '5. Location of Release Point' }
        averageSpeed       = @{ Row = 9;  Label = '6. Average speed' }
        timeBetweenPackets = @{ Row = 10; Label = '7. Packet Intervals' }
        vehDistDayMway     = @{ Row = 12; Label = '    Day - M/Way'; Default = '100 m' }
        vehDistDayARoads   = @{ Row = 13; Label = '    Day - A Roads'; Default = '50 m' }
        vehDistNightMway   = @{ Row = 14; Label = '    Night - M/Way'; Default = '50 m' }
        vehDistNightARoads = @{ Row = 15; Label = '    Night - A Roads'; Default = '50 m' }
    }
    Right          = [ordered]@{ # columns E label, F:H value
        halts               = @{ Row = 4;  Label = '9. Halts' }
        lts                 = @{ Row = 5;  Label = '10. Lights'; Default = 'Dipped' }
        tfc                 = @{ Row = 6;  Label = '11. Traffic'; Default = 'Varying' }
        med                 = @{ Row = 7;  Label = '12. Medical' }
        rec                 = @{ Row = 8;  Label = '13. Recovery' }
        convoyFlagFront     = @{ Row = 10; Label = '    Front Vehicle'; Default = 'Blue Flag' }
        convoyFlagRear      = @{ Row = 11; Label = '    Rear Vehicle'; Default = 'Green Flag' }
        convoyFlagBreakdown = @{ Row = 12; Label = '    Breakdown'; Default = 'Yellow Flag' }
        contactTelSqnOps    = @{ Row = 14; Label = '    Sqn Ops' }
        contactTelTpComd    = @{ Row = 15; Label = '    TP Comd' }
        criticalPts         = @{ Row = 16; Label = '16. Critical Points'; LastRow = 19 }
    }
    Headings       = @{ # item headings whose values are sub-fields
        A11 = '8. Vehicle Distances'
        E9  = '14. Convoy Flags'
        E13 = '15. Contact Telephone'
    }
    RouteTitleRow  = 21
    HeaderRow      = 22
    LetterRow      = 23
    FirstSerialRow = 24
    Columns        = @(
        @{ Key = 'ser';           Header = 'Ser';            Letter = '(a)'; Width = 6 }
        @{ Key = 'from';          Header = 'From';           Letter = '(b)'; Width = 30 }
        @{ Key = 'to';            Header = 'To';             Letter = '(c)'; Width = 30 }
        @{ Key = 'route';         Header = 'Route';          Letter = '(d)'; Width = 38 }
        @{ Key = 'dir';           Header = 'Dir';            Letter = '(e)'; Width = 22 }
        @{ Key = 'distance';      Header = 'Distance';       Letter = '(f)'; Width = 11 }
        @{ Key = 'totalDistance'; Header = 'Total Distance'; Letter = '(g)'; Width = 12 }
        @{ Key = 'totalTime';     Header = 'Total Time';     Letter = '(h)'; Width = 10 }
    )
}

function Get-Prop {
    param($Object, [string]$Name, $Default = '')
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name] -and $null -ne $Object.$Name) { return $Object.$Name }
    return $Default
}

function ConvertTo-InstructionsV2 {
    # Maps schemaVersion 1 instruction keys onto the version 2 items (same rules as the web app).
    param($Old)
    $out = [ordered]@{}
    foreach ($p in $Old.PSObject.Properties) { $out[$p.Name] = $p.Value }
    $has = { param($n) $out.Contains($n) }
    if ((& $has 'date') -or (& $has 'timePastSp')) {
        $date = [string]$out['date']
        if ($date -match '^(\d{4})-(\d{2})-(\d{2})$') { $date = "$($Matches[3])/$($Matches[2])/$($Matches[1])" }
        $out['timeDateSp'] = (@([string]$out['timePastSp'], $date) | Where-Object { $_ }) -join ' '
    }
    if (& $has 'distBetweenVehsDay') { $out['vehDistDayMway'] = $out['vehDistDayARoads'] = $out['distBetweenVehsDay'] }
    if (& $has 'distBetweenVehsNight') { $out['vehDistNightMway'] = $out['vehDistNightARoads'] = $out['distBetweenVehsNight'] }
    if (& $has 'convoyFlags') { $out['convoyFlagFront'] = $out['convoyFlags']; $out['convoyFlagRear'] = ''; $out['convoyFlagBreakdown'] = '' }
    if (& $has 'contactTel') { $out['contactTelSqnOps'] = $out['contactTel'] }
    foreach ($k in 'date', 'timePastSp', 'distBetweenVehsDay', 'distBetweenVehsNight', 'convoyFlags', 'contactTel') { $out.Remove($k) }
    [pscustomobject]$out
}

function Get-GridRefFromText {
    param([string]$Text)
    if ($Text -cmatch '(?<![A-Za-z0-9])([A-HJ-Z]{2})\s*(\d{2,5})\s+(\d{2,5})(?![\d.])' -and $Matches[2].Length -eq $Matches[3].Length) {
        return "$($Matches[1]) $($Matches[2]) $($Matches[3])"
    }
    if ($Text -cmatch '(?<![A-Za-z0-9])([A-HJ-Z]{2})\s*(\d{4}|\d{6}|\d{8}|\d{10})(?![\d.])') {
        $h = $Matches[2].Length / 2
        return "$($Matches[1]) $($Matches[2].Substring(0, $h)) $($Matches[2].Substring($h))"
    }
    ''
}

function Add-DerivedStartRelease {
    # Blank 4. Location of Start Point / 5. Location of Release Point follow the route table:
    # grid ref in the first From (b) and the last To (c), as in the web app.
    param($Instructions, $Serials)
    $out = [ordered]@{}
    foreach ($p in $Instructions.PSObject.Properties) { $out[$p.Name] = $p.Value }
    $list = @($Serials)
    if ($list.Count) {
        if (-not "$($out['sp'])".Trim()) { $out['sp'] = Get-GridRefFromText (Get-Prop $list[0] 'from') }
        if (-not "$($out['relPt'])".Trim()) { $out['relPt'] = Get-GridRefFromText (Get-Prop $list[-1] 'to') }
    }
    [pscustomobject]$out
}

function Get-InstructionValue {
    # Missing keys take the field-book default; keys present (even blank) keep their value.
    param($Instructions, [string]$Key, $Spec)
    $default = if ($Spec.ContainsKey('Default')) { $Spec.Default } else { '' }
    [string](Get-Prop $Instructions $Key $default)
}

function Set-Border {
    param($Range)
    foreach ($side in 'Top', 'Bottom', 'Left', 'Right') { $Range.Style.Border.$side.Style = 'Thin' }
}

function New-RouteCardXlsx {
    <#
    .SYNOPSIS
        Creates a formatted route card spreadsheet from route-card JSON exported by the web app.
    .PARAMETER Path
        Route-card JSON file (*.routecard.json).
    .PARAMETER OutputPath
        Destination .xlsx. Defaults to the JSON path with an .xlsx extension.
    .PARAMETER Show
        Open the workbook when done (needs an app that opens .xlsx files).
    .EXAMPLE
        New-RouteCardXlsx -Path .\Tidworth-to-Andover.routecard.json
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('FullName')]
        [string]$Path,
        [string]$OutputPath,
        [switch]$Show,
        [switch]$Force
    )
    process {
        $card = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        $version = Get-Prop $card 'schemaVersion' 0
        if ($version -notin 1, 2) { throw "Unsupported route card schemaVersion in '$Path'." }
        if (-not $OutputPath) { $OutputPath = [IO.Path]::ChangeExtension(($Path -replace '\.routecard\.json$', '.json'), '.xlsx') }
        $OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
        if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) { throw "'$OutputPath' exists. Use -Force to overwrite." }
        if (-not $PSCmdlet.ShouldProcess($OutputPath, 'Create route card workbook')) { return }
        if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }

        $L = $script:Layout
        $instr = Get-Prop $card 'instructions' ([pscustomobject]@{})
        if ($version -eq 1) { $instr = ConvertTo-InstructionsV2 $instr }
        $instr = Add-DerivedStartRelease $instr (Get-Prop $card 'serials' @())
        $pkg = Open-ExcelPackage -Path $OutputPath -Create
        try {
            $ws = Add-Worksheet -ExcelPackage $pkg -WorksheetName $L.Sheet
            $ws.Cells.Style.Font.Name = 'Arial'
            $ws.Cells.Style.Font.Size = 10
            for ($i = 0; $i -lt $L.Columns.Count; $i++) { $ws.Column($i + 1).Width = $L.Columns[$i].Width }

            # Title
            $ws.Cells['A1'].Value = (Get-Prop $card 'title' 'Route Card').ToUpper()
            $ws.Cells['A1:H1'].Merge = $true
            $ws.Cells['A1'].Style.Font.Bold = $true
            $ws.Cells['A1'].Style.Font.Size = 14
            $ws.Cells['A1'].Style.HorizontalAlignment = 'Center'

            # INSTRUCTIONS
            $ws.Cells['A3'].Value = 'INSTRUCTIONS'
            $ws.Cells['A3'].Style.Font.Bold = $true
            $ws.Cells['A3'].Style.Font.UnderLine = $true

            foreach ($key in $L.Left.Keys) {
                $r = $L.Left[$key].Row
                $ws.Cells["A$r"].Value = $L.Left[$key].Label
                $ws.Cells["A${r}:B$r"].Merge = $true
                $ws.Cells["C$r"].Value = Get-InstructionValue $instr $key $L.Left[$key]
                $ws.Cells["C${r}:D$r"].Merge = $true
                $ws.Cells["C${r}:D$r"].Style.Border.Bottom.Style = 'Dotted'
            }

            foreach ($key in $L.Right.Keys) {
                $spec = $L.Right[$key]
                $r = $spec.Row
                $last = if ($spec.ContainsKey('LastRow')) { $spec.LastRow } else { $r }
                $ws.Cells["E$r"].Value = $spec.Label
                $ws.Cells["E$r"].Style.VerticalAlignment = 'Top'
                $ws.Cells["F$r"].Value = Get-InstructionValue $instr $key $spec
                $range = $ws.Cells["F${r}:H$last"]
                $range.Merge = $true
                $range.Style.WrapText = $true
                $range.Style.VerticalAlignment = 'Top'
                $range.Style.Border.Bottom.Style = 'Dotted'
                if ($key -eq 'criticalPts') {
                    $lines = ([string](Get-Prop $instr $key) -split "`n").Count
                    $height = [Math]::Max(15, [Math]::Ceiling($lines * 13.5 / ($last - $r + 1)))
                    for ($k = $r; $k -le $last; $k++) { $ws.Row($k).Height = $height }
                }
            }

            foreach ($addr in $L.Headings.Keys) { $ws.Cells[$addr].Value = $L.Headings[$addr] }

            # ROUTE DETAILS
            $ws.Cells["A$($L.RouteTitleRow)"].Value = 'ROUTE DETAILS'
            $ws.Cells["A$($L.RouteTitleRow)"].Style.Font.Bold = $true
            $ws.Cells["A$($L.RouteTitleRow)"].Style.Font.UnderLine = $true
            for ($i = 0; $i -lt $L.Columns.Count; $i++) {
                $col = $i + 1
                $ws.Cells.Item($L.HeaderRow, $col).Value = $L.Columns[$i].Header
                $ws.Cells.Item($L.LetterRow, $col).Value = $L.Columns[$i].Letter
            }
            $hdr = $ws.Cells.Item($L.HeaderRow, 1, $L.LetterRow, $L.Columns.Count)
            $hdr.Style.Font.Bold = $true
            $hdr.Style.HorizontalAlignment = 'Center'
            $hdr.Style.Fill.PatternType = 'Solid'
            $hdr.Style.Fill.BackgroundColor.SetColor([System.Drawing.Color]::FromArgb(229, 231, 235))

            $row = $L.FirstSerialRow
            foreach ($s in @(Get-Prop $card 'serials' @())) {
                for ($i = 0; $i -lt $L.Columns.Count; $i++) {
                    $v = Get-Prop $s $L.Columns[$i].Key
                    $ws.Cells.Item($row, $i + 1).Value = $(if ($L.Columns[$i].Key -eq 'ser' -and "$v" -match '^\d+$') { [int]$v } else { [string]$v })
                }
                $row++
            }
            $lastRow = [Math]::Max($row - 1, $L.LetterRow)
            $table = $ws.Cells.Item($L.HeaderRow, 1, $lastRow, $L.Columns.Count)
            Set-Border $table
            foreach ($cell in $table) { Set-Border $cell }
            $bodyLast = [Math]::Max($lastRow, $L.FirstSerialRow)
            $body = $ws.Cells.Item($L.FirstSerialRow, 1, $bodyLast, $L.Columns.Count)
            $body.Style.WrapText = $true
            $body.Style.VerticalAlignment = 'Top'
            $ws.Cells.Item($L.FirstSerialRow, 1, $bodyLast, 1).Style.HorizontalAlignment = 'Center'

            # Caveat + attribution
            $note = $lastRow + 2
            $ws.Cells["A$note"].Value = Get-Prop $card 'caveat' 'Restriction data from OpenStreetMap is incomplete and advisory only.'
            $ws.Cells["A${note}:H$note"].Merge = $true
            $ws.Cells["A$note"].Style.Font.Italic = $true
            $ws.Cells["A$note"].Style.Font.Size = 8
            $ws.Cells["A$($note + 1)"].Value = "Map data $(Get-Prop $card 'attribution' '© OpenStreetMap contributors')"
            $ws.Cells["A$($note + 1)"].Style.Font.Size = 8

            # Print setup: A4 landscape, fit to one page wide, repeat the table header.
            $ps = $ws.PrinterSettings
            $ps.PaperSize = [OfficeOpenXml.ePaperSize]::A4
            $ps.Orientation = [OfficeOpenXml.eOrientation]::Landscape
            $ps.FitToPage = $true
            $ps.FitToWidth = 1
            $ps.FitToHeight = 0
            $ps.RepeatRows = $ws.Cells["$($L.HeaderRow):$($L.LetterRow)"]
            $ps.PrintArea = $ws.Cells["A1:H$($note + 1)"]

            # Supporting sheets
            $wps = @(Get-Prop $card 'waypoints' @())
            if ($wps.Count) {
                $i = 0
                $wps | ForEach-Object { $i++; [pscustomobject]@{ No = $i; Name = (Get-Prop $_ 'name'); Lat = $_.lat; Lon = $_.lon } } |
                    Export-Excel -ExcelPackage $pkg -WorksheetName 'Waypoints' -AutoSize -TableName 'Waypoints' -TableStyle Light1 -PassThru | Out-Null
            }
            $res = @(Get-Prop $card 'restrictions' @())
            if ($res.Count) {
                $res | ForEach-Object {
                    [pscustomobject]@{
                        Conflict    = [bool](Get-Prop $_ 'conflict' $false)
                        OnRoute     = [bool](Get-Prop $_ 'onRoute' $false)
                        Description = Get-Prop $_ 'description'
                        Tag         = "$(Get-Prop $_ 'tag')=$(Get-Prop $_ 'value')"
                        Lat         = Get-Prop $_ 'lat'
                        Lon         = Get-Prop $_ 'lon'
                        OsmUrl      = Get-Prop $_ 'osmUrl'
                    }
                } | Export-Excel -ExcelPackage $pkg -WorksheetName 'Restrictions' -AutoSize -TableName 'Restrictions' -TableStyle Light1 `
                    -ConditionalText (New-ConditionalText -Text 'TRUE' -Range 'A:A' -BackgroundColor LightPink) -PassThru | Out-Null
            }
            $vehicle = Get-Prop $card 'vehicle' $null
            if ($vehicle) {
                $vehicle.PSObject.Properties | ForEach-Object { [pscustomobject]@{ Property = $_.Name; Value = "$($_.Value)" } } |
                    Export-Excel -ExcelPackage $pkg -WorksheetName 'Vehicle' -AutoSize -PassThru | Out-Null
            }
            $pkg.Workbook.Worksheets.MoveToStart($L.Sheet)
            $pkg.Workbook.View.ActiveTab = 0
        }
        finally {
            Close-ExcelPackage $pkg -Show:$Show
        }
        Get-Item -LiteralPath $OutputPath
    }
}

function ConvertFrom-RouteCardXlsx {
    <#
    .SYNOPSIS
        Reads a route card workbook created by New-RouteCardXlsx (and possibly edited) back into route-card JSON.
    .PARAMETER Path
        The .xlsx file.
    .PARAMETER OutputPath
        Optional .json path. If omitted the JSON string is returned.
    .EXAMPLE
        ConvertFrom-RouteCardXlsx -Path .\card.xlsx -OutputPath .\card.routecard.json
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('FullName')]
        [string]$Path,
        [string]$OutputPath
    )
    process {
        $L = $script:Layout
        $full = (Resolve-Path -LiteralPath $Path).ProviderPath
        $pkg = Open-ExcelPackage -Path $full
        try {
            $ws = $pkg.Workbook.Worksheets[$L.Sheet]
            if (-not $ws) { throw "Worksheet '$($L.Sheet)' not found in '$Path'." }
            $text = { param($addr) $v = $ws.Cells[$addr].Text; if ($null -eq $v) { '' } else { $v.Trim() } }

            $instructions = [ordered]@{}
            foreach ($key in $L.Left.Keys) { $instructions[$key] = & $text "C$($L.Left[$key].Row)" }
            foreach ($key in $L.Right.Keys) { $instructions[$key] = & $text "F$($L.Right[$key].Row)" }

            $serials = [System.Collections.Generic.List[object]]::new()
            $row = $L.FirstSerialRow
            while ($true) {
                $vals = [ordered]@{}
                for ($i = 0; $i -lt $L.Columns.Count; $i++) { $vals[$L.Columns[$i].Key] = "$($ws.Cells.Item($row, $i + 1).Text)".Trim() }
                if (-not ($vals.Values -join '')) { break }
                if ($vals.ser -match '^\d+$') { $vals.ser = [int]$vals.ser }
                $serials.Add([pscustomobject]$vals)
                $row++
            }

            $waypoints = @()
            if ($pkg.Workbook.Worksheets['Waypoints']) {
                $waypoints = @(Import-Excel -ExcelPackage $pkg -WorksheetName 'Waypoints' | ForEach-Object {
                        [ordered]@{ lat = [double]$_.Lat; lon = [double]$_.Lon; name = "$($_.Name)" }
                    })
            }
            $card = [ordered]@{
                schemaVersion = 2
                title         = (& $text 'A1')
                instructions  = $instructions
                serials       = $serials
                waypoints     = $waypoints
                restrictions  = @()
                attribution   = '© OpenStreetMap contributors'
            }
        }
        finally {
            Close-ExcelPackage $pkg -NoSave
        }
        $json = $card | ConvertTo-Json -Depth 6
        if ($OutputPath) {
            Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
            Get-Item -LiteralPath $OutputPath
        }
        else { $json }
    }
}

Export-ModuleMember -Function New-RouteCardXlsx, ConvertFrom-RouteCardXlsx
