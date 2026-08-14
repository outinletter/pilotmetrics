import { unzipSync } from "fflate";
import { airportUtcOffset } from "../data/airport_hazards";
import { EventRow } from "../types";

const NTSB_CAROL_URL = "https://data.ntsb.gov/carol-main-public/api/Query/FileExport";
const FAA_TRANSPORT_URL = "https://www.faa.gov/lessonslearned/transportairplane/accidents/transport-airplane-lessons-learned-library";
const ASRS_URL = "https://asrs.arc.nasa.gov/search/reportsets.html";

const ASRS_KEYWORDS = ["far 121","air carrier","commuter","corporate","fatigue","smoke","fire","fumes","crm","fuel","gps","weather","maintenance","turbojet","rnav","runway","wake turbulence","flight attendant"];
const LARGE_JET_PARTS = new Set(["121","135","125","129"]);

const US_CITY_AIRPORTS: Record<string, [string, string]> = {
  // 동부
  "boston,massachusetts": ["BOS","KBOS"], "east boston,massachusetts": ["BOS","KBOS"],
  "jamaica,new york": ["JFK","KJFK"], "new york,new york": ["JFK","KJFK"],
  "flushing,new york": ["JFK","KJFK"], "queens,new york": ["JFK","KJFK"],
  "newark,new jersey": ["EWR","KEWR"],
  "washington,d.c.": ["DCA","KDCA"], "arlington,virginia": ["DCA","KDCA"],
  "dulles,virginia": ["IAD","KIAD"],
  "miami,florida": ["MIA","KMIA"], "doral,florida": ["MIA","KMIA"],
  "fort lauderdale,florida": ["FLL","KFLL"],
  "orlando,florida": ["MCO","KMCO"],
  "tampa,florida": ["TPA","KTPA"],
  "charlotte,north carolina": ["CLT","KCLT"],
  "atlanta,georgia": ["ATL","KATL"], "college park,georgia": ["ATL","KATL"],
  "philadelphia,pennsylvania": ["PHL","KPHL"],
  "pittsburgh,pennsylvania": ["PIT","KPIT"],
  "detroit,michigan": ["DTW","KDTW"], "romulus,michigan": ["DTW","KDTW"],
  "minneapolis,minnesota": ["MSP","KMSP"],
  "chicago,illinois": ["ORD","KORD"], "rosemont,illinois": ["ORD","KORD"],
  "midway,illinois": ["MDW","KMDW"],
  "st. louis,missouri": ["STL","KSTL"],
  "memphis,tennessee": ["MEM","KMEM"],
  "nashville,tennessee": ["BNA","KBNA"],
  // 중부/남부
  "dallas,texas": ["DFW","KDFW"], "fort worth,texas": ["DFW","KDFW"],
  "houston,texas": ["IAH","KIAH"], "humble,texas": ["IAH","KIAH"],
  "san antonio,texas": ["SAT","KSAT"],
  "phoenix,arizona": ["PHX","KPHX"],
  "las vegas,nevada": ["LAS","KLAS"],
  "denver,colorado": ["DEN","KDEN"],
  "salt lake city,utah": ["SLC","KSLC"],
  // 서부
  "los angeles,california": ["LAX","KLAX"], "inglewood,california": ["LAX","KLAX"],
  "san francisco,california": ["SFO","KSFO"], "san jose,california": ["SJC","KSJC"],
  "san diego,california": ["SAN","KSAN"],
  "seattle,washington": ["SEA","KSEA"], "seatac,washington": ["SEA","KSEA"],
  "portland,oregon": ["PDX","KPDX"],
  // 알래스카
  "anchorage,alaska": ["ANC","PANC"], "fairbanks,alaska": ["FAI","PAFA"],
  "palmer,alaska": ["PAQ","PAAQ"], "juneau,alaska": ["JNU","PAJN"],
  "bettles,alaska": ["BTT","PABT"], "king salmon,alaska": ["AKN","PAKN"],
  "skwentna,alaska": ["SKW","PASW"], "kenai,alaska": ["ENA","PAEN"],
  "bethel,alaska": ["BET","PABE"], "kodiak,alaska": ["ADQ","PADQ"],
  "nome,alaska": ["OME","PAOM"], "kotzebue,alaska": ["OTZ","PAOT"],
  // 하와이
  "honolulu,hawaii": ["HNL","PHNL"], "kahului,hawaii": ["OGG","PHOG"],
  "hilo,hawaii": ["ITO","PHTO"],
  // 추가 미국 도시
  "kansas city,missouri": ["MCI","KMCI"],
  "cleveland,ohio": ["CLE","KCLE"], "columbus,ohio": ["CMH","KCMH"],
  "indianapolis,indiana": ["IND","KIND"],
  "louisville,kentucky": ["SDF","KSDF"],
  "new orleans,louisiana": ["MSY","KMSY"],
  "albuquerque,new mexico": ["ABQ","KABQ"],
  "tucson,arizona": ["TUS","KTUS"],
  "reno,nevada": ["RNO","KRNO"], "boulder city,nevada": ["BLD","KBVU"],
  "spokane,washington": ["GEG","KGEG"],
  "long island,new york": ["JFK","KJFK"],
  "cerritos,california": ["LAX","KLAX"],
  // 국가 없이 도시만 있는 경우
  "mexico city": ["MEX","MMMX"],
  "toronto": ["YYZ","CYYZ"],
  "london": ["LHR","EGLL"],
  "paris": ["CDG","LFPG"],
  "tokyo": ["HND","RJTT"],
  "narita": ["NRT","RJAA"],
  "dubai": ["DXB","OMDB"],
  "istanbul": ["IST","LTFM"],
  "singapore": ["SIN","WSSS"],
  "dublin": ["DUB","EIDW"],
  "amsterdam": ["AMS","EHAM"],
  "frankfurt": ["FRA","EDDF"],
  "zurich": ["ZRH","LSZH"],
  "vienna": ["VIE","LOWW"],
  "rome": ["FCO","LIRF"],
  "madrid": ["MAD","LEMD"],
  "seoul": ["ICN","RKSI"],
  "beijing": ["PEK","ZBAA"],
  "shanghai": ["PVG","ZSPD"],
  "hong kong": ["HKG","VHHH"],
  "bangkok": ["BKK","VTBS"],
  "kuala lumpur": ["KUL","WMKK"],
  "jakarta": ["CGK","WIII"],
  "bali": ["DPS","WADD"],
  "sydney": ["SYD","YSSY"],
  "auckland": ["AKL","NZAA"],
};

const INTL_CITY_AIRPORTS: Record<string, [string, string]> = {
  // 한국
  "seoul,south korea": ["ICN","RKSI"], "seoul,korea": ["ICN","RKSI"],
  "incheon,south korea": ["ICN","RKSI"],
  "busan,south korea": ["PUS","RKPK"],
  // 일본
  "tokyo,japan": ["HND","RJTT"], "narita,japan": ["NRT","RJAA"],
  "osaka,japan": ["KIX","RJBB"], "kansai,japan": ["KIX","RJBB"],
  "fukuoka,japan": ["FUK","RJFF"], "sapporo,japan": ["CTS","RJCC"],
  // 중국
  "beijing,china": ["PEK","ZBAA"], "shanghai,china": ["PVG","ZSPD"],
  "guangzhou,china": ["CAN","ZGGG"], "shenzhen,china": ["SZX","ZGSZ"],
  "chengdu,china": ["CTU","ZUUU"],
  // 홍콩/싱가포르/동남아
  "hong kong,hong kong": ["HKG","VHHH"],
  "singapore,singapore": ["SIN","WSSS"],
  "bangkok,thailand": ["BKK","VTBS"],
  "manila,philippines": ["MNL","RPLL"],
  "cebu,philippines": ["CEB","RPVM"],
  "denpasar,indonesia": ["DPS","WADD"], "bali,indonesia": ["DPS","WADD"],
  "jakarta,indonesia": ["CGK","WIII"],
  "kuala lumpur,malaysia": ["KUL","WMKK"],
  "ho chi minh city,vietnam": ["SGN","VVTS"],
  "hanoi,vietnam": ["HAN","VVNB"],
  // 유럽
  "london,united kingdom": ["LHR","EGLL"], "london,england": ["LHR","EGLL"],
  "heathrow,united kingdom": ["LHR","EGLL"],
  "paris,france": ["CDG","LFPG"],
  "frankfurt,germany": ["FRA","EDDF"],
  "amsterdam,netherlands": ["AMS","EHAM"],
  "rome,italy": ["FCO","LIRF"],
  "madrid,spain": ["MAD","LEMD"],
  "zurich,switzerland": ["ZRH","LSZH"],
  "vienna,austria": ["VIE","LOWW"],
  "istanbul,turkey": ["IST","LTFM"],
  // 중동/아프리카
  "dubai,united arab emirates": ["DXB","OMDB"],
  "abu dhabi,united arab emirates": ["AUH","OMAA"],
  "riyadh,saudi arabia": ["RUH","OERK"],
  "jeddah,saudi arabia": ["JED","OEJN"],
  "nairobi,kenya": ["NBO","HKJK"],
  // 호주/오세아니아
  "sydney,australia": ["SYD","YSSY"],
  "melbourne,australia": ["MEL","YMML"],
  "auckland,new zealand": ["AKL","NZAA"],
  // 캐나다
  "vancouver,canada": ["YVR","CYVR"], "richmond,canada": ["YVR","CYVR"],
  "toronto,canada": ["YYZ","CYYZ"],
};

const US_STATE_ABBREV: Record<string, string> = {
  al:"alabama", ak:"alaska", az:"arizona", ar:"arkansas", ca:"california",
  co:"colorado", ct:"connecticut", de:"delaware", fl:"florida", ga:"georgia",
  hi:"hawaii", id:"idaho", il:"illinois", in:"indiana", ia:"iowa", ks:"kansas",
  ky:"kentucky", la:"louisiana", me:"maine", md:"maryland", ma:"massachusetts",
  mi:"michigan", mn:"minnesota", ms:"mississippi", mo:"missouri", mt:"montana",
  ne:"nebraska", nv:"nevada", nh:"new hampshire", nj:"new jersey", nm:"new mexico",
  ny:"new york", nc:"north carolina", nd:"north dakota", oh:"ohio", ok:"oklahoma",
  or:"oregon", pa:"pennsylvania", ri:"rhode island", sc:"south carolina",
  sd:"south dakota", tn:"tennessee", tx:"texas", ut:"utah", vt:"vermont",
  va:"virginia", wa:"washington", wv:"west virginia", wi:"wisconsin", wy:"wyoming",
  dc:"district of columbia",
};

const US_STATES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware",
  "florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky",
  "louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi",
  "missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico",
  "new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania",
  "rhode island","south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming","district of columbia",
  // 약어
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky",
  "la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd",
  "oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc",
]);

// 다중 공항 도시: 도시명 매핑이 여러 공항을 가진 경우 narrative/runway에서 구체 공항 추출
// 도시명 → ICAO 복수 후보 목록 (주요 다중 공항 도시)
const MULTI_AIRPORT_CITIES: Record<string, string[]> = {
  "new york":     ["KJFK","KLGA","KEWR"],
  "new york city":["KJFK","KLGA","KEWR"],
  "chicago":      ["KORD","KMDW"],
  "los angeles":  ["KLAX","KBUR","KLGB","KSNA","KONT"],
  "london":       ["EGLL","EGKK","EGSS","EGLC","EGGW"],
  "paris":        ["LFPG","LFPO","LFPB"],
  "houston":      ["KIAH","KHOU"],
  "dallas":       ["KDFW","KDAL"],
  "san francisco":["KSFO","KOAK","KSJC"],
  "washington":   ["KDCA","KIAD","KBWI"],
  "miami":        ["KMIA","KFLL","KPBI"],
  "boston":       ["KBOS","KBED","KORH"],
  "tokyo":        ["RJTT","RJAA"],
  "osaka":        ["RJBB","RJOO"],
  "seoul":        ["RKSI","RKSS"],
  "sydney":       ["YSSY","YSBK"],
  "melbourne":    ["YMML","YMEN"],
  "dubai":        ["OMDB","OMDW"],
  "istanbul":     ["LTFM","LTFJ"],
  "milan":        ["LIMC","LIML","LIME"],
};

// Airport name → ICAO mapping for disambiguation (audit P2: name-based matching)
// Covers secondary airports that rarely appear as ICAO/IATA codes in narrative text
const AIRPORT_NAME_ICAO: [RegExp, string][] = [
  [/\bgatwick\b/i,     "EGKK"],
  [/\bstandsted\b/i,   "EGSS"],
  [/\bluton\b/i,       "EGGW"],
  [/\bcity\s+airport\b/i, "EGLC"],  // London City
  [/\bmanchester\b/i,  "EGCC"],
  [/\bbirmingham\b/i,  "EGBB"],
  [/\bheathrow\b/i,    "EGLL"],
  [/\borly\b/i,        "LFPO"],
  [/\bbourget\b/i,     "LFPB"],
  [/\blaguardia\b|la\s+guardia/i, "KLGA"],
  [/\bnewark\b/i,      "KEWR"],
  [/\bmidway\b/i,      "KMDW"],
  [/\bburbank\b/i,     "KBUR"],
  [/\blong\s+beach\b/i,"KLGB"],
  [/\bontario\b/i,     "KONT"],
  [/\bsanta\s+ana\b|john\s+wayne/i, "KSNA"],
  [/\bdulles\b/i,      "KIAD"],
  [/\breagan\b|national\s+airport/i,"KDCA"],
  [/\bbwi\b|thurgood\s+marshall/i,  "KBWI"],
  [/\bhobby\b/i,       "KHOU"],
  [/\bdove\s*r?\b|love\s+field/i,   "KDAL"],
  [/\bfort\s+lauderdale\b/i,        "KFLL"],
  [/\bwest\s+palm\b/i, "KPBI"],
  [/\bneda\b|haneda\b/i,"RJTT"],
  [/\bnarita\b/i,      "RJAA"],
  [/\bkansai\b/i,      "RJBB"],
  [/\bitami\b/i,       "RJOO"],
  [/\bincheon\b/i,     "RKSI"],
  [/\bgimpo\b/i,       "RKSS"],
  [/\bmalpensa\b/i,    "LIMC"],
  [/\blinate\b/i,      "LIML"],
  [/\borio\s+al\s+serio\b/i, "LIME"],
  [/\bataturk\b/i,     "LTFM"],
  [/\bsabiha\b/i,      "LTFJ"],
  [/\bal\s+maktoum\b/i,"OMDW"],
  [/\bbankstown\b/i,   "YSBK"],
  [/\btullamarine\b/i, "YMML"],
  [/\bessendon\b/i,    "YMEN"],
];

// narrative 또는 runway 텍스트에서 ICAO/IATA 코드 추출
// 후보 목록이 주어지면 그 중에서만 반환 (다중 공항 도시 disambiguation)
function extractAirportFromText(text: string, candidates?: string[]): [string, string] {
  if (!text) return ["", ""];

  // Airport name keyword scan first (more specific than bare code matching)
  for (const [re, icao] of AIRPORT_NAME_ICAO) {
    if (re.test(text) && (!candidates || candidates.includes(icao))) return ["", icao];
  }

  // ICAO (4자 대문자, 알파벳+숫자): 후보 목록이 있으면 그 중에서
  const icaoMatches = text.match(/\b([A-Z]{4})\b/g) ?? [];
  for (const code of icaoMatches) {
    if (!candidates || candidates.includes(code)) return ["", code];
  }

  // IATA (3자 대문자)
  const iataMatches = text.match(/\b([A-Z]{3})\b/g) ?? [];
  for (const code of iataMatches) {
    if (!candidates) return [code, ""];
    // IATA를 ICAO로 변환 시도 (K 접두사 미국 공항)
    const icaoUS = "K" + code;
    if (candidates.includes(icaoUS)) return [code, icaoUS];
  }

  return ["", ""];
}

function airportForLocation(city: string, state: string, country: string, narrative?: string, runwayHint?: string): [string, string] {
  const c = city.toLowerCase().trim();
  const sRaw = state.toLowerCase().trim();
  const cn = country.toLowerCase().trim();

  // IATA/ICAO 직접 코드
  if (/^[A-Z]{3}$/.test(city)) return [city, ""];
  if (/^[A-Z]{4}$/.test(city)) return ["", city];

  // "OF" = NTSB Other Foreign (해외) → 미국이 아님
  const isOtherForeign = sRaw === "of" || sRaw === "ao" || sRaw === "gm";

  // 주 약어 → 전체 이름 변환 (TX→texas, FL→florida 등)
  const s = US_STATE_ABBREV[sRaw] ?? sRaw;

  // 미국 여부 판단
  const isUS = !isOtherForeign && (
    !cn || cn === "united states" || cn === "us" || cn === "usa"
    || US_STATES.has(s) || US_STATES.has(sRaw) || US_STATES.has(cn)
  );

  if (isUS) {
    const hit = US_CITY_AIRPORTS[`${c},${s}`]
      ?? US_CITY_AIRPORTS[`${c},${sRaw}`]
      ?? US_CITY_AIRPORTS[`${c},${cn}`];
    if (hit) {
      // 다중 공항 도시인 경우 narrative/runway에서 구체 공항 재추출 시도
      const multiCandidates = MULTI_AIRPORT_CITIES[c] ?? MULTI_AIRPORT_CITIES[`${c} city`];
      if (multiCandidates && (narrative || runwayHint)) {
        const searchText = `${narrative ?? ""} ${runwayHint ?? ""}`;
        const [rIata, rIcao] = extractAirportFromText(searchText, multiCandidates);
        if (rIcao) return ["", rIcao];
        if (rIata) return [rIata, ""];
      }
      return hit;
    }
  }

  // 국제 도시 (국가 포함 또는 도시명만)
  const intlHit = INTL_CITY_AIRPORTS[`${c},${cn}`]
    ?? INTL_CITY_AIRPORTS[`${c},${s}`]
    ?? US_CITY_AIRPORTS[c]          // 국가 없이 도시명만 있는 경우 (tokyo, dubai 등)
    ?? INTL_CITY_AIRPORTS[c];
  if (intlHit) {
    // 다중 공항 도시 재추출
    const multiCandidates = MULTI_AIRPORT_CITIES[c];
    if (multiCandidates && (narrative || runwayHint)) {
      const searchText = `${narrative ?? ""} ${runwayHint ?? ""}`;
      const [rIata, rIcao] = extractAirportFromText(searchText, multiCandidates);
      if (rIcao) return ["", rIcao];
      if (rIata) return [rIata, ""];
    }
    return intlHit;
  }

  return ["",""];
}

export interface UnifiedEventRecord {
  id: string;
  source_name: string;
  source_url: string;
  event_date: string;
  event_time?: string | null;
  operation_type?: string | null;
  airport_iata?: string | null;
  airport_icao?: string | null;
  destination_iata?: string | null;
  destination_icao?: string | null;
  runway?: string | null;
  approach_type?: string | null;
  flight_conditions?: string | null;
  flight_phase?: string | null;
  aircraft_type?: string | null;
  aircraft_category?: string | null;
  operator?: string | null;
  weather_summary?: string | null;
  metar_source?: string | null;
  event_type?: string | null;
  severity: number;
  core_event?: string | null;
  lesson_keyword?: string | null;
  summary: string;
  tags: string[];
  pilot_briefing_sentence?: string | null;
  confidence_score?: number | null;
}

async function upsertEventRecord(db: D1Database, rec: UnifiedEventRecord): Promise<boolean> {
  const now = new Date().toISOString();
  let existing = await db.prepare("SELECT * FROM events WHERE event_date = ? AND (airport_icao = ? AND airport_icao != '' OR airport_iata = ? AND airport_iata != '')")
    .bind(rec.event_date, rec.airport_icao || "---", rec.airport_iata || "---")
    .first<EventRow>();

  if (!existing) {
    existing = await db.prepare("SELECT * FROM events WHERE id = ?").bind(rec.id).first<EventRow>();
  }

  if (existing) {
    const sources = new Set((existing.source_name || "").split(" / "));
    sources.add(rec.source_name);
    const urls = new Set((existing.source_url || "").split(" , "));
    urls.add(rec.source_url);

    await db.prepare(`UPDATE events SET source_name=?, source_url=?, event_time=COALESCE(event_time,?), operation_type=COALESCE(operation_type,?), airport_iata=COALESCE(airport_iata,?), airport_icao=COALESCE(airport_icao,?), destination_iata=COALESCE(destination_iata,?), destination_icao=COALESCE(destination_icao,?), runway=COALESCE(runway,?), approach_type=COALESCE(approach_type,?), flight_conditions=COALESCE(flight_conditions,?), flight_phase=COALESCE(flight_phase,?), aircraft_type=COALESCE(aircraft_type,?), aircraft_category=COALESCE(aircraft_category,?), operator=COALESCE(operator,?), weather_summary=COALESCE(weather_summary,?), metar_source=COALESCE(metar_source,?), event_type=COALESCE(event_type,?), severity=MAX(COALESCE(severity,0),?), updated_at=? WHERE id=?`)
      .bind(Array.from(sources).join(" / "), Array.from(urls).join(" , "), rec.event_time || null, rec.operation_type || null, rec.airport_iata || null, rec.airport_icao || null, rec.destination_iata || null, rec.destination_icao || null, rec.runway || null, rec.approach_type || null, rec.flight_conditions || null, rec.flight_phase || null, rec.aircraft_type || null, rec.aircraft_category || null, rec.operator || null, rec.weather_summary || null, rec.metar_source || null, rec.event_type || null, rec.severity, now, existing.id).run();

    for (const tag of rec.tags) {
      await db.prepare("INSERT OR IGNORE INTO event_tags (event_id, tag_type, tag_value) VALUES (?, 'risk', ?)").bind(existing.id, tag).run();
    }
    return false;
  }

  await db.prepare(`INSERT INTO events (id,source_name,source_url,event_date,event_time,operation_type,airport_iata,airport_icao,destination_iata,destination_icao,runway,approach_type,flight_conditions,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,metar_source,event_type,severity,core_event,lesson_keyword,summary,pilot_briefing_sentence,confidence_score,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(rec.id, rec.source_name, rec.source_url, rec.event_date, rec.event_time || null, rec.operation_type || null, rec.airport_iata || null, rec.airport_icao || null, rec.destination_iata || null, rec.destination_icao || null, rec.runway || null, rec.approach_type || null, rec.flight_conditions || null, rec.flight_phase || null, rec.aircraft_type || null, rec.aircraft_category || null, rec.operator || null, rec.weather_summary || null, rec.metar_source || null, rec.event_type || null, rec.severity, rec.core_event || null, rec.lesson_keyword || null, rec.summary, rec.pilot_briefing_sentence || null, rec.confidence_score || 0.5, now, now).run();

  for (const tag of rec.tags) {
    await db.prepare("INSERT OR IGNORE INTO event_tags (event_id, tag_type, tag_value) VALUES (?, 'risk', ?)").bind(rec.id, tag).run();
  }
  return true;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cutoffDate(yearsBack: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsBack);
  return d;
}

function parseDate(text: string): Date | null {
  for (const fmt of ["mm/dd/yyyy", "yyyy-mm-dd"]) {
    const parts = text.trim().split(/[/-]/);
    try {
      if (fmt === "mm/dd/yyyy" && parts.length === 3) return new Date(`${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`);
      if (fmt === "yyyy-mm-dd" && parts.length === 3) return new Date(text.trim());
    } catch { /* next */ }
  }
  return null;
}

function categoryForTitle(title: string): string {
  const t = title.toLowerCase();
  if (["fatigue","crm","flight crew","flight attendant"].some(w => t.includes(w))) return "Human Factors / CRM";
  if (["gps","runway","weather","fuel","rnav","wake"].some(w => t.includes(w))) return "Flight Operations";
  return "Accident / Incident";
}

async function upsertOfficialItem(db: D1Database, params: { sourceName: string; sourceUrl: string; title: string; category: string; severity: string; summary: string; tags: string[] }): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM ops_intel_items WHERE source_url = ?").bind(params.sourceUrl).first<{ id: number }>();
  const tags = JSON.stringify([...new Set(params.tags)]);
  const now = new Date().toISOString();
  const lesson = "Screen this official item for Part 121/135 operational precursors, crew decision points, dispatch implications, and training value.";
  const a350 = "Review for long-haul widebody relevance, including ETOPS, fatigue, weather, navigation, maintenance control, and arrival/approach threat management.";
  const action = "Verify report details from the official source, classify Part 121/135 applicability, then extract briefing-ready lessons without inferring cause beyond the source.";
  if (!existing) {
    await db.prepare("INSERT INTO ops_intel_items (source_name,source_url,title,category,severity,summary,operational_lesson,a350_b787_applicability,recommended_action,tags,last_status,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(params.sourceName, params.sourceUrl, params.title, params.category, params.severity, params.summary, lesson, a350, action, tags, 200, now, now, now).run();
    return true;
  }
  await db.prepare("UPDATE ops_intel_items SET title=?,category=?,severity=?,summary=?,operational_lesson=?,a350_b787_applicability=?,recommended_action=?,tags=?,last_checked_at=?,updated_at=? WHERE source_url=?")
    .bind(params.title, params.category, params.severity, params.summary, lesson, a350, action, tags, now, now, params.sourceUrl).run();
  return false;
}

async function upsertFaaEvent(db: D1Database, row: { eventDate: Date; dateText: string; url: string; operator: string; flight: string; city: string; state: string; country: string; make: string; model: string }): Promise<boolean> {
  const context = `${row.operator} ${row.flight} ${row.make} ${row.model}`;
  const [airportIata, airportIcao] = airportForLocation(row.city, row.state, row.country, context);
  const rawId = `FAA-LL-${row.dateText.replace(/\//g, "-")}-${row.operator}-${row.flight}`.toUpperCase();
  const eventId = rawId.replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const makeModel = `${row.make} ${row.model}`.trim();

  return await upsertEventRecord(db, {
    id: eventId,
    source_name: "FAA Transport Airplane Lessons Learned",
    source_url: row.url,
    event_date: row.eventDate.toISOString().slice(0, 10),
    operation_type: "Part 121 / Part 135 official lesson candidate",
    airport_iata: airportIata,
    airport_icao: airportIcao,
    approach_type: airportIcao ? "VISUAL" : "ENROUTE",
    flight_phase: airportIcao ? "APPROACH" : "CRUISE",
    aircraft_type: makeModel,
    aircraft_category: "JET",
    operator: row.operator,
    weather_summary: `${row.city}, ${row.state || row.country}`.replace(/, $/,""),
    event_type: "FAA LESSONS LEARNED CASE",
    severity: 3,
    core_event: `${row.operator} ${row.flight} official lesson`,
    lesson_keyword: "Official FAA Lesson",
    summary: `FAA Lessons Learned case for ${row.operator} flight ${row.flight} near ${row.city}, ${row.state || row.country} on ${row.dateText}.`,
    tags: ["FAA", "OFFICIAL_LESSON", "PART_121_135_RELEVANT"],
    pilot_briefing_sentence: `Review FAA lesson for ${row.city || "the destination"} before approach or enroute decision gates.`,
    confidence_score: 0.7
  });
}

async function parseFaaTransportLibrary(db: D1Database, yearsBack: number): Promise<Record<string, unknown>> {
  const res = await fetch(FAA_TRANSPORT_URL, { headers: { "User-Agent": "OpsBriefing/0.1" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
  const html = await res.text();
  const cutoff = cutoffDate(yearsBack);
  const rows: { eventDate: Date; dateText: string; url: string; operator: string; flight: string; city: string; state: string; country: string; make: string; model: string }[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => cleanText(m[1]));
    if (cells.length < 2) continue;
    const dateText = cells[0];
    const eventDate = parseDate(dateText);
    if (!eventDate) continue;
    const linkMatch = rowMatch[1].match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    let url: string;
    try { url = new URL(linkMatch[1].replace(/&amp;/g, "&"), FAA_TRANSPORT_URL).href; } catch { continue; }
    rows.push({ eventDate, dateText, url, operator: cleanText(linkMatch[2]), flight: cells[2] ?? "", city: cells[3] ?? "", state: cells[4] ?? "", country: cells[5] ?? "", make: cells[6] ?? "", model: cells[7] ?? "" });
  }
  rows.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
  let created = 0;
  for (const row of rows) {
    if (await upsertFaaEvent(db, row)) created++;
    const isRecent = row.eventDate >= cutoff;
    if (await upsertOfficialItem(db, {
      sourceName: "FAA Transport Airplane Lessons Learned", sourceUrl: row.url,
      title: `FAA Transport Lessons Learned - ${row.operator} ${row.flight}`.trim(),
      category: "Accident / Incident", severity: "Medium",
      summary: `FAA Lessons Learned case for ${row.operator} flight ${row.flight} near ${[row.city, row.state, row.country].filter(Boolean).join(", ")} on ${row.dateText}.`,
      tags: ["FAA","transport_airplane","official_report_candidate","part_121_135_relevant", isRecent ? `recent_${yearsBack}_years` : "extended_period"],
    })) created++;
  }
  return { checked: rows.length, created };
}

function carolPayload(startDate: string, endDate: string): unknown {
  const dateOption = { FieldName: "EventDate", DisplayText: "Event date", Columns: ["Event.EventDate"], Selectable: true, InputType: "Date", RuleType: 0, Options: null, TargetCollection: "cases", UnderDevelopment: true };
  return {
    QueryGroups: [{
      QueryRules: [
        { RuleType: "Simple", Values: [startDate], Columns: ["Event.EventDate"], Operator: "is on or after", overrideColumn: "", selectedOption: dateOption },
        { RuleType: "Simple", Values: [endDate], Columns: ["Event.EventDate"], Operator: "is on or before", overrideColumn: "", selectedOption: dateOption },
        { RuleType: "Simple", Values: ["Aviation"], Columns: ["Event.Mode"], Operator: "is", overrideColumn: "", selectedOption: { FieldName: "Mode", DisplayText: "Investigation mode", Columns: ["Event.Mode"], Selectable: true, InputType: "Dropdown", RuleType: 0, Options: null, TargetCollection: "cases", UnderDevelopment: true } },
      ], AndOr: "and", inLastSearch: false, editedSinceLastSearch: false,
    }],
    AndOr: "and", TargetCollection: "cases", ExportFormat: "data",
    SessionId: 227230, ResultSetSize: 500, SortDescending: true,
  };
}

const NTSB_PHASE_MAP: Record<string, string> = {
  standing: "PREFLIGHT", taxi: "PREFLIGHT", takeoff: "PREFLIGHT",
  "initial climb": "CRUISE", climb: "CRUISE", "en route": "CRUISE", cruise: "CRUISE", maneuvering: "CRUISE", descent: "CRUISE",
  approach: "APPROACH", landing: "LANDING",
};

async function fetchCarolCases(start: string, end: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(NTSB_CAROL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "*/*", "Origin": "https://data.ntsb.gov" },
    body: JSON.stringify(carolPayload(start, end)),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const zip = unzipSync(new Uint8Array(buf));
  const jsonFile = Object.keys(zip).find(f => f.endsWith(".json"));
  if (!jsonFile) throw new Error("No JSON in ZIP");
  return JSON.parse(new TextDecoder().decode(zip[jsonFile])) as Record<string, unknown>[];
}

async function parseNtsbCarol(db: D1Database, yearsBack: number): Promise<Record<string, unknown>> {
  // Split into 2-year chunks to exceed the 500-record-per-query limit.
  const now = new Date();
  const chunks: { start: string; end: string }[] = [];
  for (let y = 0; y < yearsBack; y += 2) {
    const chunkEnd = new Date(now);
    chunkEnd.setFullYear(now.getFullYear() - y);
    const chunkStart = new Date(now);
    chunkStart.setFullYear(now.getFullYear() - Math.min(y + 2, yearsBack));
    chunks.push({ start: chunkStart.toISOString().slice(0, 10), end: chunkEnd.toISOString().slice(0, 10) });
  }

  let allCases: Record<string, unknown>[] = [];
  const errors: string[] = [];
  for (const chunk of chunks) {
    try {
      const cases = await fetchCarolCases(chunk.start, chunk.end);
      allCases = allCases.concat(cases);
    } catch (e) {
      errors.push(`${chunk.start}~${chunk.end}: ${e}`);
    }
  }

  let created = 0;
  let part121Matched = 0;
  const seen = new Set<string>();
  for (const c of allCases) {
    const ntsbNum = (c.cm_ntsbNum ?? c.cm_NtsbNo ?? "") as string;
    if (!ntsbNum || seen.has(ntsbNum)) continue;
    seen.add(ntsbNum);
    const vehicles = (c.cm_vehicles ?? []) as Record<string, unknown>[];
    if (!vehicles.map(v => String(v.regulationFlightConductedUnder ?? "").trim()).some(p => LARGE_JET_PARTS.has(p))) continue;
    part121Matched++;
    if (await upsertNtsbCase(db, ntsbNum, c, vehicles)) created++;
  }
  return { checked: allCases.length, chunks: chunks.length, part121_matched: part121Matched, created, errors };
}

async function upsertNtsbCase(db: D1Database, ntsbNum: string, c: Record<string, unknown>, vehicles: Record<string, unknown>[]): Promise<boolean> {
  const eventDateRaw = String(c.cm_eventDate ?? "");
  const eventDate = eventDateRaw.slice(0, 10);
  const eventTimeUtc = eventDateRaw.length >= 16 ? eventDateRaw.slice(11, 16) : "";

  const city = String(c.cm_city ?? "");
  const state = String(c.cm_state ?? "");
  const country = String(c.cm_country ?? "");
  const highestInjury = String(c.cm_highestInjury ?? "").toUpperCase();
  const fatal = Number(c.cm_fatalInjuryCount ?? 0);

  const makeModel = vehicles.map(v => `${v.cm_make ?? v.make ?? ""} ${v.cm_model ?? v.model ?? ""}`.trim()).find(Boolean) ?? "";
  const operator = vehicles.map(v => String(v.operatorName ?? v.registeredOwner ?? "")).find(Boolean) ?? "";

  const flightPhase = vehicles.flatMap(v =>
    (v.cm_events as Record<string, unknown>[] ?? []).map(e => NTSB_PHASE_MAP[String(e.cicttPhaseSOEGroup ?? "").toLowerCase()] ?? "")
  ).find(Boolean) ?? "";
  const soeGroups = vehicles.flatMap(v =>
    (v.cm_events as Record<string, unknown>[] ?? []).flatMap(e => [
      String(e.cm_tier1Name ?? ""), String(e.cm_tier2Name ?? ""), String(e.cicttEventSOEGroup ?? "")
    ])
  ).filter(Boolean);

  const damageLevel = vehicles.map(v => String(v.DamageLevel ?? v.damageLevel ?? "")).find(s => s && s !== "None") ?? "";
  const flightOperationType = vehicles.map(v => String(v.flightOperationType ?? "")).find(Boolean) ?? "";
  const flightScheduledType = vehicles.map(v => String(v.flightScheduledType ?? "")).find(Boolean) ?? "";
  const secondPilotPresent = vehicles.some(v => v.secondPilotPresent === true || v.secondPilotPresent === "true" || v.secondPilotPresent === 1);
  const siteCondition = String(c.accidentSiteCondition ?? "");
  const narrative = String(c.prelimNarrative ?? c.cm_probableCause ?? "").trim();
  const autoSummary = narrative || `NTSB case ${ntsbNum} near ${city || "unspecified"}${state ? `, ${state}` : ""}. Highest injury: ${highestInjury || "unknown"}.${damageLevel ? ` Aircraft damage: ${damageLevel}.` : ""}${siteCondition ? ` Conditions: ${siteCondition}.` : ""}${eventTimeUtc ? ` Event time: ${eventTimeUtc}Z.` : ""}`;
  const severity = fatal > 0 ? 5 : highestInjury.includes("SERIOUS") ? 4 : highestInjury.includes("MINOR") ? 3 : 2;

  const aptRaw = String(c.airportId ?? c.cm_apt ?? c.cm_aptId ?? c.cm_airport ?? "").trim().toUpperCase();
  let airportIata = "", airportIcao = "";
  if (/^[A-Z]{4}$/.test(aptRaw)) { airportIcao = aptRaw; }
  else if (/^[A-Z]{3}$/.test(aptRaw)) { airportIata = aptRaw; }
  else {
    const aptNameHint = String(c.airportName ?? c.cm_airportName ?? aptRaw ?? "");
    [airportIata, airportIcao] = airportForLocation(city, state, country, `${narrative} ${aptNameHint}`, "");
  }

  const operationType = ["Part 121 air transport (NTSB CAROL)", flightScheduledType === "SCHD" ? "scheduled" : flightScheduledType === "NSCH" ? "non-scheduled" : "", flightOperationType].filter(Boolean).join(" · ");
  const eventId = `NTSB-${ntsbNum}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");

  const tags = ["NTSB", "carol_case", "official_report_candidate", ...(fatal > 0 ? ["FATAL"] : []), ...(damageLevel === "Destroyed" ? ["AIRCRAFT_DESTROYED"] : damageLevel === "Substantial" ? ["SUBSTANTIAL_DAMAGE"] : []), ...(siteCondition === "IMC" ? ["IMC"] : siteCondition === "VMC" ? ["VMC"] : []), ...(secondPilotPresent ? [] : ["SINGLE_PILOT"])];

  if (eventTimeUtc) {
    const utcHour = parseInt(eventTimeUtc.slice(0, 2));
    const eventAt = eventDateRaw ? new Date(eventDateRaw) : undefined;
    const offset = airportIcao ? airportUtcOffset(airportIcao, eventAt) : 0;
    const localHour = ((utcHour + offset) % 24 + 24) % 24;
    tags.push(localHour >= 22 || localHour < 6 ? "NIGHT_EVENT" : "DAY_EVENT");
  }

  return await upsertEventRecord(db, {
    id: eventId,
    source_name: "NTSB CAROL",
    source_url: `https://data.ntsb.gov/carol-main-public/basic-search?NTSBNumber=${ntsbNum}`,
    event_date: eventDate,
    event_time: eventTimeUtc || null,
    operation_type: operationType,
    airport_iata: airportIata,
    airport_icao: airportIcao,
    flight_conditions: siteCondition || null,
    flight_phase: flightPhase,
    aircraft_type: makeModel,
    aircraft_category: "JET",
    operator: operator,
    event_type: soeGroups.filter(s => s.length > 2).slice(0, 3).join(" / ") || "NTSB CASE",
    severity: severity,
    core_event: `NTSB ${ntsbNum}`,
    lesson_keyword: "NTSB Case",
    summary: autoSummary,
    tags: tags,
    pilot_briefing_sentence: `Review NTSB case ${ntsbNum} — ${soeGroups[0] || "Accident"}. ${siteCondition ? `Conditions: ${siteCondition}.` : "CAROL summary only."}`,
    confidence_score: 0.5
  });
}

async function parseAsrsReportSets(db: D1Database): Promise<Record<string, unknown>> {
  const res = await fetch(ASRS_URL, { headers: { "User-Agent": "OpsBriefing/0.1" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
  const html = await res.text();
  const pdfLinks = [...html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["']/gi)];
  let checked = 0, created = 0;
  for (let i = 0; i < pdfLinks.length; i++) {
    const nextStart = pdfLinks[i + 1]?.index ?? html.length;
    const block = html.slice((pdfLinks[i].index ?? 0) + pdfLinks[i][0].length, nextStart);
    const descMatch = block.match(/<div class="fileDescription">\s*([\s\S]*?)\s*<div class="instructions">([\s\S]*?)<\/div>/i);
    if (!descMatch) continue;
    const title = cleanText(descMatch[1]);
    const instructions = cleanText(descMatch[2]);
    const haystack = `${title} ${instructions}`.toLowerCase();
    if (!ASRS_KEYWORDS.some(k => haystack.includes(k))) continue;
    checked++;
    let url: string;
    try { url = new URL(pdfLinks[i][1].replace(/&amp;/g, "&"), ASRS_URL).href; } catch { continue; }
    if (await upsertOfficialItem(db, {
      sourceName: "NASA ASRS Report Sets", sourceUrl: url,
      title: `ASRS Report Set - ${title}`,
      category: categoryForTitle(title), severity: "Medium",
      summary: `${title}. ${instructions}`,
      tags: ["ASRS","asrs_report_set","official_source","part_121_135_relevant"],
    })) created++;
  }
  return { checked, created };
}

export async function collectNtsbRange(db: D1Database, start: string, end: string): Promise<Record<string, unknown>> {
  try {
    const cases = await fetchCarolCases(start, end);
    let created = 0, part121Matched = 0;
    const seen = new Set<string>();
    for (const c of cases) {
      const ntsbNum = (c.cm_ntsbNum ?? c.cm_NtsbNo ?? "") as string;
      if (!ntsbNum || seen.has(ntsbNum)) continue;
      seen.add(ntsbNum);
      const vehicles = (c.cm_vehicles ?? []) as Record<string, unknown>[];
      if (!vehicles.map(v => String(v.regulationFlightConductedUnder ?? "").trim()).some(p => LARGE_JET_PARTS.has(p))) continue;
      part121Matched++;
      await upsertNtsbCase(db, ntsbNum, c, vehicles) && created++;
    }
    return { start, end, checked: cases.length, part121_matched: part121Matched, created };
  } catch (e) {
    return { start, end, checked: 0, created: 0, error: String(e) };
  }
}

// ── 기존 NTSB 이벤트 event_time 백필 ─────────────────────────────────────────
// CAROL API를 날짜 범위로 재조회하여 cm_eventDate의 시각 부분을 event_time에 저장
export async function backfillNtsbEventTime(db: D1Database, limit = 50): Promise<Record<string, unknown>> {
  // event_time이 없는 NTSB 이벤트 — event_date 기준으로 CAROL 재조회
  const { results } = await db.prepare(`
    SELECT id, event_date FROM events
    WHERE source_name = 'NTSB CAROL'
      AND (event_time IS NULL OR event_time = '')
      AND event_date IS NOT NULL AND event_date != ''
    LIMIT ?
  `).bind(limit).all<{ id: string; event_date: string }>();

  const { remaining: rem } = await db.prepare(`
    SELECT COUNT(*) as remaining FROM events
    WHERE source_name = 'NTSB CAROL'
      AND (event_time IS NULL OR event_time = '')
      AND event_date IS NOT NULL AND event_date != ''
  `).first<{ remaining: number }>() ?? { remaining: 0 };

  // 날짜별로 그룹화하여 CAROL 배치 조회 최소화
  const byDate = new Map<string, string[]>();
  for (const e of results) {
    const list = byDate.get(e.event_date) ?? [];
    list.push(e.id);
    byDate.set(e.event_date, list);
  }

  let updated = 0;
  const errors: string[] = [];

  for (const [date, ids] of byDate) {
    try {
      const cases = await fetchCarolCases(date, date);
      const timeMap = new Map<string, string>();
      for (const c of cases) {
        const ntsbNum = (c.cm_ntsbNum ?? c.cm_NtsbNo ?? "") as string;
        const dateRaw = String(c.cm_eventDate ?? "");
        const t = dateRaw.length >= 16 ? dateRaw.slice(11, 16) : "";
        if (ntsbNum && t) timeMap.set(`NTSB-${ntsbNum}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, ""), t);
      }
      for (const id of ids) {
        const t = timeMap.get(id);
        if (t) {
          await db.prepare("UPDATE events SET event_time = ?, updated_at = datetime('now') WHERE id = ?").bind(t, id).run();
          updated++;
        }
      }
    } catch (e) {
      errors.push(`${date}: ${String(e).slice(0, 80)}`);
    }
  }

  return { processed: results.length, updated, remaining: rem - results.length, errors };
}

// ── 기존 이벤트 공항코드 백필 ──────────────────────────────────────────────────
// weather_summary(도시명) 컬럼을 파싱해서 airport_iata/airport_icao 업데이트
export async function backfillAirportCodes(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare(
    "SELECT id, weather_summary, airport_iata, airport_icao FROM events WHERE (airport_icao IS NULL OR airport_icao = '') AND weather_summary IS NOT NULL AND weather_summary != ''"
  ).all<{ id: string; weather_summary: string; airport_iata: string; airport_icao: string }>();

  let updated = 0;
  const skipped: string[] = [];

  for (const row of results) {
    // weather_summary 형식: "City, State" (FAA) or "City, State, Country" (NTSB)
    const parts = row.weather_summary.split(",").map((s: string) => s.trim()).filter(Boolean);
    const city    = parts[0] ?? "";
    const state   = parts[1] ?? "";
    const country = parts[2] ?? "";   // 없으면 빈 문자열 — airportForLocation이 US_STATES로 판단

    const [iata, icao] = airportForLocation(city, state, country);
    if (!iata && !icao) {
      skipped.push(`${row.id}: "${row.weather_summary}"`);
      continue;
    }
    await db.prepare("UPDATE events SET airport_iata=?, airport_icao=?, updated_at=? WHERE id=?")
      .bind(iata, icao, new Date().toISOString(), row.id).run();
    updated++;
  }

  return {
    total_checked: results.length,
    updated,
    skipped_count: skipped.length,
    skipped_samples: skipped.slice(0, 10),
  };
}

// ─── RSS 공통 파서 ──────────────────────────────────────────────────────────────
function rssField(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? cleanText(m[1]) : "";
}

interface RssSource {
  name: string;
  url: string;
  tags: string[];
  /** 항공 관련 항목만 필터 — 생략 시 전체 수집 */
  aviationFilter?: RegExp;
}

async function parseRssFeed(db: D1Database, src: RssSource, cutoff: Date): Promise<Record<string, unknown>> {
  let checked = 0, created = 0;
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "PilotMetrics/1.0 (aviation-safety-research)", "Accept": "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const xml = await res.text();

    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const item = m[1];
      const title   = rssField(item, "title");
      const link    = rssField(item, "link") || rssField(item, "guid");
      const desc    = rssField(item, "description") || rssField(item, "summary");
      const pubDate = rssField(item, "pubDate") || rssField(item, "dc:date") || rssField(item, "updated");

      if (!link || !title) continue;
      if (src.aviationFilter && !src.aviationFilter.test(`${title} ${desc}`)) continue;

      const d = pubDate ? new Date(pubDate) : null;
      if (d && !isNaN(d.getTime()) && d < cutoff) continue;

      checked++;
      const fullUrl = link.startsWith("http") ? link : `https://${new URL(src.url).host}${link}`;

      // RSS as Event candidate if from an investigation body
      const isInvestigationBody = src.tags.some(t => ["ATSB", "TSB", "BEA", "AAIB", "EASA"].includes(t));
      if (isInvestigationBody) {
        const [iata, icao] = airportForLocation("", "", "", `${title} ${desc}`);
        const eventId = `RSS-${src.tags[0]}-${fullUrl.split("/").pop()}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-");
        await upsertEventRecord(db, {
          id: eventId,
          source_name: src.name,
          source_url: fullUrl,
          event_date: d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          airport_iata: iata,
          airport_icao: icao,
          summary: desc || title,
          severity: 2,
          tags: [...src.tags, "RSS_EVENT"],
          event_type: "RSS Investigation Update"
        });
      }

      const isNew = await upsertOfficialItem(db, {
        sourceName: src.name, sourceUrl: fullUrl, title,
        category: "Accident / Incident", severity: "Medium",
        summary: desc || title,
        tags: [...src.tags, "official_report_candidate", "official_source"],
      });
      if (isNew) created++;
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

// ─── AAIB (UK) — GOV.UK JSON API ──────────────────────────────────────────────
async function parseAaib(db: D1Database, cutoff: Date): Promise<Record<string, unknown>> {
  let checked = 0, created = 0;
  // GOV.UK 공식 Search API — 인증 불필요, JSON 반환
  const url = "https://www.gov.uk/search/all?content_store_document_type=aaib_report&order=updated-newest&count=100";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PilotMetrics/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const data = await res.json() as { results?: Record<string, unknown>[] };
    for (const item of (data.results ?? [])) {
      const title   = String(item.title ?? "");
      const link    = String(item.link ?? "");
      const desc    = String(item.description ?? "");
      const ts      = String(item.public_timestamp ?? "");
      if (!link || !title) continue;
      const d = ts ? new Date(ts) : null;
      if (d && !isNaN(d.getTime()) && d < cutoff) continue;
      checked++;
      const fullUrl = link.startsWith("http") ? link : `https://www.gov.uk${link}`;
      if (await upsertOfficialItem(db, {
        sourceName: "AAIB Reports (UK)", sourceUrl: fullUrl, title,
        category: "Accident / Incident", severity: "Medium",
        summary: desc || title,
        tags: ["AAIB", "UK", "official_report_candidate", "official_source"],
      })) created++;
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

// ─── ICAO iSTARS APIDS API ──────────────────────────────────────────────────
async function parseIcaoIstars(db: D1Database, apiKey: string, yearsBack: number): Promise<Record<string, unknown>> {
  const states = ["KOR", "USA", "JPN", "CHN", "FRA", "CAN", "AUS", "UK", "GER"];
  const currentYear = new Date().getFullYear();
  const startYear = Math.max(2000, currentYear - yearsBack);
  let checked = 0, created = 0;
  const errors: string[] = [];

  for (const state of states) {
    for (let year = startYear; year <= currentYear; year++) {
      try {
        const url = `https://applications.icao.int/dataservices/api/get-occurrences?api_key=${apiKey}&State=${state}&Year=${year}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const data = await res.json() as any[];
        if (!Array.isArray(data)) continue;
        for (const occ of data) {
          checked++;
          const eventDate = occ.Date || `${year}-01-01`;
          const title = `${occ.OccurrenceCategory || "Occurrence"} - ${occ.StateName || state}`;
          const summary = occ.Narrative || `ICAO iSTARS occurrence in ${occ.StateName} on ${eventDate}. Type: ${occ.OccurrenceCategory}.`;
          const sourceUrl = `https://applications.icao.int/istars/ (Ref: ${occ.OccurrenceNo})`;
          const [iata, icao] = airportForLocation("", "", occ.StateName || "", summary);

          if (await upsertEventRecord(db, {
            id: `ICAO-${occ.OccurrenceNo || Math.random().toString(36).substr(2, 9)}`,
            source_name: "ICAO iSTARS", source_url: sourceUrl,
            event_date: eventDate.slice(0, 10),
            airport_iata: iata, airport_icao: icao,
            summary: summary, severity: 3,
            tags: ["ICAO", "iSTARS", state, "OFFICIAL_REPORT"],
            event_type: occ.OccurrenceCategory
          })) created++;

          await upsertOfficialItem(db, {
            sourceName: "ICAO iSTARS", sourceUrl: sourceUrl, title,
            category: "Accident / Incident", severity: "Medium", summary,
            tags: ["ICAO", "iSTARS", state]
          });
        }
      } catch (e) { errors.push(`${state} ${year}: ${e}`); }
    }
  }
  return { checked, created, errors };
}

// ─── ARAIB Korea (South Korea) ────────────────────────────────────────────────
async function parseAraibKorea(db: D1Database): Promise<Record<string, unknown>> {
  const url = "https://araib.molit.go.kr/eng/section/list.do?menuSeq=1043";
  let checked = 0, created = 0;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "PilotMetrics/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const html = await res.text();
    for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => cleanText(c[1]));
      if (cells.length < 5) continue;
      const dateText = cells[1];
      const eventDate = parseDate(dateText) || new Date(dateText);
      if (isNaN(eventDate.getTime()) || eventDate.getFullYear() < 2000) continue;
      const linkMatch = m[1].match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const title = cleanText(linkMatch[2]);
      const fullUrl = new URL(linkMatch[1].replace(/&amp;/g, "&"), url).href;
      checked++;
      const [iata, icao] = airportForLocation("", "", "South Korea", title);
      if (await upsertEventRecord(db, {
        id: `ARAIB-${fullUrl.split("=").pop() || Math.random()}`,
        source_name: "ARAIB (Korea)", source_url: fullUrl,
        event_date: eventDate.toISOString().slice(0, 10),
        airport_iata: iata, airport_icao: icao,
        summary: title, severity: 3,
        tags: ["ARAIB", "Korea", "OFFICIAL_REPORT"],
        event_type: "Investigation Report"
      })) created++;
      await upsertOfficialItem(db, {
        sourceName: "ARAIB (Korea)", sourceUrl: fullUrl, title,
        category: "Accident / Incident", severity: "Medium", summary: title,
        tags: ["ARAIB", "Korea"]
      });
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

// ─── JTSB Japan (Japan) ─────────────────────────────────────────────────────
async function parseJtsbJapan(db: D1Database): Promise<Record<string, unknown>> {
  const url = "https://www.mlit.go.jp/jtsb/aviation.html";
  let checked = 0, created = 0;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "PilotMetrics/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const html = await res.text();
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const link = m[1];
      const title = cleanText(m[2]);
      if (!link.includes("/jtsb/aircraft/rep-acc/") && !link.includes("/jtsb/aircraft/rep-inc/")) continue;
      const fullUrl = new URL(link.replace(/&amp;/g, "&"), url).href;
      const yearMatch = title.match(/\b(20\d{2})\b/) || link.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      if (year < 2000 && year !== 0) continue;
      checked++;
      const [iata, icao] = airportForLocation("", "", "Japan", title);
      if (await upsertEventRecord(db, {
        id: `JTSB-${fullUrl.split("/").pop()?.replace(".html", "") || Math.random()}`,
        source_name: "JTSB (Japan)", source_url: fullUrl,
        event_date: year ? `${year}-01-01` : new Date().toISOString().slice(0, 10),
        airport_iata: iata, airport_icao: icao,
        summary: title, severity: 3,
        tags: ["JTSB", "Japan", "OFFICIAL_REPORT"],
        event_type: "Investigation Report"
      })) created++;
      await upsertOfficialItem(db, {
        sourceName: "JTSB (Japan)", sourceUrl: fullUrl, title,
        category: "Accident / Incident", severity: "Medium", summary: title,
        tags: ["JTSB", "Japan"]
      });
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

// ─── AvHerald (RSS Workaround) ──────────────────────────────────────────────
async function parseAvHerald(db: D1Database): Promise<Record<string, unknown>> {
  const url = "https://bsky.app/profile/avherald.com/rss";
  let checked = 0, created = 0;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "PilotMetrics/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const xml = await res.text();
    const cutoff2000 = new Date("2000-01-01");
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const item = m[1];
      const title = rssField(item, "title");
      const link = rssField(item, "link") || rssField(item, "guid");
      const desc = rssField(item, "description") || rssField(item, "summary");
      const pubDate = rssField(item, "pubDate");
      if (!link || !title) continue;
      const d = pubDate ? new Date(pubDate) : new Date();
      if (d < cutoff2000) continue;
      checked++;
      const [iata, icao] = airportForLocation("", "", "", `${title} ${desc}`);
      const eventId = `AVH-${link.split("/").pop() || Math.random()}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-");
      if (await upsertEventRecord(db, {
        id: eventId, source_name: "Aviation Herald (via Bluesky)", source_url: link,
        event_date: d.toISOString().slice(0, 10), airport_iata: iata, airport_icao: icao,
        summary: desc || title, severity: 3,
        tags: ["AvHerald", "Bluesky", "Incident", "RSS_EVENT"],
        event_type: "Incident"
      })) created++;
      await upsertOfficialItem(db, {
        sourceName: "Aviation Herald (via Bluesky)", sourceUrl: link, title,
        category: "Accident / Incident", severity: "Medium", summary: desc || title,
        tags: ["AvHerald", "Bluesky", "real_time"]
      });
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

// ─── SKYbrary — Drupal JSON:API ────────────────────────────────────────────────
async function parseSkybrary(db: D1Database, cutoff: Date): Promise<Record<string, unknown>> {
  let checked = 0, created = 0;
  // SKYbrary는 Drupal JSON:API 제공
  const url = "https://skybrary.aero/jsonapi/node/accident_and_incident?sort=-field_event_date&page[limit]=100&fields[node--accident_and_incident]=title,field_event_date,path,body";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PilotMetrics/1.0", "Accept": "application/vnd.api+json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { checked: 0, created: 0, error: `HTTP ${res.status}` };
    const data = await res.json() as { data?: Record<string, unknown>[] };
    for (const item of (data.data ?? [])) {
      const attrs = item.attributes as Record<string, unknown> ?? {};
      const title    = String(attrs.title ?? "");
      const dateStr  = String(attrs.field_event_date ?? "");
      const pathObj  = attrs.path as Record<string, string> ?? {};
      const alias    = pathObj.alias ?? "";
      const bodyObj  = attrs.body as Record<string, string> ?? {};
      const summary  = cleanText(bodyObj.summary ?? bodyObj.value ?? "").slice(0, 500);
      if (!alias || !title) continue;
      const d = dateStr ? new Date(dateStr) : null;
      if (d && !isNaN(d.getTime()) && d < cutoff) continue;
      checked++;
      const fullUrl = `https://skybrary.aero${alias}`;
      if (await upsertOfficialItem(db, {
        sourceName: "SKYbrary Accidents & Incidents", sourceUrl: fullUrl, title,
        category: "Accident / Incident", severity: "Medium",
        summary: summary || title,
        tags: ["SKYbrary", "official_source", "official_report_candidate"],
      })) created++;
    }
  } catch (e) { return { checked, created, error: String(e) }; }
  return { checked, created };
}

export async function collectRecentOfficialEvents(db: D1Database, yearsBack = 20): Promise<Record<string, unknown>> {
  const cutoff = cutoffDate(yearsBack);
  const icaoKey = "2113c549-8f2d-4a98-a587-e35192569e55";

  const RSS_SOURCES: RssSource[] = [
    {
      name: "ATSB Aviation (Australia)",
      url: "https://www.atsb.gov.au/feed/aviation/",
      tags: ["ATSB", "Australia"],
    },
    {
      name: "TSB Canada Aviation",
      url: "https://www.tsb.gc.ca/eng/rss/aviation.xml",
      tags: ["TSB", "Canada"],
    },
    {
      name: "BEA France Investigations",
      url: "https://bea.aero/en/feed/",
      tags: ["BEA", "France"],
      aviationFilter: /aircraft|aviation|flight|crash|accident|approach|runway|takeoff|landing/i,
    },
    {
      name: "EASA Safety Publications",
      url: "https://www.easa.europa.eu/en/newsroom-and-events/safety-publications/feed",
      tags: ["EASA", "Europe"],
      aviationFilter: /accident|incident|airworthiness|safety/i,
    },
  ];

  const [ntsb, faa, asrs, aaib, skybrary, icao, araib, jtsb, avherald, ...rssResults] = await Promise.allSettled([
    parseNtsbCarol(db, yearsBack),
    parseFaaTransportLibrary(db, yearsBack),
    parseAsrsReportSets(db),
    parseAaib(db, cutoff),
    parseSkybrary(db, cutoff),
    parseIcaoIstars(db, icaoKey, yearsBack),
    parseAraibKorea(db),
    parseJtsbJapan(db),
    parseAvHerald(db),
    ...RSS_SOURCES.map(src => parseRssFeed(db, src, cutoff)),
  ]);

  const r = (p: PromiseSettledResult<Record<string, unknown>>) =>
    p.status === "fulfilled" ? p.value : { checked: 0, created: 0, error: String((p as PromiseRejectedResult).reason) };

  const srcResults: Record<string, unknown> = {
    ntsb: r(ntsb), faa: r(faa), asrs: r(asrs),
    aaib: r(aaib), skybrary: r(skybrary),
    icao: r(icao), araib: r(araib), jtsb: r(jtsb), avherald: r(avherald),
  };
  RSS_SOURCES.forEach((src, i) => { srcResults[src.tags[0].toLowerCase()] = r(rssResults[i]); });

  const totals = Object.values(srcResults) as Record<string, number>[];
  return {
    status: "complete", years_back: yearsBack,
    sources: srcResults,
    items_checked: totals.reduce((s, v) => s + ((v.checked as number) ?? 0), 0),
    items_saved:   totals.reduce((s, v) => s + ((v.created as number) ?? 0), 0),
  };
}

// ── TSB Canada CSV 수집 (로컬 스크립트 → Worker ingest) ───────────────────────

export interface TsbRecord {
  occNo: string;
  occDate: string;       // "2026-06-29"
  occTime?: string;
  icao?: string;         // occurrence airport ICAO
  occType: string;       // "ACCIDENT" | "INCIDENT"
  occClass?: string;
  country?: string;
  province?: string;
  summary?: string;
  commonName?: string;
  fatalCount?: number;
  seriousCount?: number;
  minorCount?: number;
  lightCond?: string;
  operator?: string;
  aircraftType?: string;
  carsSubpart?: string;  // e.g. "705 - AIRLINER"
  operationType?: string;
  flightNo?: string;
  depIcao?: string;
  destIcao?: string;
  flightPhase?: string;
  damageLevel?: string;
}

async function upsertTsbEvent(db: D1Database, rec: TsbRecord): Promise<boolean> {
  const eventId = `TSB-${rec.occNo}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const fatal = rec.fatalCount ?? 0;
  const serious = rec.seriousCount ?? 0;
  const occUpper = (rec.occType ?? "").toUpperCase();
  const severity = fatal > 0 ? 5 : occUpper.includes("ACCIDENT") ? (serious > 0 ? 4 : 3) : 2;

  const context = `${rec.summary || ""} ${rec.commonName || ""} ${rec.operator || ""} ${rec.aircraftType || ""}`;
  let [airportIata, airportIcao] = ["", ""];
  const rawIcao = (rec.icao ?? "").trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(rawIcao)) {
    airportIcao = rawIcao;
  } else if (/^[A-Z]{3}$/.test(rawIcao)) {
    airportIata = rawIcao;
    const [, icao] = airportForLocation("", "", "", context);
    airportIcao = icao;
  }
  if (!airportIcao && !airportIata && rec.province && rec.country) {
    [airportIata, airportIcao] = airportForLocation("", rec.province, rec.country, context);
  }

  const year = rec.occDate.slice(0, 4);
  const sourceUrl = `https://www.tsb.gc.ca/eng/rapports-reports/aviation/${year}/index.html`;
  const summary = (rec.summary ?? rec.commonName ?? `TSB Canada occurrence ${rec.occNo}`).trim();

  const tags: string[] = ["TSB_CANADA", "PART_121_135_RELEVANT", ...(fatal > 0 ? ["FATAL"] : [])];
  const dmgUpper = (rec.damageLevel ?? "").toUpperCase();
  if (dmgUpper.includes("DESTRO")) tags.push("AIRCRAFT_DESTROYED"); else if (dmgUpper.includes("SUBSTANTIAL")) tags.push("SUBSTANTIAL_DAMAGE");
  const lightUpper = (rec.lightCond ?? "").toUpperCase();
  if (lightUpper.includes("NIGHT") || lightUpper.includes("DARK")) tags.push("NIGHT_EVENT"); else if (lightUpper.includes("DAY") || lightUpper.includes("DAWN") || lightUpper.includes("DUSK")) tags.push("DAY_EVENT");
  tags.push(occUpper.includes("ACCIDENT") ? "ACCIDENT" : "INCIDENT");

  return await upsertEventRecord(db, {
    id: eventId, source_name: "TSB Canada", source_url: sourceUrl,
    event_date: rec.occDate.slice(0, 10),
    event_time: rec.occTime || null,
    operation_type: rec.carsSubpart || rec.operationType || "Commercial aviation",
    airport_iata: airportIata, airport_icao: airportIcao,
    destination_iata: rec.destIcao?.length === 3 ? rec.destIcao : null,
    destination_icao: rec.destIcao?.length === 4 ? rec.destIcao : null,
    flight_phase: rec.flight_phase || rec.flightPhase || "",
    aircraft_type: rec.aircraftType || "",
    aircraft_category: "JET",
    operator: rec.operator || "",
    weather_summary: [rec.province, rec.country].filter(Boolean).join(", "),
    event_type: `${rec.occType}${rec.occClass ? ` - ${rec.occClass}` : ""}`,
    severity: severity,
    core_event: `TSB ${rec.occNo}`,
    lesson_keyword: "TSB Canada Occurrence",
    summary: summary,
    tags: tags,
    pilot_briefing_sentence: `Review TSB Canada occurrence ${rec.occNo} — ${rec.occType}.${rec.flightNo ? ` Flight: ${rec.flightNo}.` : ""}`,
    confidence_score: 0.6
  });
}

export async function ingestTsbBatch(db: D1Database, records: TsbRecord[]): Promise<{ checked: number; created: number }> {
  let created = 0;
  for (const rec of records) {
    try {
      if (await upsertTsbEvent(db, rec)) created++;
    } catch { /* skip invalid record */ }
  }
  return { checked: records.length, created };
}

// ── ASN (Aviation Safety Network, via GitHub mirror) ────────────────────────
// 원본: aviation-safety.net 스크레이핑 결과물을 재정리한 공개 GitHub 저장소에서 가져옴.

export interface AsnRecord {
  url: string;
  date: string;              // e.g. "Wednesday 1 January 2020"
  time?: string;              // e.g. "09:24 LT"
  type?: string;               // aircraft type
  owner_operator?: string;
  registration?: string;
  fatalities?: string;        // e.g. "Fatalities: 0 / Occupants:"
  aircraft_damage?: string;   // None | Minor | Substantial | Destroyed | ...
  location?: string;
  phase?: string;             // e.g. "Landing", "En route", "Take off"
  nature?: string;            // e.g. "Passenger - Scheduled", "Private", "Cargo"
  departure_airport?: string; // e.g. "Mexico City-... (MEX/MMMX)"
  destination_airport?: string;
  narrative?: string;
}

const ASN_PHASE_MAP: Record<string, string> = {
  "pushback / towing": "TAXI", "taxi": "TAXI", "standing": "GROUND",
  "take off": "TAKEOFF", "initial climb": "CLIMB",
  "en route": "CRUISE", "manoeuvring  (airshow, firefighting, ag.ops.)": "CRUISE", "combat": "CRUISE",
  "approach": "APPROACH", "landing": "LANDING", "unknown": "UNKNOWN",
};

// 항공사/상업운항 관련성 있는 nature만 취급 (Private/Training/Military/Agricultural/Test/Survey 등 GA 제외)
const ASN_COMMERCIAL_NATURE = new Set([
  "passenger - scheduled", "passenger - non-scheduled/charter/air taxi", "passenger",
  "cargo", "ferry/positioning", "executive",
]);

function parseAsnAirport(field: string | undefined): { iata: string; icao: string } {
  if (!field) return { iata: "", icao: "" };
  const m = field.match(/\(([A-Z]{3})\/([A-Z]{4})\)/);
  if (m) return { iata: m[1], icao: m[2] };
  const icaoOnly = field.match(/\(([A-Z]{4})\)/);
  if (icaoOnly) return { iata: "", icao: icaoOnly[1] };
  return { iata: "", icao: "" };
}

function parseAsnDate(dateStr: string): string {
  // "Wednesday 1 January 2020" -> strip leading weekday, let Date parse the rest
  const cleaned = dateStr.replace(/^[A-Za-z]+\s+/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

async function upsertAsnEvent(db: D1Database, rec: AsnRecord): Promise<boolean> {
  const natureKey = (rec.nature ?? "").trim().toLowerCase();
  if (!ASN_COMMERCIAL_NATURE.has(natureKey)) return false;

  const idMatch = rec.url.match(/\/(\d+)\/?$/);
  if (!idMatch) return false;
  const eventId = `ASN-${idMatch[1]}`;
  const eventDate = parseAsnDate(rec.date);
  if (!eventDate) return false;

  const fatalMatch = (rec.fatalities ?? "").match(/Fatalities:\s*(\d+)/i);
  const fatal = fatalMatch ? parseInt(fatalMatch[1], 10) : 0;
  const dmgUpper = (rec.aircraft_damage ?? "").toUpperCase();
  const severity = fatal > 0 ? 5 : dmgUpper.includes("DESTROY") ? 4 : dmgUpper.includes("SUBSTANTIAL") ? 3 : 2;

  const dep = parseAsnAirport(rec.departure_airport);
  const dest = parseAsnAirport(rec.destination_airport);
  const phase = ASN_PHASE_MAP[(rec.phase ?? "").trim().toLowerCase()] ?? "";

  const tags: string[] = ["ASN", "PART_121_135_RELEVANT", ...(fatal > 0 ? ["FATAL"] : []), ...(dmgUpper.includes("DESTROY") ? ["AIRCRAFT_DESTROYED"] : dmgUpper.includes("SUBSTANTIAL") ? ["SUBSTANTIAL_DAMAGE"] : [])];
  const summary = (rec.narrative ?? "").trim() || `ASN accident ${idMatch[1]} — ${rec.type ?? "unknown aircraft"} at ${rec.location ?? "unknown location"}.`;
  const timeStr = (rec.time ?? "").match(/^(\d{2}:\d{2})/)?.[1] ?? "";

  return await upsertEventRecord(db, {
    id: eventId, source_name: "ASN (Aviation Safety Network)", source_url: rec.url,
    event_date: eventDate, event_time: timeStr,
    operation_type: rec.nature ?? "",
    airport_iata: dep.iata, airport_icao: dep.icao,
    destination_iata: dest.iata, destination_icao: dest.icao,
    flight_phase: phase,
    aircraft_type: rec.type ?? "",
    aircraft_category: "JET",
    operator: rec.owner_operator ?? "",
    weather_summary: rec.location ?? "",
    event_type: `ACCIDENT - ${rec.aircraft_damage || "Unknown damage"}`,
    severity: severity,
    core_event: `ASN ${idMatch[1]}`,
    lesson_keyword: "ASN Accident",
    summary: summary.slice(0, 4000),
    tags: tags,
    pilot_briefing_sentence: `Review ASN accident ${idMatch[1]} — ${rec.aircraft_damage ?? "unknown damage"}.`,
    confidence_score: 0.6
  });
}

export async function ingestAsnBatch(db: D1Database, records: AsnRecord[]): Promise<{ checked: number; created: number }> {
  let created = 0;
  for (const rec of records) {
    try {
      if (await upsertAsnEvent(db, rec)) created++;
    } catch { /* skip invalid record */ }
  }
  return { checked: records.length, created };
}

// ── EASA Annual Safety Review ─────────────────────────────────────────────────

export interface EasaRecord {
  accidentId: string;  // unique key e.g. "EASA-2024-01"
  occDate: string;     // "YYYY-MM-DD"
  country: string;
  location: string;
  aircraftType: string;
  operationType: string; // "CAT" | "SPECIALISED" | "GA" | "HELICOPTER"
  headline: string;
  fatalCount?: number;
  sourceYear: number;  // which ASR edition it came from
}

async function upsertEasaEvent(db: D1Database, rec: EasaRecord): Promise<boolean> {
  const safe = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const eventId = `EASA-${safe(rec.accidentId)}`;
  const fatal = rec.fatalCount ?? 0;
  const severity = fatal > 0 ? 5 : 3;

  const tags: string[] = ["EASA", "EUROPE", "ACCIDENT", ...(fatal > 0 ? ["FATAL"] : [])];
  if (rec.operationType === "CAT") tags.push("COMMERCIAL_AIR_TRANSPORT", "PART_121_135_RELEVANT");
  if (rec.operationType === "HELICOPTER") tags.push("HELICOPTER");

  const summary = rec.headline.trim() || `EASA fatal accident — ${rec.location}, ${rec.country}`;
  const sourceUrl = `https://www.easa.europa.eu/en/document-library/general-publications/annual-safety-review-${rec.sourceYear}`;

  return await upsertEventRecord(db, {
    id: eventId, source_name: `EASA ASR ${rec.sourceYear}`, source_url: sourceUrl,
    event_date: rec.occDate.slice(0, 10),
    operation_type: rec.operationType === "CAT" ? "Commercial Air Transport" : rec.operationType,
    airport_iata: "", airport_icao: "",
    aircraft_type: rec.aircraftType ?? "",
    aircraft_category: rec.aircraftType.toUpperCase().includes("HELICOPTER") ? "HELICOPTER" : "JET",
    operator: "",
    weather_summary: `${rec.location}, ${rec.country}`,
    event_type: "ACCIDENT",
    severity: severity,
    core_event: "EASA Fatal Accident",
    lesson_keyword: "EASA Annual Safety Review",
    summary: summary,
    tags: tags,
    pilot_briefing_sentence: `${rec.country} fatal accident — ${rec.aircraftType}. ${rec.headline}`.slice(0, 200),
    confidence_score: 0.7
  });
}

export async function ingestEasaBatch(db: D1Database, records: EasaRecord[]): Promise<{ checked: number; created: number }> {
  let created = 0;
  for (const rec of records) {
    try {
      if (await upsertEasaEvent(db, rec)) created++;
    } catch { /* skip */ }
  }
  return { checked: records.length, created };
}
