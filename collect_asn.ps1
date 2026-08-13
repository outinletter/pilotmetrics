# ASN (Aviation Safety Network) via flightCrashData2026 GitHub mirror - download and ingest
# Filters for commercial/passenger-relevant nature server-side (see upsertAsnEvent)
# NOTE: source repo has no LICENSE file; data originates from aviation-safety.net scraping.
#       Used here for internal, non-public pilot-briefing research per explicit user decision.

$BASE       = "https://pilot-briefing.outinletter.workers.dev"
$BATCH_SZ   = 20
$DELAY_SEC  = 3
$PROGRESS_LOG = "$PSScriptRoot\asn_progress.log"
$YEARS      = 2010..2025

$LFS_BASE = "https://media.githubusercontent.com/media/Amineharrabi/flightCrashData2026/main/ASN_scraping"
$TMP = $env:TEMP
if (-not $TMP) { $TMP = [System.IO.Path]::GetTempPath() }

function Post-Batch {
    param($batch)
    try {
        $json = @{ records = $batch } | ConvertTo-Json -Depth 5 -Compress
        $resp = Invoke-RestMethod -Uri "$BASE/api/ops-intel/ingest-asn" -Method POST -Body $json -ContentType "application/json" -TimeoutSec 120
        return $resp
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match "503") { return "503" }
        return $null
    }
}

$done = @{}
if (Test-Path $PROGRESS_LOG) {
    Get-Content $PROGRESS_LOG | ForEach-Object { $done[$_.Trim()] = $true }
    Write-Host "[Resume] $($done.Count) accidents already processed" -ForegroundColor DarkCyan
}

Write-Host "`n[ASN] Starting ($($YEARS.Count) years)" -ForegroundColor Cyan
$totalChecked = 0; $totalCreated = 0

foreach ($year in $YEARS) {
    $yearFile = Join-Path $TMP "asn_$year.json"
    if (-not (Test-Path $yearFile) -or (Get-Item $yearFile).Length -lt 1000) {
        Write-Host "  Downloading $year..." -NoNewline
        try {
            Invoke-WebRequest -Uri "$LFS_BASE/aviation_accidents_$year.json" -OutFile $yearFile -TimeoutSec 120
            Write-Host " done ($([Math]::Round((Get-Item $yearFile).Length/1MB,1)) MB)" -ForegroundColor Green
        } catch {
            Write-Host " FAILED: $($_.Exception.Message)" -ForegroundColor Red
            continue
        }
    } else {
        Write-Host "  Using cached $year ($([Math]::Round((Get-Item $yearFile).Length/1MB,1)) MB)" -ForegroundColor DarkGray
    }

    $yearData = Get-Content $yearFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $accidents = $yearData.accidents
    Write-Host "  [$year] $($accidents.Count) accidents in file"

    $pending = [System.Collections.Generic.List[object]]::new()
    foreach ($a in $accidents) {
        if (-not $a.url) { continue }
        if ($done.ContainsKey($a.url)) { continue }
        $pending.Add($a)
    }
    Write-Host "  [$year] Pending: $($pending.Count)"

    $consec503 = 0
    for ($i = 0; $i -lt $pending.Count; $i += $BATCH_SZ) {
        $end = [Math]::Min($i + $BATCH_SZ - 1, $pending.Count - 1)
        $batch = $pending[$i..$end]

        if ($consec503 -ge 5) {
            Write-Host "`n  [rate-limit] Waiting 5 min..." -ForegroundColor Magenta
            Start-Sleep -Seconds 300
            $consec503 = 0
        }

        $r = Post-Batch $batch
        if ($r -eq "503") {
            $consec503++
            Write-Host "  Batch @$i... 503 (consec=$consec503)" -ForegroundColor Yellow
            Start-Sleep -Seconds 30
            continue
        }
        if ($r -ne $null) {
            $c = if ($r.PSObject.Properties["created"]) { [int]$r.created } else { 0 }
            $chk = if ($r.PSObject.Properties["checked"]) { [int]$r.checked } else { $batch.Count }
            $totalChecked += $chk; $totalCreated += $c
            Write-Host "  Batch @$i ($($i+1)/$($pending.Count))... chk=$chk new=$c [total=$totalCreated]"
            foreach ($rec in $batch) { Add-Content $PROGRESS_LOG $rec.url }
        } else {
            Write-Host "  Batch @$i... FAILED (skipped, one-by-one)" -ForegroundColor Yellow
            foreach ($rec in $batch) {
                $r2 = Post-Batch @($rec)
                if ($r2 -ne $null) { Add-Content $PROGRESS_LOG $rec.url }
            }
        }
        Start-Sleep -Seconds $DELAY_SEC
    }
}

Write-Host "`n[Done] ASN collection complete" -ForegroundColor Cyan
Write-Host "  Checked: $totalChecked  Created: $totalCreated"
Write-Host "Done!"
