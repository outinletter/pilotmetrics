import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { iataToIcao, icaoToIata, AIRPORTS } from "./data/airports";
import { backfillAirportCodes } from "./services/official_event_parsers";
import { enrichWithLLM, enrichEventsWithThreats } from "./services/llm_classifier";
import { getFlight, normalizeFlightNumber } from "./services/aviation_stack";
import { getWeather } from "./services/noaa";
import { parseWeatherTags, selectArrivalTafSegment, isNightArrival, arrivalWeatherBrief } from "./services/metar_parser";
import { riskLevel, riskScore, riskSummary, riskBreakdown } from "./services/risk_tagger";
import { airportFixedRisks, airportUtcOffset } from "./data/airport_hazards";
import { buildThreats } from "./services/briefing_generator";
import { fetchNotamThreats } from "./services/notam";
import { collectOnce, refineOfficialItems } from "./services/ops_intel_collector";
import { backfillMetar } from "./services/metar_backfill";
import { collectRecentOfficialEvents } from "./services/official_event_parsers";
import { dailyBriefingMarkdown, reviewMarkdown } from "./services/report_generator";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

// ─── Health ──────────────────────────────────────────────────────────────────
app.get("/api/health", c => c.json({ ok: true }));

// ─── Briefing ─────────────────────────────────────────────────────────────────
app.get("/api/briefing/:flightNumber", async c => {
  const raw = c.req.param("flightNumber").toUpperCase().trim();

  // ── 공항코드 직접 검색 (IATA 3자 or ICAO 4자) ──────────────────────────────
  if (/^[A-Z]{3}$/.test(raw) || /^[A-Z]{4}$/.test(raw)) {
    const arrIcao = raw.length === 4 ? raw : iataToIcao(raw);
    const arrIata = raw.length === 3 ? raw : icaoToIata(raw);
    const [weather, weatherMessages] = arrIcao ? await getWeather(arrIcao) : [{ metar: "", taf: "" }, []];
    const fixedRisks = airportFixedRisks(arrIcao);
    const tags = [...new Set([...parseWeatherTags(weather.metar, weather.taf, arrIcao), ...fixedRisks])];

    const airportEventCount = arrIcao
      ? ((await c.env.DB
          .prepare("SELECT COUNT(*) as n FROM events WHERE airport_icao = ? OR airport_iata = ?")
          .bind(arrIcao, arrIata).first<{ n: number }>())?.n ?? 0)
      : 0;
    const score = riskScore(tags, airportEventCount);
    const level = riskLevel(tags, airportEventCount);

    const context: Record<string, unknown> = {
      flight_number: raw,
      route: `— → ${raw}`,
      aircraft: "Airport Search",
      departure_icao: "", arrival_icao: arrIcao,
      departure_iata: "", arrival_iata: arrIata,
      destination_runway: null,
      weather: tags.join("/") || "CLEAR",
      risk_score: score,
      risk_level: level,
      risk_summary: riskSummary(score, level, tags),
      risk_breakdown: riskBreakdown(tags, airportEventCount),
      arrival_weather_brief: arrivalWeatherBrief(weather.taf, weather.metar, null, 0),
      airport_event_count: airportEventCount,
      messages: weatherMessages.filter(Boolean),
      arrival_weather_time: null,
      metar: weather.metar, taf: weather.taf, arrival_taf: weather.taf,
      arrival_tags: tags,
      metar_tags: tags,
    };

    // NOTAM 및 위협 정보 병렬 조회
    const hasNotam = arrIcao && (c.env.NMS_CLIENT_ID || c.env.FAA_NOTAM_API_KEY);
    const [threats, notamThreats] = await Promise.all([
      buildThreats(c.env.DB, context, tags, c.env.AI),
      hasNotam
        ? fetchNotamThreats(arrIcao!, null, {
            nmsClientId:     c.env.NMS_CLIENT_ID,
            nmsClientSecret: c.env.NMS_CLIENT_SECRET,
            nmsEnv:          c.env.NMS_ENV,
            legacyKey:       c.env.FAA_NOTAM_API_KEY,
          })
        : Promise.resolve([]),
    ]);

    return c.json({ flight_context: context, top_threats: threats, notam_threats: notamThreats });
  }

  // ── 편명 처리 (KE629, OZ202 등) ──────────────────────────────────────────
  const fn = normalizeFlightNumber(raw);
  const [flight, flightMsg] = await getFlight(fn, c.env.AVIATIONSTACK_API_KEY);
  const depIcao = iataToIcao(flight.departure_iata as string);
  const arrIcao = iataToIcao(flight.arrival_iata as string);
  const depIata = (flight.departure_iata as string) ?? "UNKNOWN";
  const arrIata = (flight.arrival_iata as string) ?? "UNKNOWN";

  const [weather, weatherMessages] = arrIcao ? await getWeather(arrIcao) : [{ metar: "", taf: "" }, []];
  const arrivalTime = (flight.estimated_arrival ?? flight.scheduled_arrival) as string | null;
  const arrivalTaf  = selectArrivalTafSegment(weather.taf, arrivalTime);

  // 공항 고정 위험 태그 (지형·접근 특성)
  const fixedRisks  = airportFixedRisks(arrIcao);
  const arrivalDate = arrivalTime ? new Date(arrivalTime) : new Date();
  const utcOffset   = airportUtcOffset(arrIcao, arrivalDate);
  const nightArr    = isNightArrival(arrivalTime, utcOffset);

  // 태그 합산: METAR + 도착 TAF + 공항 고정 위험
  const arrivalTags = [...new Set([...parseWeatherTags("", arrivalTaf, arrIcao), ...fixedRisks])];
  const metarTags   = parseWeatherTags(weather.metar, "", arrIcao);
  const tags        = [...new Set([...parseWeatherTags(weather.metar, arrivalTaf, arrIcao), ...fixedRisks])];

  // 도착 공항 과거 사고 이력 조회
  const airportEventCount = arrIcao
    ? ((await c.env.DB
        .prepare("SELECT COUNT(*) as n FROM events WHERE airport_icao = ? OR airport_iata = ?")
        .bind(arrIcao, arrIata).first<{ n: number }>())?.n ?? 0)
    : 0;

  // 수치 위험도: 도착 시간대 태그 + 공항 이력 + 야간 여부 반영
  const activeTags = arrivalTags.length > fixedRisks.length ? arrivalTags : tags;
  const score = riskScore(activeTags, airportEventCount, nightArr);
  const level = riskLevel(activeTags, airportEventCount, nightArr);

  const context: Record<string, unknown> = {
    flight_number: fn,
    route: `${depIata}-${arrIata}`,
    aircraft: (flight.aircraft_type as string) ?? "Unknown",
    departure_icao: depIcao, arrival_icao: arrIcao,
    departure_iata: depIata, arrival_iata: arrIata,
    destination_runway: null,
    weather: tags.join("/") || "CLEAR",
    risk_score: score,
    risk_level: level,
    risk_summary: riskSummary(score, level, activeTags, nightArr),
    risk_breakdown: riskBreakdown(activeTags, airportEventCount, nightArr),
    arrival_weather_brief: arrivalWeatherBrief(arrivalTaf, weather.metar, arrivalTime, utcOffset),
    night_arrival: nightArr,
    airport_event_count: airportEventCount,
    messages: [flightMsg, ...weatherMessages].filter(Boolean),
    arrival_weather_time: arrivalTime,
    scheduled_departure: flight.scheduled_departure ?? null,
    scheduled_arrival:   flight.scheduled_arrival ?? null,
    metar: weather.metar, taf: weather.taf, arrival_taf: arrivalTaf,
    arrival_tags: arrivalTags,
    metar_tags:   metarTags,
  };
  if (flightMsg) {
    const enc = (q: string) => encodeURIComponent(q);
    context.flight_search_links = [
      { label: `${fn} flight status`, url: `https://www.google.com/search?q=${enc(`${fn} flight status`)}` },
      { label: `${fn} ${context.route} today flight`, url: `https://www.google.com/search?q=${enc(`${fn} ${context.route} today flight`)}` },
    ];
  }

  // Persist query to D1 (fire-and-forget — 실패해도 응답에 영향 없음)
  c.env.DB.prepare(
    "INSERT INTO flight_queries (flight_number,airline_iata,flight_iata,departure_iata,arrival_iata,departure_icao,arrival_icao,scheduled_departure,scheduled_arrival,estimated_departure,estimated_arrival,aircraft_type,raw_response_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(fn, flight.airline_iata ?? null, flight.flight_iata ?? null, depIata, arrIata, depIcao, arrIcao,
    flight.scheduled_departure ?? null, flight.scheduled_arrival ?? null,
    flight.estimated_departure ?? null, flight.estimated_arrival ?? null,
    flight.aircraft_type ?? null, JSON.stringify(flight.raw ?? {})).run().catch(() => {});

  // NOTAM 위협 병렬 조회 — NMS-API(OAuth2) 우선, legacy 폴백
  const hasNotam = arrIcao && (c.env.NMS_CLIENT_ID || c.env.FAA_NOTAM_API_KEY);
  const [threats, notamThreats] = await Promise.all([
    buildThreats(c.env.DB, context, tags, c.env.AI),
    hasNotam
      ? fetchNotamThreats(arrIcao!, arrivalTime, {
          nmsClientId:     c.env.NMS_CLIENT_ID,
          nmsClientSecret: c.env.NMS_CLIENT_SECRET,
          nmsEnv:          c.env.NMS_ENV,
          legacyKey:       c.env.FAA_NOTAM_API_KEY,
        })
      : Promise.resolve([]),
  ]);

  // Background Enrichment: 브리핑에 포함된 이벤트들 중 분석이 안 된 것들 LLM 처리
  if (c.env.AI && threats.length > 0) {
    c.executionCtx.waitUntil((async () => {
      // buildThreats에서 반환된 groups 내의 event id 수집
      const eventIds = (threats as any[]).flatMap(g => g.events.map((e: any) => e.id));
      if (eventIds.length === 0) return;

      // 분석이 필요한 대상(factors가 비어있음)만 선별하여 처리
      const { results } = await c.env.DB.prepare(
        `SELECT id, summary, flight_phase FROM events
         WHERE id IN (${eventIds.map(() => '?').join(',')})
           AND (contributing_factors IS NULL OR contributing_factors = '[]')`
      ).bind(...eventIds).all<{ id: string; summary: string; flight_phase: string | null }>();

      if (results.length > 0) {
        // 현재 브리핑 항목 위주로 신속 처리 (ID 명시)
        await enrichEventsWithThreats(c.env.AI, c.env.DB, 10, results.map(r => r.id));
      }
    })());
  }

  return c.json({ flight_context: context, top_threats: threats, notam_threats: notamThreats });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get("/api/stats", async c => {
  const [total, yearRange, airports, sources, sev, lastUpdated] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as n FROM events").first<{ n: number }>(),
    c.env.DB.prepare("SELECT MIN(substr(event_date,1,4)) as min_yr, MAX(substr(event_date,1,4)) as max_yr FROM events WHERE event_date IS NOT NULL").first<{ min_yr: string; max_yr: string }>(),
    Promise.resolve({ n: Object.keys(AIRPORTS).length }),
    c.env.DB.prepare("SELECT DISTINCT source_name FROM events WHERE source_name IS NOT NULL AND source_name != '' ORDER BY source_name").all<{ source_name: string }>(),
    c.env.DB.prepare("SELECT severity, COUNT(*) as n FROM events GROUP BY severity ORDER BY severity DESC").all<{ severity: number; n: number }>(),
    c.env.DB.prepare("SELECT MAX(updated_at) as ts FROM events").first<{ ts: string }>(),
  ]);
  return c.json({
    total_events: total?.n ?? 0,
    year_min: yearRange?.min_yr ?? "—",
    year_max: yearRange?.max_yr ?? "—",
    airports_covered: airports?.n ?? 0,
    sources: sources.results.map(r => r.source_name),
    severity_breakdown: sev.results,
    last_updated: lastUpdated?.ts ?? null,
  });
});

// 기존 이벤트 공항코드 백필
app.post("/api/ops-intel/backfill-airports", async c => {
  const result = await backfillAirportCodes(c.env.DB);
  return c.json(result);
});

// Full Backfill API: Airport codes, NTSB times, and METARs
app.post("/api/ops-intel/backfill-full", async c => {
  const airportResult = await backfillAirportCodes(c.env.DB);
  const { backfillNtsbEventTime } = await import("./services/official_event_parsers");
  const ntsbResult = await backfillNtsbEventTime(c.env.DB, 100);
  const metarResult = await backfillMetar(c.env.DB, 100);
  return c.json({
    status: "complete",
    airport_backfill: airportResult,
    ntsb_time_backfill: ntsbResult,
    metar_backfill: metarResult
  });
});

app.get("/api/weather/:icao", async c => {
  const icao = c.req.param("icao").toUpperCase();
  const [weather, messages] = await getWeather(icao);
  return c.json({ station: icao, metar: weather.metar, taf: weather.taf, messages });
});

// ─── Events ──────────────────────────────────────────────────────────────────
app.get("/api/events", async c => {
  const { results } = await c.env.DB.prepare("SELECT id,airport_icao,event_type FROM events").all<{ id: string; airport_icao: string; event_type: string }>();
  return c.json(results);
});

// ─── Ops Intel ───────────────────────────────────────────────────────────────
app.get("/api/ops-intel/status", async c => {
  const lastRun = await c.env.DB.prepare("SELECT * FROM ops_intel_runs ORDER BY started_at DESC LIMIT 1").first<{ status: string; started_at: string; finished_at: string | null; items_checked: number; items_saved: number; error: string | null }>();
  const count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM ops_intel_items").first<{ count: number }>();
  return c.json({ items_in_database: count?.count ?? 0, last_run: lastRun ?? null });
});

app.post("/api/ops-intel/collect", async c => c.json(await collectOnce(c.env.DB, c.env)));

// Workers AI 연결 테스트
app.get("/api/ops-intel/ai-test", async c => {
  if (!c.env.AI) return c.json({ error: "AI binding not configured" }, 503);
  try {
    const result = await (c.env.AI as any).run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [{ role: "user", content: "Reply with: OK" }],
      max_tokens: 10,
    });
    return c.json({ ok: true, result });
  } catch (e) {
    return c.json({ ok: false, error: String(e) });
  }
});

// LLM enrichment 단독 실행
app.post("/api/ops-intel/enrich-llm", async c => {
  if (!c.env.AI) return c.json({ error: "AI binding not available" }, 503);
  const body = await c.req.json<{ limit?: number }>().catch(() => ({}));
  return c.json(await enrichWithLLM(c.env.AI, c.env.DB, body.limit ?? 20));
});

// events.summary → 구조화 위협 파라미터 추출 (TSB/NTSB 자유텍스트 대상)
app.post("/api/ops-intel/enrich-event-threats", async c => {
  if (!c.env.AI) return c.json({ error: "AI binding not available" }, 503);
  const body = await c.req.json<{ limit?: number }>().catch(() => ({}));
  return c.json(await enrichEventsWithThreats(c.env.AI, c.env.DB, body.limit ?? 20));
});

app.post("/api/ops-intel/collect-official-recent", async c => {
  const body = await c.req.json<{ years_back?: number }>().catch(() => ({ years_back: undefined }));
  return c.json(await collectRecentOfficialEvents(c.env.DB, body.years_back ?? 20));
});

// Granular collection for mass ingestion
app.post("/api/admin/collect-step", async c => {
  const body = await c.req.json<{ source: string; state?: string; year?: number; max_pages?: number }>().catch(() => ({}));
  const { source, state, year, max_pages } = body as { source: string; state?: string; year?: number; max_pages?: number };
  const db = c.env.DB;

  const { parseIcaoIstars, parseAraibKorea, parseJtsbJapan } = await import("./services/official_event_parsers");

  switch (source) {
    case "icao":
      return c.json(await parseIcaoIstars(db, "2113c549-8f2d-4a98-a587-e35192569e55", 25, state, year));
    case "araib":
      return c.json(await parseAraibKorea(db, max_pages ?? 10));
    case "jtsb":
      return c.json(await parseJtsbJapan(db));
    default:
      return c.json({ error: "Unknown source" }, 400);
  }
});

// NTSB CAROL 연도 범위 지정 수집 (Workers CPU 제한 회피용)
// 예: POST /api/ops-intel/collect-ntsb { "start": "2020-01-01", "end": "2022-12-31" }
app.post("/api/ops-intel/collect-ntsb", async c => {
  const body = await c.req.json<{ start?: string; end?: string }>().catch(() => ({ start: undefined, end: undefined }));
  const end = body.end ?? new Date().toISOString().slice(0, 10);
  const start = body.start ?? (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10); })();
  const { collectNtsbRange } = await import("./services/official_event_parsers");
  return c.json(await collectNtsbRange(c.env.DB, start, end));
});

// TSB Canada CSV 데이터 수집 (로컬 스크립트가 파싱 후 전송)
// POST /api/ops-intel/ingest-tsb  Body: { records: TsbRecord[] }
app.post("/api/ops-intel/ingest-tsb", async c => {
  const body = await c.req.json<{ records?: unknown[] }>().catch(() => ({ records: [] }));
  if (!Array.isArray(body.records) || body.records.length === 0) return c.json({ error: "records array required" }, 400);
  const { ingestTsbBatch } = await import("./services/official_event_parsers");
  return c.json(await ingestTsbBatch(c.env.DB, body.records as Parameters<typeof ingestTsbBatch>[1]));
});

// ASN(Aviation Safety Network) 데이터 수집 (로컬 스크립트가 GitHub 미러에서 받아 파싱 후 전송)
// POST /api/ops-intel/ingest-asn  Body: { records: AsnRecord[] }
app.post("/api/ops-intel/ingest-asn", async c => {
  const body = await c.req.json<{ records?: unknown[] }>().catch(() => ({ records: [] }));
  if (!Array.isArray(body.records) || body.records.length === 0) return c.json({ error: "records array required" }, 400);
  const { ingestAsnBatch } = await import("./services/official_event_parsers");
  return c.json(await ingestAsnBatch(c.env.DB, body.records as Parameters<typeof ingestAsnBatch>[1]));
});

// POST /api/ops-intel/ingest-events — Generic event ingestion
app.post("/api/ops-intel/ingest-events", async c => {
  const body = await c.req.json<{ records?: any[] }>().catch(() => ({ records: [] }));
  if (!Array.isArray(body.records) || body.records.length === 0) return c.json({ error: "records array required" }, 400);

  const { upsertEventRecord } = await import("./services/official_event_parsers");
  let created = 0;
  for (const rec of body.records) {
    try {
      if (await upsertEventRecord(c.env.DB, rec)) created++;
    } catch (e) { console.error("Ingest failed for record:", rec.id, e); }
  }
  return c.json({ checked: body.records.length, created });
});

// DELETE /api/ops-intel/purge-easa  — remove all EASA records (for re-ingestion)
app.delete("/api/ops-intel/purge-easa", async c => {
  const { results } = await c.env.DB.prepare("SELECT id FROM events WHERE id LIKE 'EASA-%'").all<{ id: string }>();
  for (const row of results) {
    await c.env.DB.prepare("DELETE FROM event_tags WHERE event_id = ?").bind(row.id).run();
    await c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(row.id).run();
  }
  return c.json({ deleted: results.length });
});

app.get("/api/ops-intel/items", async c => {
  const { results } = await c.env.DB.prepare("SELECT source_name,source_url,title,category,severity,summary,operational_lesson,a350_b787_applicability,recommended_action,tags,last_status,last_checked_at FROM ops_intel_items ORDER BY updated_at DESC LIMIT 50").all();
  return c.json(results);
});

app.post("/api/ops-intel/refine-official", async c => c.json(await refineOfficialItems(c.env.DB)));

app.post("/api/ops-intel/reports/daily", async c => c.json({ markdown: await dailyBriefingMarkdown(c.env.DB) }));

app.post("/api/ops-intel/reports/weekly", async c => c.json({ markdown: await reviewMarkdown(c.env.DB, "weekly") }));

app.post("/api/ops-intel/reports/monthly", async c => c.json({ markdown: await reviewMarkdown(c.env.DB, "monthly") }));

// ─── METAR 백필 (Iowa State Mesonet) ─────────────────────────────────────────
// POST /api/admin/backfill-metar  { "limit": 30, "dry_run": false }
// 공항코드 있는 이벤트에 대해 역사적 METAR를 조회하여 wind/visibility/metar_text 채움
app.post("/api/admin/backfill-metar", async c => {
  const body = await c.req.json<{ limit?: number; dry_run?: boolean }>().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 30), 100);
  return c.json(await backfillMetar(c.env.DB, limit));
});

// ─── NTSB event_time 백필 ─────────────────────────────────────────────────────
// POST /api/admin/backfill-ntsb-time  { "limit": 50 }
// CAROL API 재조회로 기존 NTSB 이벤트의 event_time(HH:MM UTC) 채움
app.post("/api/admin/backfill-ntsb-time", async c => {
  const body = await c.req.json<{ limit?: number }>().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 50), 200);
  const { backfillNtsbEventTime } = await import("./services/official_event_parsers");
  return c.json(await backfillNtsbEventTime(c.env.DB, limit));
});

// ─── Default: serve static assets ────────────────────────────────────────────
// Cloudflare Workers Assets serve public/ automatically for non-API routes.

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
