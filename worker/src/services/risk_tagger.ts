// ─── 위험도 태그별 가중치 ──────────────────────────────────────────────────────
// 설계 원칙: 파생 태그(CONVECTIVE_WEATHER, WET_RWY 등)는 점수 0 — 기원 태그에만 점수 부여
// 이중 집계 방지: TSRA(35) + CB(35)이 함께 발생하면 실질 최대 35점 처리 (MAX_FAMILY 그룹으로 제어)
const TAG_SCORES: Record<string, number> = {
  // ── 최고위험 기상 (각 기상 현상 중 하나만 실점수 반영) ──────────────────────
  WINDSHEAR:          40,
  TSRA:               35,   // CB와 동시 발생 시 MAX(35,35) = 35 (아래 FAMILY 처리)
  CB:                 35,
  FZRAIN:             30,
  VOLCANIC_ASH:       30,
  CAT_III_C:          38,
  CAT_III_B:          35,
  CAT_III_A:          30,
  CAT_II:             25,
  LOW_VISIBILITY:     28,   // 가시거리 단독 저하 (RVR 없는 경우)
  CAT_II_VIS:          0,   // LOW_VISIBILITY에 이미 포함 — 파생
  CAT_I_VIS:           0,   // 동일
  RVR_RESTRICTED:      0,   // CAT_III/II가 이미 반영 — 파생
  BLOWING_SNOW:       22,
  // ── 고위험 기상 ───────────────────────────────────────────────────────────────
  FOG:                22,
  ICING:              20,
  SNOW:               18,
  HEAVY_RAIN:         15,   // TSRA 동반 시 FAMILY로 중복 방지
  SQUALL:             18,
  STRONG_WIND:        16,
  CONTAMINATED_SURFACE: 0, // BLOWING_SNOW/FZRAIN/ICING이 이미 반영 — 파생
  CAT_APPROACH_RISK:   0,  // FOG+LOW_VISIBILITY 조합 — 파생
  // ── 중위험 기상 ───────────────────────────────────────────────────────────────
  GUST:               14,
  CROSSWIND:          13,
  TAILWIND:           12,
  CONVECTIVE_WEATHER:  0,  // TSRA/CB에서 유도 — 파생
  UNSTABLE_APPROACH_RISK: 0, // 복합 유도 — 파생
  WET_RWY:             0,  // HEAVY_RAIN/SNOW에서 유도 — 파생
  WIND_HAZARD:         0,  // GUST/CROSSWIND에서 유도 — 파생
  MIST:                6,
  REDUCED_VISIBILITY:  8,
  MARGINAL_VISIBILITY: 4,
  LOW_CLOUD:           8,
  DUST:               12,
  HIGH_TEMP_PERF:      8,
  SEVERE_COLD:        10,
  // ── 공항 지형/접근 고정 위험 ─────────────────────────────────────────────────
  MOUNTAIN_APPROACH:  18,
  HIGH_ALTITUDE:      14,
  ONE_SIDED_GO_AROUND: 12,
  ISLAND_APPROACH:     8,
  MARINE_LAYER_FOG:    8,
  TROPICAL_CONVECTION: 5,
  TYPHOON_RISK:       10,
  DUST_RISK:           6,
  CONGESTED_AIRSPACE:  4,
  NOISE_ABATEMENT:     3,
  SHORT_SECTOR:        3,
  // ── 기타 ─────────────────────────────────────────────────────────────────────
  TURBULENCE:         10,
  GPS_INTEGRITY:       8,
  ETOPS:               5,
};

// 같은 현상에서 파생된 태그 그룹 — 그룹 내 최고점 하나만 계산
// 예: TSRA(35) + CB(35) → 35점만 (중복 제거)
const SCORE_FAMILIES: string[][] = [
  ["TSRA", "CB", "HEAVY_RAIN"],                             // 뇌우 패밀리 — 최대 35점
  ["CAT_III_C", "CAT_III_B", "CAT_III_A", "CAT_II", "LOW_VISIBILITY"], // 시정/CAT — 최대 38점
  ["FOG", "LOW_VISIBILITY", "MARINE_LAYER_FOG"],            // 안개/시정 — 최대 28점 (FOG+LOW_VIS 중복 방지)
  ["FZRAIN", "BLOWING_SNOW", "SNOW"],                       // 결빙/강설 — 최대 30점
  ["STRONG_WIND", "GUST"],                                  // 바람 강도 — 최대 16점
];

// 복수 독립 고위험 태그 동시 발생 시 가산 (파생 태그 제외)
const HIGH_TAGS = new Set([
  "WINDSHEAR", "TSRA", "CB", "LOW_VISIBILITY", "HEAVY_RAIN",
  "ICING", "FZRAIN", "SNOW", "SQUALL", "STRONG_WIND", "CAT_III_A", "CAT_III_B", "CAT_III_C",
]);

export type RiskBreakdown = {
  tag: string;
  score: number;
  label: string;
};

const TAG_LABELS: Record<string, string> = {
  WINDSHEAR: "Wind Shear", TSRA: "Thunderstorm+Rain", CB: "Cumulonimbus", FOG: "Fog",
  LOW_VISIBILITY: "Low Visibility", CAT_III_C: "CAT IIIc RVR", CAT_III_B: "CAT IIIb RVR",
  CAT_III_A: "CAT IIIa RVR", CAT_II: "CAT II RVR", CAT_II_VIS: "CAT II Visibility",
  CAT_I_VIS: "CAT I Visibility", RVR_RESTRICTED: "RVR Restricted", FZRAIN: "Freezing Rain",
  BLOWING_SNOW: "Blowing Snow", ICING: "Icing", SNOW: "Snow", HEAVY_RAIN: "Heavy Rain",
  SQUALL: "Squall", STRONG_WIND: "Strong Wind", GUST: "Gusts", CROSSWIND: "Crosswind",
  TAILWIND: "Tailwind", CONVECTIVE_WEATHER: "Convective Weather", UNSTABLE_APPROACH_RISK: "Unstable Approach",
  WET_RWY: "Wet Runway", CONTAMINATED_SURFACE: "Contaminated Surface", CAT_APPROACH_RISK: "ILS Approach Risk",
  MOUNTAIN_APPROACH: "Mountain Approach", HIGH_ALTITUDE: "High-Altitude Airport", ONE_SIDED_GO_AROUND: "One-Sided Go-Around",
  ISLAND_APPROACH: "Island Approach", TROPICAL_CONVECTION: "Tropical Convection", TYPHOON_RISK: "Typhoon Risk",
  DUST: "Dust/Sandstorm", VOLCANIC_ASH: "Volcanic Ash", HIGH_TEMP_PERF: "High Temp Performance",
  SEVERE_COLD: "Severe Cold/Icing Env", MARINE_LAYER_FOG: "Marine Layer Fog", DUST_RISK: "Dust Risk",
  MIST: "Mist", REDUCED_VISIBILITY: "Reduced Visibility", MARGINAL_VISIBILITY: "Marginal Visibility",
  LOW_CLOUD: "Low Ceiling", WIND_HAZARD: "Wind Hazard", TURBULENCE: "Turbulence",
  GPS_INTEGRITY: "RNAV Integrity", ETOPS: "Long-Haul ETOPS",
  CONGESTED_AIRSPACE: "Congested Airspace", NOISE_ABATEMENT: "Noise Abatement", SHORT_SECTOR: "Short Sector",
};

/**
 * 0–100 수치 위험도 점수
 * @param tags         도착 시간대 날씨 태그 + 공항 고정 위험 태그
 * @param airportCnt   도착 공항 과거 사고 건수
 * @param nightArrival 야간 도착 여부
 */
// FAMILY 내 이미 점수를 부여한 태그 집합을 계산
function familyDedupedScore(tags: Set<string>): Set<string> {
  const suppressed = new Set<string>();
  for (const family of SCORE_FAMILIES) {
    const hits = family.filter(t => tags.has(t) && TAG_SCORES[t] > 0);
    if (hits.length <= 1) continue;
    hits.sort((a, b) => TAG_SCORES[b] - TAG_SCORES[a]);
    for (const dup of hits.slice(1)) suppressed.add(dup);
  }
  return suppressed;
}

export function riskScore(tags: string[], airportCnt = 0, nightArrival = false): number {
  const t = new Set(tags);
  const suppressed = familyDedupedScore(t);
  let score = 0;

  for (const [tag, pts] of Object.entries(TAG_SCORES)) {
    if (t.has(tag) && !suppressed.has(tag)) score += pts;
  }

  // 독립 고위험 태그 복합 발생 가산 (FAMILY 억제 태그 제외)
  const highHits = [...HIGH_TAGS].filter(x => t.has(x) && !suppressed.has(x)).length;
  if (highHits >= 3)      score += 15;
  else if (highHits >= 2) score += 7;

  // 공항 사고 이력 가산
  if (airportCnt >= 50)      score += 15;
  else if (airportCnt >= 20) score += 10;
  else if (airportCnt >= 10) score +=  7;
  else if (airportCnt >= 5)  score +=  4;

  // 야간 도착 가산
  if (nightArrival) {
    const hasHighWx = ["WINDSHEAR","LOW_VISIBILITY","FOG","SNOW","ICING","FZRAIN","TSRA","CB"].some(x => t.has(x));
    score += hasHighWx ? 10 : 5;
  }

  return Math.min(100, Math.round(score));
}

/**
 * 점수별 위험 레벨
 * HIGH   ≥ 55 : 즉각 대응 (go-around 기준 재확인, 교체공항 연료)
 * MEDIUM 20–54: 강화 브리핑, 안정 접근 엄수
 * LOW   < 20  : 통상 운항
 */
export function riskLevel(tags: string[], airportCnt = 0, nightArrival = false): "HIGH" | "MEDIUM" | "LOW" {
  const s = riskScore(tags, airportCnt, nightArrival);
  if (s >= 55) return "HIGH";
  if (s >= 20) return "MEDIUM";
  return "LOW";
}

/**
 * 위험도 항목별 breakdown 반환 (점수 기여가 있는 태그만)
 */
export function riskBreakdown(tags: string[], airportCnt = 0, nightArrival = false): RiskBreakdown[] {
  const t = new Set(tags);
  const suppressed = familyDedupedScore(t);
  const items: RiskBreakdown[] = [];

  for (const [tag, pts] of Object.entries(TAG_SCORES)) {
    if (t.has(tag) && !suppressed.has(tag) && pts > 0) {
      items.push({ tag, score: pts, label: TAG_LABELS[tag] ?? tag });
    }
  }

  const highHits = [...HIGH_TAGS].filter(x => t.has(x) && !suppressed.has(x)).length;
  if (highHits >= 3)      items.push({ tag: "COMPOUND_HIGH", score: 15, label: "Compound High Risk" });
  else if (highHits >= 2) items.push({ tag: "COMPOUND_HIGH", score:  7, label: "Compound High Risk" });

  if (airportCnt >= 50)      items.push({ tag: "AIRPORT_HISTORY", score: 15, label: "Airport Incident History" });
  else if (airportCnt >= 20) items.push({ tag: "AIRPORT_HISTORY", score: 10, label: "Airport Incident History" });
  else if (airportCnt >= 10) items.push({ tag: "AIRPORT_HISTORY", score:  7, label: "Airport Incident History" });
  else if (airportCnt >= 5)  items.push({ tag: "AIRPORT_HISTORY", score:  4, label: "Airport Incident History" });

  if (nightArrival) {
    const hasHighWx = ["WINDSHEAR","LOW_VISIBILITY","FOG","SNOW","ICING","FZRAIN","TSRA","CB"].some(x => t.has(x));
    items.push({ tag: "NIGHT_ARRIVAL", score: hasHighWx ? 10 : 5, label: "Night Arrival" });
  }

  return items.sort((a, b) => b.score - a.score);
}

export function threatForTags(tags: Set<string>): [string, string] {
  if (tags.has("WINDSHEAR"))
    return ["Wind Shear on Final Approach", "Wind shear on approach is a leading cause of CFIT accidents. Execute immediate go-around if LLWS alert activates."];
  if (tags.has("TSRA") || tags.has("CB") || tags.has("CONVECTIVE_WEATHER"))
    return ["Convective Weather Near Final Approach", "Thunderstorm cells near final can rapidly reduce path, speed, and wind margin."];
  if (tags.has("CAT_III_C") || tags.has("CAT_III_B") || tags.has("CAT_III_A"))
    return ["CAT III Low-Visibility Approach", "CAT III operations require autoland serviceability, RVR monitoring, and crew currency. Go-around decision must be pre-briefed."];
  if (tags.has("CAT_II") || tags.has("CAT_II_VIS"))
    return ["CAT II Approach — Low RVR", "CAT II requires confirmed CAT II aircraft cert, autoland, and RVR monitoring at all three touchdown-zone stations."];
  if (tags.has("LOW_VISIBILITY") || tags.has("FOG") || tags.has("CAT_APPROACH_RISK"))
    return ["Low Visibility / CAT Approach", "Low-vis operations require confirmed CAT rating, auto-land serviceability, and RVR monitoring below DH."];
  if (tags.has("FZRAIN") || tags.has("BLOWING_SNOW") || tags.has("CONTAMINATED_SURFACE"))
    return ["Contaminated Runway — Freezing Precipitation / Blowing Snow", "Freezing rain or blowing snow requires confirmed RCAM/RWYCC, anti-ice on prior to FAF, and validated landing distance."];
  if (tags.has("ICING"))
    return ["Airframe / Engine Icing", "Icing on approach increases stall speed and reduces climb performance. Confirm anti-ice on prior to FAF."];
  if (tags.has("MOUNTAIN_APPROACH") || tags.has("HIGH_ALTITUDE"))
    return ["Mountain / High-Altitude Approach", "Terrain proximity and reduced engine margin at altitude demand early missed-approach briefing and obstacle awareness."];
  if (tags.has("CROSSWIND"))
    return ["Crosswind Landing Limit", "High crosswind demands early checklist completion, stabilized-approach discipline, and confirmed crosswind limit."];
  if (tags.has("TAILWIND"))
    return ["Tailwind Landing Performance", "Tailwind significantly extends landing distance. Confirm landing performance with correct wind component."];
  if (tags.has("UNSTABLE_APPROACH_RISK"))
    return ["Unstable Approach and Late Go-Around", "High workload conditions increase continuation bias below stable approach gates."];
  if (tags.has("GPS_INTEGRITY"))
    return ["RNAV and GPS Integrity", "Navigation integrity changes require a briefed backup approach and early reconfiguration."];
  if (tags.has("ETOPS"))
    return ["Long-Haul Diversion and System Margin", "Long-haul sectors need early fuel, system, and alternate decision gates."];
  if (tags.has("WET_RWY") || tags.has("HEAVY_RAIN"))
    return ["Wet Runway Landing Performance", "Wet runway and convective weather may reduce landing performance margin."];
  if (tags.has("GUST") || tags.has("STRONG_WIND") || tags.has("WIND_HAZARD"))
    return ["Wind-Related Landing Hazard", "Gusty or strong wind conditions require early checklist completion and stabilized-approach discipline."];
  if (tags.has("DUST") || tags.has("VOLCANIC_ASH"))
    return ["Reduced Visibility — Dust / Volcanic Ash", "Low visibility from particulates requires sensor reliability check and potential approach category downgrade."];
  if (tags.has("TROPICAL_CONVECTION") || tags.has("TYPHOON_RISK"))
    return ["Tropical Convection / Typhoon Risk", "Tropical weather can develop rapidly near approach path; confirm SIGMET/PIREP currency."];
  return ["Route-Based Operational Threat", "Similar route events suggest a targeted prevention review."];
}

/** 점수를 조종사용 한 줄 요약으로 변환 */
export function riskSummary(score: number, level: string, tags: string[], nightArrival = false): string {
  const wxTags = tags.filter(t => !["COMPOUND_HIGH","AIRPORT_HISTORY","NIGHT_ARRIVAL"].includes(t));
  const wx = wxTags.length > 0 ? wxTags.slice(0, 4).join(", ") : "CLEAR";
  const night = nightArrival ? " [Night Arrival]" : "";
  if (level === "HIGH")
    return `Risk ${score}/100${night} — ${wx}: immediate action required. Re-confirm go-around criteria and ensure alternate fuel.`;
  if (level === "MEDIUM")
    return `Risk ${score}/100${night} — ${wx}: enhanced briefing required. Maintain stabilized approach standards.`;
  return `Risk ${score}/100${night} — Weather conditions acceptable. Apply standard procedures.`;
}
