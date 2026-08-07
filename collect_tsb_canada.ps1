# TSB Canada Aviation Occurrence - CSV download and ingest
# Filters for CAR 705/704 (commercial aviation) from 2000 onward
# On batch 400 error: retries records one by one to skip bad records

$BASE       = "https://pilot-briefing.outinletter.workers.dev"
$BATCH_SZ   = 20
$START_YEAR = 2000
$DELAY_SEC  = 3
$PROGRESS_LOG = "$PSScriptRoot\tsb_progress.log"

$OCC_URL = "https://www.tsb.gc.ca/sites/default/files/stats/ASISdb_MDOTW_VW_OCCURRENCE_PUBLIC.csv"
$AC_URL  = "https://www.tsb.gc.ca/sites/default/files/stats/ASISdb_MDOTW_VW_AIRCRAFT_PUBLIC.csv"

$TMP = $env:TEMP
if (-not $TMP) { $TMP = [System.IO.Path]::GetTempPath() }
$OCC_FILE = Join-Path $TMP "tsb_occurrence.csv"
$AC_FILE  = Join-Path $TMP "tsb_aircraft.csv"

function Download-File {
    param($url, $dest)
    Write-Host "  Downloading: $url" -ForegroundColor DarkCyan
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "PilotMetrics/1.0")
    try {
        $wc.DownloadFile($url, $dest)
        $sz = [Math]::Round((Get-Item $dest).Length / 1MB, 1)
        Write-Host "  Done: $sz MB" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    } finally { $wc.Dispose() }
}

function Import-TsbCsv {
    param($path)
    $content = Get-Content $path -Raw -Encoding UTF8
    if ($content.Length -gt 0 -and [int][char]$content[0] -eq 65279) {
        $content = $content.Substring(1)
    }
    $tmpFile = $path + ".nobom.csv"
    Set-Content $tmpFile -Value $content -Encoding UTF8
    $data = Import-Csv $tmpFile -Encoding UTF8
    Remove-Item $tmpFile -ErrorAction SilentlyContinue
    return $data
}

function CleanStr {
    param($val, $maxLen = 800)
    if ($val -eq $null) { return "" }
    $s = $val.ToString().Trim()
    if ($s.StartsWith('"') -and $s.EndsWith('"') -and $s.Length -ge 2) {
        $s = $s.Substring(1, $s.Length - 2)
    }
    # Remove control characters (0x00-0x1F except tab/newline), also strip quotes inside
    $s = [System.Text.RegularExpressions.Regex]::Replace($s, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    # Normalize quotes to avoid JSON breakage
    $s = $s.Replace('"', "'")
    if ($s.Length -gt $maxLen) { $s = $s.Substring(0, $maxLen) }
    return $s
}

# Returns $null on success-or-failure-we-want-to-skip, "503" on rate limit
function Post-Batch {
    param($batch)
    try {
        $json = @{ records = $batch } | ConvertTo-Json -Depth 5 -Compress
        $resp = Invoke-RestMethod -Uri "$BASE/api/ops-intel/ingest-tsb" -Method POST -Body $json -ContentType "application/json" -TimeoutSec 120
        return $resp
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match "503") { return "503" }
        return $null
    }
}

# 1. Download CSVs (reuse cache if fresh)
Write-Host "`n[TSB Canada] Starting" -ForegroundColor Cyan

$occOk = $true; $acOk = $true
if (-not (Test-Path $OCC_FILE) -or (Get-Item $OCC_FILE).Length -lt 1000000) {
    $occOk = Download-File $OCC_URL $OCC_FILE
} else {
    Write-Host "  Using cached occurrence CSV ($([Math]::Round((Get-Item $OCC_FILE).Length/1MB,1)) MB)" -ForegroundColor DarkGray
}
if (-not (Test-Path $AC_FILE) -or (Get-Item $AC_FILE).Length -lt 1000000) {
    $acOk = Download-File $AC_URL $AC_FILE
} else {
    Write-Host "  Using cached aircraft CSV ($([Math]::Round((Get-Item $AC_FILE).Length/1MB,1)) MB)" -ForegroundColor DarkGray
}
if (-not $occOk -or -not $acOk) { Write-Host "[ERROR] Download failed." -ForegroundColor Red; exit 1 }

# 2. Load progress log (already-processed OccNo)
$done = @{}
if (Test-Path $PROGRESS_LOG) {
    Get-Content $PROGRESS_LOG | ForEach-Object { $done[$_.Trim()] = $true }
    Write-Host "[Resume] $($done.Count) occurrences already processed" -ForegroundColor DarkCyan
}

# 3. Parse CSVs
Write-Host "`n[Parse] Loading Occurrence CSV..." -ForegroundColor Cyan
$occRows = Import-TsbCsv $OCC_FILE
Write-Host "  Total: $($occRows.Count) rows" -ForegroundColor DarkCyan

Write-Host "[Parse] Loading Aircraft CSV..." -ForegroundColor Cyan
$acRows = Import-TsbCsv $AC_FILE
Write-Host "  Total: $($acRows.Count) rows" -ForegroundColor DarkCyan

$acMap = @{}
foreach ($ac in $acRows) {
    $key = (CleanStr $ac.OccNo 50)
    if ($key -and -not $acMap.ContainsKey($key)) { $acMap[$key] = $ac }
}
Write-Host "[Join] Aircraft map: $($acMap.Count) entries" -ForegroundColor DarkCyan

# 4. Filter + Map
Write-Host "`n[Filter] Extracting commercial aviation (705/704)..." -ForegroundColor Cyan
$records = [System.Collections.Generic.List[hashtable]]::new()

foreach ($occ in $occRows) {
    $occNo = CleanStr $occ.OccNo 50
    if (-not $occNo) { continue }
    if ($done.ContainsKey($occNo)) { continue }

    $occDateRaw = CleanStr $occ.OccDate 30
    if ($occDateRaw.Length -lt 4) { continue }
    $occDateStr = $occDateRaw.Substring(0, [Math]::Min(10, $occDateRaw.Length))
    $year = 0
    if (-not [int]::TryParse($occDateStr.Substring(0,4), [ref]$year) -or $year -lt $START_YEAR) { continue }

    $ac = if ($acMap.ContainsKey($occNo)) { $acMap[$occNo] } else { $null }
    $carsSubpart   = if ($ac) { CleanStr $ac.CarsSubpartID_DisplayEng   50 } else { "" }
    $operationType = if ($ac) { CleanStr $ac.OperationTypeID_DisplayEng 50 } else { "" }

    if (-not (($carsSubpart -match '705|704') -or ($operationType -match 'AIR TRANSPORT'))) { continue }

    $fatalCount = 0; $seriousCount = 0; $minorCount = 0
    [int]::TryParse((CleanStr $occ.TotalFatalCount   10), [ref]$fatalCount)   | Out-Null
    [int]::TryParse((CleanStr $occ.TotalSeriousCount 10), [ref]$seriousCount) | Out-Null
    [int]::TryParse((CleanStr $occ.TotalMinorCount   10), [ref]$minorCount)   | Out-Null

    $records.Add(@{
        occNo         = $occNo
        occDate       = $occDateStr
        occTime       = CleanStr $occ.OccTime 10
        icao          = CleanStr $occ.ICAO 10
        occType       = CleanStr $occ.OccTypeID_DisplayEng 30
        occClass      = CleanStr $occ.OccClassID_DisplayEng 30
        country       = CleanStr $occ.CountryID_DisplayEng 50
        province      = CleanStr $occ.ProvinceID_DisplayEng 50
        summary       = CleanStr $occ.Summary 800
        commonName    = CleanStr $occ.CommonName 200
        fatalCount    = $fatalCount
        seriousCount  = $seriousCount
        minorCount    = $minorCount
        lightCond     = CleanStr $occ.LightCondID_DisplayEng 40
        operator      = if ($ac) { CleanStr $ac.OrganizationID_DisplayEng       80 } else { "" }
        aircraftType  = if ($ac) { CleanStr $ac.AircraftCommonNameID_DisplayEng 80 } else { "" }
        carsSubpart   = $carsSubpart
        operationType = $operationType
        flightNo      = if ($ac) { CleanStr $ac.FlightNo               20 } else { "" }
        depIcao       = if ($ac) { CleanStr $ac.ICAODepart             10 } else { "" }
        destIcao      = if ($ac) { CleanStr $ac.ICAODestination        10 } else { "" }
        flightPhase   = if ($ac) { CleanStr $ac.FlightPhaseID_DisplayEng 40 } else { "" }
        damageLevel   = if ($ac) { CleanStr $ac.DamageLevelID_DisplayEng 40 } else { "" }
    })
}

Write-Host "  Pending: $($records.Count) (skipped $($done.Count) already done)" -ForegroundColor Green

# 5. Batch upload
Write-Host "`n[Upload] $BASE/api/ops-intel/ingest-tsb" -ForegroundColor Cyan
$totalChecked = 0; $totalCreated = 0; $batchNum = 0; $consec503 = 0

for ($i = 0; $i -lt $records.Count; $i += $BATCH_SZ) {
    $batchNum++
    $end   = [Math]::Min($i + $BATCH_SZ - 1, $records.Count - 1)
    $batch = $records[$i..$end]
    $rangeEnd = [Math]::Min($i + $BATCH_SZ, $records.Count)
    Write-Host "  Batch $batchNum ($($i+1)/$($records.Count))..." -NoNewline

    # Rate limit guard
    if ($consec503 -ge 5) {
        Write-Host "`n  [rate-limit] Waiting 5 min..." -ForegroundColor Magenta
        Start-Sleep -Seconds 300
        $consec503 = 0
    }

    $r = Post-Batch $batch

    if ($r -eq "503") {
        $consec503++
        Write-Host " 503 (consec=$consec503)" -ForegroundColor Yellow
        Start-Sleep -Seconds 30
        continue
    }

    if ($r -ne $null) {
        # Batch success
        $c  = if ($r.PSObject.Properties["created"]) { [int]$r.created } else { 0 }
        $ch = if ($r.PSObject.Properties["checked"]) { [int]$r.checked } else { 0 }
        $totalChecked += $ch; $totalCreated += $c; $consec503 = 0
        Write-Host " chk=$ch new=$c [total=$totalCreated]" -ForegroundColor Green
        # Mark all in batch as done
        foreach ($rec in $batch) { Add-Content $PROGRESS_LOG $rec.occNo }
    } else {
        # Batch 400 error: retry one by one
        Write-Host " 400-fallback (one-by-one)..." -NoNewline
        $singleOk = 0; $singleFail = 0
        foreach ($rec in $batch) {
            $sr = Post-Batch @($rec)
            if ($sr -ne $null -and $sr -ne "503") {
                $c = if ($sr.PSObject.Properties["created"]) { [int]$sr.created } else { 0 }
                $totalCreated += $c; $singleOk++
                Add-Content $PROGRESS_LOG $rec.occNo
            } else {
                $singleFail++
            }
            Start-Sleep -Milliseconds 300
        }
        $totalChecked += $batch.Count; $consec503 = 0
        Write-Host " ok=$singleOk skip=$singleFail [total=$totalCreated]" -ForegroundColor Yellow
    }

    Start-Sleep -Seconds $DELAY_SEC
}

# 6. LLM enrichment
if ($totalCreated -gt 0) {
    Write-Host "`n[LLM] Enriching $totalCreated new records..." -ForegroundColor Cyan
    for ($j = 1; $j -le 30; $j++) {
        try {
            $r = Invoke-RestMethod -Uri "$BASE/api/ops-intel/enrich-llm" -Method POST -Body '{"limit":30}' -ContentType "application/json" -TimeoutSec 120
            $proc = if ($r.PSObject.Properties["processed"]) { [int]$r.processed } else { 0 }
            $upd  = if ($r.PSObject.Properties["updated"])   { [int]$r.updated }   else { 0 }
            Write-Host "  Batch $j processed=$proc updated=$upd" -ForegroundColor Green
            if ($proc -eq 0) { break }
        } catch { Write-Host "  LLM batch $j failed" -ForegroundColor Yellow }
        Start-Sleep -Seconds 3
    }
}

# 7. Final stats
try { $stats = Invoke-RestMethod "$BASE/api/stats" -TimeoutSec 30 } catch { $stats = $null }
Write-Host "`n[Done] TSB Canada collection complete" -ForegroundColor Cyan
Write-Host "  Processed: $totalChecked  New: $totalCreated"
if ($stats) { Write-Host "  DB total: $($stats.total_events) events ($($stats.year_min)-$($stats.year_max))" }
Write-Host "Done!" -ForegroundColor Green
