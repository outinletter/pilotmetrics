# PilotBriefing Mass Ingestion Orchestrator
# This script bypasses Cloudflare Workers' 30s timeout by splitting requests by year/state.

$API_BASE = "https://pilot-briefing.outinletter.workers.dev/api/admin/collect-step"
$STATES = @("KOR", "USA", "JPN", "CHN", "FRA", "CAN", "AUS", "UK", "GER", "BRA", "IND", "MEX", "ARE", "SGP", "HKG", "ITA", "ESP", "CHE", "NLD", "RUS")
$START_YEAR = 2000
$CURRENT_YEAR = [DateTime]::Now.Year

Write-Host "??Starting Mass Ingestion for PilotBriefing..." -ForegroundColor Cyan

# 1. ARAIB (Korea) - Multiple pages
Write-Host "`n[1/3] Ingesting ARAIB (Korea) Reports..." -ForegroundColor Yellow
$araibBody = @{ source = "araib"; max_pages = 50 } | ConvertTo-Json
Invoke-RestMethod -Uri $API_BASE -Method Post -Body $araibBody -ContentType "application/json"
Write-Host "?? ARAIB scan initiated." -ForegroundColor Green

# 2. JTSB (Japan) - Yearly archives
Write-Host "`n[2/3] Ingesting JTSB (Japan) Reports..." -ForegroundColor Yellow
$jtsbBody = @{ source = "jtsb" } | ConvertTo-Json
Invoke-RestMethod -Uri $API_BASE -Method Post -Body $jtsbBody -ContentType "application/json"
Write-Host "?? JTSB scan initiated." -ForegroundColor Green

# 3. ICAO iSTARS - Multi-state, Multi-year (The big one)
Write-Host "`n[3/3] Ingesting ICAO iSTARS (Global)..." -ForegroundColor Yellow
foreach ($state in $STATES) {
    Write-Host " -> Processing $state..." -ForegroundColor Gray
    foreach ($year in $START_YEAR..$CURRENT_YEAR) {
        $icaoBody = @{ source = "icao"; state = $state; year = $year } | ConvertTo-Json
        try {
            $res = Invoke-RestMethod -Uri $API_BASE -Method Post -Body $icaoBody -ContentType "application/json"
            Write-Host "    - ${year}: Checked $($res.checked), Created $($res.created)" -ForegroundColor DarkGray
        } catch {
            Write-Host "    - ${year}: FAILED ($($_.Exception.Message))" -ForegroundColor Red
        }
        # Small delay to avoid rate limiting
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "`n?Mass Ingestion Complete! Check your Dashboard for updated stats." -ForegroundColor Cyan
