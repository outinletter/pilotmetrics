# PilotBriefing - Full data collection 2014-2025 (monthly chunks)
$BASE  = "https://pilot-briefing.outinletter.workers.dev"
$DELAY = 15

function Invoke-Api {
    param($uri, $method = "GET", $body = $null)
    $result = $null
    $attempts = 0
    while ($result -eq $null -and $attempts -lt 3) {
        if ($attempts -eq 1) {
            Write-Host " retry(30s)..." -NoNewline
            Start-Sleep -Seconds 30
        }
        if ($attempts -eq 2) {
            Write-Host " retry(60s)..." -NoNewline
            Start-Sleep -Seconds 60
        }
        $attempts = $attempts + 1
        try {
            $params = @{ Uri = $uri; Method = $method; TimeoutSec = 120 }
            if ($body -ne $null) {
                $params.Body        = ($body | ConvertTo-Json)
                $params.ContentType = "application/json"
            }
            $result = Invoke-RestMethod @params
        } catch {
            $msg = $_.Exception.Message.Split([Environment]::NewLine)[0]
            Write-Host " ERROR: $msg" -ForegroundColor Red
        }
    }
    return $result
}

function Get-Val {
    param($obj, $key)
    if ($obj -and $obj.PSObject.Properties[$key]) {
        return $obj.$key
    }
    return 0
}

$monthEnd = @(0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

# DB 현황
Write-Host "[DB Status]" -ForegroundColor Cyan
$stats = Invoke-Api "$BASE/api/stats"
if ($stats) {
    Write-Host "  Current events: $(Get-Val $stats 'total_events')"
}

# NTSB CAROL 수집
Write-Host "[NTSB CAROL 2014-2025 monthly]" -ForegroundColor Cyan
$totalCreated    = 0
$totalChecked    = 0
$skipped         = 0
$consecutive503  = 0

for ($yr = 2024; $yr -le 2025; $yr++) {
    $isLeap = ($yr % 4 -eq 0 -and $yr % 100 -ne 0) -or ($yr % 400 -eq 0)
    if ($isLeap) {
        $monthEnd[2] = 29
    } else {
        $monthEnd[2] = 28
    }

    if ($yr -eq 2024) {
        $startMo = 8
    } else {
        $startMo = 1
    }

    for ($mo = $startMo; $mo -le 12; $mo++) {
        $ms    = $mo.ToString("00")
        $me    = $monthEnd[$mo].ToString("00")
        $start = "$yr-$ms-01"
        $end   = "$yr-$ms-$me"
        Write-Host "  $yr-$ms ..." -NoNewline

        $r = Invoke-Api "$BASE/api/ops-intel/collect-ntsb" "POST" @{ start = $start; end = $end }
        if ($r -ne $null) {
            $c  = Get-Val $r "created"
            $ch = Get-Val $r "checked"
            $totalCreated   = $totalCreated + $c
            $totalChecked   = $totalChecked + $ch
            $consecutive503 = 0
            Write-Host " chk=$ch new=$c [total=$totalCreated]" -ForegroundColor Green
        } else {
            $skipped        = $skipped + 1
            $consecutive503 = $consecutive503 + 1
            Write-Host " SKIP (consec=$consecutive503)" -ForegroundColor Yellow
            if ($consecutive503 -ge 3) {
                Write-Host "  [rate-limit] 5min wait..." -ForegroundColor Magenta
                Start-Sleep -Seconds 300
                $consecutive503 = 0
            }
        }
        Start-Sleep -Seconds $DELAY
    }
    Write-Host "  --- $yr done (skipped=$skipped) ---" -ForegroundColor DarkCyan
}

Write-Host "  NTSB done: checked=$totalChecked created=$totalCreated skipped=$skipped" -ForegroundColor Green

# LLM 분류
Write-Host "[LLM classification]" -ForegroundColor Cyan
$i = 1
while ($i -le 5) {
    $r = Invoke-Api "$BASE/api/ops-intel/enrich-llm" "POST" @{ limit = 30 }
    if ($r) {
        Write-Host "  Batch $i processed=$(Get-Val $r 'processed') updated=$(Get-Val $r 'updated')" -ForegroundColor Green
    }
    $i = $i + 1
    Start-Sleep -Seconds 5
}

# 최종 현황
Write-Host "[Final DB Status]" -ForegroundColor Cyan
$stats2 = Invoke-Api "$BASE/api/stats"
if ($stats2) {
    Write-Host "  Total  : $(Get-Val $stats2 'total_events') events"
    Write-Host "  Period : $(Get-Val $stats2 'year_min') - $(Get-Val $stats2 'year_max')"
}
Write-Host "Done!" -ForegroundColor Green
