# ──────────────────────────────────────────────────────────────
# PilotMetrics — 2000~2025 전체 데이터 수집 스크립트
# 실행: cd D:\Data\Project\PilotMetrics && .\collect_2000_2025.ps1
# ──────────────────────────────────────────────────────────────

$BASE = "https://pilot-briefing.outinletter.workers.dev"
$DELAY = 8   # 요청 간 대기 시간(초) — Workers rate limit 회피

function Invoke-Api($uri, $method = "GET", $body = $null) {
    try {
        $params = @{ Uri = $uri; Method = $method; TimeoutSec = 90 }
        if ($body) {
            $params.Body = ($body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        return Invoke-RestMethod @params
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
        return $null
    }
}

# ── 1. 현재 DB 상태 확인 ──────────────────────────────────────
Write-Host "`n[DB 현황]" -ForegroundColor Cyan
$stats = Invoke-Api "$BASE/api/stats"
Write-Host "  현재 이벤트 수: $($stats.total_events)"

# ── 2. NTSB CAROL — 연도별 수집 (2000~2025) ──────────────────
Write-Host "`n[NTSB CAROL 2000~2025 수집 시작]" -ForegroundColor Cyan
$totalCreated = 0

for ($yr = 2000; $yr -le 2025; $yr++) {
    $start = "$yr-01-01"
    $end   = "$yr-12-31"
    Write-Host "  $yr 수집 중..." -NoNewline

    $r = Invoke-Api "$BASE/api/ops-intel/collect-ntsb" "POST" @{ start = $start; end = $end }
    if ($r) {
        $c = $r.created ?? 0
        $ch = $r.checked ?? 0
        $totalCreated += $c
        Write-Host " checked=$ch created=$c (누적=$totalCreated)" -ForegroundColor Green
    } else {
        Write-Host " SKIP (timeout/error)" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds $DELAY
}

Write-Host "`n  NTSB 수집 완료 — 총 생성: $totalCreated 건" -ForegroundColor Green

# ── 3. FAA / ASRS / 공식 소스 수집 ───────────────────────────
Write-Host "`n[공식 소스 수집 (FAA, ASRS, EASA...)]" -ForegroundColor Cyan
$r = Invoke-Api "$BASE/api/ops-intel/collect-official-recent" "POST" @{ years_back = 25 }
if ($r) { Write-Host "  완료: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green }
Start-Sleep -Seconds $DELAY

# ── 4. 웹 크롤 (AAIB, BEA, ATSB, SKYbrary, ASN 등) ──────────
Write-Host "`n[웹 크롤 수집 (신규 소스 포함)]" -ForegroundColor Cyan
$r = Invoke-Api "$BASE/api/ops-intel/collect" "POST"
if ($r) { Write-Host "  완료: saved=$($r.saved) errors=$($r.errors)" -ForegroundColor Green }
Start-Sleep -Seconds $DELAY

# ── 5. LLM 분류 (여러 배치) ───────────────────────────────────
Write-Host "`n[LLM 분류 실행]" -ForegroundColor Cyan
for ($i = 1; $i -le 5; $i++) {
    $r = Invoke-Api "$BASE/api/ops-intel/enrich-llm" "POST" @{ limit = 30 }
    if ($r) { Write-Host "  배치 $i : processed=$($r.processed) updated=$($r.updated) errors=$($r.errors)" -ForegroundColor Green }
    Start-Sleep -Seconds 5
}

# ── 6. 최종 DB 현황 ───────────────────────────────────────────
Write-Host "`n[최종 DB 현황]" -ForegroundColor Cyan
$stats2 = Invoke-Api "$BASE/api/stats"
Write-Host "  총 이벤트: $($stats2.total_events)"
Write-Host "  기간: $($stats2.year_min) ~ $($stats2.year_max)"
Write-Host "  마지막 업데이트: $($stats2.last_updated)"
Write-Host "`n완료!" -ForegroundColor Green
