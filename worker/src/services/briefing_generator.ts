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

function generateHeuristicFactors(e: EventRow): string[] {
  const factors: string[] = [];
  const s = (e.summary ?? "").toUpperCase();
  const t = (e.core_event ?? "").toUpperCase();
  const k = (e.lesson_keyword ?? "").toUpperCase();
  const haystack = `${s} ${t} ${k}`;

  // Severity and Outcome
  if ((e.severity ?? 0) >= 5 || haystack.includes("FATAL")) factors.push("Fatal Outcome");
  else if ((e.severity ?? 0) >= 4 || haystack.includes("SERIOUS INJURY")) factors.push("Serious Injury Level");

  if (haystack.includes("DESTROYED") || haystack.includes("TOTAL LOSS")) factors.push("Aircraft Destroyed");
  if (haystack.includes("SUBSTANTIAL") && haystack.includes("DAMAGE")) factors.push("Substantial Aircraft Damage");

  // Flight Phase Specifics
  if (haystack.includes("UNSTABLE") && haystack.includes("APPROACH")) factors.push("Unstable Approach Path");
  if (haystack.includes("REJECTED TAKEOFF") || haystack.includes(" RTO ")) factors.push("Rejected Takeoff (RTO)");
  if (haystack.includes("GO-AROUND") || haystack.includes("GO AROUND")) factors.push("Go-Around Executed");
  if (haystack.includes("TAILSTRIKE") || haystack.includes("TAIL STRIKE")) factors.push("Tail Strike Event");
  if (haystack.includes("HARD LANDING")) factors.push("High-G Hard Landing");

  // Environmental Threats
  if (haystack.includes(" IMC") || haystack.includes("INSTRUMENT CONDITIONS")) factors.push("IMC Conditions");
  if (haystack.includes("NIGHT") || haystack.includes("DARKNESS")) factors.push("Night Operations");
  if (haystack.includes("WINDSHEAR") || haystack.includes("LLWS")) factors.push("Windshear Reported");
  if (haystack.includes("THUNDERSTORM") || haystack.includes(" TSRA") || haystack.includes("CONVECTIVE")) factors.push("Convective Activity");
  if (haystack.includes("ICING") || haystack.includes(" ICE ") || haystack.includes("FREEZING")) factors.push("Icing Environment");
  if (haystack.includes("BIRD STRIKE")) factors.push("Bird Strike Hazard");

  // System/Technical link
  if (haystack.includes("ENGINE FAILURE") || haystack.includes("ENGINE SHUTDOWN")) factors.push("Engine Failure/Shutdown");
  if (haystack.includes("FIRE") || haystack.includes("SMOKE") || haystack.includes("FUMES")) factors.push("Fire / Smoke / Fumes");
  if (haystack.includes("HYDRAULIC")) factors.push("Hydraulic System Loss");
  if (haystack.includes("LANDING GEAR") || haystack.includes(" GEAR ")) factors.push("Landing Gear Malfunction");
  if (haystack.includes("MAINTENANCE") || haystack.includes("REPAIR")) factors.push("Maintenance/Technical Link");

  // Human Factors
  if (haystack.includes("FATIGUE")) factors.push("Crew Fatigue Factor");
  if (haystack.includes("COMMUNICATION") || haystack.includes("MISUNDERSTANDING")) factors.push("Communication Breakdown");

  return factors.length > 0 ? factors : ["Detailed factors pending AI analysis"];
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

// Fuel/Decision Support advisory — generated from event tags + flight phase
function fuelAdvisory(eTags: Set<string>, context: Record<string, unknown>): string | null {
  const ctxTags = new Set((context.arrival_tags as string[] | undefined) ?? []);
  const allTags = new Set([...eTags, ...ctxTags]);
  const isEtops = ETOPS_CONTEXT_TYPES.has(
    ((context.aircraft_type as string) ?? "").toUpperCase().replace(/[-\s]/g, "").slice(0, 4)
  );

  const lines: string[] = [];

  // ETOPS sectors: diversion fuel check
  if (isEtops && (allTags.has("ETOPS") || (context.route as string ?? "").length > 6)) {
    lines.push("Confirm ETOPS diversion fuel covers worst-case equal-time point (ETP) with 30 min reserve at alternate.");
  }

  // Tailwind → landing distance performance
  if (allTags.has("TAILWIND")) {
    lines.push("Tailwind increases landing distance. Verify LDA with tailwind component; consider requesting upwind runway or holding for wind shift.");
  }

  // Low visibility / CAT II/III → missed approach fuel
  if (["CAT_III_C","CAT_III_B","CAT_III_A","CAT_II","LOW_VISIBILITY","FOG"].some(t => allTags.has(t))) {
    lines.push("Low-vis operation increases missed approach probability. Carry extra fuel for one additional approach + alternate + 30 min final reserve.");
  }

  // Windshear / convective → go-around fuel
  if (allTags.has("WINDSHEAR") || allTags.has("TSRA") || allTags.has("CB")) {
    lines.push("Windshear or convective weather: pre-brief go-around fuel state. Ensure fuel supports diversion to alternate if go-around initiated below 1,000 ft AAL.");
  }

  // Contaminated runway → braking action uncertainty
  if (allTags.has("FZRAIN") || allTags.has("BLOWING_SNOW") || allTags.has("CONTAMINATED_SURFACE")) {
    lines.push("Contaminated runway: validate RCAM/RWYCC before descent. If RWYCC < 3, recalculate landing distance with increased stopping margin.");
  }

  // Icing on approach
  if (allTags.has("ICING") || allTags.has("FZRAIN")) {
    lines.push("Icing environment: confirm anti-ice on prior to FAF; account for fuel burn increase with continuous ignition and anti-ice systems active.");
  }

  if (lines.length === 0) return null;
  return lines.join(" | ");
}

// ETOPS-capable types (duplicated from similarity_engine to avoid circular import)
const ETOPS_CONTEXT_TYPES = new Set(["B787","B788","B789","B78X","A359","A35K","A350","B772","B773","B77W","B77L"]);

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

function generateHeuristicLessons(e: EventRow): string[] {
  const lessons: string[] = [];
  const phase = (e.flight_phase ?? "").toUpperCase();
  const type = (e.event_type ?? "").toUpperCase();
  const summary = (e.summary ?? "").toUpperCase();

  if (phase === "LANDING" || phase === "APPROACH") {
    lessons.push("Strict adherence to stabilized approach criteria is mandatory below 1,000 ft AAL.");
    lessons.push("Perform early missed-approach briefing focusing on terrain and go-around thrust settings.");
  } else if (phase === "TAKEOFF" || phase === "CLIMB") {
    lessons.push("Verify takeoff performance for actual runway conditions and ambient temperature.");
  }

  if (type.includes("FIRE") || summary.includes("SMOKE")) {
    lessons.push("Immediate execution of 'Smoke/Fire/Fumes' checklist; prioritize immediate landing at nearest suitable airport.");
  }

  if (lessons.length === 0 && e.pilot_briefing_sentence) {
    lessons.push(e.pilot_briefing_sentence);
  }

  return lessons.length > 0 ? lessons : ["Review full occurrence report for human factors and organizational precursors."];
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

    // Factors: AI (if exists) or Heuristic
    let factors = jsonList(event.contributing_factors);
    if (factors.length === 0) {
      factors = generateHeuristicFactors(event);
    }

    // Lessons: AI or Heuristic
    let lessons = jsonList(event.operational_lessons);
    if (lessons.length === 0) {
      lessons = generateHeuristicLessons(event);
    }

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
        contributing_factors: factors,
        operational_lessons: lessons,
        a350_b787_applicability: a350b787(event),
        recommended_action: recAction,
        fuel_advisory: fuelAdvisory(eTags, context),
        briefing_keywords: briefingKeywords(event),
      });
    }
    if (groups.size >= 5 && [...groups.values()].every(g => g.events.length > 0)) break;
  }

  return [...groups.values()].slice(0, 5);
}
