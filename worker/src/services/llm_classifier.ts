/**
 * Cloudflare Workers AI를 이용한 항공 안전 이벤트 분류기
 * 모델: @cf/meta/llama-3.1-8b-instruct (Workers AI 무료 티어)
 */

const AVIATION_CATEGORIES = [
  "Accident / Incident",
  "Human Factors / CRM",
  "Flight Operations",
  "Regulation",
  "Training",
  "Security / External Threat",
  "Industry Trends",
] as const;

export type ClassifyResult = {
  category: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  operational_lesson: string;
  airport_hint: string;   // 텍스트에서 추출한 공항 코드 힌트 (빈 문자열 가능)
  confidence: number;     // 0~1
};

const SEVERITY_MAP: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

export async function llmClassify(ai: Ai, title: string, summary: string): Promise<ClassifyResult | null> {
  const text = `${title}\n\n${summary}`.slice(0, 1200);

  const prompt = `You are an aviation safety analyst. Analyze the following aviation safety item and respond with ONLY valid JSON.

TEXT:
${text}

Respond with exactly this JSON structure (no markdown, no explanation):
{
  "category": "<one of: Accident / Incident | Human Factors / CRM | Flight Operations | Regulation | Training | Security / External Threat | Industry Trends>",
  "severity": "<one of: Low | Medium | High | Critical>",
  "operational_lesson": "<one concise sentence about what pilots or operators should do differently, max 150 chars>",
  "airport_iata": "<3-letter IATA code if a specific airport is clearly mentioned, else empty string>",
  "confidence": <0.0 to 1.0>
}`;

  try {
    const response = await (ai as any).run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        { role: "system", content: "You are an aviation safety analyst. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.1,
    }) as { response?: string };

    const raw = (response?.response ?? "").trim();
    // JSON 파싱 — 마크다운 코드블록 제거
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      category: AVIATION_CATEGORIES.includes(parsed.category) ? parsed.category : "Flight Operations",
      severity: SEVERITY_MAP[String(parsed.severity ?? "").toLowerCase()] ?? "Low",
      operational_lesson: String(parsed.operational_lesson ?? "").slice(0, 200),
      airport_hint: String(parsed.airport_iata ?? "").toUpperCase().slice(0, 4),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    };
  } catch (e) {
    // 오류를 null 대신 로그로 반환 (디버깅용)
    console.error("[llmClassify error]", String(e));
    return null;
  }
}

/**
 * ops_intel_items 중 아직 LLM 분류가 안 된 항목을 일괄 처리
 * (배치당 최대 limit건, Workers AI 속도 제한 고려)
 */
export async function enrichWithLLM(
  ai: Ai,
  db: D1Database,
  limit = 20,
): Promise<{ processed: number; updated: number; errors: number }> {
  const { results } = await db.prepare(
    `SELECT id, source_url, title, summary, category, severity, operational_lesson
     FROM ops_intel_items
     WHERE (operational_lesson IS NULL OR operational_lesson LIKE 'Review new%' OR operational_lesson LIKE 'Screen this%')
       AND summary IS NOT NULL AND summary != ''
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(limit).all<{
    id: number; source_url: string; title: string | null;
    summary: string | null; category: string | null;
    severity: string | null; operational_lesson: string | null;
  }>();

  let updated = 0, errors = 0;
  const errorSamples: string[] = [];

  for (const item of results) {
    const result = await llmClassify(ai, item.title ?? "", item.summary ?? "");
    if (!result) {
      errors++;
      if (errorSamples.length < 3) {
        try {
          const testRun = await (ai as any).run("@cf/meta/llama-3.1-8b-instruct-fp8", { prompt: "Say OK", max_tokens: 5 });
          errorSamples.push(`model_ok:${JSON.stringify(testRun).slice(0,80)}`);
        } catch(te) { errorSamples.push(String(te).slice(0, 120)); }
      }
      continue;
    }

    const now = new Date().toISOString();
    await db.prepare(
      `UPDATE ops_intel_items
       SET category=?, severity=?, operational_lesson=?, updated_at=?
       WHERE id=?`
    ).bind(result.category, result.severity, result.operational_lesson, now, item.id).run();

    // 공항 힌트가 있으면 events 테이블도 업데이트 시도
    if (result.airport_hint && /^[A-Z]{3,4}$/.test(result.airport_hint)) {
      const col = result.airport_hint.length === 4 ? "airport_icao" : "airport_iata";
      await db.prepare(
        `UPDATE events SET ${col}=?, updated_at=? WHERE source_url=? AND (airport_icao IS NULL OR airport_icao='')`
      ).bind(result.airport_hint, now, item.source_url).run();
    }

    updated++;
    // Workers AI rate limit 완화용 딜레이 (50ms)
    await new Promise(r => setTimeout(r, 50));
  }

  return { processed: results.length, updated, errors, error_samples: errorSamples };
}

// ── events.summary → 구조화 위협 파라미터 추출 (TSB/NTSB 자유텍스트용) ──────────

export type EventThreats = {
  flight_phase: string;          // TAKEOFF | CLIMB | CRUISE | DESCENT | APPROACH | LANDING | TAXI | GROUND | UNKNOWN
  system_affected: string;       // e.g. ENGINE_FUEL_SYSTEM, LANDING_GEAR, AVIONICS, "" if none
  failure_component: string;     // short free text, "" if none
  emergency_declared: boolean;
  emergency_level: string;       // NONE | PAN_PAN | MAYDAY
  crew_action: string;           // short phrase, e.g. "rejected takeoff", "diverted"
  outcome: string;               // short phrase, e.g. "safe return, no injuries"
  contributing_factors: string[]; // up to 5 short phrases
  operational_lesson: string;    // one sentence, what pilots should watch for
  time_since_takeoff_bucket: string; // IMMEDIATE(<5min) | EARLY(5-30min) | MID_FLIGHT(30min-2hr) | LATE(>2hr) | NOT_APPLICABLE | UNKNOWN
  time_since_takeoff_minutes: number | null; // explicit minutes if stated in text, else null
  confidence: number;
};

const EMPTY_THREATS: EventThreats = {
  flight_phase: "", system_affected: "", failure_component: "",
  emergency_declared: false, emergency_level: "NONE",
  crew_action: "", outcome: "", contributing_factors: [],
  operational_lesson: "",
  time_since_takeoff_bucket: "UNKNOWN", time_since_takeoff_minutes: null,
  confidence: 0,
};

export async function extractEventThreats(ai: Ai, summary: string): Promise<EventThreats | null> {
  const text = summary.slice(0, 2000);
  const prompt = `You are a Senior Aviation Safety Briefing Analyst. Your goal is to extract structured threat data from an occurrence report to help pilots prepare for similar risks.
Focus on identifying technical failures, environmental threats (weather/terrain), and specific crew countermeasures.

REPORT TEXT:
${text}

Respond with exactly this JSON structure (no markdown, no explanation):
{
  "flight_phase": "<TAKEOFF | CLIMB | CRUISE | DESCENT | APPROACH | LANDING | TAXI | GROUND | UNKNOWN>",
  "system_affected": "<Specific system tag, e.g. POWERPLANT, HYDRAULICS, AVIONICS, AUTOMATION, TIRES_BRAKES, or empty string>",
  "failure_component": "<Specific part name, e.g. HP fuel pump, #2 engine, L inner tire, else empty string>",
  "emergency_declared": <true or false>,
  "emergency_level": "<NONE | PAN_PAN | MAYDAY>",
  "crew_action": "<Key safety action taken, e.g. Emergency descent, Single-engine landing, Air turn-back, max 80 chars>",
  "outcome": "<The final result, e.g. Safe landing, Runway excursion, Component fire, max 80 chars>",
  "contributing_factors": [
    "<Concise phrase identifying a threat, e.g. Heavy rain at touchdown>",
    "<Concise phrase identifying a human factor, e.g. Crew continuation bias>",
    "<Concise phrase identifying a technical factor, e.g. Intermittent sensor fault>",
    "... up to 5 items"
  ],
  "operational_lesson": "<One high-impact takeaway for a pilot briefing, e.g. Verify brake serviceability if landing on contaminated runway with known sensor alerts, max 150 chars>",
  "time_since_takeoff_bucket": "<IMMEDIATE | EARLY | MID_FLIGHT | LATE | NOT_APPLICABLE | UNKNOWN>",
  "time_since_takeoff_minutes": <integer or null>,
  "confidence": <0.0 to 1.0>
}`;

  try {
    const response = await (ai as any).run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        { role: "system", content: "You are an aviation safety analyst. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.1,
    }) as { response?: string };

    const raw = (response?.response ?? "").trim();
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    const PHASES = ["TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LANDING", "TAXI", "GROUND", "UNKNOWN"];
    const EMLEVELS = ["NONE", "PAN_PAN", "MAYDAY"];
    const TSTO_BUCKETS = ["IMMEDIATE", "EARLY", "MID_FLIGHT", "LATE", "NOT_APPLICABLE", "UNKNOWN"];

    const minutesRaw = parsed.time_since_takeoff_minutes;
    const minutes = (minutesRaw === null || minutesRaw === undefined || minutesRaw === "")
      ? null
      : Math.max(0, Math.round(Number(minutesRaw)));

    return {
      flight_phase: PHASES.includes(String(parsed.flight_phase ?? "").toUpperCase()) ? String(parsed.flight_phase).toUpperCase() : "UNKNOWN",
      system_affected: String(parsed.system_affected ?? "").toUpperCase().slice(0, 60),
      failure_component: String(parsed.failure_component ?? "").slice(0, 120),
      emergency_declared: Boolean(parsed.emergency_declared),
      emergency_level: EMLEVELS.includes(String(parsed.emergency_level ?? "").toUpperCase()) ? String(parsed.emergency_level).toUpperCase() : "NONE",
      crew_action: String(parsed.crew_action ?? "").slice(0, 100),
      outcome: String(parsed.outcome ?? "").slice(0, 100),
      contributing_factors: Array.isArray(parsed.contributing_factors) ? parsed.contributing_factors.map((f: unknown) => String(f).slice(0, 100)).slice(0, 5) : [],
      operational_lesson: String(parsed.operational_lesson ?? "").slice(0, 200),
      time_since_takeoff_bucket: TSTO_BUCKETS.includes(String(parsed.time_since_takeoff_bucket ?? "").toUpperCase()) ? String(parsed.time_since_takeoff_bucket).toUpperCase() : "UNKNOWN",
      time_since_takeoff_minutes: (Number.isFinite(minutes as number)) ? minutes : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    };
  } catch (e) {
    console.error("[extractEventThreats error]", String(e));
    return null;
  }
}

/**
 * events 테이블 중 아직 위협 추출이 안 된 레코드(contributing_factors가 비어있는 '[]')를 일괄 처리.
 * flight_phase는 기존 값이 있으면 덮어쓰지 않음(TSB/NTSB 원본 필드 우선).
 */
export async function enrichEventsWithThreats(
  ai: Ai,
  db: D1Database,
  limit = 20,
  targetIds?: string[],
): Promise<{ processed: number; updated: number; errors: number; error_samples?: string[] }> {
  let query = `SELECT id, summary, flight_phase
     FROM events
     WHERE (contributing_factors IS NULL OR contributing_factors = '[]')
       AND summary IS NOT NULL AND summary != ''`;

  if (targetIds && targetIds.length > 0) {
    query += ` AND id IN (${targetIds.map(() => '?').join(',')})`;
  }

  query += ` ORDER BY event_date DESC LIMIT ?`;

  const stmt = db.prepare(query);
  const params = targetIds ? [...targetIds, limit] : [limit];
  const { results } = await stmt.bind(...params).all<{ id: string; summary: string; flight_phase: string | null }>();

  let updated = 0, errors = 0;
  const errorSamples: string[] = [];

  for (const row of results) {
    const result = await extractEventThreats(ai, row.summary);
    if (!result) {
      errors++;
      if (errorSamples.length < 3) errorSamples.push(row.id);
      continue;
    }

    const now = new Date().toISOString();
    const keepExistingPhase = row.flight_phase && row.flight_phase.trim() !== "";
    const tags = [
      result.system_affected,
      result.emergency_declared ? `EMERGENCY_${result.emergency_level}` : "",
      `TIME_SINCE_TAKEOFF_${result.time_since_takeoff_bucket}`,
      result.time_since_takeoff_minutes !== null ? `TSTO_MINUTES_${result.time_since_takeoff_minutes}` : "",
    ].filter(Boolean);

    await db.prepare(
      `UPDATE events SET
         flight_phase = ?,
         contributing_factors = ?,
         operational_lessons = ?,
         pilot_briefing_sentence = ?,
         confidence_score = ?,
         updated_at = ?
       WHERE id = ?`
    ).bind(
      keepExistingPhase ? row.flight_phase : result.flight_phase,
      JSON.stringify(result.contributing_factors),
      JSON.stringify([result.operational_lesson].filter(Boolean)),
      [result.crew_action, result.outcome].filter(Boolean).join(" — ") || null,
      result.confidence,
      now,
      row.id
    ).run();

    for (const tag of tags) {
      await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(row.id, "llm_threat", tag).run();
    }

    updated++;
    await new Promise(r => setTimeout(r, 50));
  }

  return { processed: results.length, updated, errors, error_samples: errorSamples };
}
