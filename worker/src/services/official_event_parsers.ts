import { unzipSync } from "fflate";

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
  // 알래스카/하와이
  "anchorage,alaska": ["ANC","PANC"],
  "honolulu,hawaii": ["HNL","PHNL"],
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

function airportForLocation(city: string, state: string, country: string): [string, string] {
  const c = city.toLowerCase().trim();
  const s = state.toLowerCase().trim();
  const cn = country.toLowerCase().trim();
  // 1순위: IATA 코드 직접 입력된 경우 (city가 3자 대문자)
  if (/^[A-Z]{3}$/.test(city)) return [city, ""];
  if (/^[A-Z]{4}$/.test(city)) return ["", city];
  // 2순위: 미국 도시
  if (!cn || cn === "united states" || cn === "us" || cn === "usa") {
    const hit = US_CITY_AIRPORTS[`${c},${s}`];
    if (hit) return hit;
    // 주만으로 폴백 (state가 공항 코드인 경우)
  }
  // 3순위: 국제 도시
  const intlHit = INTL_CITY_AIRPORTS[`${c},${cn}`] ?? INTL_CITY_AIRPORTS[`${c},${s}`];
  if (intlHit) return intlHit;
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
      const eventDate = String(c.cm_eventDate ?? "").slice(0, 10);
      const city = String(c.cm_city ?? "");
      const state = String(c.cm_state ?? "");
      const country = String(c.cm_country ?? "");
      const highestInjury = String(c.cm_highestInjury ?? "").toUpperCase();
      const fatal = Number(c.cm_fatalInjuryCount ?? 0);
      const makeModel = vehicles.map(v => `${v.cm_make ?? v.make ?? ""} ${v.cm_model ?? v.model ?? ""}`.trim()).find(Boolean) ?? "";
      const flightPhase = vehicles.flatMap(v => (v.cm_events as Record<string, unknown>[] ?? []).map(e => NTSB_PHASE_MAP[String(e.cicttPhaseSOEGroup ?? "").toLowerCase()] ?? "")).find(Boolean) ?? "";
      const operator = vehicles.map(v => String(v.operatorName ?? v.registeredOwner ?? "")).find(Boolean) ?? "";
      const severity = fatal > 0 ? 5 : highestInjury.includes("SERIOUS") ? 4 : highestInjury.includes("MINOR") ? 3 : 2;
      // 공항코드: CAROL의 cm_apt 우선, 없으면 도시→공항 매핑
      const aptRaw = String(c.cm_apt ?? c.cm_aptId ?? c.cm_airport ?? "").trim().toUpperCase();
      let airportIata = "", airportIcao = "";
      if (/^[A-Z]{4}$/.test(aptRaw)) { airportIcao = aptRaw; }
      else if (/^[A-Z]{3}$/.test(aptRaw)) { airportIata = aptRaw; }
      else { [airportIata, airportIcao] = airportForLocation(city, state, country); }
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO events (id,source_name,source_url,event_date,operation_type,airport_iata,airport_icao,runway,approach_type,flight_phase,aircraft_type,aircraft_category,operator,weather_summary,event_type,severity,core_event,lesson_keyword,summary,contributing_factors,operational_lessons,pilot_briefing_sentence,confidence_score,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(eventId,"NTSB CAROL",`https://data.ntsb.gov/carol-main-public/basic-search?NTSBNumber=${ntsbNum}`,eventDate,"Part 121 air transport (NTSB CAROL)",airportIata,airportIcao,"","",flightPhase,makeModel,"JET",operator,[city,state,country].filter(Boolean).join(", "),"NTSB CASE",severity,`NTSB ${ntsbNum}`,"NTSB Case",`NTSB case ${ntsbNum} near ${city || "unspecified"}${state ? `, ${state}` : ""}. Highest injury: ${highestInjury || "unknown"}.`,JSON.stringify([]),JSON.stringify([]),`Review NTSB case ${ntsbNum} in full — this record carries only CAROL summary fields.`,0.5,now,now).run();
      for (const tag of ["NTSB","carol_case","official_report_candidate",...(fatal > 0 ? ["FATAL"] : [])]) {
        await db.prepare("INSERT INTO event_tags (event_id,tag_type,tag_value) VALUES (?,?,?)").bind(eventId,"risk",tag).run();
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

// ── 기존 이벤트 공항코드 백필 ──────────────────────────────────────────────────
// weather_summary(도시명) 컬럼을 파싱해서 airport_iata/airport_icao 업데이트
export async function backfillAirportCodes(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare(
    "SELECT id, weather_summary, airport_iata, airport_icao FROM events WHERE (airport_icao IS NULL OR airport_icao = '') AND weather_summary IS NOT NULL AND weather_summary != ''"
  ).all<{ id: string; weather_summary: string; airport_iata: string; airport_icao: string }>();

  let updated = 0;
  const skipped: string[] = [];

  for (const row of results) {
    // weather_summary 형식: "City, State" or "City, Country" or "City, State, Country"
    const parts = row.weather_summary.split(",").map(s => s.trim());
    const city = parts[0] ?? "";
    const state = parts[1] ?? "";
    const country = parts[2] ?? parts[1] ?? "";

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

export async function collectRecentOfficialEvents(db: D1Database, yearsBack = 20): Promise<Record<string, unknown>> {
  const [ntsb, faa, asrs] = await Promise.allSettled([
    parseNtsbCarol(db, yearsBack),
    parseFaaTransportLibrary(db, yearsBack),
    parseAsrsReportSets(db),
  ]);
  const r = (p: PromiseSettledResult<Record<string, unknown>>) => p.status === "fulfilled" ? p.value : { checked: 0, created: 0, error: String((p as PromiseRejectedResult).reason) };
  const ntsbR = r(ntsb), faaR = r(faa), asrsR = r(asrs);
  return {
    status: "complete", years_back: yearsBack,
    sources: { ntsb: ntsbR, faa: faaR, asrs: asrsR },
    items_checked: ((ntsbR.checked ?? 0) as number) + ((faaR.checked ?? 0) as number) + ((asrsR.checked ?? 0) as number),
    items_saved: ((ntsbR.created ?? 0) as number) + ((faaR.created ?? 0) as number) + ((asrsR.created ?? 0) as number),
  };
}
