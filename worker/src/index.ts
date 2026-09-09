import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { iataToIcao, icaoToIata, AIRPORTS } from "./data/airports";
import { backfillAirportCodes } from "./services/official_event_parsers";
import { enrichWithLLM, enrichEventsWithThreats } from "./services/llm_classifier";
import { getWeather } from "./services/noaa";
import {
  parseWeatherTags,
  selectArrivalTafSegment,
  isNightArrival,
  arrivalWeatherBrief,
} from "./services/metar_parser";
import {
  riskLevel,
  riskScore,
  riskSummary,
  riskBreakdown,
} from "./services/risk_tagger";
import { airportFixedRisks, airportUtcOffset, AIRPORT_HAZARDS } from "./data/airport_hazards";
import { buildThreats } from "./services/briefing_generator";
import { fetchNotamThreats } from "./services/notam";
import {
  collectOnce,
  refineOfficialItems,
} from "./services/ops_intel_collector";
import { backfillMetar } from "./services/metar_backfill";
import {
  collectRecentOfficialEvents,
} from "./services/official_event_parsers";
import {
  dailyBriefingMarkdown,
  reviewMarkdown,
} from "./services/report_generator";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/api/health", c => c.json({ ok: true }));

// ─── Briefing ─────────────────────────────────────────────────────────────────

app.get("/api/briefing/:flightNumber", async c => {
  const raw = c.req.param("flightNumber").toUpperCase().trim();

  const errors: Array<{
    stage: string;
    error: string;
  }> = [];

  const messages: string[] = [];

  const recordError = (
    stage: string,
    error: unknown,
  ) => {
    let message =
      (error instanceof Error
        ? error.message
        : String(error)
      ).trim();

    // Shorten Cloudflare D1 quota errors
    if (message.includes("exceeded D1's free tier daily row read limit")) {
      message = "D1 Quota Exceeded: Daily row read limit reached. The database is intact, but access is restricted until the next reset or upgrade.";
    }

    console.error(
      `[BRIEFING:${stage}]`,
      message,
    );

    errors.push({
      stage,
      error: message,
    });
  };

  try {
    /* ==================================================================== */
    /* Airport-Centric Search (3 or 4 letter code)                          */
    /* ==================================================================== */

    if (/^[A-Z]{3,4}$/.test(raw)) {
      let arrIcao = raw.length === 4 ? raw : iataToIcao(raw);
      let arrIata = raw.length === 3 ? raw : icaoToIata(raw);

      let weather = { metar: "", taf: "" };
      let weatherMessages: string[] = [];

      /* WEATHER */
      try {
        if (arrIcao) {
          [weather, weatherMessages] = await getWeather(arrIcao);
        }
      } catch (error) {
        recordError("WEATHER", error);
        weatherMessages = ["Weather data unavailable."];
      }

      const fixedRisks = airportFixedRisks(arrIcao);
      const tags = [...new Set([...parseWeatherTags(weather.metar, weather.taf, arrIcao), ...fixedRisks])];
      const hazard = arrIcao ? AIRPORT_HAZARDS[arrIcao] : null;

      /* D1 EVENT COUNT */
      let airportEventCount = 0;
      try {
        if (arrIcao) {
          airportEventCount = (await c.env.DB
            .prepare("SELECT COUNT(*) as n FROM events WHERE (airport_icao = ? AND airport_icao != '') OR (airport_iata = ? AND airport_iata != '')")
            .bind(arrIcao, arrIata)
            .first<{ n: number }>())?.n ?? 0;
        }
      } catch (error) {
        recordError("D1_EVENT_COUNT", error);
      }

      const score = riskScore(tags, airportEventCount);
      const level = riskLevel(tags, airportEventCount);

      const context: Record<string, unknown> = {
        flight_number: raw,
        route: `DESTINATION: ${raw}`,
        aircraft: "Airport-Centric Briefing",
        departure_icao: "",
        arrival_icao: arrIcao,
        departure_iata: "",
        arrival_iata: arrIata,
        destination_runway: null,
        // Enhanced Airport Info
        elevation_ft: hazard?.altitude_ft ?? 0,
        runways: hazard?.runways ?? [],
        terrain_type: hazard?.terrain ?? "standard",
        fixed_risks: hazard?.fixed_risks ?? [],

        weather: tags.join("/") || "CLEAR",
        risk_score: score,
        risk_level: level,
        risk_summary: riskSummary(score, level, tags),
        risk_breakdown: riskBreakdown(tags, airportEventCount),
        arrival_weather_brief: arrivalWeatherBrief(weather.taf, weather.metar, null, 0),
        airport_event_count: airportEventCount,
        messages: [...weatherMessages],
        arrival_weather_time: null,
        metar: weather.metar,
        taf: weather.taf,
        arrival_taf: weather.taf,
        arrival_tags: tags,
        metar_tags: tags,
      };

      let threats: any[] = [];
      let notamThreats: any[] = [];

      /* THREAT ENGINE */
      try {
        threats = await buildThreats(c.env.DB, context, tags, c.env.AI);
      } catch (error) {
        recordError("BUILD_THREATS", error);
      }

      /* NOTAM */
      try {
        const hasNotam = !!arrIcao && !!(c.env.NMS_CLIENT_ID || c.env.FAA_NOTAM_API_KEY);
        if (hasNotam) {
          notamThreats = await fetchNotamThreats(arrIcao!, null, {
            nmsClientId: c.env.NMS_CLIENT_ID,
            nmsClientSecret: c.env.NMS_CLIENT_SECRET,
            nmsEnv: c.env.NMS_ENV,
            legacyKey: c.env.FAA_NOTAM_API_KEY,
          });
        }
      } catch (error) {
        recordError("NOTAM", error);
      }

      context.messages = [...weatherMessages, ...errors.map(e => `${e.stage}: ${e.error}`)];

      return c.json({
        ok: !errors.some(e => ["AIRPORT_CODE", "BRIEFING_UNHANDLED"].includes(e.stage)),
        flight_context: context,
        top_threats: threats,
        notam_threats: notamThreats,
        error_stage: errors.length > 0 ? errors[0].stage : null,
        errors,
      });
    }

    // Invalid input - not an airport code
    return c.json({
      ok: false,
      flight_context: {
        flight_number: raw,
        route: "INVALID-INPUT",
        messages: ["Please enter a 3 or 4 letter airport code (e.g., VTBS, RKSI, LAX)."]
      },
      top_threats: [],
      notam_threats: [],
      error_stage: "INVALID_INPUT",
      errors: [{ stage: "INPUT_VALIDATION", error: "Input must be a 3 or 4 letter airport code." }]
    });
  } catch (error) {
    recordError("BRIEFING_UNHANDLED", error);
    return c.json({
      ok: false,
      flight_context: {
        flight_number: raw,
        route: "UNKNOWN-UNKNOWN",
        aircraft: "Unknown",
        messages: errors.map(e => `${e.stage}: ${e.error}`),
      },
      top_threats: [],
      notam_threats: [],
      error_stage: "BRIEFING_UNHANDLED",
      errors,
    });
  }
});


// ─── Maintenance ─────────────────────────────────────────────────────────────

app.get("/api/admin/backfill-asn", async c => {
  const { backfillAsnAirports } = await import("./services/official_event_parsers");
  const result = await backfillAsnAirports(c.env.DB, 500); // 한 번에 500개씩 처리
  return c.json({ ok: true, ...result });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

app.get("/api/stats", async c => {
  const errors: Array<{
    stage: string;
    error: string;
  }> = [];

  const recordError = (
    stage: string,
    error: unknown,
  ) => {
    let message =
      (error instanceof Error
        ? error.message
        : String(error)
      ).trim();

    if (message.includes("exceeded D1's free tier daily row read limit")) {
      message = "D1 Quota Exceeded: Daily row read limit reached. The database is intact, but access is restricted until the next reset or upgrade.";
    }

    console.error(`[STATS:${stage}]`, message);
    errors.push({ stage, error: message });
  };

  // 1. Get latest update from BOTH tables and last run
  let currentTs: string | null = null;
  try {
    const [lastEv, lastOps, lastRun] = await Promise.all([
      c.env.DB.prepare("SELECT MAX(updated_at) as ts FROM events").first<{ ts: string }>().catch(() => null),
      c.env.DB.prepare("SELECT MAX(updated_at) as ts FROM ops_intel_items").first<{ ts: string }>().catch(() => null),
      c.env.DB.prepare("SELECT MAX(finished_at) as ts FROM ops_intel_runs WHERE status = 'complete'").first<{ ts: string }>().catch(() => null),
    ]);
    // Use last successful run time as primary update indicator
    currentTs = lastRun?.ts || (lastEv?.ts && lastOps?.ts
      ? (lastEv.ts > lastOps.ts ? lastEv.ts : lastOps.ts)
      : (lastEv?.ts || lastOps?.ts || null));
  } catch (error) { recordError("STATS_TIMESTAMP_CHECK", error); }

  // 2. Cache check
  let cache: Cache | null = null;
  let cacheKey: Request | null = null;
  try {
    cache = caches.default;
    const cacheUrl = new URL(c.req.url);
    cacheUrl.searchParams.set("_v", "6"); // Increment version to bust potentially corrupt cache
    cacheKey = new Request(cacheUrl.toString(), c.req.raw);
    if (cache && cacheKey && currentTs) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const cachedBody = await cached.clone().json<{ last_updated: string | null; total_events: number }>().catch(() => null);
        // Ensure cached body is not reporting 0 if we have a valid timestamp
        if (cachedBody && cachedBody.last_updated === currentTs && (cachedBody.total_events || 0) > 0) return cached;
      }
    }
  } catch { /* ignore cache errors */ }

  let totalEvents = 0;
  let yearMin = "—";
  let yearMax = "—";
  let airportsCovered = 0;
  let sources: string[] = [];
  let severityBreakdown: Array<{ severity: number; n: number; }> = [];

  /* TOTAL */
  try {
    const [evCount, opsCount] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) as n FROM events").first<{ n: number | string }>().catch(() => ({ n: 0 })),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM ops_intel_items").first<{ n: number | string }>().catch(() => ({ n: 0 })),
    ]);
    totalEvents = Number(evCount?.n ?? 0) + Number(opsCount?.n ?? 0);
  } catch (error) { recordError("STATS_TOTAL_EVENTS", error); }

  /* YEAR RANGE */
  try {
    const yearRange = await c.env.DB.prepare(
      `SELECT MIN(substr(event_date,1,4)) as min_yr, MAX(substr(event_date,1,4)) as max_yr
       FROM events WHERE event_date IS NOT NULL AND event_date != ''`
    ).first<{ min_yr: string; max_yr: string }>();
    yearMin = yearRange?.min_yr ?? "—";
    yearMax = yearRange?.max_yr ?? "—";
  } catch (error) { recordError("STATS_YEAR_RANGE", error); }

  /* AIRPORTS */
  try {
    const result = await c.env.DB.prepare(
      "SELECT COUNT(DISTINCT CASE WHEN airport_icao != '' THEN airport_icao ELSE airport_iata END) as n FROM events WHERE (airport_icao IS NOT NULL AND airport_icao != '') OR (airport_iata IS NOT NULL AND airport_iata != '')"
    ).first<{ n: number }>();
    airportsCovered = result?.n ?? 0;
  } catch (error) { recordError("STATS_AIRPORTS", error); }

  /* SOURCES */
  try {
    const result = await c.env.DB.prepare(
      `SELECT DISTINCT source_name FROM events WHERE source_name IS NOT NULL AND source_name != '' ORDER BY source_name`
    ).all<{ source_name: string }>();
    sources = result.results.map(r => r.source_name);
    if (sources.length === 0) sources = ["NTSB", "FAA", "ASRS", "TSB"];
  } catch (error) { recordError("STATS_SOURCES", error); }

  /* SEVERITY */
  try {
    const result = await c.env.DB.prepare(
      `SELECT severity, COUNT(*) as n FROM events GROUP BY severity ORDER BY severity DESC`
    ).all<{ severity: number; n: number }>();
    severityBreakdown = result.results;
  } catch (error) { recordError("STATS_SEVERITY", error); }

  const stats = {
    ok: errors.length === 0,
    total_events: totalEvents,
    year_min: yearMin,
    year_max: yearMax,
    airports_covered: airportsCovered,
    sources,
    severity_breakdown: severityBreakdown,
    last_updated: currentTs,
    error_stage: errors.length > 0 ? errors[0].stage : null,
    errors,
  };

  const res = c.json(stats, 200, { "Cache-Control": "public, max-age=3600" });
  if (cache && cacheKey) {
    try { c.executionCtx.waitUntil(cache.put(cacheKey, res.clone())); } catch { /* ignore */ }
  }
  return res;
});

// ─── DB Debug ─────────────────────────────────────────────────────────────────
// Production Worker가 실제 연결된 D1 상태를 확인하기 위한 진단 API.
// 배포 확인 후 필요 없으면 제거 가능.

app.get("/api/debug/db", async c => {
  try {
    const [
      eventsCount,
      eventsLatest,
      eventsDateRange,
      opsCount,
    ] = await Promise.all([
      c.env.DB
        .prepare(
          "SELECT COUNT(*) as n FROM events"
        )
        .first<{ n: number }>(),

      c.env.DB
        .prepare(
          "SELECT MAX(updated_at) as ts FROM events"
        )
        .first<{ ts: string | null }>(),

      c.env.DB
        .prepare(
          `SELECT
             MIN(event_date) as min_date,
             MAX(event_date) as max_date
           FROM events
           WHERE event_date IS NOT NULL
             AND event_date != ''`
        )
        .first<{
          min_date: string | null;
          max_date: string | null;
        }>(),

      c.env.DB
        .prepare(
          "SELECT COUNT(*) as n FROM ops_intel_items"
        )
        .first<{ n: number }>(),
    ]);

    return c.json(
      {
        ok: true,

        database_binding: "DB",

        events: {
          count: Number(
            eventsCount?.n ?? 0
          ),

          latest_updated_at:
            eventsLatest?.ts ?? null,

          min_event_date:
            eventsDateRange?.min_date ??
            null,

          max_event_date:
            eventsDateRange?.max_date ??
            null,
        },

        ops_intel_items: {
          count: Number(
            opsCount?.n ?? 0
          ),
        },

        server_time:
          new Date().toISOString(),
      },
      200,
      {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      }
    );
  } catch (error) {
    console.error(
      "[/api/debug/db] D1 query failed:",
      error
    );

    return c.json(
      {
        ok: false,
        error: "DB_DEBUG_ERROR",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
      {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      }
    );
  }
});

// ─── 기존 이벤트 공항코드 백필 ───────────────────────────────────────────────

app.post(
  "/api/ops-intel/backfill-airports",
  async c => {
    const result =
      await backfillAirportCodes(
        c.env.DB
      );

    return c.json(result);
  }
);

// ─── Full Backfill API ─────────────────────────────────────────────────────────

app.post(
  "/api/ops-intel/backfill-full",
  async c => {
    const airportResult =
      await backfillAirportCodes(
        c.env.DB
      );

    const {
      backfillNtsbEventTime,
    } = await import(
      "./services/official_event_parsers"
    );

    const ntsbResult =
      await backfillNtsbEventTime(
        c.env.DB,
        100
      );

    const metarResult =
      await backfillMetar(
        c.env.DB,
        100
      );

    return c.json({
      status: "complete",

      airport_backfill:
        airportResult,

      ntsb_time_backfill:
        ntsbResult,

      metar_backfill:
        metarResult,
    });
  }
);

// ─── Weather ──────────────────────────────────────────────────────────────────

app.get(
  "/api/weather/:icao",
  async c => {
    const icao =
      c.req
        .param("icao")
        .toUpperCase();

    const [
      weather,
      messages,
    ] = await getWeather(
      icao
    );

    return c.json({
      station: icao,
      metar: weather.metar,
      taf: weather.taf,
      messages,
    });
  }
);

// ─── Events ──────────────────────────────────────────────────────────────────

app.get(
  "/api/events",
  async c => {
    const {
      results,
    } = await c.env.DB
      .prepare(
        "SELECT id,airport_icao,event_type FROM events"
      )
      .all<{
        id: string;
        airport_icao: string;
        event_type: string;
      }>();

    return c.json(results);
  }
);

// ─── Ops Intel ────────────────────────────────────────────────────────────────

app.get(
  "/api/ops-intel/status",
  async c => {
    const lastRun =
      await c.env.DB
        .prepare(
          `SELECT *
           FROM ops_intel_runs
           ORDER BY started_at DESC
           LIMIT 1`
        )
        .first<{
          status: string;
          started_at: string;
          finished_at: string | null;
          items_checked: number;
          items_saved: number;
          error: string | null;
        }>();

    const count =
      await c.env.DB
        .prepare(
          "SELECT COUNT(*) as count FROM ops_intel_items"
        )
        .first<{
          count: number;
        }>();

    return c.json({
      items_in_database:
        count?.count ?? 0,

      last_run:
        lastRun ?? null,
    });
  }
);

app.post(
  "/api/ops-intel/collect",
  async c =>
    c.json(
      await collectOnce(
        c.env.DB,
        c.env
      )
    )
);

// ─── Workers AI 연결 테스트 ─────────────────────────────────────────────────

app.get(
  "/api/ops-intel/ai-test",
  async c => {
    if (!c.env.AI) {
      return c.json(
        {
          error:
            "AI binding not configured",
        },
        503
      );
    }

    try {
      const result =
        await (c.env.AI as any).run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
            messages: [
              {
                role: "user",
                content:
                  "Reply with: OK",
              },
            ],
            max_tokens: 10,
          }
        );

      return c.json({
        ok: true,
        result,
      });
    } catch (e) {
      return c.json({
        ok: false,
        error: String(e),
      });
    }
  }
);

// ─── LLM enrichment 단독 실행 ────────────────────────────────────────────────

app.post(
  "/api/ops-intel/enrich-llm",
  async c => {
    if (!c.env.AI) {
      return c.json(
        {
          error:
            "AI binding not available",
        },
        503
      );
    }

    const body =
      await c.req
        .json<{
          limit?: number;
        }>()
        .catch(() => ({}));

    return c.json(
      await enrichWithLLM(
        c.env.AI,
        c.env.DB,
        body.limit ?? 20
      )
    );
  }
);

// events.summary → 구조화 위협 파라미터 추출
app.post(
  "/api/ops-intel/enrich-event-threats",
  async c => {
    if (!c.env.AI) {
      return c.json(
        {
          error:
            "AI binding not available",
        },
        503
      );
    }

    const body =
      await c.req
        .json<{
          limit?: number;
        }>()
        .catch(() => ({}));

    return c.json(
      await enrichEventsWithThreats(
        c.env.AI,
        c.env.DB,
        body.limit ?? 20
      )
    );
  }
);

app.post(
  "/api/ops-intel/collect-official-recent",
  async c => {
    const body =
      await c.req
        .json<{
          years_back?: number;
        }>()
        .catch(() => ({
          years_back:
            undefined,
        }));

    return c.json(
      await collectRecentOfficialEvents(
        c.env.DB,
        body.years_back ?? 20
      )
    );
  }
);

// ─── Granular collection for mass ingestion ──────────────────────────────────

app.post(
  "/api/admin/collect-step",
  async c => {
    const body =
      await c.req
        .json<{
          source: string;
          state?: string;
          year?: number;
          max_pages?: number;
        }>()
        .catch(() => ({}));

    const {
      source,
      state,
      year,
      max_pages,
    } = body as {
      source: string;
      state?: string;
      year?: number;
      max_pages?: number;
    };

    const db = c.env.DB;

    const {
      parseIcaoIstars,
      parseAraibKorea,
      parseJtsbJapan,
    } = await import(
      "./services/official_event_parsers"
    );

    switch (source) {
      case "icao":
        return c.json(
          await parseIcaoIstars(
            db,
            "2113c549-8f2d-4a98-a587-e35192569e55",
            25,
            state,
            year
          )
        );

      case "araib":
        return c.json(
          await parseAraibKorea(
            db,
            max_pages ?? 10
          )
        );

      case "jtsb":
        return c.json(
          await parseJtsbJapan(db)
        );

      default:
        return c.json(
          {
            error:
              "Unknown source",
          },
          400
        );
    }
  }
);

// ─── NTSB CAROL 연도 범위 지정 수집 ─────────────────────────────────────────

app.post(
  "/api/ops-intel/collect-ntsb",
  async c => {
    const body =
      await c.req
        .json<{
          start?: string;
          end?: string;
        }>()
        .catch(() => ({
          start: undefined,
          end: undefined,
        }));

    const end =
      body.end ??
      new Date()
        .toISOString()
        .slice(0, 10);

    const start =
      body.start ??
      (() => {
        const d =
          new Date();

        d.setFullYear(
          d.getFullYear() - 2
        );

        return d
          .toISOString()
          .slice(0, 10);
      })();

    const {
      collectNtsbRange,
    } = await import(
      "./services/official_event_parsers"
    );

    return c.json(
      await collectNtsbRange(
        c.env.DB,
        start,
        end
      )
    );
  }
);

// ─── TSB Canada CSV 데이터 수집 ──────────────────────────────────────────────

app.post(
  "/api/ops-intel/ingest-tsb",
  async c => {
    const body =
      await c.req
        .json<{
          records?: unknown[];
        }>()
        .catch(() => ({
          records: [],
        }));

    if (
      !Array.isArray(body.records) ||
      body.records.length === 0
    ) {
      return c.json(
        {
          error:
            "records array required",
        },
        400
      );
    }

    const {
      ingestTsbBatch,
    } = await import(
      "./services/official_event_parsers"
    );

    return c.json(
      await ingestTsbBatch(
        c.env.DB,
        body.records as Parameters<
          typeof ingestTsbBatch
        >[1]
      )
    );
  }
);

// ─── ASN 데이터 수집 ─────────────────────────────────────────────────────────

app.post(
  "/api/ops-intel/ingest-asn",
  async c => {
    const body =
      await c.req
        .json<{
          records?: unknown[];
        }>()
        .catch(() => ({
          records: [],
        }));

    if (
      !Array.isArray(body.records) ||
      body.records.length === 0
    ) {
      return c.json(
        {
          error:
            "records array required",
        },
        400
      );
    }

    const {
      ingestAsnBatch,
    } = await import(
      "./services/official_event_parsers"
    );

    return c.json(
      await ingestAsnBatch(
        c.env.DB,
        body.records as Parameters<
          typeof ingestAsnBatch
        >[1]
      )
    );
  }
);

// ─── Generic event ingestion ──────────────────────────────────────────────────

app.post(
  "/api/ops-intel/ingest-events",
  async c => {
    const body =
      await c.req
        .json<{
          records?: any[];
        }>()
        .catch(() => ({
          records: [],
        }));

    if (
      !Array.isArray(body.records) ||
      body.records.length === 0
    ) {
      return c.json(
        {
          error:
            "records array required",
        },
        400
      );
    }

    const {
      upsertEventRecord,
    } = await import(
      "./services/official_event_parsers"
    );

    let created = 0;

    for (
      const rec of body.records
    ) {
      try {
        if (
          await upsertEventRecord(
            c.env.DB,
            rec
          )
        ) {
          created++;
        }
      } catch (e) {
        console.error(
          "Ingest failed for record:",
          rec.id,
          e
        );
      }
    }

    return c.json({
      checked:
        body.records.length,

      created,
    });
  }
);

// ─── DELETE EASA records ──────────────────────────────────────────────────────

app.delete(
  "/api/ops-intel/purge-easa",
  async c => {
    const {
      results,
    } = await c.env.DB
      .prepare(
        "SELECT id FROM events WHERE id LIKE 'EASA-%'"
      )
      .all<{
        id: string;
      }>();

    for (
      const row of results
    ) {
      await c.env.DB
        .prepare(
          "DELETE FROM event_tags WHERE event_id = ?"
        )
        .bind(row.id)
        .run();

      await c.env.DB
        .prepare(
          "DELETE FROM events WHERE id = ?"
        )
        .bind(row.id)
        .run();
    }

    return c.json({
      deleted:
        results.length,
    });
  }
);

app.get(
  "/api/ops-intel/items",
  async c => {
    const {
      results,
    } = await c.env.DB
      .prepare(
        `SELECT
           source_name,
           source_url,
           title,
           category,
           severity,
           summary,
           operational_lesson,
           a350_b787_applicability,
           recommended_action,
           tags,
           last_status,
           last_checked_at
         FROM ops_intel_items
         ORDER BY updated_at DESC
         LIMIT 50`
      )
      .all();

    return c.json(results);
  }
);

app.post(
  "/api/ops-intel/refine-official",
  async c =>
    c.json(
      await refineOfficialItems(
        c.env.DB
      )
    )
);

app.post(
  "/api/ops-intel/reports/daily",
  async c =>
    c.json({
      markdown:
        await dailyBriefingMarkdown(
          c.env.DB
        ),
    })
);

app.post(
  "/api/ops-intel/reports/weekly",
  async c =>
    c.json({
      markdown:
        await reviewMarkdown(
          c.env.DB,
          "weekly"
        ),
    })
);

app.post(
  "/api/ops-intel/reports/monthly",
  async c =>
    c.json({
      markdown:
        await reviewMarkdown(
          c.env.DB,
          "monthly"
        ),
    })
);

// ─── METAR 백필 ───────────────────────────────────────────────────────────────

app.post(
  "/api/admin/backfill-metar",
  async c => {
    const body =
      await c.req
        .json<{
          limit?: number;
          dry_run?: boolean;
        }>()
        .catch(() => ({}));

    const limit = Math.min(
      Number(body.limit ?? 30),
      100
    );

    return c.json(
      await backfillMetar(
        c.env.DB,
        limit
      )
    );
  }
);

// ─── NTSB event_time 백필 ─────────────────────────────────────────────────────

app.post(
  "/api/admin/backfill-ntsb-time",
  async c => {
    const body =
      await c.req
        .json<{
          limit?: number;
        }>()
        .catch(() => ({}));

    const limit = Math.min(
      Number(body.limit ?? 50),
      200
    );

    const {
      backfillNtsbEventTime,
    } = await import(
      "./services/official_event_parsers"
    );

    return c.json(
      await backfillNtsbEventTime(
        c.env.DB,
        limit
      )
    );
  }
);

// ─── Default: serve static assets ─────────────────────────────────────────────
// Cloudflare Workers Assets serve public/ automatically for non-API routes.

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
