# PilotMetrics — NTSB CAROL 전체 수집 2000-2025 (월별)
$BASE  = "https://pilot-briefing.outinletter.workers.dev"
$DELAY = 15   # 요청 간 대기(초)

function Invoke-Api {
    param($uri, $method = "GET", $body = $null)
    $result = $null; $attempts = 0
    while ($result -eq $null -and $attempts -lt 3) {
        if ($attempts -eq 1) { Write-Host " retry(30s)..." -NoNewline; Start-Sleep -Seconds 30 }
        if ($attempts -eq 2) { Write-Host " retry(60s)..." -NoNewline; Start-Sleep -Seconds 60 }
        $attempts++
        try {
            $params = @{ Uri = $uri; Method = $method; TimeoutSec = 120 }
            if ($body -ne $null) { $params.Body = ($body | ConvertTo-Json); $params.ContentType = "application/json" }
            $result = Invoke-RestMethod @params
        } catch {
            Write-Host " ERR: $($_.Exception.Message.Split([Environment]::NewLine)[0])" -ForegroundColor Red
        }
    }
    return $result
}

$monthEnd = @(0,31,28,31,30,31,30,31,31,30,31,30,31)

# 현재 DB 현황
$stats = Invoke-Api "$BASE/api/stats"
Write-Host "[DB 현황] total=$($stats.total_events)  period=$($stats.year_min)-$($stats.year_max)" -ForegroundColor Cyan

# 진행 로그 파일 (재실행 시 이미 성공한 구간 스킵)
$logFile = "$PSScriptRoot\collect_progress.log"
$done = @{}
if (Test-Path $logFile) {
    Get-Content $logFile | ForEach-Object { $done[$_] = $true }
    Write-Host "[Resume] $($done.Count) 구간 이미 완료" -ForegroundColor DarkCyan
}

$totalCreated = 0; $totalChecked = 0; $skipped = 0; $consec503 = 0

for ($yr = 2000; $yr -le 2025; $yr++) {
    $isLeap = ($yr % 4 -eq 0 -and $yr % 100 -ne 0) -or ($yr % 400 -eq 0)
    $monthEnd[2] = if ($isLeap) { 29 } else { 28 }

    for ($mo = 1; $mo -le 12; $mo++) {
        if ($yr -eq 2025 -and $mo -gt (Get-Date).Month) { break }

        $key = "$yr-$($mo.ToString('00'))"
        if ($done[$key]) {
            Write-Host "  $key ... SKIP(done)" -ForegroundColor DarkGray
            continue
        }

        $ms    = $mo.ToString("00")
        $start = "$yr-$ms-01"
        $end   = "$yr-$ms-$($monthEnd[$mo].ToString('00'))"
        Write-Host "  $key ..." -NoNewline

        $r = Invoke-Api "$BASE/api/ops-intel/collect-ntsb" "POST" @{ start = $start; end = $end }

        if ($r -ne $null) {
            $c  = if ($r.PSObject.Properties["created"]) { $r.created } else { 0 }
            $ch = if ($r.PSObject.Properties["checked"]) { $r.checked } else { 0 }
            $totalCreated += $c; $totalChecked += $ch; $consec503 = 0
            Write-Host " chk=$ch new=$c [누적=$totalCreated]" -ForegroundColor Green
            Add-Content $logFile $key   # 성공 기록
        } else {
            $skipped++; $consec503++
            Write-Host " SKIP (consec=$consec503)" -ForegroundColor Yellow
            if ($consec503 -ge 3) {
                Write-Host "  [rate-limit] 5분 대기..." -ForegroundColor Magenta
                Start-Sleep -Seconds 300
                $consec503 = 0
            }
        }
        Start-Sleep -Seconds $DELAY
    }
    Write-Host "  --- $yr 완료 ---" -ForegroundColor DarkCyan
}

Write-Host "`n[NTSB 수집 완료] checked=$totalChecked created=$totalCreated skipped=$skipped" -ForegroundColor Green

# LLM 분류 (신규 데이터 enrichment)
Write-Host "[LLM 분류]" -ForegroundColor Cyan
for ($i = 1; $i -le 10; $i++) {
    $r = Invoke-Api "$BASE/api/ops-intel/enrich-llm" "POST" @{ limit = 30 }
    if ($r) {
        $proc = if ($r.PSObject.Properties["processed"]) { $r.processed } else { 0 }
        $upd  = if ($r.PSObject.Properties["updated"])   { $r.updated }   else { 0 }
        Write-Host "  배치 $i processed=$proc updated=$upd" -ForegroundColor Green
        if ($proc -eq 0) { break }
    }
    Start-Sleep -Seconds 5
}

# 최종 현황
$stats2 = Invoke-Api "$BASE/api/stats"
Write-Host "`n[최종 DB 현황]" -ForegroundColor Cyan
Write-Host "  Total  : $($stats2.total_events) events"
Write-Host "  Period : $($stats2.year_min) - $($stats2.year_max)"
Write-Host "Done!" -ForegroundColor Green
