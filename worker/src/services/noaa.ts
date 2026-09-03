const UA = "PilotBriefing/1.0 (aviation-safety-briefing; outinletter@daum.net)";

// ── 공항 좌표 (Open-Meteo / Yr.no 폴백용) ───────────────────────────────────
// aviationweather.gov가 취약한 비미국 공항 위주로 수록
const AIRPORT_COORDS: Record<string, [number, number]> = {
  // 한국
  RKSI: [37.4602, 126.4407], RKSS: [37.5589, 126.7906], RKPK: [35.1795, 128.9382],
  RKPC: [33.5113, 126.4930],
  // 일본
  RJAA: [35.7648, 140.3864], RJTT: [35.5494, 139.7798], RJBB: [34.4347, 135.2440],
  RJFF: [33.5835, 130.4511], RJGG: [34.8583, 136.8048], RJCC: [42.7752, 141.6920],
  ROAH: [26.1958, 127.6468],
  // 동남아
  VNKT: [27.6966,  85.3591],  // Kathmandu — 주요 폴백 대상
  VTBS: [13.6811, 100.7472],  // Bangkok Suvarnabhumi
  VTSP: [ 8.1132,  98.3170],  // Phuket
  VTCC: [18.7667,  98.9625],  // Chiang Mai
  RPLL: [14.5086, 121.0194],  // Manila
  WSSS: [ 1.3644, 103.9915],  // Singapore
  WMKK: [ 2.7456, 101.7101],  // Kuala Lumpur
  WBKK: [ 5.9372, 116.0508],  // Kota Kinabalu
  VHHH: [22.3089, 113.9145],  // Hong Kong
  WADD: [-8.7479, 115.1667],  // Bali
  WIII: [-6.1256, 106.6558],  // Jakarta
  VVTS: [10.8188, 106.6520],  // Ho Chi Minh
  VVNB: [21.2212, 105.8072],  // Hanoi
  VVDN: [16.0439, 108.1993],  // Da Nang
  VDPP: [11.5466, 104.8440],  // Phnom Penh
  VYYY: [16.9073,  96.1332],  // Yangon
  // 인도 / 남아시아
  VIDP: [28.5665,  77.1031],  // Delhi
  VABB: [19.0896,  72.8679],  // Mumbai
  VCBI: [ 7.1808,  79.8841],  // Colombo
  // 중동
  OMDB: [25.2532,  55.3657],  // Dubai
  OMAA: [24.4330,  54.6511],  // Abu Dhabi
  OERK: [24.9576,  46.6988],  // Riyadh
  OEJN: [21.6796,  39.1565],  // Jeddah
  // 유럽
  LFPG: [49.0097,   2.5478],  // Paris CDG
  EGLL: [51.4775,  -0.4614],  // London Heathrow
  EDDF: [50.0379,   8.5622],  // Frankfurt
  EHAM: [52.3086,   4.7639],  // Amsterdam
  LIMC: [45.6306,   8.7231],  // Milan
  LIRF: [41.8003,  12.2389],  // Rome
  LEBL: [41.2971,   2.0785],  // Barcelona
  LEMD: [40.4719,  -3.5626],  // Madrid
  LOWW: [48.1103,  16.5697],  // Vienna
  LTFM: [41.2754,  28.7519],  // Istanbul
  // 미주
  KJFK: [40.6413, -73.7781],  KLAX: [33.9425,-118.4081],
  KSFO: [37.6213,-122.3790],  KSEA: [47.4502,-122.3088],
  KORD: [41.9742, -87.9073],  KATL: [33.6407, -84.4277],
  KIAD: [38.9531, -77.4565],  KIAH: [29.9902, -95.3368],
  PHNL: [21.3245,-157.9251],  CYVR: [49.1967,-123.1815],
  // 대양주
  YSSY: [-33.9461, 151.1772], YMML: [-37.6690, 144.8410],
};

// ── WMO 날씨 코드 → 간략 설명 (Open-Meteo 폴백용) ───────────────────────────
const WMO_DESC: Record<number, string> = {
  0:'CLR',  1:'FEW CLDs',  2:'SCT',  3:'OVC',
  45:'FG',  48:'FG/FZDZ',
  51:'DRSN',53:'-DZ',55:'+DZ',
  61:'-RA', 63:'RA',  65:'+RA',
  71:'-SN', 73:'SN',  75:'+SN', 77:'SG',
  80:'-SH', 81:'SH',  82:'+SH',
  85:'-SHSN',86:'+SHSN',
  95:'TS',  96:'TSRA', 99:'+TSRA',
};

function wmoDesc(code: number): string {
  return WMO_DESC[code] ?? `WX${code}`;
}

/** 단일 소스에서 METAR/TAF 문자열 추출 — 실패 시 reject */
async function tryMetarSource(url: string, parse: (body: string) => string | null, timeoutMs = 8000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  const metar = parse(body);
  if (!metar) throw new Error("no data");
  return metar;
}

/** Open-Meteo 현재 기상 → 합성 날씨 설명 (좌표 있는 공항 전용 폴백) */
async function fetchOpenMeteoSynthetic(icao: string): Promise<string> {
  const coords = AIRPORT_COORDS[icao];
  if (!coords) throw new Error("no coords");
  const [lat, lon] = coords;
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,wind_direction_10m,weather_code,visibility,precipitation,cloud_cover` +
    `&wind_speed_unit=kn&forecast_days=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json() as {
    current: {
      wind_speed_10m: number; wind_direction_10m: number;
      weather_code: number; visibility: number; cloud_cover: number;
    };
    current_units: Record<string, string>;
  };
  const c = j.current;
  const windDir = Math.round(c.wind_direction_10m / 10) * 10;
  const windKt  = Math.round(c.wind_speed_10m);
  const vis     = c.visibility >= 9999 ? "9999" : `${Math.round(c.visibility / 100) * 100}`;
  const wx      = wmoDesc(c.weather_code);
  const cloud   = c.cloud_cover < 12 ? "SKC" : c.cloud_cover < 37 ? "FEW" : c.cloud_cover < 75 ? "SCT" : "BKN";
  return `${icao} [SYNTH] ${String(windDir).padStart(3,"0")}${String(windKt).padStart(2,"0")}KT ${vis} ${wx === "CLR" ? "" : wx+" "}${cloud}`;
}

/** Yr.no (Norwegian Met Institute) → 합성 날씨 설명 (좌표 기반) */
async function fetchYrnoSynthetic(icao: string): Promise<string> {
  const coords = AIRPORT_COORDS[icao];
  if (!coords) throw new Error("no coords");
  const [lat, lon] = coords;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = await res.json() as any;
  const inst = j.properties.timeseries[0].data.instant.details as {
    wind_speed: number; wind_from_direction: number; cloud_area_fraction: number;
  };
  const windKt  = Math.round(inst.wind_speed * 1.944);
  const windDir = Math.round(inst.wind_from_direction / 10) * 10;
  const cloud   = inst.cloud_area_fraction < 12 ? "SKC" : inst.cloud_area_fraction < 37 ? "FEW" : inst.cloud_area_fraction < 75 ? "SCT" : "BKN";
  const sym     = (j.properties.timeseries[0].data.next_1_hours?.summary?.symbol_code ?? "") as string;
  const wx      = sym.includes("thunder") ? "TS" : sym.includes("snow") ? "SN" : sym.includes("rain") ? "RA" : sym.includes("fog") ? "FG" : "";
  return `${icao} [YR] ${String(windDir).padStart(3,"0")}${String(windKt).padStart(2,"0")}KT ${wx ? wx+" " : ""}${cloud}`;
}

async function fetchMetar(icao: string): Promise<[string, string | null]> {
  const sources: Promise<string>[] = [
    // ① NOAA FTP 텍스트 — WMO 전세계 네트워크 (비미국 공항 포함)
    tryMetarSource(
      `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`,
      t => {
        const raw = t.trim().split("\n").find(l => l.trimStart().startsWith(icao));
        return raw && raw.length > 10 ? raw.trim() : null;
      }
    ),
    // ② aviationweather.gov JSON (주로 미국/카리브해)
    tryMetarSource(
      `https://aviationweather.gov/api/data/metar?format=json&ids=${icao}`,
      t => {
        try {
          const d = JSON.parse(t) as Record<string, string>[];
          return d?.[0]?.rawOb ?? d?.[0]?.raw_text ?? null;
        } catch { return null; }
      }
    ),
    // ③ NOAA ADDS legacy CSV
    tryMetarSource(
      `https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=csv&stationString=${icao}&hoursBeforeNow=2&mostRecent=true`,
      t => {
        const line = t.split("\n").find(l => l.trimStart().startsWith(icao));
        if (!line) return null;
        const raw = line.split(",")[0].trim();
        return raw.startsWith(icao) ? raw : null;
      }
    ),
    // ④ VATSIM (시뮬레이션 네트워크 — 실시간 관제사 보고)
    tryMetarSource(
      `https://metar.vatsim.net/metar.php?id=${icao}`,
      t => { const s = t.trim(); return (s.length > 10 && !s.startsWith("No ")) ? s : null; }
    ),
    // ⑤ IVAO (별도 시뮬레이션 네트워크)
    tryMetarSource(
      `https://wx.ivao.aero/metar.php?station=${icao}`,
      t => { const s = t.trim(); return (s.length > 10 && !s.startsWith("No ")) ? s : null; }
    ),
  ];

  try {
    const metar = await Promise.any(sources);
    return [metar, null];
  } catch {
    // ── 좌표 기반 합성 폴백 ─────────────────────────────────────────────────
    if (AIRPORT_COORDS[icao]) {
      try {
        const synth = await Promise.any([
          fetchOpenMeteoSynthetic(icao),
          fetchYrnoSynthetic(icao),
        ]);
        return [synth, "[SYNTH] Live METAR unavailable — showing Open-Meteo/Yr.no synthesized weather"];
      } catch { /* fall through */ }
    }
    return ["", "Weather API unavailable — all weather sources failed to respond."];
  }
}

async function fetchTaf(icao: string): Promise<[string, string | null]> {
  const sources: Promise<string>[] = [
    // ① NOAA FTP TAF 텍스트
    tryMetarSource(
      `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`,
      t => {
        const lines = t.trim().split("\n");
        const idx = lines.findIndex(l => /^TAF\b|^(TAF )?[A-Z]{4}\b/.test(l.trim()));
        if (idx < 0) return null;
        const raw = lines.slice(idx).join(" ").replace(/\s+/g, " ").trim();
        return raw.length > 10 ? raw : null;
      }
    ),
    // ② aviationweather.gov JSON
    tryMetarSource(
      `https://aviationweather.gov/api/data/taf?format=json&ids=${icao}`,
      t => {
        try {
          const d = JSON.parse(t) as Record<string, string>[];
          return d?.[0]?.rawTAF ?? d?.[0]?.raw_text ?? null;
        } catch { return null; }
      }
    ),
    // ③ NOAA ADDS legacy CSV TAF
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
    return ["", null];  // TAF 없음은 경고 불필요 — METAR로 대체
  }
}

export async function getWeather(icao: string): Promise<[{ metar: string; taf: string }, string[]]> {
  const [metar, metarMsg] = await fetchMetar(icao);
  const [taf,   tafMsg  ] = await fetchTaf(icao);
  const messages = [...new Set([metarMsg, tafMsg].filter(Boolean) as string[])];
  return [{ metar, taf }, messages];
}
