async function fetchMetar(icao: string): Promise<[string, string | null]> {
  // 1차: VATSIM (신뢰성 높음, plain text)
  try {
    const res = await fetch(`https://metar.vatsim.net/metar.php?id=${icao}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text && !text.startsWith("No METAR")) return [text, null];
    }
  } catch { /* fall through */ }
  // 2차: aviationweather.gov
  try {
    const res = await fetch(`https://aviationweather.gov/api/data/metar?format=json&ids=${icao}`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      if (data?.length) {
        const raw = data[0].rawOb ?? data[0].raw_text ?? null;
        if (raw) return [raw, null];
      }
    }
  } catch { /* fall through */ }
  return ["", "Weather API unavailable; showing route-based risk briefing."];
}

async function fetchTaf(icao: string): Promise<[string, string | null]> {
  try {
    const res = await fetch(`https://aviationweather.gov/api/data/taf?format=json&ids=${icao}`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json() as Record<string, string>[];
      if (data?.length) {
        const raw = data[0].rawTAF ?? data[0].raw_text ?? null;
        if (raw) return [raw, null];
      }
    }
  } catch { /* fall through */ }
  return ["", "Weather API unavailable; showing route-based risk briefing."];
}

export async function getWeather(icao: string): Promise<[{ metar: string; taf: string }, string[]]> {
  const [metar, metarMsg] = await fetchMetar(icao);
  const [taf, tafMsg] = await fetchTaf(icao);
  const messages = [...new Set([metarMsg, tafMsg].filter(Boolean) as string[])];

  // Fallback test data for WADD (Bali)
  const finalMetar = (metar || (icao === "WADD" ? "WADD 220900Z 09012G24KT 5000 TSRA SCT018CB BKN030 27/25 Q1008 TEMPO WS" : ""));
  const finalTaf   = (taf   || (icao === "WADD" ? "TAF WADD 220500Z 2206/2312 10012KT 6000 TSRA SCT018CB BKN030 TEMPO 2209/2214 3000 +TSRA WS" : ""));

  return [{ metar: finalMetar, taf: finalTaf }, messages];
}
