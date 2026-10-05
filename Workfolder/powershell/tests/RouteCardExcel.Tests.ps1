#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }, ImportExcel

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..\RouteCardExcel.psm1') -Force
    $script:Sample = Join-Path $PSScriptRoot '..\..\schema\sample-route-card.json'
    $script:Out = Join-Path $TestDrive 'card.xlsx'
    New-RouteCardXlsx -Path $script:Sample -OutputPath $script:Out | Out-Null
}

Describe 'New-RouteCardXlsx' {
    BeforeAll { $pkg = Open-ExcelPackage -Path $script:Out; $ws = $pkg.Workbook.Worksheets['Route Card'] }
    AfterAll { Close-ExcelPackage $pkg -NoSave }

    It 'writes the instruction block' {
        $ws.Cells['A4'].Text | Should -Be '1. Move From'
        $ws.Cells['C4'].Text | Should -Be 'Tidworth'
        $ws.Cells['A6'].Text | Should -Be '3. Time/Date at Start Point'
        $ws.Cells['C6'].Text | Should -Be '0800 12/10/2026'
        $ws.Cells['A10'].Text | Should -Be '7. Packet Intervals'
        $ws.Cells['A11'].Text | Should -Be '8. Vehicle Distances'
        $ws.Cells['C12'].Text | Should -Be '100 m'
        $ws.Cells['C15'].Text | Should -Be '50 m'
        $ws.Cells['E5'].Text | Should -Be '10. Lights'
        $ws.Cells['E9'].Text | Should -Be '14. Convoy Flags'
        $ws.Cells['F12'].Text | Should -Be 'Yellow Flag'
        $ws.Cells['E13'].Text | Should -Be '15. Contact Telephone'
        $ws.Cells['E15'].Text.Trim() | Should -Be 'TP Comd'
        $ws.Cells['E16'].Text | Should -Be '16. Critical Points'
        $ws.Cells['F16'].Text | Should -Match 'Height limit'
    }

    It 'writes the route details table with lettered columns' {
        ($ws.Cells['A22:H22'] | ForEach-Object Text) -join '|' | Should -Be 'Ser|From|To|Route|Dir|Distance|Total Distance|Total Time'
        ($ws.Cells['A23:H23'] | ForEach-Object Text) -join '' | Should -Be '(a)(b)(c)(d)(e)(f)(g)(h)'
        $ws.Cells['A24'].Value | Should -Be 1
        $ws.Cells['D26'].Text | Should -Be 'Weyhill Road → Western Avenue'
        $ws.Cells['G26'].Text | Should -Be '16.3 km'
        $ws.Cells['H26'].Text | Should -Be '00:24'
        $ws.Cells['A27'].Text | Should -BeNullOrEmpty
    }

    It 'adds supporting sheets and print setup' {
        $pkg.Workbook.Worksheets.Name | Should -Contain 'Waypoints'
        $pkg.Workbook.Worksheets.Name | Should -Contain 'Restrictions'
        $pkg.Workbook.Worksheets[1].Name | Should -Be 'Route Card'
        $ws.PrinterSettings.Orientation | Should -Be 'Landscape'
    }

    It 'refuses to overwrite without -Force' {
        { New-RouteCardXlsx -Path $script:Sample -OutputPath $script:Out } | Should -Throw '*-Force*'
        { New-RouteCardXlsx -Path $script:Sample -OutputPath $script:Out -Force } | Should -Not -Throw
    }
}

Describe 'ConvertFrom-RouteCardXlsx' {
    It 'round-trips the card back to JSON' {
        $card = ConvertFrom-RouteCardXlsx -Path $script:Out | ConvertFrom-Json
        $orig = Get-Content $script:Sample -Raw | ConvertFrom-Json
        $card.schemaVersion | Should -Be 2
        $card.instructions.movTo | Should -Be $orig.instructions.movTo
        $card.instructions.timeDateSp | Should -Be $orig.instructions.timeDateSp
        $card.instructions.convoyFlagRear | Should -Be 'Green Flag'
        $card.instructions.contactTelTpComd | Should -Be $orig.instructions.contactTelTpComd
        $card.instructions.criticalPts | Should -Be ($orig.instructions.criticalPts -replace "`r", '')
        $card.serials.Count | Should -Be 3
        $card.serials[2].route | Should -Be $orig.serials[2].route
        $card.serials[0].ser | Should -Be 1
        $card.waypoints.Count | Should -Be 2
        $card.waypoints[1].name | Should -Be 'Andover'
    }
}

Describe 'Schema version 1 cards' {
    It 'migrates old instruction keys and fills missing defaults' {
        $v1 = [ordered]@{
            schemaVersion = 1
            instructions  = [ordered]@{
                movFrom = 'A'; date = '2026-10-12'; timePastSp = '0800'
                distBetweenVehsDay = '120 m'; distBetweenVehsNight = '60 m'; convoyFlags = 'Blue front'; contactTel = '01234'
            }
            serials       = @()
        }
        $json = Join-Path $TestDrive 'v1.json'
        $v1 | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $json -Encoding UTF8
        $xlsx = New-RouteCardXlsx -Path $json -OutputPath (Join-Path $TestDrive 'v1.xlsx')
        $card = ConvertFrom-RouteCardXlsx -Path $xlsx.FullName | ConvertFrom-Json
        $card.instructions.timeDateSp | Should -Be '0800 12/10/2026'
        $card.instructions.vehDistDayARoads | Should -Be '120 m'
        $card.instructions.vehDistNightMway | Should -Be '60 m'
        $card.instructions.convoyFlagFront | Should -Be 'Blue front'
        $card.instructions.convoyFlagRear | Should -BeNullOrEmpty
        $card.instructions.contactTelSqnOps | Should -Be '01234'
        $card.instructions.lts | Should -Be 'Dipped'
        $card.instructions.tfc | Should -Be 'Varying'
    }
}
