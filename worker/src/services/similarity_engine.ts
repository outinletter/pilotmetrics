import type { EventRow } from "../types";

export function jsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

// 개별 이벤트 태그 조회 (briefing_generator 내부용)
export async function eventTags(db: D1Database, eventId: string): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT tag_value FROM event_tags WHERE event_id = ?").bind(eventId).all<{ tag_value: string }>();
  return new Set(results.map(r => r.tag_value));
}

// 전체 태그를 한 번에 로드 → Map<eventId, Set<tagValue>>
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

// 고위험 기상 태그 (도착 시간대 발생 시 위협도 높음)
const HIGH_IMPACT_TAGS = new Set([
  "TSRA","CB","THUNDERSTORM","CONVECTIVE_WEATHER",
  "WINDSHEAR","FOG","LOW_VISIBILITY",
]);
// 중간 위험 태그
const MED_IMPACT_TAGS = new Set([
  "GUST","HEAVY_RAIN","UNSTABLE_APPROACH_RISK","WET_RWY",
]);

function scoreEvent(event: EventRow, context: Record<string, unknown>, tags: string[], eTags: Set<string>): number {
  let score = 0;

  // 1. 도착 공항 일치 (최고 우선순위)
  if (event.airport_icao && event.airport_icao === context.arrival_icao) score += 25;
  if (event.runway && event.runway === context.destination_runway) score += 10;

  // 2. 도착 시간대 TAF 날씨 태그 (가중치 적용)
  const arrivalTags = new Set((context.arrival_tags as string[] | undefined) ?? []);
  if (arrivalTags.size > 0 && eTags.size > 0) {
    let wx = 0;
    for (const t of arrivalTags) {
      if (!eTags.has(t)) continue;
      if (HIGH_IMPACT_TAGS.has(t)) wx += 8;       // 고위험 기상 일치: 8점
      else if (MED_IMPACT_TAGS.has(t)) wx += 4;   // 중위험 일치: 4점
      else wx += 2;                                 // 기타 일치: 2점
    }
    score += Math.min(35, wx); // 최대 35점 (도착 날씨가 가장 중요)
  } else {
    // arrival_tags 없을 때 기존 전체 태그 방식 유지 (폴백)
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

  return Math.min(score, 100);
}

export async function rankedEvents(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number][]> {
  // events + 전체 tags를 각 1회 쿼리로 처리 (N+1 → 2회)
  const [{ results }, allTags] = await Promise.all([
    db.prepare("SELECT * FROM events").all<EventRow>(),
    loadAllTags(db),
  ]);

  const arrIcao = (context.arrival_icao as string) || "";
  const hasArrival = !!arrIcao;
  const scored: [EventRow, number][] = [];

  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    // 도착 공항 있으면 해당 공항 이벤트만, 없으면 임계값 이상
    if (hasArrival ? event.airport_icao === arrIcao : score >= 20) {
      scored.push([event, score]);
    }
  }

  return scored.sort(([, a], [, b]) => b - a);
}

// 태그 포함 버전: briefing_generator에서 재쿼리 없이 사용
export async function rankedEventsWithTags(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number, Set<string>][]> {
  const [{ results }, allTags] = await Promise.all([
    db.prepare("SELECT * FROM events").all<EventRow>(),
    loadAllTags(db),
  ]);

  const arrIcao = (context.arrival_icao as string) || "";
  const hasArrival = !!arrIcao;
  const scored: [EventRow, number, Set<string>][] = [];

  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if (hasArrival ? event.airport_icao === arrIcao : score >= 20) {
      scored.push([event, score, eTags]);
    }
  }

  return scored.sort(([, a], [, b]) => b - a);
}
