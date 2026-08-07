import { calcWindComponents } from "../data/airport_hazards";

// ─── 기상현상 감지 정규식 ──────────────────────────────────────────────────────
const WEATHER_CHECKS: Record<string, RegExp> = {
  TSRA:          /\bTSRA\b|\+TSRA/,
  CB:            /\bCB\b/,
  THUNDERSTORM:  /(?<![A-Z])TS(?![A-Z])|\bTSRA\b/,
  HEAVY_RAIN:    /\+RA|\+TSRA/,
  WINDSHEAR:     /\bWS\b(?!\d)|WINDSHEAR/,
  GUST:          /\b(?:VRB|\d{3})\d{2,3}G\d{2,3}KT\b/,
  FOG:           /\bFG\b/,
  MIST:          /\bBR\b/,
  ICING:         /\bIC\b|FZRA|FZDZ|FZFG|\bFZ(?:RA|DZ|FG)\b/,
  SNOW:          /\bSN\b|\+SN\b|BLSN|DRSN/,
  FZRAIN:        /FZRA|FZDZ/,
  BLOWING_SNOW:  /BLSN/,
  DUST:          /\bDU\b|\bSA\b|\bSS\b|\bDS\b/,
  SQUALL:        /\bSQ\b/,
  VOLCANIC_ASH:  /\bVA\b/,
  LOW_CLOUD:     /\bOVC00[0-9]\b|\bBKN00[0-9]\b/,   // OVC/BKN < 1000ft
};

// ─── RVR 파싱 ─────────────────────────────────────────────────────────────────
/** R28L/1200FT or R28L/0600 (단위 없으면 미터) */
function parseRvr(text: string): { rvr_m: number | null; cat: string | null } {
  const m = text.match(/\bR\d{2}[LRC]?\/(P|M)?(\d{3,4})(FT)?\b/);
  if (!m) return { rvr_m: null, cat: null };
  let val = parseInt(m[2]);
  if (m[3] === "FT") val = Math.round(val * 0.3048);
  let cat: string | null = null;
  if (val < 75)        cat = "CAT_III_C";
  else if (val < 200)  cat = "CAT_III_B";
  else if (val < 300)  cat = "CAT_III_A";
  else if (val < 550)  cat = "CAT_II";
  else if (val < 800)  cat = "CAT_I_MARGINAL";
  return { rvr_m: val, cat };
}

// ─── 풍향/풍속 파싱 ───────────────────────────────────────────────────────────
export function parseWind(text: string): { dir: number | null; speed: number; gust: number } | null {
  const m = text.match(/\b(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (!m) return null;
  const speed = parseInt(m[2]);
  return {
    dir:   m[1] === "VRB" ? null : parseInt(m[1]),
    speed,
    gust:  m[3] ? parseInt(m[3]) : speed,
  };
}

// ─── 가시거리 파싱 ────────────────────────────────────────────────────────────
function parseVisibility(text: string): number | null {
  // 9999 = 10km+, 4자리 미터 값
  const tokens = text.split(/\s+/);
  for (const t of tokens) {
    if (/^\d{4}$/.test(t)) { const v = parseInt(t); if (v <= 9999) return v; }
    // 미국식: "1SM", "1/2SM" 등
    if (/^\d+SM$/.test(t)) return Math.round(parseInt(t) * 1852);
    if (/^(\d+)\/(\d+)SM$/.test(t)) {
      const sm = t.match(/^(\d+)\/(\d+)SM$/)!;
      return Math.round((parseInt(sm[1]) / parseInt(sm[2])) * 1852);
    }
  }
  return null;
}

// ─── 주 태그 추출 ─────────────────────────────────────────────────────────────
/**
 * METAR + TAF 텍스트에서 위험 태그 배열 반환
 * @param arrIcao 도착 공항 ICAO (crosswind/tailwind 계산용, 없으면 생략)
 */
export function parseWeatherTags(metar = "", taf = "", arrIcao = ""): string[] {
  const text = `${metar} ${taf}`.toUpperCase();
  const tags = new Set<string>();

  // 기본 기상현상 감지
  for (const [tag, re] of Object.entries(WEATHER_CHECKS)) {
    if (re.test(text)) tags.add(tag);
  }

  // 가시거리 분류
  const vis = parseVisibility(metar.toUpperCase());
  if (vis !== null) {
    if (vis <= 150)        tags.add("LOW_VISIBILITY");  // CAT III 미만
    else if (vis <= 550)   { tags.add("LOW_VISIBILITY"); tags.add("CAT_II_VIS"); }
    else if (vis <= 800)   { tags.add("LOW_VISIBILITY"); tags.add("CAT_I_VIS"); }
    else if (vis <= 3000)  tags.add("REDUCED_VISIBILITY");
    else if (vis <= 5000)  tags.add("MARGINAL_VISIBILITY");
  }

  // RVR → CAT 분류
  const { cat } = parseRvr(metar.toUpperCase() + " " + taf.toUpperCase());
  if (cat) {
    tags.add("RVR_RESTRICTED");
    tags.add(cat);
    tags.add("LOW_VISIBILITY");
  }

  // 풍향/풍속 → crosswind / tailwind / gust
  const wind = parseWind(metar.toUpperCase());
  if (wind) {
    if (wind.gust >= 25) tags.add("GUST");
    if (wind.speed >= 30 || wind.gust >= 35) tags.add("STRONG_WIND");

    // 가변풍(VRB)은 crosswind 위험
    if (wind.dir === null && wind.speed >= 10) {
      tags.add("CROSSWIND");
    } else if (wind.dir !== null && arrIcao) {
      const { crosswind, tailwind } = calcWindComponents(wind.dir, wind.gust, arrIcao);
      if (crosswind >= 15) tags.add("CROSSWIND");
      if (tailwind  >= 5)  tags.add("TAILWIND");
    }
  }

  // 고온 성능 저하 (OAT 파싱 — METAR 온도 필드 XX/XX)
  const tempM = metar.toUpperCase().match(/\bM?(\d{2})\/M?\d{2}\b/);
  if (tempM) {
    const oat = parseInt(tempM[1]) * (metar.toUpperCase().includes("M" + tempM[1] + "/") ? -1 : 1);
    if (oat >= 38) tags.add("HIGH_TEMP_PERF");   // 고온 성능 저하
    if (oat <= -10) tags.add("SEVERE_COLD");       // 결빙 환경
  }

  // 복합 위험 유도
  if (["TSRA", "CB", "THUNDERSTORM"].some(t => tags.has(t))) tags.add("CONVECTIVE_WEATHER");
  if (["GUST", "WINDSHEAR", "CROSSWIND", "TAILWIND", "STRONG_WIND"].some(t => tags.has(t))) tags.add("WIND_HAZARD");
  if (["GUST", "WINDSHEAR", "LOW_VISIBILITY", "CONVECTIVE_WEATHER", "CROSSWIND"].some(t => tags.has(t))) tags.add("UNSTABLE_APPROACH_RISK");
  if (["ICING", "FZRAIN", "SNOW", "BLOWING_SNOW", "SEVERE_COLD"].some(t => tags.has(t))) tags.add("CONTAMINATED_SURFACE");
  if (["FOG", "MIST", "LOW_CLOUD"].some(t => tags.has(t)) && ["LOW_VISIBILITY", "REDUCED_VISIBILITY"].some(t => tags.has(t))) tags.add("CAT_APPROACH_RISK");
  if (["HEAVY_RAIN", "SNOW", "FZRAIN"].some(t => tags.has(t))) tags.add("WET_RWY");

  return [...tags].sort();
}

// ─── ISO UTC 파싱 ─────────────────────────────────────────────────────────────
function parseIsoUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  try { return new Date(value.replace("Z", "+00:00")); } catch { return null; }
}

// ─── TAF 윈도우 매칭 ──────────────────────────────────────────────────────────
function tafWindowMatches(token: string, arrival: Date): boolean {
  const m = token.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!m) return false;
  const [, sd, sh, ed, eh] = m.map(Number);
  const ad = arrival.getUTCDate(), ah = arrival.getUTCHours();
  let start = sd * 24 + sh, end = ed * 24 + eh, arr = ad * 24 + ah;
  if (end < start) { end += 31 * 24; if (arr < start) arr += 31 * 24; }
  return start <= arr && arr <= end;
}

// ─── 도착 시간대 TAF 세그먼트 선택 ───────────────────────────────────────────
/**
 * 도착 예정 시간에 해당하는 TAF 메인 세그먼트 반환.
 * TEMPO/BECMG/PROB 구간은 도착 시간대에 겹치면 append하여 함께 반환.
 */
export function selectArrivalTafSegment(taf: string, arrivalTime: string | null | undefined): string {
  const arrival = parseIsoUtc(arrivalTime);
  if (!taf || !arrival) return taf;

  const tokens = taf.split(/\s+/);
  const mainSegment: string[] = [];
  const tempoSegments: string[] = [];

  let mode: "main" | "tempo" | "skip" = "skip";
  let tempoActive = false;
  let tempoBuffer: string[] = [];

  for (const token of tokens) {
    // FM DDHHSS — 메인 구간 전환
    if (/^FM\d{6}$/.test(token)) {
      if (tempoBuffer.length) { tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; }
      const day = parseInt(token.slice(2, 4)), hour = parseInt(token.slice(4, 6));
      mode = (day === arrival.getUTCDate() && hour <= arrival.getUTCHours()) ? "main" : "skip";
      if (mode === "main") { mainSegment.length = 0; mainSegment.push(token); }
      tempoActive = false;
      continue;
    }
    // TEMPO / BECMG / PROB 구간 — 도착 시간과 겹치면 수집
    if (["TEMPO", "BECMG", "PROB30", "PROB40"].includes(token)) {
      if (tempoBuffer.length) { tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; }
      tempoActive = true;
      tempoBuffer.push(token);
      continue;
    }
    // 시간 윈도우 토큰 DDDD/DDDD
    if (/^\d{4}\/\d{4}$/.test(token)) {
      const inWindow = tafWindowMatches(token, arrival);
      if (tempoActive) {
        tempoBuffer.push(token);
        if (!inWindow) { tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; tempoActive = false; }
      } else {
        mode = inWindow ? "main" : "skip";
        if (mode === "main") { mainSegment.length = 0; mainSegment.push(token); }
      }
      continue;
    }
    if (tempoActive) { tempoBuffer.push(token); continue; }
    if (mode === "main") mainSegment.push(token);
  }
  if (tempoBuffer.length) tempoSegments.push(tempoBuffer.join(" "));

  const base = mainSegment.length ? mainSegment.join(" ") : taf;
  return tempoSegments.length ? `${base} ${tempoSegments.join(" ")}` : base;
}

/**
 * 야간 도착 여부 — 현지시간 기준 22:00–05:00 를 야간으로 판별
 * @param arrivalTimeUtc ISO 도착 시각(UTC)
 * @param utcOffset      도착 공항 UTC 오프셋(h)
 */
export function isNightArrival(arrivalTimeUtc: string | null | undefined, utcOffset: number): boolean {
  const d = parseIsoUtc(arrivalTimeUtc);
  if (!d) return false;
  const localHour = ((d.getUTCHours() + utcOffset) % 24 + 24) % 24;
  return localHour >= 22 || localHour < 5;
}
