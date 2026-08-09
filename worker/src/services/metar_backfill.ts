/**
 * Iowa State University Mesonet (ASOS) Historical METAR Backfill
 * - Data source: mesonet.agron.iastate.edu (NOAA-certified, 1973–present)
 * - API: free, no key required, global airport coverage
 * - Fills: wind, visibility, metar_text, weather_summary
 *
 * Time selection strategy:
 *   - event_time available (HH:MM UTC) → observation closest to that time
 *   - event_time missing              → worst-conditions observation of the day
 *     (priority: wx codes > lowest visibility > highest wind)
 */

interface MetarObs {
  validMin: number;   // minutes since midnight UTC
  wind:     string;
  windKt:   number;
  visibility: string;
  visSm:    number;
  metar_text: string;
  weather_summary: string;
  raw_wxcodes: string;
  hasSigWx: boolean;  // TS/FG/FZRA/SN/GR/VA present
}

// Iowa State Mesonet ASOS API — returns CSV
async function fetchMetarForDay(icao: string, date: string): Promise<MetarObs[]> {
  const d = new Date(date + "T00:00:00Z");
  if (isNaN(d.getTime())) return [];

  const d2 = new Date(d);
  d2.setUTCDate(d2.getUTCDate() + 1);

  const params = new URLSearchParams({
    station:  icao.toUpperCase(),
    data:     "all",
    year1:    String(d.getUTCFullYear()),
    month1:   String(d.getUTCMonth() + 1),
    day1:     String(d.getUTCDate()),
    year2:    String(d2.getUTCFullYear()),
    month2:   String(d2.getUTCMonth() + 1),
    day2:     String(d2.getUTCDate()),
    tz:       "Etc/UTC",
    format:   "comma",
    latlon:   "no",
    elev:     "no",
    missing:  "M",
    trace:    "T",
    direct:   "no",
    report_type: "3",   // 3 = METAR only (no special reports)
  });

  let text: string;
  try {
    const res = await fetch(
      `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${params}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  // CSV: station,valid,lon,lat,tmpf,dwpf,relh,drct,sknt,p01i,alti,mslp,vsby,gust,
  //      skyc1,skyc2,skyc3,skyc4,skyl1,skyl2,skyl3,skyl4,wxcodes,feel,...,metar
  const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("station"));
  const obs: MetarObs[] = [];

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 13) continue;

    const validStr = parts[1]; // "2024-03-15 14:53"
    const validMin = parseValidMin(validStr);

    const drct  = parts[7];
    const sknt  = parts[8];
    const gust  = parts[13];
    const vsby  = parts[12];
    const wxcodes = parts[22] || "";
    const metar = parts[parts.length - 1]?.trim() || "";

    const validWind = drct && drct !== "M" && sknt && sknt !== "M";
    const windKt = validWind ? Number(sknt) : 0;
    const windStr = validWind
      ? `${drct}°/${sknt}kt${(gust && gust !== "M") ? ` G${gust}kt` : ""}`
      : "";

    const visSm = (vsby && vsby !== "M") ? parseFloat(vsby) : 99;
    const visStr = (vsby && vsby !== "M") ? `${visSm.toFixed(1)}SM` : "";

    const wxDesc = wxcodes
      .split(" ")
      .map(w => WX_CODE_LABELS[w] ?? "")
      .filter(Boolean)
      .join(", ");

    const hasSigWx = wxcodes.split(" ").some(w => SIG_WX_CODES.has(w));

    const summaryParts = [windStr, visStr && `Vis ${visStr}`, wxDesc].filter(Boolean);

    obs.push({
      validMin,
      wind: windStr,
      windKt,
      visibility: visStr,
      visSm,
      metar_text: metar,
      weather_summary: summaryParts.join(" | ") || "No significant weather",
      raw_wxcodes: wxcodes,
      hasSigWx,
    });
  }

  return obs;
}

function parseValidMin(validStr: string): number {
  // validStr = "2024-03-15 14:53" or "2024-03-15 14:53:00"
  const match = validStr.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})/);
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

// timeKnown: event_time이 있는 경우에만 true를 반환 (wx 태그 추가 여부 결정용)
export function selectObs(obs: MetarObs[], eventTimeUtc: string | null): { obs: MetarObs | null; timeKnown: boolean } {
  if (obs.length === 0) return { obs: null, timeKnown: false };

  if (eventTimeUtc) {
    // 이벤트 발생 시각에 가장 가까운 관측 선택
    const [hh, mm] = eventTimeUtc.split(":").map(Number);
    const targetMin = hh * 60 + (mm || 0);
    let best = obs[0];
    let bestDiff = Math.abs(obs[0].validMin - targetMin);
    for (const o of obs) {
      if (o.validMin < 0) continue;
      const diff = Math.abs(o.validMin - targetMin);
      if (diff < bestDiff) { best = o; bestDiff = diff; }
    }
    return { obs: best, timeKnown: true };
  }

  // 시각 미상: 정오(12시) 기준 관측 선택 — 편향 없는 중립 기본값
  // (최악 기상 선택 시 인과 왜곡 및 위험 태그 오삽입 위험이 있음)
  // wx 태그는 추가하지 않음 (timeKnown: false)
  const noonMin = 12 * 60;
  let best = obs[0];
  let bestDiff = Math.abs((obs[0].validMin >= 0 ? obs[0].validMin : noonMin) - noonMin);
  for (const o of obs) {
    if (o.validMin < 0) continue;
    const diff = Math.abs(o.validMin - noonMin);
    if (diff < bestDiff) { best = o; bestDiff = diff; }
  }
  return { obs: best, timeKnown: false };
}

// Common METAR wx codes → readable labels
const WX_CODE_LABELS: Record<string, string> = {
  TS: "Thunderstorm", TSRA: "Thunderstorm+Rain", TSGR: "Thunderstorm+Hail",
  FG: "Fog", FZFG: "Freezing Fog", BR: "Mist",
  RA: "Rain", SHRA: "Rain Showers", FZRA: "Freezing Rain",
  SN: "Snow", SNRA: "Snow+Rain", RASN: "Rain+Snow", GS: "Snow Pellets",
  DZ: "Drizzle", FZDZ: "Freezing Drizzle",
  GR: "Hail", PL: "Ice Pellets",
  HZ: "Haze", DU: "Dust", SA: "Sand", SS: "Sandstorm", DS: "Duststorm",
  FC: "Funnel Cloud", SQ: "Squall",
  BLSN: "Blowing Snow", DRSN: "Drifting Snow",
  VA: "Volcanic Ash", UP: "Unknown Precipitation",
};

// 중요 기상 코드 (최악 기상 선택 우선순위용)
const SIG_WX_CODES = new Set(["TS", "TSRA", "TSGR", "FG", "FZFG", "FZRA", "FZDZ", "GR", "VA", "SS", "DS", "FC"]);

// wx codes → risk tags (for tagging enrichment)
const WX_TO_TAGS: Record<string, string[]> = {
  TS:   ["TSRA", "CONVECTIVE_WEATHER"],
  TSRA: ["TSRA", "CONVECTIVE_WEATHER", "HEAVY_RAIN"],
  TSGR: ["TSRA", "CB", "CONVECTIVE_WEATHER"],
  FG:   ["FOG", "LOW_VISIBILITY"],
  FZFG: ["FOG", "ICING", "LOW_VISIBILITY"],
  FZRA: ["FZRAIN", "ICING"],
  GR:   ["TSRA", "CONVECTIVE_WEATHER"],
  SN:   ["SNOW"],
  SNRA: ["SNOW", "HEAVY_RAIN"],
  RASN: ["SNOW", "HEAVY_RAIN"],
  BLSN: ["BLOWING_SNOW"],
  RA:   ["HEAVY_RAIN"],
  SHRA: ["HEAVY_RAIN"],
  VA:   ["VOLCANIC_ASH"],
};

function wxCodesToTags(wxcodes: string): string[] {
  const tags = new Set<string>();
  for (const code of wxcodes.split(" ")) {
    for (const tag of WX_TO_TAGS[code] ?? []) tags.add(tag);
  }
  return [...tags];
}

export interface BackfillResult {
  processed: number;
  updated:   number;
  skipped:   number;   // no METAR data found
  errors:    string[];
  remaining: number;
}

export async function backfillMetar(db: D1Database, limit = 30): Promise<BackfillResult> {
  // 기상 데이터 없는 이벤트 중 공항코드 있는 것만 대상
  const { results } = await db.prepare(`
    SELECT id, airport_icao, event_date, event_time
    FROM events
    WHERE airport_icao IS NOT NULL AND airport_icao != ''
      AND (wind IS NULL OR wind = '')
      AND event_date IS NOT NULL AND event_date != ''
    LIMIT ?
  `).bind(limit).all<{ id: string; airport_icao: string; event_date: string; event_time: string | null }>();

  const { remaining: rem } = await db.prepare(`
    SELECT COUNT(*) as remaining FROM events
    WHERE airport_icao IS NOT NULL AND airport_icao != ''
      AND (wind IS NULL OR wind = '')
      AND event_date IS NOT NULL AND event_date != ''
  `).first<{ remaining: number }>() ?? { remaining: 0 };

  let updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const event of results) {
    try {
      const allObs = await fetchMetarForDay(event.airport_icao, event.event_date);
      const { obs: metar, timeKnown } = selectObs(allObs, event.event_time ?? null);

      if (!metar || (!metar.wind && !metar.metar_text)) {
        skipped++;
        continue;
      }

      const metarSource = timeKnown ? "mesonet_exact" : "mesonet_noon";
      await db.prepare(`
        UPDATE events
        SET wind = ?, visibility = ?, metar_text = ?, weather_summary = ?, metar_source = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(metar.wind, metar.visibility, metar.metar_text, metar.weather_summary, metarSource, event.id).run();

      // wx 태그는 event_time이 확인된 경우에만 추가
      // (시각 미상 시 인과 왜곡 방지 — 정오 기준 METAR의 wx코드를 사고와 연결하면 신뢰도 훼손)
      if (timeKnown) {
        const wxTags = wxCodesToTags(metar.raw_wxcodes);
        for (const tag of wxTags) {
          await db.prepare(`
            INSERT OR IGNORE INTO event_tags (event_id, tag_type, tag_value) VALUES (?, 'risk', ?)
          `).bind(event.id, tag).run();
        }
      }

      updated++;
    } catch (e) {
      errors.push(`${event.id}: ${String(e).slice(0, 80)}`);
    }
  }

  return {
    processed: results.length,
    updated,
    skipped,
    errors,
    remaining: rem - results.length,
  };
}
