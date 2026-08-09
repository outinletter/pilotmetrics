import type { EventRow } from "../types";

// ── 코사인 유사도 ─────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function contextText(context: Record<string, unknown>, tags: string[]): string {
  return [
    context.arrival_icao ? `arrival airport ${context.arrival_icao}` : "",
    context.arrival_iata ? `IATA ${context.arrival_iata}` : "",
    context.aircraft_type ? `aircraft ${context.aircraft_type}` : "",
    context.route ? `route ${context.route}` : "",
    tags.length ? `weather: ${tags.slice(0, 8).join(" ")}` : "",
  ].filter(Boolean).join(". ");
}

function eventText(e: EventRow): string {
  return [
    e.summary,
    // weather_summary는 METAR 백필이 확인된 경우(metar_source 있음)만 포함
    // 미확인 시 포함하면 위치 텍스트 또는 정오 추정값이 임베딩 오염 유발
    e.metar_source ? e.weather_summary : null,
    e.flight_conditions,   // VMC/IMC — 비행 조건 유사도 기여
    e.core_event,
    e.lesson_keyword,
  ].filter(Boolean).join(". ").slice(0, 350);
}

export function jsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export async function eventTags(db: D1Database, eventId: string): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT tag_value FROM event_tags WHERE event_id = ?").bind(eventId).all<{ tag_value: string }>();
  return new Set(results.map(r => r.tag_value));
}

async function loadAllTags(db: D1Database): Promise<Map<string, Set<string>>> {
  const { results } = await db.prepare("SELECT event_id, tag_value FROM event_tags").all<{ event_id: string; tag_value: string }>();
  const map = new Map<string, Set<string>>();
  for (const r of results) {
    if (!map.has(r.event_id)) map.set(r.event_id, new Set());
    map.get(r.event_id)!.add(r.tag_value);
  }
  return map;
}

const KE_AIRCRAFT = new Set(["B737","B738","B739","B773","B777","B787","B788","B789","B78X","A333","A330","A350","A359","A380","A388"]);

const HIGH_IMPACT_TAGS = new Set([
  "TSRA","CB","THUNDERSTORM","CONVECTIVE_WEATHER",
  "WINDSHEAR","FOG","LOW_VISIBILITY",
]);
const MED_IMPACT_TAGS = new Set([
  "GUST","HEAVY_RAIN","UNSTABLE_APPROACH_RISK","WET_RWY",
]);

// P2 Fix: Weather tag families — only the highest-scoring tag per family counts
// Prevents FOG+LOW_VISIBILITY or THUNDERSTORM+CB+TSRA from inflating scores
const WEATHER_FAMILIES: string[][] = [
  ["TSRA","CB","THUNDERSTORM","CONVECTIVE_WEATHER"],  // convective family
  ["FOG","LOW_VISIBILITY"],                           // visibility family
  ["GUST","HEAVY_RAIN"],                              // precipitation family
];
function deduplicatedWeatherScore(matchedTags: string[]): number {
  const scored = matchedTags.map(t =>
    HIGH_IMPACT_TAGS.has(t) ? 8 : MED_IMPACT_TAGS.has(t) ? 4 : 2
  );
  const used = new Set<string>();
  let total = 0;
  // sort descending by score so the best tag in each family wins
  const pairs = matchedTags.map((t, i) => [t, scored[i]] as [string, number])
    .sort(([,a],[,b]) => b - a);
  for (const [tag, pts] of pairs) {
    const family = WEATHER_FAMILIES.find(f => f.includes(tag));
    const familyKey = family ? family[0] : tag; // canonical family key
    if (!used.has(familyKey)) { used.add(familyKey); total += pts; }
  }
  return total;
}

// λ = 0.08 → half-life ≈ 8.7 years (older events fade but remain usable)
const RECENCY_LAMBDA = 0.08;

function recencyDecay(eventDate: string | null): number {
  if (!eventDate) return 0.7; // unknown date → moderate penalty
  const eventMs = new Date(eventDate).getTime();
  if (isNaN(eventMs)) return 0.7;
  const yearsAgo = (Date.now() - eventMs) / (365.25 * 24 * 3600 * 1000);
  return Math.exp(-RECENCY_LAMBDA * Math.max(0, yearsAgo));
}

// severity field 1-10 → multiplier 1.0-1.3
function severityMultiplier(severity: number | null): number {
  if (!severity) return 1.0;
  if (severity >= 8) return 1.3;
  if (severity >= 5) return 1.15;
  return 1.0;
}

// GA(일반항공) 기종 패턴 — Part 121 브리핑에서 관련성 없음
const GA_AIRCRAFT_PATTERN = /DHC|CESSNA|PIPER|BEECH|CIRRUS|MOONEY|BONANZA|SENECA|BARON|SKYHAWK|SKYLANE|STINSON|MAULE|GRUMMAN|CHAMPION|ROBINSON|BELL 2|R22|R44|PA-2|PA-3|PA-4|C172|C182|C150|C152/i;

function sourceQualityMultiplier(sourceName: string | null, aircraftType: string | null): number {
  // 일반항공 기종 → Part 121 브리핑 관련성 낮음
  if (aircraftType && GA_AIRCRAFT_PATTERN.test(aircraftType)) return 0.25;
  // 샘플 데이터 — 실제 사고 데이터 우선
  if (sourceName === "Sample/demo data") return 0.6;
  return 1.0;
}

function scoreEvent(event: EventRow, context: Record<string, unknown>, tags: string[], eTags: Set<string>): number {
  let score = 0;

  // 1. 도착 공항 일치 (최고 우선순위) — 매칭되면 높은 점수 부여
  if (event.airport_icao && event.airport_icao === context.arrival_icao) score += 25;
  else if (event.airport_iata && event.airport_iata === context.arrival_iata)  score += 20;
  if (event.runway && event.runway === context.destination_runway) score += 10;

  // 2. 도착 시간대 TAF 날씨 태그 (패밀리 중복 제거 후 가중치 적용)
  const arrivalTags = new Set((context.arrival_tags as string[] | undefined) ?? []);
  if (arrivalTags.size > 0 && eTags.size > 0) {
    const matched = [...arrivalTags].filter(t => eTags.has(t));
    score += Math.min(35, deduplicatedWeatherScore(matched));
  } else {
    const tagSet = new Set(tags);
    if (tagSet.size && eTags.size) {
      const common = [...tagSet].filter(t => eTags.has(t)).length;
      score += Math.min(20, Math.round(20 * common / Math.max(1, tagSet.size)));
    }
  }

  // 3. 현재 METAR 날씨 보조 반영
  const metarTags = new Set((context.metar_tags as string[] | undefined) ?? []);
  if (metarTags.size > 0) {
    for (const t of metarTags) {
      if (eTags.has(t) && HIGH_IMPACT_TAGS.has(t)) score += 3;
    }
  }

  // 4. 비행 단계 / 항공기 카테고리
  if (event.aircraft_category === "JET") score += 8;
  if (["APPROACH","LANDING"].includes(event.flight_phase ?? "")) score += 10;
  if (["VISUAL","RNAV","ILS"].includes(event.approach_type ?? "")) score += 5;

  // 5. KE 운항 기종 일치
  const ac = (event.aircraft_type ?? "").toUpperCase().replace(/[-\s]/g, "").slice(0, 4);
  if (KE_AIRCRAFT.has(ac)) score += 7;

  // 6. 중증도 가중치 (sᵢ) × 시간 감쇠 (dᵢ = exp(-λΔt)) × 데이터 품질
  score = score
    * severityMultiplier(event.severity)
    * recencyDecay(event.event_date)
    * sourceQualityMultiplier(event.source_name, event.aircraft_type);

  return Math.min(score, 100);
}

// ── 중복 억제 (P3: 크로스소스 개선) ─────────────────────────────────────────
// 동일 사고가 NTSB + TSB + SKYbrary 등 여러 소스에 중복 수록되는 경우 방지.
// 클러스터 키: (공항, 연-월, 이벤트 유형 접두 4자) → 동일 월 동일 공항 동일 유형은 1건만.
function deduplicateResults<T extends [EventRow, number, ...unknown[]]>(ranked: T[]): T[] {
  const seen = new Map<string, number>();
  const keep: T[] = [];

  for (const item of ranked) {
    const [event, score] = item;
    const airport = event.airport_icao || event.airport_iata || "UNKN";
    // 월 단위 윈도우: 동일 공항+동일 월 내 동일 이벤트 유형은 같은 사고로 간주
    const yearMonth = (event.event_date ?? "").slice(0, 7);
    const evtPrefix = (event.event_type ?? event.core_event ?? "").toLowerCase().slice(0, 4);
    const clusterKey = `${airport}|${yearMonth}|${evtPrefix}`;

    // 보조 키: 정확히 같은 날짜 + 공항 (소스 무관 중복 억제)
    const exactKey = `${airport}|${(event.event_date ?? "").slice(0, 10)}`;

    const key = seen.has(exactKey) ? exactKey : clusterKey;

    if (!seen.has(key)) {
      seen.set(key, keep.length);
      seen.set(exactKey, keep.length); // 정확한 날짜 키도 등록
      keep.push(item);
    } else {
      const existIdx = seen.get(key)!;
      if (score > (keep[existIdx][1] as number)) {
        keep[existIdx] = item;
      }
    }
  }

  return keep;
}

// ── P1: SQL 사전 필터링 ───────────────────────────────────────────────────────
// SELECT * FROM events (22k rows) → JS 반복은 메모리/CPU 한계 도달 위험.
// 전략: aircraft_category='JET' SQL 필터로 GA 제외 → 약 60% 행 감소.
// 추가로 도착 공항 일치 이벤트(ICAO/IATA)를 먼저 조회해 상위 후보에 포함.
async function fetchCandidates(db: D1Database, context: Record<string, unknown>): Promise<EventRow[]> {
  const arrIcao = (context.arrival_icao as string | undefined) ?? "";
  const arrIata = (context.arrival_iata as string | undefined) ?? "";

  // 1차: 공항 일치 이벤트 (소규모 → 빠름)
  const airportRows: EventRow[] = [];
  if (arrIcao || arrIata) {
    const { results } = await db.prepare(
      `SELECT * FROM events WHERE aircraft_category = 'JET'
       AND (airport_icao = ? OR airport_iata = ?) LIMIT 300`
    ).bind(arrIcao || "", arrIata || "").all<EventRow>();
    airportRows.push(...results);
  }

  // 2차: 전체 JET 풀 (공항 무관 — 날씨/유사 태그 매칭용)
  const { results: jetRows } = await db.prepare(
    "SELECT * FROM events WHERE aircraft_category = 'JET' LIMIT 5000"
  ).all<EventRow>();

  // 병합 — 공항 일치 행 우선, ID 기준 중복 제거
  const seen = new Set<string>(airportRows.map(r => r.id));
  for (const r of jetRows) if (!seen.has(r.id)) { seen.add(r.id); airportRows.push(r); }
  return airportRows;
}

export async function rankedEvents(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number][]> {
  const [results, allTags] = await Promise.all([
    fetchCandidates(db, context),
    loadAllTags(db),
  ]);

  const scored: [EventRow, number][] = [];
  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if (score >= 22) scored.push([event, score]);
  }

  return deduplicateResults(scored.sort(([, a], [, b]) => b - a));
}

export async function rankedEventsWithTags(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number, Set<string>][]> {
  const [results, allTags] = await Promise.all([
    fetchCandidates(db, context),
    loadAllTags(db),
  ]);

  const scored: [EventRow, number, Set<string>][] = [];
  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if (score >= 22) scored.push([event, score, eTags]);
  }

  return deduplicateResults(scored.sort(([, a], [, b]) => b - a));
}

// ── LLM 임베딩 재랭킹 (2단계 파이프라인) ────────────────────────────────────
// 1차: 다중요소 스코어링 → Top 30 후보 선발
// 2차: BGE 배치 임베딩 → 코사인 유사도 → blended score
// AI 실패 시 1차 결과 그대로 fallback
export async function rankedEventsWithLLM(
  db: D1Database,
  ai: Ai,
  context: Record<string, unknown>,
  tags: string[],
): Promise<[EventRow, number, Set<string>][]> {
  const candidates = (await rankedEventsWithTags(db, context, tags)).slice(0, 30);
  if (candidates.length === 0) return [];

  const queryText = contextText(context, tags);
  const texts = [queryText, ...candidates.map(([e]) => eventText(e))];

  let embeddings: number[][] | null = null;
  try {
    const result = await Promise.race([
      (ai as unknown as { run: (m: string, p: unknown) => Promise<{ data: number[][] }> })
        .run("@cf/baai/bge-base-en-v1.5", { text: texts }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    embeddings = result.data;
  } catch {
    return candidates.slice(0, 18);
  }

  if (!embeddings || embeddings.length < 2) return candidates.slice(0, 18);

  const queryEmb = embeddings[0];
  const reranked: [EventRow, number, Set<string>][] = candidates.map(([event, mfScore, eTags], i) => {
    const sim = embeddings![i + 1] ? cosine(queryEmb, embeddings![i + 1]) : 0;
    // 블렌딩: 다중요소 점수 50% + 코사인 유사도 50% (0-100 정규화)
    const blended = Math.min(100, Math.round(0.5 * mfScore + 50 * sim));
    return [event, blended, eTags];
  });

  return reranked.sort(([, a], [, b]) => b - a);
}
