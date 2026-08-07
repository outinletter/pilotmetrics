// ─── 위험도 태그별 가중치 ──────────────────────────────────────────────────────
const TAG_SCORES: Record<string, number> = {
  // 최고위험 기상 (단독으로도 치명적)
  WINDSHEAR:          40,
  TSRA:               35,
  CB:                 35,
  LOW_VISIBILITY:     30,
  FOG:                25,
  HEAVY_RAIN:         20,
  // 중위험 기상
  GUST:               15,
  CROSSWIND:          12,
  TAILWIND:           12,
  WET_RWY:            10,
  CONVECTIVE_WEATHER:  8,
  UNSTABLE_APPROACH_RISK: 10,
  // 기타
  ICING:              18,
  TURBULENCE:         10,
  GPS_INTEGRITY:       8,
  ETOPS:               5,
};

// 복수 고위험 태그 동시 발생 시 추가 가산
const HIGH_TAGS = new Set(["WINDSHEAR","TSRA","CB","LOW_VISIBILITY","HEAVY_RAIN","ICING"]);

/**
 * 0–100 수치 위험도 점수
 * @param tags        현재 도착 시간대 날씨 태그 배열
 * @param airportCnt  도착 공항의 과거 사고/이벤트 건수 (DB 조회값)
 */
export function riskScore(tags: string[], airportCnt = 0): number {
  const t = new Set(tags);
  let score = 0;

  // 1. 태그별 개별 점수 합산
  for (const [tag, pts] of Object.entries(TAG_SCORES)) {
    if (t.has(tag)) score += pts;
  }

  // 2. 고위험 태그 동시 발생 가산 (복합 위험)
  const highHits = [...HIGH_TAGS].filter(x => t.has(x)).length;
  if (highHits >= 3) score += 20;
  else if (highHits >= 2) score += 10;

  // 3. 공항 사고 이력 가산 (해당 공항이 사고 다발 공항일수록 위험)
  if (airportCnt >= 50)      score += 15;
  else if (airportCnt >= 20) score += 10;
  else if (airportCnt >= 10) score +=  7;
  else if (airportCnt >= 5)  score +=  4;

  return Math.min(100, Math.round(score));
}

/**
 * 수치 점수 기반 3단계 위험 레벨
 * HIGH  ≥ 55 : 즉각 대응 필요 (go-around 검토, 교체공항 준비)
 * MEDIUM 20–54: 주의 필요 (강화 브리핑, 안정적 접근 확인)
 * LOW   < 20 : 통상 운항
 */
export function riskLevel(tags: string[], airportCnt = 0): "HIGH" | "MEDIUM" | "LOW" {
  const s = riskScore(tags, airportCnt);
  if (s >= 55) return "HIGH";
  if (s >= 20) return "MEDIUM";
  return "LOW";
}

export function threatForTags(tags: Set<string>): [string, string] {
  if (tags.has("WINDSHEAR"))
    return ["Wind Shear on Final Approach", "Wind shear on approach is a leading cause of controlled-flight-into-terrain accidents. Execute immediate go-around if LLWS alert activates."];
  if (tags.has("TSRA") || tags.has("CB") || tags.has("CONVECTIVE_WEATHER"))
    return ["Convective Weather Near Final Approach", "Thunderstorm cells near final can rapidly reduce path, speed, and wind margin."];
  if (tags.has("LOW_VISIBILITY") || tags.has("FOG"))
    return ["Low Visibility / CAT Approach", "Low-vis operations require confirmed CAT rating, auto-land serviceability, and RVR monitoring below DH."];
  if (tags.has("ICING"))
    return ["Airframe / Engine Icing", "Icing on approach increases stall speed and reduces climb performance. Confirm anti-ice on prior to FAF."];
  if (tags.has("UNSTABLE_APPROACH_RISK"))
    return ["Unstable Approach and Late Go-Around", "High workload conditions increase continuation bias below stable approach gates."];
  if (tags.has("GPS_INTEGRITY"))
    return ["RNAV and GPS Integrity", "Navigation integrity changes require a briefed backup approach and early reconfiguration."];
  if (tags.has("ETOPS"))
    return ["Long-Haul Diversion and System Margin", "Long-haul sectors need early fuel, system, and alternate decision gates."];
  if (tags.has("WET_RWY") || tags.has("HEAVY_RAIN"))
    return ["Wet Runway Landing Performance", "Wet runway and convective weather may reduce landing performance margin."];
  if (tags.has("GUST") || tags.has("CROSSWIND") || tags.has("TAILWIND"))
    return ["Wind-Related Landing Hazard", "Gusty or crosswind conditions require early checklist completion and stabilized-approach discipline."];
  return ["Route-Based Operational Threat", "Similar route events suggest a targeted prevention review."];
}

/** 점수를 조종사용 한 줄 요약으로 변환 */
export function riskSummary(score: number, level: string, tags: string[]): string {
  const wx = tags.length > 0 ? tags.slice(0, 3).join(", ") : "CLEAR";
  if (level === "HIGH")   return `위험도 ${score}/100 — ${wx} 조건으로 즉각 대응 필요. Go-around 기준 재확인, 교체공항 연료 확보 권고.`;
  if (level === "MEDIUM") return `위험도 ${score}/100 — ${wx} 조건. 강화 브리핑 실시, 안정적 접근 기준 엄수.`;
  return `위험도 ${score}/100 — 기상 조건 양호. 통상 절차 적용.`;
}
