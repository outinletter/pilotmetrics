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

  // FM 구간을 순서대로 수집한 뒤 도착 시각에 해당하는 구간을 선택
  // FM DDHHSS → 해당 일시부터 다음 FM 일시까지 유효
  interface FmSegment { startMin: number; tokens: string[] }
  const fmSegments: FmSegment[] = [];
  let currentFm: FmSegment | null = null;
  const baseTokens: string[] = [];
  const tempoSegments: string[] = [];
  let tempoBuffer: string[] = [];
  let inTempo = false;

  // TAF 헤더의 유효 윈도우 (DDHH/DDHH) — 기준 날짜 계산용
  const headerWindow = taf.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
  // 월 내 일(day)을 분(min) 단위로: 단순히 day*24*60+hour*60 사용
  function fmToMin(day: number, hour: number, min = 0) { return day * 1440 + hour * 60 + min; }
  const arrMin = fmToMin(arrival.getUTCDate(), arrival.getUTCHours(), arrival.getUTCMinutes());

  for (const token of taf.split(/\s+/)) {
    // FM DDHHSS
    if (/^FM\d{6}$/.test(token)) {
      if (inTempo && tempoBuffer.length) { tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; inTempo = false; }
      const day = parseInt(token.slice(2, 4));
      const hour = parseInt(token.slice(4, 6));
      currentFm = { startMin: fmToMin(day, hour), tokens: [token] };
      fmSegments.push(currentFm);
      continue;
    }
    // TEMPO / BECMG / PROB — 도착 시간대 겹침 여부는 다음 토큰(윈도우)에서 판별
    if (["TEMPO", "BECMG", "PROB30", "PROB40"].includes(token)) {
      if (inTempo && tempoBuffer.length) { tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; }
      inTempo = true;
      tempoBuffer = [token];
      continue;
    }
    // 시간 윈도우 DDHH/DDHH
    if (/^\d{4}\/\d{4}$/.test(token)) {
      if (inTempo) {
        tempoBuffer.push(token);
        if (!tafWindowMatches(token, arrival)) {
          tempoSegments.push(tempoBuffer.join(" ")); tempoBuffer = []; inTempo = false;
        }
      } else if (currentFm) {
        currentFm.tokens.push(token);
      } else {
        baseTokens.push(token);
      }
      continue;
    }
    if (inTempo) { tempoBuffer.push(token); continue; }
    if (currentFm) { currentFm.tokens.push(token); continue; }
    baseTokens.push(token);
  }
  if (inTempo && tempoBuffer.length) tempoSegments.push(tempoBuffer.join(" "));

  // 도착 시각이 속하는 FM 구간 선택:
  // 각 FM의 유효 범위 = [FM.startMin, 다음FM.startMin)
  let bestFm: FmSegment | null = null;
  for (let i = 0; i < fmSegments.length; i++) {
    const seg = fmSegments[i];
    const nextStart = fmSegments[i + 1]?.startMin ?? Infinity;
    // 월말 경계 처리: 다음 FM의 day가 작으면 다음 달로 넘어간 것
    const effectiveNext = fmSegments[i + 1] && fmSegments[i + 1].startMin < seg.startMin
      ? fmSegments[i + 1].startMin + 31 * 1440
      : nextStart;
    const effectiveArr = arrMin < seg.startMin ? arrMin + 31 * 1440 : arrMin;
    if (effectiveArr >= seg.startMin && effectiveArr < effectiveNext) {
      bestFm = seg;
    }
  }

  const base = bestFm ? bestFm.tokens.join(" ") : (baseTokens.length ? baseTokens.join(" ") : taf);
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

// ─── 기상현상 한국어 약어 ─────────────────────────────────────────────────────
const WX_KO: Record<string, string> = {
  TSRA: "뇌우+강우", CB: "적란운", THUNDERSTORM: "뇌우", HEAVY_RAIN: "폭우",
  WINDSHEAR: "윈드시어", FOG: "안개", MIST: "박무", ICING: "착빙",
  SNOW: "강설", FZRAIN: "결빙강수", BLOWING_SNOW: "날리는 눈",
  DUST: "먼지/모래", SQUALL: "스콜", VOLCANIC_ASH: "화산재",
  LOW_CLOUD: "저운고도", CROSSWIND: "측풍", TAILWIND: "배풍",
};

function cloudCeilingKo(text: string): string | null {
  // BKN/OVC + 3자리 높이 (100ft 단위)
  const m = text.match(/\b(BKN|OVC)(\d{3})\b/);
  if (!m) return null;
  const ft = parseInt(m[2]) * 100;
  return `운고 ${ft.toLocaleString()}ft`;
}

/**
 * 도착 예정 시각 기준 날씨 한 줄 브리핑 (한국어)
 * @param arrivalTaf     selectArrivalTafSegment 가 반환한 도착 시간대 TAF 문자열
 * @param metar          현재 METAR 원문
 * @param arrivalTimeUtc 도착 예정 ISO UTC 시각
 * @param utcOffset      도착 공항 UTC 오프셋
 */
export function arrivalWeatherBrief(
  arrivalTaf: string,
  metar: string,
  arrivalTimeUtc: string | null | undefined,
  utcOffset: number,
): string {
  const src = (arrivalTaf || metar).toUpperCase();

  // 도착 현지 시각
  const d = parseIsoUtc(arrivalTimeUtc);
  const timeStr = d
    ? (() => {
        const localH = ((d.getUTCHours() + utcOffset) % 24 + 24) % 24;
        const localM = d.getUTCMinutes();
        return `${String(localH).padStart(2, "0")}:${String(localM).padStart(2, "0")} 현지`;
      })()
    : null;

  const parts: string[] = [];

  // 풍향/풍속
  const wind = parseWind(src);
  if (wind) {
    const dirStr = wind.dir !== null ? `${wind.dir}°` : "가변";
    const gustStr = wind.gust > wind.speed ? `/G${wind.gust}` : "";
    parts.push(`바람 ${dirStr} ${wind.speed}${gustStr}kt`);
  }

  // 가시거리
  const vis = (() => {
    const tokens = src.split(/\s+/);
    for (const t of tokens) {
      if (/^\d{4}$/.test(t)) { const v = parseInt(t); if (v <= 9999) return v; }
    }
    return null;
  })();
  if (vis !== null) {
    parts.push(vis >= 9999 ? "시정 10km+" : `시정 ${vis}m`);
  }

  // RVR
  const { rvr_m, cat } = parseRvr(src);
  if (rvr_m !== null) parts.push(`RVR ${rvr_m}m(${cat})`);

  // 기상현상 (중복 없이 최대 3개)
  const wxHits: string[] = [];
  for (const [tag, re] of Object.entries(WEATHER_CHECKS)) {
    if (re.test(src) && WX_KO[tag] && !wxHits.includes(WX_KO[tag])) {
      wxHits.push(WX_KO[tag]);
      if (wxHits.length >= 3) break;
    }
  }
  if (wxHits.length) parts.push(wxHits.join("·"));

  // 운고
  const ceiling = cloudCeilingKo(src);
  if (ceiling) parts.push(ceiling);

  if (parts.length === 0) parts.push("기상 양호(CAVOK)");

  const prefix = timeStr ? `도착 ${timeStr}` : "도착 예정";
  const source = arrivalTaf ? "TAF" : "METAR";
  return `${prefix} 기상(${source}): ${parts.join(", ")}`;
}
