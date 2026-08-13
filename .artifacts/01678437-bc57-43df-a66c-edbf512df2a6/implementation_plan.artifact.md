# 데이터 수집 완결성 및 무오류성 강화 계획

이 계획은 `PilotMetrics`의 데이터 수집 엔진을 완성하고, 소스 간 중복 제거 및 지능형 공항 매핑을 통해 데이터베이스의 신뢰도를 실무급으로 끌어올리는 것을 목표로 합니다.

## User Review Required

> [!IMPORTANT]
> **데이터베이스 마이그레이션**: `events` 테이블의 신규 컬럼(`destination_iata`, `event_time` 등)을 과거 데이터에도 채워넣는 **Backfill** 작업이 포함됩니다. 이 과정에서 기존 레코드의 `updated_at`이 갱신됩니다.

> [!WARNING]
> **중복 제거 정책**: 날짜, 공항, 항공기가 동일한 경우 "동일 사고"로 판단하여 정보를 병합(Merge)합니다. 소스 URL이 다르더라도 하나의 사건으로 통합 관리됩니다.

## Proposed Changes

### 1. 데이터 수집 엔진 고도화 (Parser Alignment)

#### [MODIFY] [official_event_parsers.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/official_event_parsers.ts)
- **전체 파서 통합**: `upsertFaaEvent`, `upsertTsbEvent`, `upsertNtsbCase`가 `destination_iata/icao`, `event_time`, `flight_conditions`를 모두 저장하도록 SQL 수정.
- **지능형 공항 매핑 확산**: FAA와 TSB 수집 시에도 `airportForLocation`에 본문 텍스트를 전달하여 다중 공항 도시(런던, 뉴욕 등) 오매핑 방지.
- **중복 제거 로직 구현**: `upsertEvent` 공통 함수를 만들어 소스별 고유 ID가 다르더라도 `(date, airport, aircraft)` 조합으로 기존 레코드를 찾아 소스 URL을 병합하는 logic 추가.

### 2. 누락 데이터 복구 (Backfill Utility)

#### [MODIFY] [index.ts](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts)
- **`POST /api/ops-intel/backfill-full`**: 기존 `events` 테이블을 순회하며 본문에서 도착 공항, 시각, 기상 조건을 재추출하여 신규 컬럼을 채우는 관리용 API 추가.

### 3. 수집 효율화 (Collection Strategy)

#### [MODIFY] [ops_intel_collector.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/ops_intel_collector.ts)
- **Smart Fetching**: `MAX_DETAIL_FETCHES`를 동적으로 조절하고, 이미 수집된 URL은 본문 파싱을 건너뛰어 CPU 시간 절약.

---

## Verification Plan

### Automated Tests
- **Deduplication Test**: 동일한 사고 내용을 NTSB와 SKYbrary 소스로 각각 삽입했을 때, DB에 1개의 레코드만 남고 소스 이름이 병합되는지 확인.
- **Disambiguation Test**: "Accident in London near Gatwick" 텍스트 입력 시 LHR이 아닌 EGKK로 매핑되는지 검증.

### Manual Verification
- **Stats Dashboard**: `api/stats` 호출 시 중복 제거 후의 정확한 이벤트 수와 연도별 분포 확인.
- **Historical Tab**: 모바일 앱에서 과거 사고 리스트의 '도착지' 정보가 정상 출력되는지 확인.
