# 이벤트 분석 브리핑(블릿 포인트) 강화 계획

이 계획은 사고 데이터베이스의 "얇은 요약(Thin Summary)" 문제를 해결하고, 조종사에게 실질적인 도움이 되는 **분석적 위험 요소 브리핑**을 제공하는 것을 목표로 합니다.

## User Review Required

> [!NOTE]
> **2단계 브리핑 전략**:
> 1. **휴리스틱(Heuristic)**: 실시간 요청 시 정규식을 통해 핵심 위험 키워드(FATAL, IMC, 기상 등)를 즉시 추출하여 블릿 포인트로 표시합니다.
> 2. **AI 백그라운드 강화**: 요청 직후 서버리스 환경의 `waitUntil`을 사용하여 해당 이벤트들을 LLM으로 정밀 분석하고 DB를 갱신합니다. 다음 조회 시에는 사람이 분석한 수준의 고품질 브리핑이 제공됩니다.

## Proposed Changes

### 1. 분석적 블릿 포인트 생성 로직 (Briefing Logic)

#### [MODIFY] [briefing_generator.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/briefing_generator.ts)
- **`generateHeuristicFactors(event)`**: `contributing_factors`가 비어있을 경우, `summary`와 `severity` 필드를 분석하여 다음과 같은 블릿 포인트를 자동 생성합니다.
    - 예: "Severity: Critical (Fatalities reported)", "Phase: Landing", "Condition: IMC inferred from text"
- **`buildThreats` 업데이트**: 생성된 휴리스틱 블릿을 `contributing_factors` 필드에 병합하여 UI에 전달합니다.

### 2. 실시간 AI 강화 파이프라인 (Live Enrichment)

#### [MODIFY] [index.ts](file:///D:/Data/Project/PilotMetrics/worker/src/index.ts)
- **`waitUntil` 통합**: 브리핑 API(`/api/briefing/:flightNumber`) 응답 직후, 검색된 상위 18개 이벤트 중 분석 데이터가 없는 항목들에 대해 `enrichEventsWithThreats`를 백그라운드에서 실행합니다.

### 3. LLM 분석 프롬프트 고도화 (LLM Enrichment)

#### [MODIFY] [llm_classifier.ts](file:///D:/Data/Project/PilotMetrics/worker/src/services/llm_classifier.ts)
- **프롬프트 강화**: `extractEventThreats`의 페르소나를 "Safety Briefing Analyst"로 강화하여, 단순 요약이 아닌 "조종사가 주의해야 할 구체적 위협 요인(Threats)"과 "대응 지침(Countermeasures)"을 블릿 포인트로 추출하도록 수정합니다.

---

## Verification Plan

### Automated Tests
- **Heuristic Extraction Test**: "Fatal crash in IMC" 텍스트를 가진 이벤트를 조회했을 때, `contributing_factors`에 "Fatal Outcome", "IMC Conditions" 블릿이 포함되는지 확인.
- **Background Task Test**: 브리핑 조회 후 10초 뒤 DB의 해당 레코드에 AI가 분석한 데이터가 채워져 있는지 확인.

### Manual Verification
- **Screenshot Case (DCA26MA161) 재검증**: 기존에 텍스트 한 줄만 나오던 화면이 위협 요소 블릿 포인트와 풍부한 브리핑 문장으로 채워지는지 확인.
