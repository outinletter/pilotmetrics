import type { EventRow } from "../types";

export function jsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export async function eventTags(db: D1Database, eventId: string): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT tag_value FROM event_tags WHERE event_id = ?").bind(eventId).all<{ tag_value: string }>();
  return new Set(results.map(r => r.tag_value));
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
  // KE 운항 기종 가중치
  const ac = (event.aircraft_type ?? "").toUpperCase().replace(/[-\s]/g, "").slice(0, 4);
  if (KE_AIRCRAFT.has(ac)) score += 8;
  return Math.min(score, 100);
}

export async function rankedEvents(db: D1Database, context: Record<string, unknown>, tags: string[]): Promise<[EventRow, number][]> {
  const { results } = await db.prepare("SELECT * FROM events").all<EventRow>();
  const hasArrival = !!(context.arrival_icao as string);
  // arrival_icao 없으면 임계값 완화 (노선 DB에 없는 편명 대응)
  const threshold = hasArrival ? 35 : 20;
  const scored: [EventRow, number, Set<string>][] = [];
  for (const event of results) {
    const eTags = await eventTags(db, event.id);
    const score = scoreEvent(event, context, tags, eTags);
    if ((hasArrival && event.airport_icao === context.arrival_icao) || score >= threshold) {
      scored.push([event, score, eTags]);
    }
  }
  return scored
    .sort(([, as], [, bs]) => bs - as)
    .map(([e, s]) => [e, s] as [EventRow, number]);
}
