import { LOCAL_ROUTES } from "../data/routes";

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

  if (local) {
    const raw = apiFlight ? apiFlight.raw : { source: "internal_route_database", ...local };
    if (apiFlight) {
      local.aircraft_type = apiFlight.aircraft_type ?? local.aircraft_type;
      for (const k of ["scheduled_departure","scheduled_arrival","estimated_departure","estimated_arrival"] as const) {
        (local as Record<string, unknown>)[k] = (apiFlight as Record<string, unknown>)[k];
      }
    }
    return [{ ...local, flight_number: fn, airline_iata: fn.slice(0, 2), flight_iata: apiFlight?.flight_iata ?? fn, raw }, null];
  }

  if (apiFlight) return [apiFlight as unknown as Record<string, unknown>, null];

  const fallback: Record<string, unknown> = {
    flight_number: fn, airline_iata: fn.slice(0, 2), flight_iata: fn,
    departure_iata: null, arrival_iata: null,
    scheduled_departure: null, scheduled_arrival: null,
    estimated_departure: null, estimated_arrival: null,
    aircraft_type: null, raw: { source: "unresolved" },
  };
  const msg = fn.startsWith("KE") && /^\d+$/.test(fn.slice(2))
    ? "Flight not found in live/local route data; showing Korean Air flight lookup."
    : "Flight API unavailable; using local route database.";
  return [fallback, msg];
}
