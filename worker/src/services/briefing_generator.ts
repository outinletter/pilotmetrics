import type { EventRow } from "../types";
import { threatForTags } from "./risk_tagger";
import { jsonList, rankedEventsWithTags, rankedEventsWithLLM } from "./similarity_engine";

function eventTitle(e: EventRow): string {
  const year = (e.event_date ?? "0000").slice(0, 4);
  return `${year} ${e.airport_iata} ${e.runway} ${e.approach_type} ${e.aircraft_type} | ${e.weather_summary} | ${e.core_event} - ${e.lesson_keyword}`;
}

function oneLine(e: EventRow, sim: number): string {
  const kw = (!e.lesson_keyword || KW_NOISE.test(e.lesson_keyword))
    ? (e.core_event ?? e.event_type ?? "")
    : e.lesson_keyword;
  const parts = [
    e.airport_iata || e.airport_icao || "",
    e.aircraft_type || "",
    e.flight_phase || "",
    kw,
  ].filter(Boolean);
  return `${sim}% | ${parts.join(" | ")}`.toUpperCase();
}

function severityLabel(v: number | null): string {
  if ((v ?? 0) >= 5) return "Critical";
  if ((v ?? 0) >= 4) return "High";
  if ((v ?? 0) >= 3) return "Medium";
  return "Low";
}

function matchLevel(s: number) { return s >= 70 ? "High match" : s >= 50 ? "Medium match" : "Low match"; }
function matchClass(s: number) { return s >= 70 ? "high" : s >= 50 ? "medium" : "low"; }

// Noise patterns — substring match, not meaningful safety info
const KW_NOISE = /tsb|ntsb|carol|faa\b|easa\b|occurrence|incident.*class|accident.*class|sample.*demo|part\s*121|air\s*transport|\b[a-z]\d{2}[a-z]\d{4}\b/i;

// Aviation hazard vocabulary scanned against summary text
const AVIATION_TERMS: [RegExp, string][] = [
  [/unstable approach/i,        "Unstable Approach"],
  [/go.around/i,                "Go-Around"],
  [/missed approach/i,          "Missed Approach"],
  [/wind.?shear/i,              "Windshear"],
  [/GPWS|EGPWS|terrain/i,       "Terrain Warning (GPWS)"],
  [/TCAS|RA|resolution advisory/i, "TCAS RA"],
  [/low visibility|low vis/i,   "Low Visibility"],
  [/fog|RVR/i,                  "Fog / Low RVR"],
  [/turbulence/i,               "Turbulence"],
  [/icing|ice accretion/i,      "Icing"],
  [/thunderstorm|convect/i,     "Thunderstorm"],
  [/engine failure|engine shut/i, "Engine Failure"],
  [/bird strike/i,              "Bird Strike"],
  [/hydraulic/i,                "Hydraulic System"],
  [/fire.{0,10}warn|smoke/i,    "Fire / Smoke Warning"],
  [/pressuri[sz]/i,             "Pressurization"],
  [/spoiler/i,                  "Spoiler Malfunction"],
  [/gear|landing gear/i,        "Landing Gear"],
  [/flap/i,                     "Flap Issue"],
  [/runway excursion|veer/i,    "Runway Excursion"],
  [/tail strike/i,              "Tail Strike"],
  [/hard landing/i,             "Hard Landing"],
  [/incapacitat/i,              "Crew Incapacitation"],
  [/fatigue/i,                  "Crew Fatigue"],
  [/communication|ATC\s/i,      "ATC Communication"],
  [/PAN.?PAN|MAYDAY/i,          "Emergency Declaration"],
  [/fuel/i,                     "Fuel Management"],
  [/depressuri[sz]/i,           "Depressurization"],
  [/rejected takeoff|RTO/i,     "Rejected Takeoff"],
  [/tail.?wind/i,               "Tailwind"],
  [/crosswind/i,                "Crosswind"],
];

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function cleanToken(raw: string): string {
  return raw.replace(/^[-–•*]\s*/, "").split(/[,;.]/)[0].trim();
}

function isUsable(k: string): boolean {
  const t = k.trim();
  return t.length > 2 && t.split(/\s+/).length <= 6 && !KW_NOISE.test(t);
}

function briefingKeywords(e: EventRow): string[] {
  const candidates: string[] = [];

  // 1. lesson_keyword — comma/semicolon separated, filter noise
  if (e.lesson_keyword) {
    for (const part of e.lesson_keyword.split(/[,;|]+/)) {
      const k = part.trim();
      if (isUsable(k)) candidates.push(toTitleCase(k));
    }
  }

  // 2. core_event — most reliable meaningful description
  if (e.core_event) {
    // split on " on ", " during ", " at ", " after ", "/" to get sub-phrases
    const parts = e.core_event.split(/\s+(?:on|during|at|after|due to)\s+|\/|-(?=\s)/i);
    for (const p of parts) {
      const k = p.trim();
      if (isUsable(k)) candidates.push(toTitleCase(k));
    }
  }

  // 3. event_type — skip generic incident class codes
  if (e.event_type && isUsable(e.event_type)) {
    const k = e.event_type.replace(/_/g, " ").trim();
    if (isUsable(k)) candidates.push(toTitleCase(k));
  }

  // 4. contributing_factors — short phrases only
  for (const f of jsonList(e.contributing_factors)) {
    const k = cleanToken(f);
    if (isUsable(k)) candidates.push(toTitleCase(k));
  }

  // 5. summary — scan for known aviation hazard terms (fallback when other fields are empty)
  if (e.summary) {
    for (const [re, label] of AVIATION_TERMS) {
      if (re.test(e.summary)) candidates.push(label);
    }
  }

  // 6. flight_phase — always useful context
  const phase = (e.flight_phase ?? "").toUpperCase().trim();
  if (phase && !["UNKNOWN",""].includes(phase)) candidates.push(phase.charAt(0) + phase.slice(1).toLowerCase() + " Phase");

  // deduplicate and limit
  const seen = new Set<string>();
  return candidates.filter(k => !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase())).slice(0, 6);
}

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
        briefing_keywords: briefingKeywords(event),
      });
    }
    if (groups.size >= 5 && [...groups.values()].every(g => g.events.length > 0)) break;
  }

  return [...groups.values()].slice(0, 5);
}
