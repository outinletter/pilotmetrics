import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { iataToIcao } from "./data/airports";
import { getFlight, normalizeFlightNumber } from "./services/aviation_stack";
import { getWeather } from "./services/noaa";
import { parseWeatherTags, selectArrivalTafSegment } from "./services/metar_parser";
import { riskLevel } from "./services/risk_tagger";
import { buildThreats } from "./services/briefing_generator";
import { collectOnce, refineOfficialItems } from "./services/ops_intel_collector";
import { collectRecentOfficialEvents } from "./services/official_event_parsers";
import { dailyBriefingMarkdown, reviewMarkdown } from "./services/report_generator";
import { telegramMessage, sendTelegramMessage } from "./services/telegram";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

// ─── Health ──────────────────────────────────────────────────────────────────
app.get("/api/health", c => c.json({ ok: true }));

// ─── Briefing ─────────────────────────────────────────────────────────────────
app.get("/api/briefing/:flightNumber", async c => {
  const fn = normalizeFlightNumber(c.req.param("flightNumber"));
  const [flight, flightMsg] = await getFlight(fn, c.env.AVIATIONSTACK_API_KEY);
  const depIcao = iataToIcao(flight.departure_iata as string);
  const arrIcao = iataToIcao(flight.arrival_iata as string);
  const [weather, weatherMessages] = arrIcao ? await getWeather(arrIcao) : [{ metar: "", taf: "" }, []];
  const arrivalTime = (flight.estimated_arrival ?? flight.scheduled_arrival) as string | null;
  const arrivalTaf = selectArrivalTafSegment(weather.taf, arrivalTime);
  const tags = parseWeatherTags(weather.metar, arrivalTaf);
  const depIata = (flight.departure_iata as string) ?? "UNKNOWN";
  const arrIata = (flight.arrival_iata as string) ?? "UNKNOWN";

  const context: Record<string, unknown> = {
    flight_number: fn, route: `${depIata}-${arrIata}`,
    aircraft: (flight.aircraft_type as string) ?? "Unknown",
    departure_icao: depIcao, arrival_icao: arrIcao,
    destination_runway: null,
    weather: tags.join("/") || "ROUTE ONLY",
    risk_level: riskLevel(tags),
    messages: [flightMsg, ...weatherMessages].filter(Boolean),
    arrival_weather_time: arrivalTime,
    metar: weather.metar, taf: weather.taf, arrival_taf: arrivalTaf,
  };
  if (flightMsg) {
    const enc = (q: string) => encodeURIComponent(q);
    context.flight_search_links = [
      { label: `${fn} flight status`, url: `https://www.google.com/search?q=${enc(`${fn} flight status`)}` },
      { label: `${fn} ${context.route} today flight`, url: `https://www.google.com/search?q=${enc(`${fn} ${context.route} today flight`)}` },
    ];
  }

  // Persist query to D1
  await c.env.DB.prepare(
    "INSERT INTO flight_queries (flight_number,airline_iata,flight_iata,departure_iata,arrival_iata,departure_icao,arrival_icao,scheduled_departure,scheduled_arrival,estimated_departure,estimated_arrival,aircraft_type,raw_response_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(fn, flight.airline_iata ?? null, flight.flight_iata ?? null, flight.departure_iata ?? null, flight.arrival_iata ?? null, depIcao, arrIcao, flight.scheduled_departure ?? null, flight.scheduled_arrival ?? null, flight.estimated_departure ?? null, flight.estimated_arrival ?? null, flight.aircraft_type ?? null, JSON.stringify(flight.raw ?? {})).run();

  return c.json({ flight_context: context, top_threats: await buildThreats(c.env.DB, context, tags) });
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

app.post("/api/ops-intel/collect", async c => c.json(await collectOnce(c.env.DB)));

app.post("/api/ops-intel/collect-official-recent", async c => {
  const body = await c.req.json<{ years_back?: number }>().catch(() => ({ years_back: undefined }));
  return c.json(await collectRecentOfficialEvents(c.env.DB, body.years_back ?? 20));
});

app.get("/api/ops-intel/items", async c => {
  const { results } = await c.env.DB.prepare("SELECT source_name,source_url,title,category,severity,summary,operational_lesson,a350_b787_applicability,recommended_action,tags,last_status,last_checked_at FROM ops_intel_items ORDER BY updated_at DESC LIMIT 50").all();
  return c.json(results);
});

app.post("/api/ops-intel/refine-official", async c => c.json(await refineOfficialItems(c.env.DB)));

app.post("/api/ops-intel/reports/daily", async c => c.json({ markdown: await dailyBriefingMarkdown(c.env.DB) }));

app.post("/api/ops-intel/reports/weekly", async c => c.json({ markdown: await reviewMarkdown(c.env.DB, "weekly") }));

app.post("/api/ops-intel/reports/monthly", async c => c.json({ markdown: await reviewMarkdown(c.env.DB, "monthly") }));

app.get("/api/ops-intel/telegram/message", async c => c.json({ message: await telegramMessage(c.env.DB) }));

app.post("/api/ops-intel/telegram/send", async c =>
  c.json(await sendTelegramMessage(c.env.DB, c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID))
);

// ─── Default: serve static assets ────────────────────────────────────────────
// Cloudflare Workers Assets serve public/ automatically for non-API routes.

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
