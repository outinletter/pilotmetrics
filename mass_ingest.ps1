$API_BASE = "http://localhost:8787/api/admin/collect-step" # Update with your production URL if needed
$STATES = @("KOR", "USA", "JPN", "CHN", "FRA", "CAN", "AUS", "UK", "GER", "BRA", "IND", "MEX", "ARE", "SGP", "HKG", "ITA", "ESP", "CHE", "NLD", "RUS")
$YEAR_START = 2000
$YEAR_END = 2026

Write-Host "Starting Mass Ingestion for ICAO iSTARS..." -ForegroundColor Cyan

foreach ($year in $YEAR_START..$YEAR_END) {
    foreach ($state in $STATES) {
        Write-Host "Collecting $state for year $year..."
        $body = @{
            source = "icao"
            state = $state
            year = [int]$year
        } | ConvertTo-Json

        try {
            $response = Invoke-RestMethod -Uri $API_BASE -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60
            Write-Host "  Success: $($response.checked) checked, $($response.created) created" -ForegroundColor Green
        } catch {
            Write-Host "  Error collecting $state $year: $_" -ForegroundColor Red
        }
        Start-Sleep -Seconds 1 # Avoid overwhelming the worker/API
    }
}

Write-Host "`nStarting Ingestion for ARAIB Korea (100 pages)..." -ForegroundColor Cyan
$bodyAraib = @{
    source = "araib"
    max_pages = 100
} | ConvertTo-Json
try {
    $resAraib = Invoke-RestMethod -Uri $API_BASE -Method Post -Body $bodyAraib -ContentType "application/json" -TimeoutSec 300
    Write-Host "  Success: $($resAraib.checked) checked, $($resAraib.created) created" -ForegroundColor Green
} catch {
    Write-Host "  Error ARAIB: $_" -ForegroundColor Red
}

Write-Host "`nStarting Ingestion for JTSB Japan..." -ForegroundColor Cyan
$bodyJtsb = @{
    source = "jtsb"
} | ConvertTo-Json
try {
    $resJtsb = Invoke-RestMethod -Uri $API_BASE -Method Post -Body $bodyJtsb -ContentType "application/json" -TimeoutSec 300
    Write-Host "  Success: $($resJtsb.checked) checked, $($resJtsb.created) created" -ForegroundColor Green
} catch {
    Write-Host "  Error JTSB: $_" -ForegroundColor Red
}

Write-Host "`nMass Ingestion Complete." -ForegroundColor Cyan
