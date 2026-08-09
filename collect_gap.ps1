#!/usr/bin/env pwsh
# METAR Backfill — Iowa State Mesonet API
# Processes events with airport_icao but missing wind/weather data
# Run: .\collect_gap.ps1 [-BatchSize 50] [-MaxBatches 999] [-DryRun]

param(
    [int]$BatchSize = 50,
    [int]$MaxBatches = 999,
    [switch]$DryRun
)

$endpoint = "https://pilot-briefing.outinletter.workers.dev/api/admin/backfill-metar"
$totalProcessed = 0
$totalUpdated = 0
$totalSkipped = 0
$batch = 0
$remaining = 99999

Write-Host "=== METAR Backfill ===" -ForegroundColor Cyan
Write-Host "Endpoint : $endpoint"
Write-Host "BatchSize: $BatchSize  MaxBatches: $MaxBatches  DryRun: $DryRun"
Write-Host ""

while ($remaining -gt 0 -and $batch -lt $MaxBatches) {
    $batch++
    $body = @{ limit = $BatchSize; dry_run = $DryRun.IsPresent } | ConvertTo-Json

    try {
        $resp = Invoke-RestMethod -Uri $endpoint -Method Post `
            -ContentType "application/json" -Body $body -TimeoutSec 60

        $remaining  = [int]$resp.remaining
        $totalProcessed += [int]$resp.processed
        $totalUpdated   += [int]$resp.updated
        $totalSkipped   += [int]$resp.skipped

        $pct = if ($remaining + $totalProcessed -gt 0) {
            [math]::Round($totalUpdated / ($totalUpdated + $remaining + $totalSkipped) * 100, 1)
        } else { 100 }

        Write-Host ("[Batch {0,3}] processed={1} updated={2} skipped={3} remaining={4} ({5}%)" -f `
            $batch, $resp.processed, $resp.updated, $resp.skipped, $remaining, $pct) `
            -ForegroundColor $(if ($resp.updated -gt 0) { "Green" } else { "Yellow" })

        if ($resp.errors -and $resp.errors.Count -gt 0) {
            foreach ($e in $resp.errors) { Write-Host "  ERROR: $e" -ForegroundColor Red }
        }

        if ($resp.processed -lt $BatchSize -and $remaining -le 0) { break }

        # Mesonet rate-limit: 1 req/s per station is safe; we batch 50 events
        # Each event hits Mesonet once, so 50 requests per batch → sleep 3s between batches
        Start-Sleep -Seconds 3

    } catch {
        Write-Host "HTTP error: $_" -ForegroundColor Red
        Start-Sleep -Seconds 10
    }
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Batches : $batch"
Write-Host "Updated : $totalUpdated"
Write-Host "Skipped : $totalSkipped"
Write-Host "Remaining: $remaining"
