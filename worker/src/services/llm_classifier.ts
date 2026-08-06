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
    const response = await (ai as any).run("@cf/meta/llama-3.1-8b-instruct", {
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
  } catch {
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

  for (const item of results) {
    const result = await llmClassify(ai, item.title ?? "", item.summary ?? "");
    if (!result) { errors++; continue; }

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

  return { processed: results.length, updated, errors };
}
