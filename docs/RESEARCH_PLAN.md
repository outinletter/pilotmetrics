# PilotMetrics: 2000년 이후 전 세계 항공사고 연구 데이터 구축

기준일: 2026-09-13. 대상 프로젝트: `D:\Data\Project\PilotMetrics`.

목표는 2000-01-01 이후 공개된 전 세계 항공사고·준사고 중 **상업용 제트항공기** 자료를 수집하고, 가능한 많은 분석 변수를 **출처와 함께** 확보하는 것이다. 조사기관의 소속 국가, 실제 발생 국가, 운영자 국가, 등록국은 서로 다르게 저장한다. 기본 코호트는 Part 121 또는 Part 129 운항 규정과 제트 기체 근거가 모두 확인된 자료로 제한한다. Part 135는 별도 승인 전까지 제외하며, 근거가 없는 한국·일본 목록 항목은 저장하지 않고 검토 대기로 둔다.

“전 세계”는 출처·국가·연도별 수집 상태를 관리한다는 의미다. 공개되지 않은 사고와 비공개 조사 파라미터까지 확보했다고 판단하지 않는다. 사건 수, 출처 레코드 수, 보고서 수를 구분한다.

## 1. 실제 운영 DB 진단

Cloudflare 계정 `3a19eb09a951f7ade052638929276529`, Worker `pilot-briefing`, D1 `09d394b0-213a-457c-8aa7-c23f5db3d20c`를 로컬 Wrangler 인증으로 조회했다. 대시보드 페이지 대신 실제 D1 SQL 조회로 확인했다.

| 기존 출처 | 레코드 | DB에 저장된 기간 | 중요한 제한 |
|---|---:|---|---|
| TSB Canada | 19,316 | 2000-01-01–2026-07-11 | 기종 8,084건, 비행단계 921건만 비어 있지 않음. 기존 수집기에 상업항공 제한 |
| ASN | 15,248 | 2010-01-02–2025-11-17 | 2000–2009 및 최신 기간 누락. 프로젝트는 제3자 GitHub 파생본을 사용 |
| NTSB CAROL | 3,551 | 2000-01-02–2026-07-29 | 일부 운항규정만 수집. 사고시각 1,361건만 비어 있지 않음 |
| ARAIB 영문 | 55 | 2012-09-20–2025-12-15 | 게시일이 사고일로 들어감. 기종·운영자·공항·비행단계 미입력 |
| FAA Lessons Learned | 21 | 2000-01-31–2013-04-29 | 사례집으로 전수 사고 모집단을 대표하지 않음 |
| Sample/demo data | 15 | 2013–2024 | 연구 분석에서 제외 필요 |
| 합계 | 38,206 | | 고유 사고 수로 해석 불가 |

확인한 데이터 오류와 구조적 제약:

1. 기존 저장기는 날짜·공항만 같아도 다른 사고를 병합할 수 있다. 과거 병합으로 사라진 사건은 원출처 재수집 없이 복구할 수 없다.
2. `weather_summary`에 `ONTARIO, CANADA`, `United States of America` 등이 저장되어 있다. 비어 있지 않다는 사실은 기상정보가 존재한다는 뜻이 아니다.
3. NTSB 단계 변환에서 이륙이 `PREFLIGHT`, 상승·하강이 `CRUISE`로 합쳐진다. 기종·운항종류·단계별 비교에 왜곡을 만들 수 있다.
4. 모든 기존 출처에서 `published_date`가 비어 있다. ARAIB 표본 `266499`는 기존 사고일 2025-12-15가 실제로 게시일이고, 상세 원문의 사고일은 2022-11-27이다.
5. 동일 URL을 가진 레코드 그룹이 30개다. 같은 URL이라는 이유만으로 삭제하지 않고 보고서 단위와 사건 단위를 검토해야 한다.
6. `ops_intel_runs`에는 실행 기록 1건만 있다. 수만 건을 가져온 외부 수집기의 기간별 성공·실패를 이 테이블만으로 추적할 수 없다.
7. 실패 응답에 HTTP 200이 있으면 월 수집 완료로 기록될 수 있다. 500건 상한에서 잘린 응답도 완료가 될 수 있다.
8. **ARAIB 마지막 페이지 반복이 실제로 장시간 수집을 유발했다.** `ARAIB-218387`에는 페이지 6부터 6,158까지의 변형 URL 4,572개가 연결되어 URL 문자열이 1,603,721자였다. 비슷한 5개 보고서 URL이 각각 약 145만–160만자였다. 새 수집기는 다음 페이지를 확인하고 보고서 ID로 상세 URL을 정규화하며 반복 ID 페이지를 실패로 남긴다. 과거 URL 문자열은 감사 원본으로 보존했다.

`worker/research_audit.sql`은 재점검용 조회다. 기존 데이터는 보존했다. `research_legacy_candidates`는 샘플과 날짜 오류가 의심되는 ARAIB를 제외하는 후보 뷰이며, 나머지 데이터가 검증되었다는 뜻은 아니다.

## 2. 이번 단계에서 구현·반영한 결과

### 운영 D1에 반영

`worker/research_schema.sql`로 `research_source_records`, 인덱스, `research_coverage`, `research_legacy_candidates`를 추가했다. 분석용 출처 레코드 1,095건을 적재하고 운영 DB를 다시 조회해 검증했다. 기존 `events`는 38,206건으로 유지했다.

| 새 분석용 출처 | 레코드 | 사고일 확인 | 목록에서 확인된 사고일 범위 |
|---|---:|---:|---|
| JTSB 일본어 공식 검색표 | 714 | 714 | 2000-01-09–2025-09-02 |
| ARAIB 국문 공식 조사목록 | 326 | 326 | 2005-01-09–2025-04-23 |
| ARAIB 영문 보고서 | 55 | 5 | 확인된 5건: 2019-10-31–2023-06-23 |

1,095는 **출처별 레코드 합계**다. 한국어·영어 보고서 중복과 다른 조사기관의 공동조사 중복은 아직 통합하지 않았다. 영문 50건은 사고일이 명확한 라벨로 확인되지 않아 `needs_date_review`로 보존했다. 표·게시물 탐색이 완료된 것이며 PDF 본문·조사 중 목록·각국 전체 사고 전수조사가 완료된 것은 아니다. 국문 2000–2004 및 2026 발생 사고가 없다고 단정할 수 없다.

각 레코드에는 원자료 JSON, 정규화 JSON, 원문 URL, 수집시각, 원문 SHA-256, 파서 버전, 필드별 근거를 저장한다. 원 HTML 응답은 로컬 작업 폴더에 해시 파일로 보관한다. D1에는 해당 레코드의 원문 행/상세표를 보존한다. PDF 파일 자체는 아직 내려받지 않았다.

### 프로젝트 코드에 반영

- `collect_research.py`: SQLite 체크포인트, 작업·시간 예산, 페이지 단위 저장, 원문 보존, 지수 백오프, 429 재시도 지연, 401/403 차단 상태, JSONL/SQL 내보내기. 정상 페이지로 파싱되지 않으면 0건 성공으로 처리하지 않는다.
- JTSB 실제 6열 검색표, ARAIB 국문 8열 목록, ARAIB 영문 상세자료의 사고일/게시일 구분을 구현했다. 원출처 ID를 사용해 재실행에서도 같은 레코드를 유지한다.
- NTSB는 전체 항공 모드의 월별 작업을 생성하고 500건 이상이면 날짜 구간을 양분한다. 단일 일자까지 잘리면 실패 상태로 남긴다. 현재 실제 API는 HTTP 500이어서 **신규 NTSB 실자료 검증은 미완료**다. 분할·원문 보존 로직은 테스트로 확인했다.
- 기존 한국·일본 Python 실행 진입점은 새 수집기로 연결했다. 함수 내부의 과거 `collect()`/`upload()` 코드는 호환성을 위해 남아 있지만 새 연구 수집에 직접 사용하지 않는다.
- Worker의 한국·일본 과거 파서는 잘못된 사고일을 생성하는 대신 외부 수집기 실행이 필요하다고 반환한다. 긴 과거 수집은 로컬 수집기에서 수행한다.
- Worker 저장기에서 날짜·공항 자동 병합을 제거했다. 게시일 저장, 빈 문자열 필드 보강, 긴 기존 설명 보존, 0 신뢰도 보존, 태그 재중복 방지를 수정했다.
- 범용 적재 API에 1–50건 제한, 날짜·필수값 검증, `accepted_ids`, `failed`, `errors`, 부분 성공 HTTP 207을 추가했다.
- NTSB 운항규정 수집 제한과 TSB 상업항공 수집 제한을 제거했다. NTSB 비행단계 매핑과 지역명→기상 필드 오입력을 수정했다.
- 일반항공까지 확장하면서 잘못 남을 수 있는 고정 `JET`·`Part 121` 값을 제거했다. NTSB의 시간대 없는 시각을 UTC로 간주하거나 승무원 정보 미상을 단독조종으로 분류하지 않도록 수정했다.
- 월별 PowerShell 수집의 2025년 고정 종료/중간연도 시작을 수정했다. 오류 응답은 완료로 기록하지 않고 현재 월을 다시 검사한다. 전체 수집 스크립트는 새로운 체크포인트 이름을 사용해 기존 잘못된 성공 기록을 재사용하지 않는다.
- 기존 TypeScript 검사 오류도 수정했다.

Worker 변경은 로컬 코드 및 배포용 빌드 검증까지 완료했다. **서비스 Worker 배포는 이번 단계에 포함하지 않았다.** 따라서 운영 중인 기존 API 응답·기존 브리핑 화면은 아직 변경 전이다. 새 분석 데이터는 운영 D1의 별도 테이블과 내보낸 파일로 확인한다. 운영 배포 전 기존 자동 호출자의 HTTP 207 처리와 외부 수집 경로 전환을 함께 적용한다.

## 3. 전 세계 수집 우선순위

| 순서 | 대상/방법 | 확보할 내용 | 완료 판정 |
|---|---|---|---|
| P0 | 현재 수집 신뢰성·분석용 저장소 | 재개 상태, 원문, 키, 날짜, 상업용 제트 자격 근거 | 이번 단계 구현·운영 D1 적재 완료 |
| P1 | NTSB 공식 대량 데이터 + 최신 CAROL 증분 | 모든 운항 종류, 복수 기체, 사고·인명·발생순서·조사 필드 | `collect_ntsb_bulk.py`로 `avall.zip`을 다운로드·해시·목록화한 뒤 스키마 확인, 2000년 이후 건수 대조, API 실패 구간 0 또는 사유 기록 |
| P1 | TSB 공개 5개 테이블 + 데이터 사전 | Occurrence, Aircraft, Injuries, Events and phases, Survivability | Occurrence 키별 일대다 관계 유지, 5개 테이블 조인 검증 |
| P1 | ARAIB·JTSB 상세/PDF·조사 중 목록 | 원인, 기여요인, 기상, 인적요인, 권고, 조사 상태 | 보고서 링크 확보율·다운로드율·파싱율을 분리해 측정 |
| P2 | 영국 AAIB·프랑스 BEA·호주 ATSB | 사건목록·보고서·통계 | 2000년 이후 연도별 목록 대비 수집률, 제한 구간 기록 |
| P2 | ASN 2000–2009 및 최근 누락분 | 전 세계 사건 탐색·공식 보고서 연결 | 파생본의 원출처/버전/사용조건 확인, 공식자료와 중복 검토 |
| P3 | ICAO 조사기관 목록을 기준으로 지역 확대 | 유럽 잔여국, 아시아·태평양, 중남미, 중동·아프리카 | 국가×연도마다 완료/부분/차단/비공개/미착수 표시 |

NTSB 웹 설명과 배포 파일의 세대별 범위가 다를 수 있으므로 `avall.zip` 하나에 2000년 이후 전 기간이 있다고 가정하지 않는다. 파일 디렉터리와 release notes를 확인하고 2000–2007 등 과거 파일을 별도 확보한다. CAROL 오류 구간은 건너뛴 채 성공으로 만들지 않는다.

TSB는 사건 한 행에 첫 번째 항공기만 붙이는 방식을 중단하고 기체·인명·이벤트/단계·생존정보를 원래 키로 모두 보존하는 새 어댑터가 필요하다. 이번 기존 TSB 스크립트 수정은 수집 필터 제거까지이며, 다중 테이블 연구 어댑터는 다음 단계다.

ATSB는 전체 데이터 내보내기에 제한이 있다고 명시한다. 공개 검색/보고서 범위와 접근 가능한 통계만 사용하고, 미공개 세부자료는 접근 필요 상태로 기록한다. EASA/ICAO의 통계·권고·안전간행물과 사건 단위 레코드는 별도 자료 유형으로 보관한다. ASRS 자발적 보고도 사고 전수자료와 별도 코호트로 둔다.

## 4. 수집 구조와 시간 제한 대응

`공식 목록/벌크 파일 → 원문 저장 → 출처 레코드 → 검증 → 사건 연결 → 분석 테이블 → 통계/브리핑`

현재 구현은 원문 저장~출처 레코드와 기초 검증까지다. 긴 다운로드·ZIP/PDF/OCR은 Worker HTTP 요청 안에 넣지 않는다. Worker/D1은 검증된 소량 적재와 조회를 담당하고, 로컬 실행기는 작업 예산 내에서 처리 후 재개한다. 장기적으로 로컬 작업 상태를 중앙 작업 테이블/Queue로 옮기되 외부에 실제 배포하기 전 중복 실행 잠금과 장애 복구를 검증한다.

- 기본 작업 단위: 국가가 아니라 출처+조회조건+월/페이지/보고서. NTSB는 월→반월→일로 분할한다.
- 현재 기본 예산: 실행당 최대 10작업, 120초, 요청 타임아웃 최대 30초, 요청 사이 1초. 단일 응답의 읽기/파싱 시간 때문에 시간 예산은 실시간 강제 종료 보장이 아닌 작업 시작·요청 제한이다.
- `pending`은 예약된 재시도, `blocked`는 401/403, `failed`는 반복 실패다. 429에는 서버 지시와 백오프를 적용한다. 실패 작업을 지운 뒤 처음부터 재시작하지 않는다.
- 현재 체크포인트는 1실행기용이다. 같은 `--state`로 여러 프로세스를 동시에 돌리지 않는다. 출처별 디렉터리는 독립 실행 가능하다.
- 동일 기간·버전 상태를 재사용한다. 다른 기간/버전이면 새 상태 폴더를 요구한다. 날짜 기본값이 바뀌므로 재개 명령에는 `--end`를 고정한다.
- 증분 수집은 새 상태 폴더로 최근 기간을 재탐색한다. 사고일이 오래된 최종보고서 개정도 있으므로 월별 게시/수정일 확인과 정기 전체 목록 재대조를 함께 설계한다. 영구적인 최초 1회 수집 완료를 최신 상태로 오해하지 않는다.
- 실제 운영 배치의 예상 시간은 첫 실행에서 출처별 응답시간·대기·파일 크기를 측정해 산정한다. 현재 확보 건수를 전 세계 수집 속도로 외삽하지 않는다.

## 5. 분석 파라미터 설계

아래는 확장 목표다. 현재 모두 추출되었다는 의미가 아니다. 기초 식별자·날짜·기종·운영자·등록부호·장소·사건유형·보고서 링크·원문과 근거는 구현했다. NTSB JSON의 전체 필드와 복수 기체 보존 코드는 준비했지만 실자료 API 검증은 남았다.

| 변수군 | 확보할 변수 예시 | 저장·해석 원칙 |
|---|---|---|
| 식별·출처 | canonical_event_id, authority_case_id, report_id, language, source_url, hash, retrieved_at, parser_version | 사건/보고서/번역본을 별도 식별 |
| 날짜·위치 | event_date, local_time, timezone, UTC, published_date, report_date, country, subdivision, lat/lon, airport, runway | 게시일로 사고일을 채우지 않음. 시간대 미상 시 UTC 미생성 |
| 기체 | registration, make, model, series, category, engine_type/count, year_of_manufacture, flight_hours, cycles, damage | 사건:기체=1:N, 원본 명칭·표준코드 동시 보존 |
| 운항 | operator, operation_type, scheduled, cargo/passenger, flight_number, departure, destination, flight_rules, flight_phase, altitude, speed | 수집 필터보다 사후 분석 필터 사용 |
| 결과 | fatalities, serious/minor/uninjured, occupants, ground_injuries, destroyed, fire, evacuation, survivability | 0과 미상을 구분. 기체별/사건별 사상자 이중 합산 방지 |
| 사건 순서 | occurrence_category, sequence_no, phase, LOC-I, CFIT, runway_excursion/incursion, collision, system_failure | 여러 분류·여러 시점 허용. 출처 원코드와 매핑 버전 저장 |
| 기상·환경 | VMC/IMC, daylight, visibility, ceiling, wind_speed/direction/gust, crosswind, precipitation, icing, turbulence, runway_condition | 장소 문자열을 기상으로 사용하지 않음. 단위·관측시각 필수 |
| 승무원·인적요인 | total/type/recent_hours, duty/rest, fatigue, CRM, training, procedural_deviation, workload | 공식 보고서 근거가 있을 때만 입력. 미기재를 “요인 없음”으로 바꾸지 않음 |
| 기술·조직 | component_failure, maintenance_history, MEL, SOP, dispatch, oversight, recommendations | 확정 원인·기여요인·관찰·AI 추정을 분리 |
| 품질 | field_status, evidence_url/page/quote, extraction_method, confidence, reviewer, reviewed_at, revision | 필드별 출처 추적, 원문으로 재검증 가능 |

정규화 값에는 `observed / not_reported / not_applicable / pending_investigation / extraction_failed / inferred` 상태를 붙이는 다음 단계의 필드 관측 테이블을 설계한다. 현재는 레코드 상태와 `field_evidence`로 시작한다. 숫자 미상은 NULL, 단위 미상은 원값 보존 후 분석 제외다.

PDF 텍스트 추출 → 표 추출 → 스캔만 OCR → 근거 페이지 연결 순서로 처리한다. AI는 후보 값과 인용 위치를 제시하며, 근거 없는 날짜·사상자·원인을 확정 필드에 기록하지 않는다. 원문 언어와 번역문을 둘 다 보존한다.

## 6. 사건 연결·분석·품질 완료 기준

`research_source_records`는 출처별 원본이다. `commercial_jet_eligible=true`인 레코드만 최종 분석 테이블로 내보낸다. NTSB는 Part 121/129와 제트 기체명이 모두 있어야 true이며, 그 외에는 `eligibility_reason`을 남긴다. 다음 단계에서 `research_events`, `research_event_sources`, `research_aircraft`, `research_field_observations`를 추가한다. 공식 사건번호를 우선하고, 일자+등록부호+장소+보고서 참조가 일치하는 경우에만 연결 후보로 만든다. 날짜+공항만으로 자동 병합하지 않는다. 번역본과 예비/최종보고서는 같은 사건의 별도 자료다.

분석 진입 기준:

1. 식별자·출처 URL·수집시각·해시·파서 버전 보유율 100%.
2. 사고일 미확인 레코드는 날짜 분석에서 제외하고 검토 대기 건수로 공개.
3. 국가·연도·출처별 대상 건수, 확보 건수, 실패, 미확인 분모를 표시. 분모가 없으면 수집률 대신 확보 건수만 표시.
4. 파서마다 정상/빈결과/차단/변경된 표/중복페이지/잘린 벌크 파일 테스트. 주요 수치 필드는 층화 표본 원문 대조.
5. 사고/준사고/일반 incident/자발적 보고/사례집/초경량 등을 분리해서 집계.
6. 시간 분할 검증은 보고서 게시일도 고려해 미래 정보를 과거 예측에 섞지 않음. 같은 사건의 번역·개정본이 학습/평가 양쪽에 들어가지 않도록 사건 단위로 분리.
7. 항공편수·비행시간 등 노출량을 연결하기 전에는 국가·항공사별 “사고율”로 표시하지 않음. 수집 편향과 보고체계 차이를 함께 표시.

기초 분석은 연도·국가·기종·운항종류·단계·사상 결과와 결측률부터 시작한다. 충분한 표본과 검증된 변수 확보 후 다변량 회귀·위험요인 상호작용·시간 추세를 검토한다. 모든 필드를 무조건 모델에 넣는 것보다 변수 정의·결측 메커니즘·표본 편향을 통제한다.

## 7. 다음 작업 순서

| 단계 | 구체 작업 | 완료 결과 |
|---|---|---|
| 1 — 완료 | DB 진단, 한국·일본 수집, 원문보존, 오류 수정, 회귀검증 | 신규 연구 레코드 1,095건 및 코드 |
| 2 — 다음 | NTSB 벌크 다운로드 실증, TSB 5개 테이블 연구 어댑터, 국가×연도 수집대장 | 2000년 이후 북미 원자료와 필드 사전 |
| 3 | 한·일 보고서/PDF·조사 중 목록, 영문 미확인 50건 검토 | 사건일·조사상태·원인·기상·인적요인 근거 |
| 4 | AAIB/BEA/ATSB 및 ICAO 국가 목록 기반 확대 | 국가별 커버리지와 공개 제한 대장 |
| 5 | 사건 연결·다중 기체/인명/시퀀스 테이블, 기존 잘못된 병합·기상·단계 재검증 | 분석 가능한 고유 사건 데이터셋 |
| 6 | 분석 대시보드·Parquet 내보내기·증분 스케줄·알림 | 결측/출처/기간 필터를 포함한 연구 환경 |

운영 Worker 배포 시에는 현재 호출자의 부분 실패 처리, 장기 수집의 외부 실행 전환, 적재/삭제/AI 비용 발생 API의 인증 및 요청 예산도 함께 확인한다. 현재 공개 API의 인증 보강과 비밀값의 환경변수 전환은 후속 운영 개선 항목이다. 이번 작업에서 유료 서비스·예약 실행·새 인프라는 생성하지 않았다.

## 8. 실행·검증

최종 검증: Python 10개 + Worker 6개 테스트 통과, TypeScript 검사 통과, 수정한 PowerShell 3개 구문검사 통과, Worker dry-run 빌드 통과. 연구 SQL을 로컬 SQLite에 두 번 실행해 1,095건이 유지됨을 확인했고, 1,095개 레코드가 참조하는 저장 원문 해시를 검증했다. 운영 D1 재조회에서도 1,095건과 기존 events 38,206건을 확인했다. 실제 Worker 서비스 배포 테스트는 수행하지 않았다.

프로젝트 루트에서 Python 의존성은 기존 `requirements.txt`를 사용한다. 현재 환경에서는 `uv run --with requests --with beautifulsoup4 python ...`으로 검증했다.

```powershell
Set-Location D:\Data\Project\PilotMetrics
uv run --with requests --with beautifulsoup4 python collect_research.py --source jtsb --end 2026-09-13 --state work/research-jtsb --output work/research-jtsb/export --max-jobs 10 --max-seconds 120
uv run --with requests --with beautifulsoup4 python collect_research.py --source araib-ko --end 2026-09-13 --state work/research-araib-ko --output work/research-araib-ko/export --max-jobs 10 --max-seconds 120
uv run --with requests --with beautifulsoup4 python collect_research.py --source araib --end 2026-09-13 --state work/research-araib --output work/research-araib/export --max-jobs 10 --max-seconds 120
uv run --with requests --with beautifulsoup4 python -m unittest discover -s tests -v
Set-Location worker
node --test tests/research.test.mjs
npx tsc --noEmit
npx wrangler deploy --dry-run
```

기간 확장은 `--end`와 `--state`를 같이 바꾼다. 실패가 남았는지는 SQLite `jobs`의 상태와 오류로 확인한다. 수집기가 종료되어도 pending/blocked/failed가 남으면 전체 성공이 아니다. 내보낸 SQL은 `research_schema.sql` 적용 후 명시적으로 D1에 적재하며 수집 자체는 자동 업로드하지 않는다. 기존 테이블을 지우는 절차는 없다.

## 9. 확인한 공식 출처

- [JTSB 검색](https://jtsb.mlit.go.jp/jtsb/aircraft/air-kensaku-list.php): 실제 로컬 HTTP 응답의 검색조건·표·페이지 이동 검증.
- [ARAIB 국문 조사목록](https://araib.molit.go.kr/USR/airboard0201/m_34497/lst.jsp): 실제 8열 공식 표와 상세페이지 확인.
- [ARAIB 영문 보고서](https://araib.molit.go.kr/USR/BORD0201/m_34591/LST.jsp?id=eaib0401): 게시일·사고일 차이 확인.
- [NTSB 데이터 안내](https://www.ntsb.gov/safety/data/Pages/Data_Stats.aspx), [데이터 사전](https://www.ntsb.gov/Pages/AviationDownloadDataDictionary.aspx): CAROL·대량 데이터·사전 접근 경로.
- [캐나다 정부 TSB 데이터셋](https://open.canada.ca/data/en/dataset/a376864b-18f2-49d8-9b98-1b7268ffb3c0): 공개 5개 테이블과 데이터 사전.
- [ATSB 데이터베이스](https://www.atsb.gov.au/national-aviation-occurrence-database): 전체 내보내기 제한 확인.
- [AAIB 보고서](https://www.gov.uk/aaib-reports), [BEA](https://bea.aero/en/): 국가별 보고서 확대 경로.
- [ICAO 조사기관 목록](https://www.icao.int/safety/AIG/accident-investigation-authorities-addresses): 전 세계 국가별 출처 등록의 출발점.
- [Cloudflare Workers 제한](https://developers.cloudflare.com/workers/platform/limits/): CPU·메모리·서브리퀘스트 등 자원 제한 확인. 계정 요금제별 값은 별도 확인하며 긴 수집을 단일 Worker 요청으로 해결한다고 가정하지 않는다.
