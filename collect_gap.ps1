# SKIP된 구간만 재수집
$BASE  = "https://pilot-briefing.outinletter.workers.dev"
$URL   = $BASE + "/api/ops-intel/collect-ntsb"
$DELAY = 20

$gaps = @(
    "2021-11",
    "2021-12",
    "2022-01",
    "2024-08",
    "2024-09",
    "2024-10",
    "2024-11"
)

$monthDays = @{ "01"=31;"02"=28;"03"=31;"04"=30;"05"=31;"06"=30;"07"=31;"08"=31;"09"=30;"10"=31;"11"=30;"12"=31 }

$totalCreated = 0
Write-Host "[Gap fill]" -ForegroundColor Cyan

foreach ($ym in $gaps) {
    $yr = $ym.Substring(0, 4)
    $mo = $ym.Substring(5, 2)
    $start = $ym + "-01"
    $end   = $ym + "-" + $monthDays[$mo]
    Write-Host "  $ym ..." -NoNewline

    $bodyJson = '{"start":"' + $start + '","end":"' + $end + '"}'
    $ok = $false
    $try = 0
    while (-not $ok -and $try -lt 3) {
        if ($try -eq 1) { Write-Host " retry(30s)..." -NoNewline; Start-Sleep -Seconds 30 }
        if ($try -eq 2) { Write-Host " retry(60s)..." -NoNewline; Start-Sleep -Seconds 60 }
        $try = $try + 1
        try {
            $r = Invoke-RestMethod -Uri $URL -Method POST -Body $bodyJson -ContentType "application/json" -TimeoutSec 120
            $c  = 0; $ch = 0
            if ($r.PSObject.Properties["created"]) { $c  = $r.created }
            if ($r.PSObject.Properties["checked"]) { $ch = $r.checked }
            $totalCreated = $totalCreated + $c
            Write-Host " chk=$ch new=$c [total=$totalCreated]" -ForegroundColor Green
            $ok = $true
        } catch {
            $msg = $_.Exception.Message.Split([Environment]::NewLine)[0]
            Write-Host " ERROR: $msg" -ForegroundColor Red
        }
    }
    if (-not $ok) { Write-Host " SKIP" -ForegroundColor Yellow }
    Start-Sleep -Seconds $DELAY
}

Write-Host "Done: created=$totalCreated" -ForegroundColor Green
