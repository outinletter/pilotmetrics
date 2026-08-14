# 글로벌 대규모 데이터 수집(Mass Ingestion) 고도화 계획

현재 수집된 데이터(약 3.8만 건)를 넘어, ICAO, ARAIB, JTSB 등 핵심 소스에서 2000년 이후 수만 건의 데이터를 전수 수집하기 위한 기술적 고도화를 수행합니다.

## 분석 및 원인

> [!CAUTION]
> **단일 페이지 수집의 한계**: 현재 ARAIB, JTSB 파서는 각 사이트의 **첫 페이지(최신 10~20건)**만 보고 있습니다. 2000년까지의 데이터를 모두 가져오려면 페이지네이션(Pagination) 탐색이 필수적입니다.
>
> **ICAO 국가 제한**: 현재 9개 주요국만 수집하고 있습니다. 전 세계 190여 개국 데이터를 가져오기 위해 국가 목록을 확장해야 합니다.
>
> **Workers 실행 제한**: 한 번의 요청으로 수만 건을 처리하면 Cloudflare Workers의 CPU 제한(30초)에 걸려 중단됩니다. **"배치 처리(Batching)"** 및 **"연도별 분할 수집"** 전략이 필요합니다.

##Proposed Changes

### 1. ICAO iSTARS: 전 세계 국가 확장 및 연도별 정밀 수집

#### [MODIFY] [official_event_parsers.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/official_event_parsers.ts)
- **국가 목록 확장**: 주요 항공 운영국 50개국 이상으로 수집 대상 확대.
- **연도별 루프 최적화**: 2000년부터 현재까지 1년 단위로 끊어서 수집하여 타임아웃 방지.

### 2. ARAIB (한국) & JTSB (일본): 페이지네이션 크롤링 도입

#### [MODIFY] [official_event_parsers.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/official_event_parsers.ts)
- **`parseAraibKorea`**: `pageIndex=1`부터 시작하여 날짜가 2000년 이전이 나올 때까지 다음 페이지를 자동으로 탐색.
- **`parseJtsbJapan`**: 연도별 아카이브 섹션을 모두 순회하여 과거 데이터 전수 수집.

### 3. 대규모 데이터 처리를 위한 'Ingest API' 및 스크립트 제공

#### [NEW] [Mass Ingest Endpoint](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts)
- `/api/admin/ingest-historical` 엔드포인트 추가: 특정 소스와 연도를 지정하여 부분 수집이 가능하도록 설계.
- **로컬 실행 스크립트**: 파이썬 또는 PowerShell 스크립트를 통해 루프를 돌며 API를 호출, 수만 건의 데이터를 타임아웃 없이 데이터베이스에 안전하게 적재.

---

## 수집 목표치 (Target Recall)

| 소스 | 현재 수집 | 목표 수집 (2000년~) | 비고 |
| :--- | :--- | :--- | :--- |
| **ICAO iSTARS** | 11건 | **30,000+건** | 전 세계 사고/준사고 통합 |
| **ARAIB (한국)** | 0건 | **500+건** | 국내 전수 조사 결과 |
| **JTSB (일본)** | 1건 | **2,000+건** | 일본 내 전수 조사 결과 |
| **ASN / TSB** | 34,000건 | 유지 (완료) | 기존 데이터 보존 |
| **Total** | **~3.8만 건** | **~7만 건 이상** | 최종 목표치 |

## Verification Plan

### Manual Verification
- **Stats Sidebar**: 수집 스크립트 실행 후 "Total Threat Events" 숫자가 수천 단위로 올라가는지 실시간 모니터링.
- **Source Breakdown**: `api/stats` 결과에서 ICAO 건수가 유의미하게(수만 건) 표시되는지 확인.
