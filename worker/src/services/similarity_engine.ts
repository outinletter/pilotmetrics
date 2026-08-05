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

function scoreEvent(event: EventRow, context: Record<string, unknown>, tags: string[], eTags: Set<string>): number {
  let score = 0;
  const tagSet = new Set(tags);
  if (event.airport_icao && event.airport_icao === context.arrival_icao) score += 25;
  if (event.runway && event.runway === context.destination_runway) score += 15;
  if (tagSet.size && eTags.size) {
    const common = [...tagSet].filter(t => eTags.has(t)).length;
    score += Math.min(25, Math.round(25 * common / Math.max(1, tagSet.size)));
  }
  if (["VISUAL","RNAV","ILS"].includes(event.approach_type ?? "")) score += 10;
  if (event.aircraft_category === "JET") score += 10;
  if (["APPROACH","LANDING"].includes(event.flight_phase ?? "")) score += 10;
  if (["UNSTABLE_APPROACH_RISK","CONVECTIVE_WEATHER","WET_RWY"].some(t => eTags.has(t))) score += 5;
  const ac = (event.aircraft_type ?? "").toUpperCase().replace(/[-\s]/g, "").slice(0, 4);
  if (KE_AIRCRAFT.has(ac)) score += 8;
  return Math.min(score, 100);
}

export async function rankedEvents(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number][]> {
  // events + 전체 tags를 각 1회 쿼리로 처리 (N+1 → 2회)
  const [{ results }, allTags] = await Promise.all([
    db.prepare("SELECT * FROM events").all<EventRow>(),
    loadAllTags(db),
  ]);

  const hasArrival = !!(context.arrival_icao as string);
  const threshold = hasArrival ? 35 : 20;
  const scored: [EventRow, number][] = [];

  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if ((hasArrival && event.airport_icao === context.arrival_icao) || score >= threshold) {
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

  const hasArrival = !!(context.arrival_icao as string);
  const threshold = hasArrival ? 35 : 20;
  const scored: [EventRow, number, Set<string>][] = [];

  for (const event of results) {
    const eTags = allTags.get(event.id) ?? new Set<string>();
    const score = scoreEvent(event, context, tags, eTags);
    if ((hasArrival && event.airport_icao === context.arrival_icao) || score >= threshold) {
      scored.push([event, score, eTags]);
    }
  }

  return scored.sort(([, a], [, b]) => b - a);
}
