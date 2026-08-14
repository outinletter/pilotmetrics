# 신규 데이터 소스(2000년 이후) 수집 확장 계획

본 계획은 대한항공(KE) 운항 노선의 특수성을 반영하여 한국(ARAIB), 일본(JTSB), 그리고 실시간 글로벌 뉴스(AvHerald) 데이터를 추가 수집하여 안전 브리핑의 밀도를 높이는 것을 목표로 합니다.

## User Review Required

> [!IMPORTANT]
> **수집 범위 한정**: 사용자 요청에 따라 **2000년 1월 1일 이후**의 데이터만 선별적으로 수집하여 데이터베이스의 최신성과 효율성을 확보합니다.

> [!WARNING]
> **웹 스크래핑 기술적 제약**: ARAIB와 JTSB는 공식 API를 제공하지 않으므로 HTML 파싱(Scraping) 방식을 사용합니다. 사이트 구조 변경 시 수집이 중단될 수 있으며, 이를 방지하기 위해 로버스트한 파서를 설계합니다.

## Proposed Changes

### 1. 지역 특화 수집 엔진 추가 (Regional Parsers)

#### [NEW] [araib_parser.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/araib_parser.ts)
- **대상**: 대한민국 항공철도사고조사위원회 (ARAIB) 영문 아카이브.
- **로직**: `https://araib.molit.go.kr/eng/section/list.do?menuSeq=1043` 페이지의 테이블을 순회하며 사고 보고서 링크 및 요약 추출.
- **필터**: 2000년 이후 발생 건만 수집.

#### [NEW] [jtsb_parser.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/jtsb_parser.ts)
- **대상**: 일본 운수안전위원회 (JTSB) 항공 사고 조사 보고서.
- **로직**: 일본 내 주요 공항(NRT, HND, KIX, FUK 등) 관련 사고 데이터를 우선적으로 스크래핑.

### 2. 실시간 위협 피드 연동 (Real-time Feeds)

#### [NEW] [avherald_collector.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/avherald_collector.ts)
- **대상**: The Aviation Herald (Bluesky RSS Workaround).
- **로직**: `https://bsky.app/profile/avherald.com/rss` 피드를 구독하여 최신 준사고(Incident) 정보를 실시간 수집.
- **특징**: 공식 보고서 발간 전의 '생생한' 위협 정보(기종 결항, 낙뢰 등)를 브리핑에 반영.

### 3. 통합 수집 스케줄러 업데이트

#### [MODIFY] [ops_intel_collector.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/ops_intel_collector.ts)
- `collectOnce` 함수에 신규 파서들(ARAIB, JTSB, AvHerald)을 병렬 실행 리스트에 추가.

---

## Verification Plan

### Automated Tests
- **Temporal Filter Test**: 수집된 데이터 중 2000년 이전 데이터가 포함되어 있지 않은지 SQL 쿼리로 검증.
- **Source Integrity Test**: ARAIB 수집 데이터의 공항 코드가 ICN/GMP/PUS 등으로 정확히 매핑되는지 확인.

### Manual Verification
- **Stats Check**: `api/stats` 결과에서 "Korea (ARAIB)" 및 "Japan (JTSB)" 소스가 추가되고 이벤트 수가 유의미하게 증가했는지 확인.
- **AvHerald Live Check**: 최근 24시간 내 발생한 해외 준사고가 시스템에 수집되어 노출되는지 확인.
