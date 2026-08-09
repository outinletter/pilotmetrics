import type { EventRow } from "../types";
import { threatForTags } from "./risk_tagger";
import { jsonList, rankedEventsWithTags, rankedEventsWithLLM } from "./similarity_engine";

function eventTitle(e: EventRow): string {
  const year = (e.event_date ?? "0000").slice(0, 4);
  return `${year} ${e.airport_iata} ${e.runway} ${e.approach_type} ${e.aircraft_type} | ${e.weather_summary} | ${e.core_event} - ${e.lesson_keyword}`;
}

function oneLine(e: EventRow, sim: number): string {
  return `${sim}% | ${e.runway ?? "ROUTE"} | ${e.weather_summary} | ${e.approach_type} | ${e.aircraft_type} | ${e.event_type} | ${e.lesson_keyword}`.toUpperCase();
}

function severityLabel(v: number | null): string {
  if ((v ?? 0) >= 5) return "Critical";
  if ((v ?? 0) >= 4) return "High";
  if ((v ?? 0) >= 3) return "Medium";
  return "Low";
}

function matchLevel(s: number) { return s >= 70 ? "High match" : s >= 50 ? "Medium match" : "Low match"; }
function matchClass(s: number) { return s >= 70 ? "high" : s >= 50 ? "medium" : "low"; }

function a350b787(e: EventRow): string {
  const ac = e.aircraft_type ?? "";
  if (["A350","B787","B78"].some(x => ac.includes(x))) return "Directly applicable to A350/B787 long-haul operations.";
  return "Use as a comparable jet-operations lesson when briefing A350/B787 long-haul crews.";
}

const KNOWN_PHASES = new Set(["APPROACH", "LANDING", "CRUISE", "PREFLIGHT", "TAKEOFF", "CLIMB", "DESCENT"]);

function recommendedAction(e: EventRow): string {
  const phase = (e.flight_phase ?? "").toUpperCase().trim();
  if (["APPROACH", "LANDING"].includes(phase)) return "Include in arrival briefing, stable-approach gates, go-around decision review, and recurrent simulator scenarios.";
  if (phase === "CRUISE") return "Review dispatch release, ETOPS alternates, fuel decision points, and enroute contingency briefing.";
  if (phase === "PREFLIGHT") return "Review MEL/CDL, dispatch release limitations, and crew threat briefing before acceptance.";
  if (["TAKEOFF", "CLIMB"].includes(phase)) return "Review departure briefing, performance calculations, and engine-failure or abnormal-procedure drills.";
  if (phase === "DESCENT") return "Include in descent-planning review, STAR constraints, and weather-awareness briefing.";
  // flight_phase 미상 또는 비표준 값 → General Awareness
  return "General Awareness — use for safety trend monitoring, recurrent training, and threat-briefing supplements. Flight phase not specified in source data.";
}

function resolveFlightPhase(e: EventRow): string {
  const phase = (e.flight_phase ?? "").toUpperCase().trim();
  return KNOWN_PHASES.has(phase) ? phase : "UNKNOWN";
}

export async function buildThreats(db: D1Database, context: Record<string, unknown>, tags: string[], ai?: Ai): Promise<unknown[]> {
  const groups = new Map<string, { title: string; description: string; events: unknown[] }>();

  const ranked = ai
    ? await rankedEventsWithLLM(db, ai, context, tags)
    : await rankedEventsWithTags(db, context, tags);

  for (const [event, similarity, eTags] of ranked.slice(0, 18)) {
    let [title, description] = threatForTags(eTags);

    // flight_phase 불확실 이벤트는 위협 그룹 내에서 "General Awareness"로 표시
    const phase = resolveFlightPhase(event);
    const phaseLabel = phase === "UNKNOWN" ? " [General Awareness]" : "";
    const recAction = recommendedAction(event);

    if (!groups.has(title)) groups.set(title, { title, description, events: [] });
    const g = groups.get(title)!;
    if (g.events.length < 4) {
      g.events.push({
        id: event.id, similarity, match_level: matchLevel(similarity), match_class: matchClass(similarity),
        one_line: oneLine(event, similarity), detail_title: eventTitle(event),
        date: event.event_date ?? event.published_date ?? "",
        source_name: event.source_name ?? "", source_url: event.source_url ?? "",
        operation_type: event.operation_type ?? "", aircraft_type: event.aircraft_type ?? "",
        operator: event.operator ?? "", severity: severityLabel(event.severity),
        flight_phase: phase + phaseLabel,
        summary: event.summary ?? "",
        contributing_factors: jsonList(event.contributing_factors),
        operational_lessons: jsonList(event.operational_lessons),
        a350_b787_applicability: a350b787(event),
        recommended_action: recAction,
        pilot_briefing_sentence: event.pilot_briefing_sentence ?? "",
      });
    }
    if (groups.size >= 5 && [...groups.values()].every(g => g.events.length > 0)) break;
  }

  return [...groups.values()].slice(0, 5);
}
