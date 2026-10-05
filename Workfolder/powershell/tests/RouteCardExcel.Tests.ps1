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
        $ws.Cells['A4'].Text | Should -Be '1. Mov from'
        $ws.Cells['C4'].Text | Should -Be 'Tidworth'
        $ws.Cells['C6'].Text | Should -Be '12/10/2026'
        $ws.Cells['A12'].Text | Should -Be '9. Dist between vehs'
        $ws.Cells['C14'].Text | Should -Be '50 m'
        $ws.Cells['E11'].Text | Should -Be '17. Critical pts'
        $ws.Cells['F11'].Text | Should -Match 'Height limit'
    }

    It 'writes the route details table with lettered columns' {
        ($ws.Cells['A17:H17'] | ForEach-Object Text) -join '|' | Should -Be 'Ser|From|To|Route|Dir|Distance|Total Distance|Total Time'
        ($ws.Cells['A18:H18'] | ForEach-Object Text) -join '' | Should -Be '(a)(b)(c)(d)(e)(f)(g)(h)'
        $ws.Cells['A19'].Value | Should -Be 1
        $ws.Cells['D21'].Text | Should -Be 'Weyhill Road → Western Avenue'
        $ws.Cells['G21'].Text | Should -Be '16.3 km'
        $ws.Cells['H21'].Text | Should -Be '00:24'
        $ws.Cells['A22'].Text | Should -BeNullOrEmpty
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
        $card.schemaVersion | Should -Be 1
        $card.instructions.movTo | Should -Be $orig.instructions.movTo
        $card.instructions.date | Should -Be $orig.instructions.date
        $card.instructions.criticalPts | Should -Be ($orig.instructions.criticalPts -replace "`r", '')
        $card.serials.Count | Should -Be 3
        $card.serials[2].route | Should -Be $orig.serials[2].route
        $card.serials[0].ser | Should -Be 1
        $card.waypoints.Count | Should -Be 2
        $card.waypoints[1].name | Should -Be 'Andover'
    }
}
