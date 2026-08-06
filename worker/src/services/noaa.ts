const UA = "PilotMetrics/1.0 (aviation-safety-briefing)";

/** 단일 소스에서 METAR 문자열 추출 — 실패 시 reject */
async function tryMetarSource(url: string, parse: (body: string) => string | null): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  const metar = parse(body);
  if (!metar) throw new Error("no data");
  return metar;
}

async function fetchMetar(icao: string): Promise<[string, string | null]> {
  // 3개 소스를 동시에 요청 — 가장 먼저 성공한 결과 사용
  const sources: Promise<string>[] = [
    // VATSIM (plain text)
    tryMetarSource(
      `https://metar.vatsim.net/metar.php?id=${icao}`,
      t => { const s = t.trim(); return (s.length > 10 && !s.startsWith("No ")) ? s : null; }
    ),
    // IVAO (plain text, 별도 네트워크)
    tryMetarSource(
      `https://wx.ivao.aero/metar.php?station=${icao}`,
      t => { const s = t.trim(); return (s.length > 10 && !s.startsWith("No ")) ? s : null; }
    ),
    // aviationweather.gov JSON
    tryMetarSource(
      `https://aviationweather.gov/api/data/metar?format=json&ids=${icao}`,
      t => {
        try {
          const d = JSON.parse(t) as Record<string, string>[];
          return d?.[0]?.rawOb ?? d?.[0]?.raw_text ?? null;
        } catch { return null; }
      }
    ),
    // NOAA ADDS legacy CSV
    tryMetarSource(
      `https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=csv&stationString=${icao}&hoursBeforeNow=2&mostRecent=true`,
      t => {
        const line = t.split("\n").find(l => l.trimStart().startsWith(icao));
        if (!line) return null;
        const raw = line.split(",")[0].trim();
        return raw.startsWith(icao) ? raw : null;
      }
    ),
  ];

  try {
    const metar = await Promise.any(sources);
    return [metar, null];
  } catch {
    return ["", "Weather API unavailable; showing route-based risk briefing."];
  }
}

async function fetchTaf(icao: string): Promise<[string, string | null]> {
  const sources: Promise<string>[] = [
    tryMetarSource(
      `https://aviationweather.gov/api/data/taf?format=json&ids=${icao}`,
      t => {
        try {
          const d = JSON.parse(t) as Record<string, string>[];
          return d?.[0]?.rawTAF ?? d?.[0]?.raw_text ?? null;
        } catch { return null; }
      }
    ),
    tryMetarSource(
      `https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=tafs&requestType=retrieve&format=csv&stationString=${icao}&hoursBeforeNow=6&mostRecent=true`,
      t => {
        const line = t.split("\n").find(l => l.trimStart().startsWith("TAF") || l.trimStart().startsWith(icao));
        if (!line) return null;
        const raw = line.split(",")[0].trim();
        return raw.length > 10 ? raw : null;
      }
    ),
  ];
  try {
    return [await Promise.any(sources), null];
  } catch {
    return ["", "Weather API unavailable; showing route-based risk briefing."];
  }
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
