# TSB Canada Aviation Occurrence - CSV download and ingest
# Filters for CAR 705/704 (commercial aviation) from 2000 onward

$BASE     = "https://pilot-briefing.outinletter.workers.dev"
$BATCH_SZ = 20   # smaller batches = fewer writes per request = less rate limiting
$START_YEAR = 2000
$DELAY_SEC = 5   # seconds between batches

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
        Write-Host "  Done: $sz MB -> $dest" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    } finally {
        $wc.Dispose()
    }
}

function Import-TsbCsv {
    param($path)
    $content = Get-Content $path -Raw -Encoding UTF8
    # Remove BOM
    if ($content.StartsWith([char]0xFEFF)) { $content = $content.Substring(1) }
    $tmpFile = $path + ".nobom.csv"
    Set-Content $tmpFile -Value $content -Encoding UTF8
    $data = Import-Csv $tmpFile -Encoding UTF8
    Remove-Item $tmpFile -ErrorAction SilentlyContinue
    return $data
}

function Post-Api {
    param($uri, $bodyObj)
    try {
        $json = $bodyObj | ConvertTo-Json -Depth 5 -Compress
        $resp = Invoke-RestMethod -Uri $uri -Method POST -Body $json -ContentType "application/json" -TimeoutSec 120
        return $resp
    } catch {
        Write-Host "  API error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function SafeStr {
    param($val)
    if ($val -eq $null) { return "" }
    return ($val.ToString()).Trim().Trim('"')
}

# ── 1. Download CSVs ──────────────────────────────────────────────────────────
Write-Host "`n[TSB Canada] Starting CSV download" -ForegroundColor Cyan

$occOk = Download-File $OCC_URL $OCC_FILE
$acOk  = Download-File $AC_URL  $AC_FILE

if (-not $occOk -or -not $acOk) {
    Write-Host "[ERROR] CSV download failed." -ForegroundColor Red
    exit 1
}

# ── 2. Parse CSVs ─────────────────────────────────────────────────────────────
Write-Host "`n[Parse] Loading Occurrence CSV..." -ForegroundColor Cyan
$occRows = Import-TsbCsv $OCC_FILE
Write-Host "  Total: $($occRows.Count) rows" -ForegroundColor DarkCyan

Write-Host "[Parse] Loading Aircraft CSV..." -ForegroundColor Cyan
$acRows = Import-TsbCsv $AC_FILE
Write-Host "  Total: $($acRows.Count) rows" -ForegroundColor DarkCyan

# Build aircraft lookup by OccNo (first aircraft per occurrence)
$acMap = @{}
foreach ($ac in $acRows) {
    $key = (SafeStr $ac.OccNo)
    if ($key -and -not $acMap.ContainsKey($key)) {
        $acMap[$key] = $ac
    }
}
Write-Host "[Join] Aircraft map: $($acMap.Count) entries" -ForegroundColor DarkCyan

# ── 3. Filter + Map ───────────────────────────────────────────────────────────
Write-Host "`n[Filter] Extracting commercial aviation (705/704)..." -ForegroundColor Cyan

$records = [System.Collections.Generic.List[hashtable]]::new()

foreach ($occ in $occRows) {
    $occNo = SafeStr $occ.OccNo
    if (-not $occNo) { continue }

    $occDateRaw = SafeStr $occ.OccDate
    if (-not $occDateRaw -or $occDateRaw.Length -lt 4) { continue }
    $occDateStr = $occDateRaw.Substring(0, [Math]::Min(10, $occDateRaw.Length))

    $yearStr = $occDateStr.Substring(0, 4)
    $year = 0
    if (-not [int]::TryParse($yearStr, [ref]$year)) { continue }
    if ($year -lt $START_YEAR) { continue }

    $ac = $null
    if ($acMap.ContainsKey($occNo)) { $ac = $acMap[$occNo] }

    $carsSubpart   = if ($ac) { SafeStr $ac.CarsSubpartID_DisplayEng }   else { "" }
    $operationType = if ($ac) { SafeStr $ac.OperationTypeID_DisplayEng } else { "" }

    $isCommercial = ($carsSubpart -match '705|704') -or ($operationType -match 'AIR TRANSPORT|TRANSPORT')
    if (-not $isCommercial) { continue }

    $summary = SafeStr $occ.Summary
    if ($summary.Length -gt 800) { $summary = $summary.Substring(0, 800) }

    $fatalCount   = 0; [int]::TryParse((SafeStr $occ.TotalFatalCount),   [ref]$fatalCount)   | Out-Null
    $seriousCount = 0; [int]::TryParse((SafeStr $occ.TotalSeriousCount), [ref]$seriousCount) | Out-Null
    $minorCount   = 0; [int]::TryParse((SafeStr $occ.TotalMinorCount),   [ref]$minorCount)   | Out-Null

    $operator     = if ($ac) { SafeStr $ac.OrganizationID_DisplayEng }         else { "" }
    $aircraftType = if ($ac) { SafeStr $ac.AircraftCommonNameID_DisplayEng }   else { "" }
    $flightNo     = if ($ac) { SafeStr $ac.FlightNo }                          else { "" }
    $depIcao      = if ($ac) { SafeStr $ac.ICAODepart }                        else { "" }
    $destIcao     = if ($ac) { SafeStr $ac.ICAODestination }                   else { "" }
    $flightPhase  = if ($ac) { SafeStr $ac.FlightPhaseID_DisplayEng }          else { "" }
    $damageLevel  = if ($ac) { SafeStr $ac.DamageLevelID_DisplayEng }          else { "" }

    $rec = @{
        occNo        = $occNo
        occDate      = $occDateStr
        occTime      = SafeStr $occ.OccTime
        icao         = SafeStr $occ.ICAO
        occType      = SafeStr $occ.OccTypeID_DisplayEng
        occClass     = SafeStr $occ.OccClassID_DisplayEng
        country      = SafeStr $occ.CountryID_DisplayEng
        province     = SafeStr $occ.ProvinceID_DisplayEng
        summary      = $summary
        commonName   = SafeStr $occ.CommonName
        fatalCount   = $fatalCount
        seriousCount = $seriousCount
        minorCount   = $minorCount
        lightCond    = SafeStr $occ.LightCondID_DisplayEng
        operator     = $operator
        aircraftType = $aircraftType
        carsSubpart  = $carsSubpart
        operationType = $operationType
        flightNo     = $flightNo
        depIcao      = $depIcao
        destIcao     = $destIcao
        flightPhase  = $flightPhase
        damageLevel  = $damageLevel
    }
    $records.Add($rec)
}

Write-Host "  Commercial aviation records: $($records.Count) (from year $START_YEAR)" -ForegroundColor Green

# ── 4. Batch upload to Worker API ─────────────────────────────────────────────
Write-Host "`n[Upload] $BASE/api/ops-intel/ingest-tsb" -ForegroundColor Cyan

$totalChecked = 0; $totalCreated = 0; $batchNum = 0
$consec503 = 0

for ($i = 0; $i -lt $records.Count; $i += $BATCH_SZ) {
    $batchNum++
    $end = [Math]::Min($i + $BATCH_SZ - 1, $records.Count - 1)
    $batch = $records[$i..$end]
    $rangeEnd = [Math]::Min($i + $BATCH_SZ, $records.Count)
    Write-Host "  Batch $batchNum ($($i+1) to $rangeEnd / $($records.Count))..." -NoNewline

    # 503 연속 발생 시 5분 대기
    if ($consec503 -ge 5) {
        Write-Host "`n  [rate-limit] Waiting 5 min..." -ForegroundColor Magenta
        Start-Sleep -Seconds 300
        $consec503 = 0
    }

    # 최대 3회 재시도
    $r = $null; $attempt = 0
    while ($r -eq $null -and $attempt -lt 3) {
        if ($attempt -eq 1) { Write-Host " retry(30s)..." -NoNewline; Start-Sleep -Seconds 30 }
        if ($attempt -eq 2) { Write-Host " retry(60s)..." -NoNewline; Start-Sleep -Seconds 60 }
        $attempt++
        $r = Post-Api "$BASE/api/ops-intel/ingest-tsb" @{ records = $batch }
    }

    if ($r -ne $null) {
        $c  = if ($r.PSObject.Properties["created"]) { $r.created } else { 0 }
        $ch = if ($r.PSObject.Properties["checked"]) { $r.checked } else { 0 }
        $totalChecked += $ch; $totalCreated += $c
        $consec503 = 0
        Write-Host " chk=$ch new=$c [total=$totalCreated]" -ForegroundColor Green
    } else {
        $consec503++
        Write-Host " FAILED (consec503=$consec503)" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds $DELAY_SEC
}

# ── 5. LLM enrichment for new records ────────────────────────────────────────
if ($totalCreated -gt 0) {
    Write-Host "`n[LLM] Enriching $totalCreated new records..." -ForegroundColor Cyan
    for ($i = 1; $i -le 20; $i++) {
        $r = Post-Api "$BASE/api/ops-intel/enrich-llm" @{ limit = 30 }
        if ($r -ne $null) {
            $proc = if ($r.PSObject.Properties["processed"]) { $r.processed } else { 0 }
            $upd  = if ($r.PSObject.Properties["updated"])   { $r.updated }   else { 0 }
            Write-Host "  Batch $i processed=$proc updated=$upd" -ForegroundColor Green
            if ($proc -eq 0) { break }
        }
        Start-Sleep -Seconds 3
    }
}

# ── 6. Final stats ────────────────────────────────────────────────────────────
try {
    $stats = Invoke-RestMethod "$BASE/api/stats" -TimeoutSec 30
} catch { $stats = $null }

Write-Host "`n[Done] TSB Canada collection complete" -ForegroundColor Cyan
Write-Host "  Processed: $totalChecked  New: $totalCreated"
if ($stats) {
    Write-Host "  DB total: $($stats.total_events) events ($($stats.year_min)-$($stats.year_max))"
}
Write-Host "Done!" -ForegroundColor Green
