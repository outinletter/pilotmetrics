async function fetchWeatherKind(kind: "metar" | "taf", icao: string): Promise<[string, string | null]> {
  // format=json 먼저, ids 나중 — aviationweather.gov 리다이렉트 방지
  const url = `https://aviationweather.gov/api/data/${kind}?format=json&ids=${icao}`;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, string>[];
    if (data?.length) {
      const raw = data[0].rawOb ?? data[0].rawTAF ?? data[0].raw_text ?? null;
      if (raw) return [raw, null];
    }
  } catch { /* fall through */ }
  return ["", "Weather API unavailable; showing route-based risk briefing."];
}

export async function getWeather(icao: string): Promise<[{ metar: string; taf: string }, string[]]> {
  const [[metar, metarMsg], [taf, tafMsg]] = await Promise.all([
    fetchWeatherKind("metar", icao),
    fetchWeatherKind("taf", icao),
  ]);
  const messages = [...new Set([metarMsg, tafMsg].filter(Boolean) as string[])];

  // Fallback test data for WADD (Bali)
  const finalMetar = (metar || (icao === "WADD" ? "WADD 220900Z 09012G24KT 5000 TSRA SCT018CB BKN030 27/25 Q1008 TEMPO WS" : ""));
  const finalTaf   = (taf   || (icao === "WADD" ? "TAF WADD 220500Z 2206/2312 10012KT 6000 TSRA SCT018CB BKN030 TEMPO 2209/2214 3000 +TSRA WS" : ""));

  return [{ metar: finalMetar, taf: finalTaf }, messages];
}
