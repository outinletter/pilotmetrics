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

// KE 편번 범위로 ICN 출발/귀항 방향 추론 후 ROUTE_PAIRS에서 노선 확인
function guessKeRoute(fn: string): { departure_iata: string; arrival_iata: string; aircraft_type: string } | null {
  if (!fn.startsWith("KE")) return null;
  const num = parseInt(fn.slice(2), 10);
  if (isNaN(num)) return null;

  // 홀수=ICN 출발, 짝수=ICN 귀항 (대부분의 KE 관례)
  const outbound = num % 2 === 1;

  // 편번 대역별 대표 목적지 목록 (ROUTE_PAIRS에 있는 실제 노선 기준)
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

  // 편번 범위에 해당하는 후보 목적지 목록 선택
  let candidates: string[] = [];
  if (num >= 1   && num <= 99)  candidates = regionMap["1-99"];
  else if (num >= 100 && num <= 199) candidates = regionMap["100-199"];
  else if (num >= 200 && num <= 299) candidates = regionMap["200-299"];
  else if (num >= 300 && num <= 399) candidates = regionMap["300-399"];
  else if (num >= 461 && num <= 470) candidates = regionMap["461-470"];
  else if (num >= 471 && num <= 499) candidates = regionMap["471-480"];
  else if (num >= 600 && num <= 699) candidates = regionMap["600-699"];
  else if (num >= 700 && num <= 799) candidates = regionMap["700-799"];
  else if (num >= 800 && num <= 899) candidates = regionMap["800-899"];
  else if (num >= 900 && num <= 999) candidates = regionMap["900-999"];

  // ROUTE_PAIRS에서 실제 운항 노선 중 첫 번째 매칭
  for (const dst of candidates) {
    const key = outbound ? `ICN-${dst}` : `${dst}-ICN`;
    const pair = ROUTE_PAIRS[key];
    if (pair) return pair;
  }

  // 최후 fallback: ICN 출발/귀항만 설정
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

async function aviationstackLookup(fn: string, apiKey: string) {
  if (!apiKey) return null;
  for (const q of candidates(fn)) {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${q}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = (await res.json() as { data?: unknown[] }).data;
      if (data?.length) return flightFromItem(fn, data[0] as Record<string, unknown>);
    } catch { /* continue */ }
  }
  return null;
}

export async function getFlight(fn: string, apiKey: string): Promise<[Record<string, unknown>, string | null]> {
  fn = normalizeFlightNumber(fn);
  const local = localRoute(fn);
  let apiFlight: ReturnType<typeof flightFromItem> | null = null;

  try { apiFlight = await aviationstackLookup(fn, apiKey); } catch { /* ignore */ }

  // 1순위: LOCAL_ROUTES (정확한 편명 매핑)
  if (local) {
    if (apiFlight) {
      local.aircraft_type = apiFlight.aircraft_type ?? local.aircraft_type;
      for (const k of ["scheduled_departure","scheduled_arrival","estimated_departure","estimated_arrival"] as const) {
        (local as Record<string, unknown>)[k] = (apiFlight as Record<string, unknown>)[k];
      }
    }
    return [{ ...local, flight_number: fn, airline_iata: "KE", flight_iata: apiFlight?.flight_iata ?? fn, raw: apiFlight?.raw ?? { source: "local_routes" } }, null];
  }

  // 2순위: AviationStack API 실시간 데이터
  if (apiFlight) {
    // API 결과에서 ROUTE_PAIRS로 기종 보완
    const dep = (apiFlight.departure_iata as string) ?? "";
    const arr = (apiFlight.arrival_iata as string) ?? "";
    const pair = ROUTE_PAIRS[`${dep}-${arr}`];
    if (!apiFlight.aircraft_type && pair) {
      (apiFlight as Record<string, unknown>).aircraft_type = pair.aircraft_type;
    }
    return [apiFlight as unknown as Record<string, unknown>, null];
  }

  // 3순위: ROUTE_PAIRS 기반 추론 (OpenFlights 데이터)
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
  const msg = hasRoute
    ? `Route estimated from OpenFlights data (${keGuess!.departure_iata}→${keGuess!.arrival_iata}). Live data unavailable.`
    : "Flight route not found. Showing general Korean Air threat analysis.";
  return [fallback, msg];
}
