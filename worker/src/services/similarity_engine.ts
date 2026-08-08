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
  return [e.summary, e.weather_summary, e.core_event, e.lesson_keyword]
    .filter(Boolean).join(". ").slice(0, 350);
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

function scoreEvent(event: EventRow, context: Record<string, unknown>, tags: string[], eTags: Set<string>): number {
  let score = 0;

  // 1. 도착 공항 일치 (최고 우선순위) — 매칭되면 높은 점수 부여
  if (event.airport_icao && event.airport_icao === context.arrival_icao) score += 25;
  else if (event.airport_iata && event.airport_iata === context.arrival_iata)  score += 20;
  if (event.runway && event.runway === context.destination_runway) score += 10;

  // 2. 도착 시간대 TAF 날씨 태그 (가중치 적용)
  const arrivalTags = new Set((context.arrival_tags as string[] | undefined) ?? []);
  if (arrivalTags.size > 0 && eTags.size > 0) {
    let wx = 0;
    for (const t of arrivalTags) {
      if (!eTags.has(t)) continue;
      if (HIGH_IMPACT_TAGS.has(t)) wx += 8;
      else if (MED_IMPACT_TAGS.has(t)) wx += 4;
      else wx += 2;
    }
    score += Math.min(35, wx);
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

  // 6. 중증도 가중치 (sᵢ) × 시간 감쇠 (dᵢ = exp(-λΔt))
  score = score * severityMultiplier(event.severity) * recencyDecay(event.event_date);

  return Math.min(score, 100);
}

// ─── 핵심 수정: 공항 ICAO 하드필터 제거 ────────────────────────────────────────
// 기존: hasArrival이면 airport_icao가 일치하는 이벤트만 포함 → 69% 미매핑 이벤트 전부 누락
// 변경: 항상 점수 임계값(15점) 기준으로 필터링
//       - 공항 매칭 시 +20~25점이므로 공항 일치 이벤트는 자동으로 상위 랭크
//       - 날씨 태그 고위험 2개 이상 일치 시에도 포함 (wx >= 16점 → 임계값 통과)
export async function rankedEvents(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number][]> {
  const [{ results }, allTags] = await Promise.all([
    db.prepare("SELECT * FROM events").all<EventRow>(),
    loadAllTags(db),
  ]);

  const scored: [EventRow, number][] = [];
  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if (score >= 15) scored.push([event, score]);
  }

  return scored.sort(([, a], [, b]) => b - a);
}

export async function rankedEventsWithTags(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number, Set<string>][]> {
  const [{ results }, allTags] = await Promise.all([
    db.prepare("SELECT * FROM events").all<EventRow>(),
    loadAllTags(db),
  ]);

  const scored: [EventRow, number, Set<string>][] = [];
  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if (score >= 15) scored.push([event, score, eTags]);
  }

  return scored.sort(([, a], [, b]) => b - a);
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
