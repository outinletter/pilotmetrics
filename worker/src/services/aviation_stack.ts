import { LOCAL_ROUTES } from "../data/routes";
import { ROUTE_PAIRS } from "../data/route_pairs";

export function normalizeFlightNumber(fn: string): string {
  const value = fn.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (value.startsWith("KAL") && /^\d+$/.test(value.slice(3))) return `KE${value.slice(3)}`;
  return value;
}

function candidates(fn: string): string[] {
  fn = normalizeFlightNumber(fn);
  if (fn.length >= 4 && /^\d+$/.test(fn.slice(2))) {
    const airline = fn.slice(0, 2);
    const num = parseInt(fn.slice(2), 10);
    return [...new Set([fn, `${airline}${num}`, `${airline}${String(num).padStart(3, "0")}`])];
  }
  return [fn];
}

function localRoute(fn: string) {
  for (const q of candidates(fn)) {
    const r = LOCAL_ROUTES[q];
    if (r) return { ...r };
  }
  return null;
}

// KE 편번 범위로 출발/귀항 방향 추론 후 ROUTE_PAIRS에서 노선 확인
function guessKeRoute(fn: string): { departure_iata: string; arrival_iata: string; aircraft_type: string } | null {
  if (!fn.startsWith("KE")) return null;
  const num = parseInt(fn.slice(2), 10);
  if (isNaN(num)) return null;

  const outbound = num % 2 === 1;

  // 4자리 편번 (국내선 및 특정 셔틀 노선)
  if (num >= 1000) {
    let candidates: [string, string][] = [];
    if (num >= 1001 && num <= 1999) {
      // Domestic: Hub (GMP, PUS, ICN) <=> CJU/PUS/USN/RSU
      candidates = outbound
        ? [["GMP", "CJU"], ["PUS", "CJU"], ["ICN", "PUS"], ["GMP", "PUS"], ["GMP", "USN"], ["GMP", "RSU"]]
        : [["CJU", "GMP"], ["CJU", "PUS"], ["PUS", "ICN"], ["PUS", "GMP"], ["USN", "GMP"], ["RSU", "GMP"]];
    } else if (num >= 2101 && num <= 2199) {
      candidates = outbound ? [["GMP", "HND"]] : [["HND", "GMP"]];
    } else if (num >= 2701 && num <= 2800) {
      candidates = outbound ? [["GMP", "SHA"], ["GMP", "TSA"]] : [["SHA", "GMP"], ["TSA", "GMP"]];
    }

    for (const [dep, arr] of candidates) {
      const pair = ROUTE_PAIRS[`${dep}-${arr}`];
      if (pair) return pair;
    }
    return null;
  }

  // 3자리 이하 편번 (국제선 중심, ICN 기준)
  const regionMap: Record<string, string[]> = {
    "1-99":   ["JFK","LAX","ORD","SFO","ATL","IAD","IAH"],
    "100-199":["SYD","AKL","BNE","NAN"],
    "200-299":["LAX","SFO","LAS"],
    "300-399":["FRA","CDG","LHR","AMS","MXP","FCO","MAD","VIE","ZRH","PRG","IST","LED","SVO","ARN"],
    "400-499":["DEL","BOM","CMB","KTM","TAS","RUH","AUH","JED","NBO","TLV"],
    "461-470":["DAD","SGN","HAN","CXR","PNH","REP","RGN"],
    "471-480":["DEL","BOM"],
    "600-699":["BKK","CNX","MNL","SIN","KUL","HKT","HKG","DPS","CGK","CEB","BKI","PNH","REP","RGN","ROR"],
    "700-799":["NRT","HND","KIX","FUK","NGO","CTS","OKA","KIJ","KMQ","KOJ","OIT","OKJ"],
    "800-899":["PEK","PVG","SHA","CAN","CTU","XIY","DLC","SHE","HGH","NKG","TAO","TSN","CSX","TNA","TXN","SZX","KMG","WUH","XMN","YNJ","CGO"],
    "900-999":["CDG","FRA","LHR","AMS","MXP","FCO","MAD","VIE","ZRH","PRG","IST"],
  };

  let dests: string[] = [];
  if (num >= 1   && num <= 99)  dests = regionMap["1-99"];
  else if (num >= 100 && num <= 199) dests = regionMap["100-199"];
  else if (num >= 200 && num <= 299) dests = regionMap["200-299"];
  else if (num >= 300 && num <= 399) dests = regionMap["300-399"];
  else if (num >= 461 && num <= 470) dests = regionMap["461-470"];
  else if (num >= 471 && num <= 499) dests = regionMap["471-480"];
  else if (num >= 600 && num <= 699) dests = regionMap["600-699"];
  else if (num >= 700 && num <= 799) dests = regionMap["700-799"];
  else if (num >= 800 && num <= 899) dests = regionMap["800-899"];
  else if (num >= 900 && num <= 999) dests = regionMap["900-999"];

  for (const dst of dests) {
    const key = outbound ? `ICN-${dst}` : `${dst}-ICN`;
    const pair = ROUTE_PAIRS[key];
    if (pair) return pair;
  }

  return outbound
    ? { departure_iata: "ICN", arrival_iata: "UNKNOWN", aircraft_type: "Unknown" }
    : { departure_iata: "UNKNOWN", arrival_iata: "ICN", aircraft_type: "Unknown" };
}

function flightFromItem(fn: string, item: Record<string, unknown>) {
  return {
    flight_number: fn,
    airline_iata: (item.airline as Record<string, string>)?.iata ?? null,
    flight_iata: (item.flight as Record<string, string>)?.iata ?? null,
    departure_iata: (item.departure as Record<string, string>)?.iata ?? null,
    arrival_iata: (item.arrival as Record<string, string>)?.iata ?? null,
    scheduled_departure: (item.departure as Record<string, string>)?.scheduled ?? null,
    scheduled_arrival: (item.arrival as Record<string, string>)?.scheduled ?? null,
    estimated_departure: (item.departure as Record<string, string>)?.estimated ?? null,
    estimated_arrival: (item.arrival as Record<string, string>)?.estimated ?? null,
    aircraft_type: (item.aircraft as Record<string, string>)?.iata ?? null,
    raw: item,
  };
}

// ─── Flightradar24 공개 API — 스케줄 시각 조회 ────────────────────────────────
const FR24_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface Fr24Times {
  scheduled_departure: string | null;
  scheduled_arrival:   string | null;
  estimated_departure: string | null;
  estimated_arrival:   string | null;
}

async function fr24Times(fn: string): Promise<Fr24Times | null> {
  // FR24 flight-list endpoint (공개, 인증 불필요)
  const url = `https://api.flightradar24.com/common/v1/flight/list.json?query=${encodeURIComponent(fn)}&fetchBy=flight&page=1&limit=10&format=json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FR24_UA, "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;

    // 응답 구조: { result: { response: { data: { item: { rows: [...] } } } } }
    const rows = (json as any)?.result?.response?.data?.item?.rows as Record<string, unknown>[] | undefined;
    if (!rows?.length) return null;

    // 가장 최근 항편 (배열 첫 번째)
    const row = rows[0] as Record<string, unknown>;

    function toIso(epoch: unknown): string | null {
      if (!epoch) return null;
      const t = typeof epoch === "string" ? parseInt(epoch) : Number(epoch);
      if (!isFinite(t) || t <= 0) return null;
      return new Date(t * 1000).toISOString();
    }

    const times = row.time as Record<string, Record<string, unknown>> | undefined;
    return {
      scheduled_departure: toIso(times?.scheduled?.departure),
      scheduled_arrival:   toIso(times?.scheduled?.arrival),
      estimated_departure: toIso(times?.estimated?.departure ?? times?.real?.departure),
      estimated_arrival:   toIso(times?.estimated?.arrival   ?? times?.real?.arrival),
    };
  } catch { return null; }
}

// ─── 한국공항공사(Airportal) 국제선 운항 스케줄 — 공식 데이터, AviationStack보다 우선 ──────
// NOTE: 실제 응답 필드명(airline/flightId/depAirportId 등)과 편명 필터 파라미터 지원 여부는
// 공식 Swagger 문서로 검증 필요. 편명 직접 필터가 안 될 경우 페이지 스캔이 느릴 수 있어
// 최대 5페이지(5000행)까지만 조회하고 못 찾으면 포기한다.
const AIRPORTAL_URL = "https://apis.data.go.kr/B551178/flight-schedule/int";
const AIRPORTAL_MAX_PAGES = 5;

async function airportalLookup(fn: string, serviceKey?: string) {
  if (!serviceKey) return null;
  for (let page = 1; page <= AIRPORTAL_MAX_PAGES; page++) {
    const url = `${AIRPORTAL_URL}?serviceKey=${serviceKey}&pageNo=${page}&numOfRows=1000&type=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue; // Skip to next page or fail silently
      const json = await res.json() as Record<string, unknown>;
      if (!json || typeof json !== "object") continue;

      const items = (json as any)?.response?.body?.items?.item;
      if (!items) continue;

      const rows: Record<string, unknown>[] = Array.isArray(items) ? items : [items];
      if (!rows.length) return null; // 마지막 페이지 도달

      for (const q of candidates(fn)) {
        const match = rows.find(r => String(r.flightId ?? r.flightNo ?? "").toUpperCase() === q);
        if (match) {
          return {
            flight_number: fn,
            airline_iata: "KE",
            flight_iata: q,
            departure_iata: (match.depAirportId as string) ?? null,
            arrival_iata: (match.arrAirportId as string) ?? null,
            scheduled_departure: null,
            scheduled_arrival: null,
            estimated_departure: null,
            estimated_arrival: null,
            aircraft_type: null,
            raw: { source: "airportal", ...match },
          };
        }
      }
    } catch { return null; }
  }
  return null;
}

async function aviationstackLookup(fn: string, apiKey: string) {
  if (!apiKey) return null;
  // 1차: 실시간 flights (현재 비행 중인 편)
  for (const q of candidates(fn)) {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${q}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = (await res.json() as { data?: unknown[] }).data;
      if (data?.length) return flightFromItem(fn, data[0] as Record<string, unknown>);
    } catch { /* continue */ }
  }
  // 2차: timetable (스케줄 데이터 — 비행 중이 아닐 때)
  for (const q of candidates(fn)) {
    const url = `http://api.aviationstack.com/v1/timetable?access_key=${apiKey}&iataCode=ICN&type=departure&flight_number=${q}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const json = await res.json() as { data?: unknown[] };
      const data = json.data;
      if (data?.length) {
        const item = data[0] as Record<string, unknown>;
        // timetable 응답 구조를 flightFromItem 형식으로 변환
        const dep = item.departure as Record<string, string> | undefined;
        const arr = item.arrival as Record<string, string> | undefined;
        return {
          flight_number: fn,
          airline_iata: (item.airline as Record<string, string>)?.iata ?? "KE",
          flight_iata: q,
          departure_iata: dep?.iata ?? null,
          arrival_iata: arr?.iata ?? null,
          scheduled_departure: dep?.scheduledTime ?? dep?.scheduled ?? null,
          scheduled_arrival: arr?.scheduledTime ?? arr?.scheduled ?? null,
          estimated_departure: null,
          estimated_arrival: null,
          aircraft_type: (item.aircraft as Record<string, string>)?.iata ?? null,
          raw: item,
        };
      }
    } catch { /* continue */ }
  }
  return null;
}

/** 시각이 모두 null인지 확인 */
function hasNoTimes(f: Record<string, unknown>): boolean {
  return !f.scheduled_departure && !f.scheduled_arrival && !f.estimated_departure && !f.estimated_arrival;
}

/** FR24에서 가져온 시각으로 결과 보완 */
async function enrichTimesFromFr24(result: Record<string, unknown>, fn: string): Promise<void> {
  if (!hasNoTimes(result)) return;
  try {
    const t = await fr24Times(fn);
    if (!t) return;
    if (t.scheduled_departure)  result.scheduled_departure  = t.scheduled_departure;
    if (t.scheduled_arrival)    result.scheduled_arrival    = t.scheduled_arrival;
    if (t.estimated_departure)  result.estimated_departure  = t.estimated_departure;
    if (t.estimated_arrival)    result.estimated_arrival    = t.estimated_arrival;
    if (t.scheduled_departure || t.scheduled_arrival) result.time_source = "flightradar24";
  } catch { /* silent */ }
}

export async function getFlight(fn: string, apiKey: string, airportalKey?: string): Promise<[Record<string, unknown>, string | null]> {
  fn = normalizeFlightNumber(fn);
  const local = localRoute(fn);
  let apiFlight: ReturnType<typeof flightFromItem> | null = null;
  let airportalFlight: Awaited<ReturnType<typeof airportalLookup>> = null;

  // Airportal(공식) + AviationStack + FR24 병렬 조회
  const [, , fr24] = await Promise.allSettled([
    (async () => { try { apiFlight = await aviationstackLookup(fn, apiKey); } catch { /* ignore */ } })(),
    (async () => { try { airportalFlight = await airportalLookup(fn, airportalKey); } catch { /* ignore */ } })(),
    fr24Times(fn),
  ]);
  const fr24Result = fr24.status === "fulfilled" ? fr24.value : null;

  function applyFr24(target: Record<string, unknown>) {
    if (!fr24Result || !hasNoTimes(target)) return;
    if (fr24Result.scheduled_departure)  target.scheduled_departure  = fr24Result.scheduled_departure;
    if (fr24Result.scheduled_arrival)    target.scheduled_arrival    = fr24Result.scheduled_arrival;
    if (fr24Result.estimated_departure)  target.estimated_departure  = fr24Result.estimated_departure;
    if (fr24Result.estimated_arrival)    target.estimated_arrival    = fr24Result.estimated_arrival;
    if (fr24Result.scheduled_departure || fr24Result.scheduled_arrival) target.time_source = "flightradar24";
  }

  // 1순위: LOCAL_ROUTES
  if (local) {
    if (apiFlight) {
      local.aircraft_type = apiFlight.aircraft_type ?? local.aircraft_type;
      for (const k of ["scheduled_departure","scheduled_arrival","estimated_departure","estimated_arrival"] as const) {
        (local as Record<string, unknown>)[k] = (apiFlight as Record<string, unknown>)[k];
      }
    }
    const result: Record<string, unknown> = { ...local, flight_number: fn, airline_iata: "KE", flight_iata: apiFlight?.flight_iata ?? fn, raw: apiFlight?.raw ?? { source: "local_routes" } };
    applyFr24(result);
    return [result, null];
  }

  // 2순위: Airportal(한국공항공사 공식 스케줄) — 3rd-party API보다 신뢰도 높음
  if (airportalFlight) {
    const dep = (airportalFlight.departure_iata as string) ?? "";
    const arr = (airportalFlight.arrival_iata as string) ?? "";
    const pair = ROUTE_PAIRS[`${dep}-${arr}`];
    if (!airportalFlight.aircraft_type && pair) {
      (airportalFlight as Record<string, unknown>).aircraft_type = pair.aircraft_type;
    }
    const result = airportalFlight as unknown as Record<string, unknown>;
    applyFr24(result);
    return [result, null];
  }

  // 3순위: AviationStack API 실시간 데이터
  if (apiFlight) {
    const dep = (apiFlight.departure_iata as string) ?? "";
    const arr = (apiFlight.arrival_iata as string) ?? "";
    const pair = ROUTE_PAIRS[`${dep}-${arr}`];
    if (!apiFlight.aircraft_type && pair) {
      (apiFlight as Record<string, unknown>).aircraft_type = pair.aircraft_type;
    }
    const result = apiFlight as unknown as Record<string, unknown>;
    applyFr24(result);
    return [result, null];
  }

  // 4순위: ROUTE_PAIRS 기반 추론
  const keGuess = guessKeRoute(fn);
  const hasRoute = keGuess && keGuess.arrival_iata !== "UNKNOWN" && keGuess.departure_iata !== "UNKNOWN";
  const fallback: Record<string, unknown> = {
    flight_number: fn, airline_iata: "KE", flight_iata: fn,
    departure_iata: hasRoute ? keGuess!.departure_iata : null,
    arrival_iata: hasRoute ? keGuess!.arrival_iata : null,
    scheduled_departure: null, scheduled_arrival: null,
    estimated_departure: null, estimated_arrival: null,
    aircraft_type: hasRoute ? keGuess!.aircraft_type : null,
    raw: { source: "openflights_route_pairs", ...keGuess },
  };
  applyFr24(fallback);
  const msg = hasRoute
    ? `Route estimated from OpenFlights data (${keGuess!.departure_iata}→${keGuess!.arrival_iata}). Live data unavailable.`
    : "Flight route not found. Showing general Korean Air threat analysis.";
  return [fallback, msg];
}
