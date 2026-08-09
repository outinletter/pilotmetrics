import { unzipSync } from "fflate";
import { airportUtcOffset } from "../data/airport_hazards";

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
  "kansas city,missouri": ["MCI","KMCI"], "st. louis,missouri": ["STL","KSTL"],
  "cleveland,ohio": ["CLE","KCLE"], "columbus,ohio": ["CMH","KCMH"],
  "indianapolis,indiana": ["IND","KIND"],
  "louisville,kentucky": ["SDF","KSDF"],
  "new orleans,louisiana": ["MSY","KMSY"],
  "albuquerque,new mexico": ["ABQ","KABQ"],
  "phoenix,arizona": ["PHX","KPHX"], "tucson,arizona": ["TUS","KTUS"],
  "salt lake city,utah": ["SLC","KSLC"],
  "reno,nevada": ["RNO","KRNO"], "boulder city,nevada": ["BLD","KBVU"],
  "spokane,washington": ["GEG","KGEG"],
  "dulles,virginia": ["IAD","KIAD"],
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

// narrative 또는 runway 텍스트에서 ICAO/IATA 코드 추출
// 후보 목록이 주어지면 그 중에서만 반환 (다중 공항 도시 disambiguation)
function extractAirportFromText(text: string, candidates?: string[]): [string, string] {
  if (!text) return ["", ""];

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
  const [airportIata, airportIcao] = airportForLocation(row.city, row.state, row.country);
  const rawId = `FAA-LL-${row.dateText.replace(/\//g, "-")}-${row.operator}-${row.flight}`.toUpperCase();
  const eventId = rawId.replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const existing = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first<{ id: string }>();
  const makeModel = `${row.make} ${row.model}`.trim();
  const now = new Date().toISOString();
  const tags = ["FAA","OFFICIAL_LESSON","PART_121_135_RELEVANT"];
  if (!existing) {
    await db.prepare("INSERT INTO events (id,source_name,source_url,event_date,operation_type,airport_iata,airport_icao,runway,approach_type,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,event_type,severity,core_event,lesson_keyword,summary,contributing_factors,operational_lessons,pilot_briefing_sentence,confidence_score,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(eventId,"FAA Transport Airplane Lessons Learned",row.url,row.eventDate.toISOString().slice(0,10),"Part 121 / Part 135 official lesson candidate",airportIata,airportIcao,"",airportIcao ? "VISUAL" : "ENROUTE",airportIcao ? "APPROACH" : "CRUISE",makeModel,"JET",row.operator,`${row.city}, ${row.state || row.country}`.replace(/, $/,""),"FAA LESSONS LEARNED CASE",3,`${row.operator} ${row.flight} official lesson`,"Official FAA Lesson",`FAA Lessons Learned case for ${row.operator} flight ${row.flight} near ${row.city}, ${row.state || row.country} on ${row.dateText}.`,JSON.stringify([]),JSON.stringify([]),`Review FAA lesson for ${row.city || "the destination"} before approach or enroute decision gates.`,0.7,now,now).run();
    for (const tag of tags) await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(eventId,"risk",tag).run();
    return true;
  }
  return false;
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
    const eventId = `NTSB-${ntsbNum}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const existing = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first<{ id: string }>();
    if (!existing) {
      const eventDateRaw = String(c.cm_eventDate ?? "");
      const eventDate = eventDateRaw.slice(0, 10);
      // 시각 추출 (cm_eventDate: "2024-03-15T14:30:00Z")
      const eventTimeUtc = eventDateRaw.length >= 16 ? eventDateRaw.slice(11, 16) : "";

      const city = String(c.cm_city ?? "");
      const state = String(c.cm_state ?? "");
      const country = String(c.cm_country ?? "");
      const highestInjury = String(c.cm_highestInjury ?? "").toUpperCase();
      const fatal = Number(c.cm_fatalInjuryCount ?? 0);

      const makeModel = vehicles.map(v => `${v.cm_make ?? v.make ?? ""} ${v.cm_model ?? v.model ?? ""}`.trim()).find(Boolean) ?? "";
      const operator = vehicles.map(v => String(v.operatorName ?? v.registeredOwner ?? "")).find(Boolean) ?? "";

      // 비행단계 + SOE 이벤트 분류
      const flightPhase = vehicles.flatMap(v =>
        (v.cm_events as Record<string, unknown>[] ?? []).map(e => NTSB_PHASE_MAP[String(e.cicttPhaseSOEGroup ?? "").toLowerCase()] ?? "")
      ).find(Boolean) ?? "";
      const soeGroups = vehicles.flatMap(v =>
        (v.cm_events as Record<string, unknown>[] ?? []).flatMap(e => [
          String(e.cm_tier1Name ?? ""), String(e.cm_tier2Name ?? ""), String(e.cicttEventSOEGroup ?? "")
        ])
      ).filter(Boolean);

      // 피해 규모 (vehicles[].DamageLevel)
      const damageLevel = vehicles.map(v => String(v.DamageLevel ?? v.damageLevel ?? "")).find(s => s && s !== "None") ?? "";

      // 운항 정보
      const flightOperationType = vehicles.map(v => String(v.flightOperationType ?? "")).find(Boolean) ?? "";
      const flightScheduledType = vehicles.map(v => String(v.flightScheduledType ?? "")).find(Boolean) ?? "";
      const secondPilotPresent = vehicles.some(v => v.secondPilotPresent === true || v.secondPilotPresent === "true" || v.secondPilotPresent === 1);

      // 기상 조건 (VMC/IMC)
      const siteCondition = String(c.accidentSiteCondition ?? "");

      // 풍부한 서술 텍스트 우선 사용
      const narrative = String(c.prelimNarrative ?? c.cm_probableCause ?? "").trim();

      // 위치 기반 요약
      const locationStr = [city, state, country].filter(Boolean).join(", ");

      // 자동 요약 생성
      const autoSummary = narrative ||
        `NTSB case ${ntsbNum} near ${city || "unspecified"}${state ? `, ${state}` : ""}. Highest injury: ${highestInjury || "unknown"}.${damageLevel ? ` Aircraft damage: ${damageLevel}.` : ""}${siteCondition ? ` Conditions: ${siteCondition}.` : ""}${eventTimeUtc ? ` Event time: ${eventTimeUtc}Z.` : ""}`;

      const severity = fatal > 0 ? 5 : highestInjury.includes("SERIOUS") ? 4 : highestInjury.includes("MINOR") ? 3 : 2;

      // 공항코드: CAROL의 airportId/cm_apt 우선, 없으면 도시→공항 매핑
      const aptRaw = String(c.airportId ?? c.cm_apt ?? c.cm_aptId ?? c.cm_airport ?? "").trim().toUpperCase();
      let airportIata = "", airportIcao = "";
      if (/^[A-Z]{4}$/.test(aptRaw)) { airportIcao = aptRaw; }
      else if (/^[A-Z]{3}$/.test(aptRaw)) { airportIata = aptRaw; }
      else {
        // 다중 공항 도시 disambiguation: narrative + 공항명 텍스트에서 구체 공항 재추출
        const aptNameHint = String(c.airportName ?? c.cm_airportName ?? aptRaw ?? "");
        [airportIata, airportIcao] = airportForLocation(city, state, country, `${narrative} ${aptNameHint}`, "");
      }

      // 이벤트 유형: SOE > 기본값
      const eventType = soeGroups.filter(s => s.length > 2).slice(0, 3).join(" / ") || "NTSB CASE";

      // 운항 유형 레이블
      const operationType = [
        "Part 121 air transport (NTSB CAROL)",
        flightScheduledType === "SCHD" ? "scheduled" : flightScheduledType === "NSCH" ? "non-scheduled" : "",
        flightOperationType,
      ].filter(Boolean).join(" · ");

      const now = new Date().toISOString();
      await db.prepare("INSERT INTO events (id,source_name,source_url,event_date,event_time,operation_type,airport_iata,airport_icao,runway,approach_type,flight_conditions,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,event_type,severity,core_event,lesson_keyword,summary,contributing_factors,operational_lessons,pilot_briefing_sentence,confidence_score,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(
          eventId, "NTSB CAROL",
          `https://data.ntsb.gov/carol-main-public/basic-search?NTSBNumber=${ntsbNum}`,
          eventDate, eventTimeUtc || null, operationType,
          airportIata, airportIcao,
          "",
          null,            // approach_type: ILS/RNAV/VISUAL — CAROL에서 미제공
          siteCondition || null,  // flight_conditions: VMC/IMC
          flightPhase, makeModel, "JET", operator,
          null,            // weather_summary: METAR 백필 후 채워짐
          eventType,
          severity,
          `NTSB ${ntsbNum}`,
          "NTSB Case",
          autoSummary,
          JSON.stringify([]),
          JSON.stringify([]),
          `Review NTSB case ${ntsbNum} — ${eventType}. ${siteCondition ? `Conditions: ${siteCondition}.` : "CAROL summary only."}`,
          0.5, now, now
        ).run();

      // 태그: 기본 + 상세 분류 + 조건
      const extraTags: string[] = [
        ...(fatal > 0 ? ["FATAL"] : []),
        ...(damageLevel === "Destroyed" ? ["AIRCRAFT_DESTROYED"] : damageLevel === "Substantial" ? ["SUBSTANTIAL_DAMAGE"] : []),
        ...(siteCondition === "IMC" ? ["IMC"] : siteCondition === "VMC" ? ["VMC"] : []),
        ...(secondPilotPresent ? [] : ["SINGLE_PILOT"]),
        ...(eventTimeUtc ? (() => {
          const utcHour = parseInt(eventTimeUtc.slice(0, 2));
          // 공항 ICAO로 로컬 시간 계산, 없으면 UTC 그대로
          // AIRPORT_HAZARDS는 ICAO 키만 지원 — IATA fallback은 항상 0 반환하므로 제거
          const eventAt = eventDateRaw ? new Date(eventDateRaw) : undefined;
          const offset = airportIcao ? airportUtcOffset(airportIcao, eventAt) : 0;
          const localHour = ((utcHour + offset) % 24 + 24) % 24;
          return [localHour >= 22 || localHour < 6 ? "NIGHT_EVENT" : "DAY_EVENT"];
        })() : []),
      ];
      for (const tag of ["NTSB", "carol_case", "official_report_candidate", ...extraTags]) {
        await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(eventId, "risk", tag).run();
      }
      return true;
    }
    return false;
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

  const [ntsb, faa, asrs, aaib, skybrary, ...rssResults] = await Promise.allSettled([
    parseNtsbCarol(db, yearsBack),
    parseFaaTransportLibrary(db, yearsBack),
    parseAsrsReportSets(db),
    parseAaib(db, cutoff),
    parseSkybrary(db, cutoff),
    ...RSS_SOURCES.map(src => parseRssFeed(db, src, cutoff)),
  ]);

  const r = (p: PromiseSettledResult<Record<string, unknown>>) =>
    p.status === "fulfilled" ? p.value : { checked: 0, created: 0, error: String((p as PromiseRejectedResult).reason) };

  const srcResults: Record<string, unknown> = {
    ntsb: r(ntsb), faa: r(faa), asrs: r(asrs),
    aaib: r(aaib), skybrary: r(skybrary),
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
  const existing = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first<{ id: string }>();
  if (existing) return false;

  const fatal = rec.fatalCount ?? 0;
  const serious = rec.seriousCount ?? 0;
  const occUpper = (rec.occType ?? "").toUpperCase();
  const severity = fatal > 0 ? 5 : occUpper.includes("ACCIDENT") ? (serious > 0 ? 4 : 3) : 2;

  const rawIcao = (rec.icao ?? "").trim().toUpperCase();
  let airportIcao = "", airportIata = "";
  if (/^[A-Z]{4}$/.test(rawIcao)) {
    airportIcao = rawIcao;
  } else if (/^[A-Z]{3}$/.test(rawIcao)) {
    airportIata = rawIcao;
    const [, icao] = airportForLocation("", "", "");
    airportIcao = icao;
  }
  if (!airportIcao && !airportIata && rec.province && rec.country) {
    [airportIata, airportIcao] = airportForLocation("", rec.province, rec.country);
  }

  const year = rec.occDate.slice(0, 4);
  const sourceUrl = `https://www.tsb.gc.ca/eng/rapports-reports/aviation/${year}/index.html`;
  const summary = (rec.summary ?? rec.commonName ?? `TSB Canada occurrence ${rec.occNo}`).trim();

  const tags: string[] = ["TSB_CANADA", "PART_121_135_RELEVANT"];
  if (fatal > 0) tags.push("FATAL");
  const dmgUpper = (rec.damageLevel ?? "").toUpperCase();
  if (dmgUpper.includes("DESTRO")) tags.push("AIRCRAFT_DESTROYED");
  else if (dmgUpper.includes("SUBSTANTIAL")) tags.push("SUBSTANTIAL_DAMAGE");
  const lightUpper = (rec.lightCond ?? "").toUpperCase();
  if (lightUpper.includes("NIGHT") || lightUpper.includes("DARK")) tags.push("NIGHT_EVENT");
  else if (lightUpper.includes("DAY") || lightUpper.includes("DAWN") || lightUpper.includes("DUSK")) tags.push("DAY_EVENT");
  if (occUpper.includes("ACCIDENT")) tags.push("ACCIDENT"); else tags.push("INCIDENT");

  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO events (id,source_name,source_url,event_date,operation_type,airport_iata,airport_icao,runway,approach_type,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,event_type,severity,core_event,lesson_keyword,summary,contributing_factors,operational_lessons,pilot_briefing_sentence,confidence_score,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      eventId, "TSB Canada", sourceUrl,
      rec.occDate.slice(0, 10),
      rec.carsSubpart || rec.operationType || "Commercial aviation",
      airportIata, airportIcao,
      "", "",
      rec.flightPhase ?? "",
      rec.aircraftType ?? "",
      "JET",
      rec.operator ?? "",
      [rec.province, rec.country].filter(Boolean).join(", "),
      `${rec.occType}${rec.occClass ? ` - ${rec.occClass}` : ""}`,
      severity,
      `TSB ${rec.occNo}`,
      "TSB Canada Occurrence",
      summary,
      JSON.stringify([]), JSON.stringify([]),
      `Review TSB Canada occurrence ${rec.occNo} — ${rec.occType}.${rec.flightNo ? ` Flight: ${rec.flightNo}.` : ""}`,
      0.6, now, now
    ).run();

  for (const tag of tags) {
    await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(eventId, "risk", tag).run();
  }
  return true;
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
  const existing = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first<{ id: string }>();
  if (existing) return false;

  const fatal = rec.fatalCount ?? 0;
  const severity = fatal > 0 ? 5 : 3;

  const tags: string[] = ["EASA", "EUROPE", "ACCIDENT"];
  if (fatal > 0) tags.push("FATAL");
  if (rec.operationType === "CAT") tags.push("COMMERCIAL_AIR_TRANSPORT", "PART_121_135_RELEVANT");
  if (rec.operationType === "HELICOPTER") tags.push("HELICOPTER");

  const summary = rec.headline.trim() || `EASA fatal accident — ${rec.location}, ${rec.country}`;
  const sourceUrl = `https://www.easa.europa.eu/en/document-library/general-publications/annual-safety-review-${rec.sourceYear}`;
  const now = new Date().toISOString();

  await db.prepare(`INSERT INTO events (id,source_name,source_url,event_date,operation_type,airport_iata,airport_icao,runway,approach_type,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,event_type,severity,core_event,lesson_keyword,summary,contributing_factors,operational_lessons,pilot_briefing_sentence,confidence_score,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      eventId, `EASA ASR ${rec.sourceYear}`, sourceUrl,
      rec.occDate.slice(0, 10),
      rec.operationType === "CAT" ? "Commercial Air Transport" : rec.operationType,
      "", "",
      "", "",
      "",
      rec.aircraftType ?? "",
      rec.aircraftType.toUpperCase().includes("HELICOPTER") ? "HELICOPTER" : "JET",
      "",
      `${rec.location}, ${rec.country}`,
      "ACCIDENT",
      severity,
      "EASA Fatal Accident",
      "EASA Annual Safety Review",
      summary,
      JSON.stringify([]), JSON.stringify([]),
      `${rec.country} fatal accident — ${rec.aircraftType}. ${rec.headline}`.slice(0, 200),
      0.7, now, now
    ).run();

  for (const tag of tags) {
    await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(eventId, "risk", tag).run();
  }
  return true;
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
