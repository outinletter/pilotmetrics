import io
import json
import re
import zipfile
from datetime import datetime, timedelta
from html import unescape
from urllib.parse import parse_qs, urljoin, urlparse

import httpx

from ..database import SessionLocal
from ..models import Event, EventTag, OpsIntelItem

# NOTE: the classic NTSB_MONTHLY_URL page no longer lists year/month links
# (NTSB replaced it with a Power BI dashboard), so parse_ntsb_monthly() below
# is dead code kept only for reference. Live collection goes through the
# public CAROL FileExport endpoint instead (see parse_ntsb_carol()).
NTSB_MONTHLY_URL = "https://www.ntsb.gov/Pages/monthly.aspx"
NTSB_CAROL_FILE_EXPORT_URL = "https://data.ntsb.gov/carol-main-public/api/Query/FileExport"
FAA_TRANSPORT_LIBRARY_URL = "https://www.faa.gov/lessonslearned/transportairplane/accidents/transport-airplane-lessons-learned-library"
ASRS_REPORTSETS_URL = "https://asrs.arc.nasa.gov/search/reportsets.html"

ASRS_RELEVANT_KEYWORDS = [
    "far 121", "air carrier", "commuter", "corporate", "fatigue", "smoke", "fire",
    "fumes", "crm", "fuel", "gps", "weather", "maintenance", "turbojet", "rnav",
    "runway", "wake turbulence", "flight attendant",
]

MONTH_NAMES = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}

US_CITY_AIRPORTS = {
    ("boston", "massachusetts"): ("BOS", "KBOS"),
    ("chicago", "illinois"): ("ORD", "KORD"),
    ("honolulu", "hawaii"): ("HNL", "PHNL"),
    ("jamaica", "new york"): ("JFK", "KJFK"),
    ("los angeles", "california"): ("LAX", "KLAX"),
    ("new york", "new york"): ("JFK", "KJFK"),
    ("san francisco", "california"): ("SFO", "KSFO"),
    ("seattle", "washington"): ("SEA", "KSEA"),
    ("washington", "d.c."): ("DCA", "KDCA"),
    ("atlanta", "georgia"): ("ATL", "KATL"),
    ("dallas", "texas"): ("DFW", "KDFW"),
    ("denver", "colorado"): ("DEN", "KDEN"),
    ("detroit", "michigan"): ("DTW", "KDTW"),
    ("houston", "texas"): ("IAH", "KIAH"),
    ("miami", "florida"): ("MIA", "KMIA"),
    ("newark", "new jersey"): ("EWR", "KEWR"),
    ("orlando", "florida"): ("MCO", "KMCO"),
    ("philadelphia", "pennsylvania"): ("PHL", "KPHL"),
    ("phoenix", "arizona"): ("PHX", "KPHX"),
    ("anchorage", "alaska"): ("ANC", "PANC"),
    ("guam", "guam"): ("GUM", "PGUM"),
}

# International city/country lookups, for FAA lessons-learned cases outside the US.
INTL_CITY_AIRPORTS = {
    ("seoul", "south korea"): ("ICN", "RKSI"),
    ("seoul", "korea"): ("ICN", "RKSI"),
    ("tokyo", "japan"): ("HND", "RJTT"),
    ("narita", "japan"): ("NRT", "RJAA"),
    ("hong kong", "hong kong"): ("HKG", "VHHH"),
    ("singapore", "singapore"): ("SIN", "WSSS"),
    ("bangkok", "thailand"): ("BKK", "VTBS"),
    ("manila", "philippines"): ("MNL", "RPLL"),
    ("london", "united kingdom"): ("LHR", "EGLL"),
    ("london", "england"): ("LHR", "EGLL"),
    ("paris", "france"): ("CDG", "LFPG"),
    ("dubai", "united arab emirates"): ("DXB", "OMDB"),
    ("denpasar", "indonesia"): ("DPS", "WADD"),
    ("bali", "indonesia"): ("DPS", "WADD"),
}


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def cutoff_date(years_back: int) -> datetime:
    return datetime.utcnow() - timedelta(days=years_back * 365)


def parse_date(text: str) -> datetime | None:
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue
    return None


def category_for_title(title: str) -> str:
    text = title.lower()
    if any(word in text for word in ["fatigue", "crm", "flight crew", "flight attendant"]):
        return "Human Factors / CRM"
    if any(word in text for word in ["gps", "runway", "weather", "fuel", "rnav", "wake"]):
        return "Flight Operations"
    if any(word in text for word in ["maintenance", "fumes", "smoke", "fire", "turbojet"]):
        return "Accident / Incident"
    return "Accident / Incident"


def airport_for_location(city: str, state: str, country: str) -> tuple[str, str]:
    if country.lower() == "united states":
        return US_CITY_AIRPORTS.get((city.lower(), state.lower()), ("", ""))
    return INTL_CITY_AIRPORTS.get((city.lower(), country.lower()), ("", ""))


def aircraft_category(make: str, model: str) -> str:
    text = f"{make} {model}".upper()
    if any(token in text for token in ["BOEING", "AIRBUS", "DC-", "MD-", "L-1011", "A3", "B7"]):
        return "JET"
    return "TRANSPORT"


def faa_tags_for_row(city: str, state: str, model: str) -> list[str]:
    tags = ["FAA", "OFFICIAL_LESSON", "PART_121_135_RELEVANT"]
    location = f"{city} {state}".lower()
    model_text = model.upper()
    if "jamaica" in location or "new york" in location:
        tags.extend(["CONVECTIVE_WEATHER", "WINDSHEAR", "UNSTABLE_APPROACH_RISK"])
    elif "chicago" in location:
        tags.extend(["WET_RWY", "TAILWIND"])
    elif "honolulu" in location:
        tags.extend(["ETOPS", "LONG_HAUL"])
    elif "los angeles" in location:
        tags.extend(["RUNWAY_INCIDENT", "UNSTABLE_APPROACH_RISK"])
    if any(widebody in model_text for widebody in ["747", "777", "787", "A330", "A340", "A350", "A380", "DC-10", "MD-11"]):
        tags.append("WIDEBODY")
    return list(dict.fromkeys(tags))


def faa_factor_lesson_profile(city: str, state: str) -> tuple[list[str], list[str], str]:
    location = f"{city} {state}".lower()
    if "jamaica" in location or "new york" in location:
        return (
            ["Terminal-area weather exposure", "High-density arrival/departure environment", "Large transport aircraft energy management"],
            ["Brief JFK/New York terminal weather and escape options early", "Monitor vertical and lateral path continuously in the terminal area", "Use conservative go-around or diversion gates when margins reduce"],
            "For JFK/New York operations, treat terminal weather, traffic density, and long-haul fatigue as combined threats requiring early decision gates.",
        )
    if "los angeles" in location:
        return (
            ["Complex runway environment", "High traffic density", "Runway incursion or continuation-bias exposure"],
            ["Review runway assignment, crossing restrictions, and rejected-landing triggers", "Maintain strict external and instrument crosscheck", "Confirm stop/go decision gates before final or takeoff"],
            "For LAX operations, emphasize runway awareness, stabilized final criteria, and early go-around decision making.",
        )
    if "chicago" in location:
        return (
            ["Adverse runway condition potential", "Winter or wet runway performance margin", "Tailwind or braking action uncertainty"],
            ["Recompute landing performance with current runway condition", "Brief autobrake, reverse, and touchdown-zone limits", "Use conservative diversion or delay decisions when braking margin is uncertain"],
            "For Chicago operations, treat runway condition and stopping margin as primary threats whenever weather deteriorates.",
        )
    if "honolulu" in location:
        return (
            ["Long overwater route exposure", "ETOPS and diversion planning dependency", "Limited enroute alternates"],
            ["Review fuel decision points and alternates before oceanic commitment", "Keep dispatch and maintenance control in the loop early", "Reassess destination and alternate weather trends before descent"],
            "For Honolulu/Pacific operations, brief ETOPS, fuel margin, and diversion gates before committing beyond suitable alternates.",
        )
    return (
        ["Official transport-airplane accident case", "Comparable large-aircraft operation", "Airport or route-specific threat requires review"],
        ["Read the FAA lesson page for the specific scenario", "Extract applicable crew, weather, dispatch, and aircraft-system decision points", "Convert applicable findings into the departure, enroute, or arrival TEM brief"],
        f"For comparable operations near {city or 'the destination'}, review the FAA lesson and brief applicable threats before approach or enroute decision gates.",
    )


def upsert_faa_event(db, row: dict) -> bool:
    city = row["city"]
    state = row["state"]
    country = row["country"]
    airport_iata, airport_icao = airport_for_location(city, state, country)
    event_id = f"FAA-LL-{row['date_text'].replace('/', '-')}-{row['operator']}-{row['flight']}".upper()
    event_id = re.sub(r"[^A-Z0-9-]+", "-", event_id).strip("-")
    item = db.get(Event, event_id)
    created = False
    if not item:
        item = Event(id=event_id)
        db.add(item)
        created = True
    make_model = f"{row['make']} {row['model']}".strip()
    item.source_name = "FAA Transport Airplane Lessons Learned"
    item.source_url = row["url"]
    item.event_date = row["event_date"].strftime("%Y-%m-%d")
    item.operation_type = "Part 121 / Part 135 official lesson candidate"
    item.airport_iata = airport_iata
    item.airport_icao = airport_icao
    item.runway = ""
    item.approach_type = "ENROUTE" if not airport_icao else "VISUAL"
    item.flight_phase = "CRUISE" if not airport_icao else "APPROACH"
    item.aircraft_type = make_model
    item.aircraft_category = aircraft_category(row["make"], row["model"])
    item.operator = row["operator"]
    item.weather_summary = f"{city}, {state or country}".strip(", ")
    item.runway_condition = ""
    item.event_type = "FAA LESSONS LEARNED CASE"
    item.severity = 3
    item.core_event = f"{row['operator']} {row['flight']} official lesson"
    item.lesson_keyword = "Official FAA Lesson"
    item.summary = (
        f"FAA Lessons Learned case for {row['operator']} flight {row['flight']} near "
        f"{city}, {state or country} on {row['date_text']}."
    )
    factors, lessons, briefing_sentence = faa_factor_lesson_profile(city, state)
    item.contributing_factors = json.dumps(factors)
    item.operational_lessons = json.dumps(lessons)
    item.pilot_briefing_sentence = briefing_sentence
    item.confidence_score = 0.7
    db.query(EventTag).filter(EventTag.event_id == event_id).delete()
    for tag in faa_tags_for_row(city, state, row["model"]):
        db.add(EventTag(event_id=event_id, tag_type="risk", tag_value=tag))
    return created


def official_summary(source_name: str, title: str, note: str) -> str:
    return f"{title}. Official source: {source_name}. {note}"


def upsert_official_item(
    db,
    *,
    source_name: str,
    source_url: str,
    title: str,
    category: str,
    severity: str,
    summary: str,
    tags: list[str],
) -> bool:
    item = db.query(OpsIntelItem).filter(OpsIntelItem.source_url == source_url).first()
    created = False
    if not item:
        item = OpsIntelItem(source_name=source_name, source_url=source_url)
        db.add(item)
        created = True
    item.title = title
    item.category = category
    item.severity = severity
    item.summary = summary
    item.operation_type = "Part 121 / Part 135"
    item.operational_lesson = "Screen this official item for Part 121/135 operational precursors, crew decision points, dispatch implications, and training value."
    item.a350_b787_applicability = "Review for long-haul widebody relevance, including ETOPS, fatigue, weather, navigation, maintenance control, and arrival/approach threat management."
    item.recommended_action = "Verify report details from the official source, classify Part 121/135 applicability, then extract briefing-ready lessons without inferring cause beyond the source."
    item.tags = json.dumps(list(dict.fromkeys(tags)))
    item.last_status = 200
    item.last_checked_at = datetime.utcnow()
    item.updated_at = datetime.utcnow()
    return created


async def parse_ntsb_monthly(client: httpx.AsyncClient, db, years_back: int) -> dict:
    response = await client.get(NTSB_MONTHLY_URL)
    response.raise_for_status()
    cutoff = cutoff_date(years_back)
    created = 0
    checked = 0
    seen = set()
    for match in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>', response.text, re.IGNORECASE):
        href = unescape(match.group(1))
        parsed = urlparse(href)
        query = parse_qs(parsed.query)
        try:
            year = int(query.get("year", [""])[0])
            month = int(query.get("month", [""])[0])
        except ValueError:
            continue
        if not (1 <= month <= 12):
            continue
        event_month = datetime(year, month, 1)
        if event_month < datetime(cutoff.year, cutoff.month, 1):
            continue
        url = urljoin(NTSB_MONTHLY_URL, href)
        if url in seen:
            continue
        seen.add(url)
        checked += 1
        title = f"NTSB Aviation Accident Synopses - {year} {MONTH_NAMES[month]}"
        if upsert_official_item(
            db,
            source_name="NTSB Monthly Aviation Accident Synopses",
            source_url=url,
            title=title,
            category="Accident / Incident",
            severity="Medium",
            summary=official_summary(
                "NTSB",
                title,
                "Monthly aviation accident synopses are saved as official recent-7-year candidates and still require Part 121/135 applicability screening.",
            ),
            tags=["NTSB", "recent_7_years", "ntsb_monthly_synopsis", "official_report_candidate", "part_121_135_screening_required"],
        ):
            created += 1
    return {"checked": checked, "created": created}


def _carol_date_range_payload(start_date: str, end_date: str, mode: str = "Aviation") -> dict:
    """Reverse-engineered from the CAROL web UI's FileExport request.
    Source: https://github.com/Amineharrabi/NTSB_api (unofficial, but hits the
    public data.ntsb.gov endpoint directly with no auth)."""
    event_date_option = {
        "FieldName": "EventDate",
        "DisplayText": "Event date",
        "Columns": ["Event.EventDate"],
        "Selectable": True,
        "InputType": "Date",
        "RuleType": 0,
        "Options": None,
        "TargetCollection": "cases",
        "UnderDevelopment": True,
    }
    return {
        "QueryGroups": [
            {
                "QueryRules": [
                    {
                        "RuleType": "Simple",
                        "Values": [start_date],
                        "Columns": ["Event.EventDate"],
                        "Operator": "is on or after",
                        "overrideColumn": "",
                        "selectedOption": event_date_option,
                    },
                    {
                        "RuleType": "Simple",
                        "Values": [end_date],
                        "Columns": ["Event.EventDate"],
                        "Operator": "is on or before",
                        "overrideColumn": "",
                        "selectedOption": event_date_option,
                    },
                    {
                        "RuleType": "Simple",
                        "Values": [mode],
                        "Columns": ["Event.Mode"],
                        "Operator": "is",
                        "overrideColumn": "",
                        "selectedOption": {
                            "FieldName": "Mode",
                            "DisplayText": "Investigation mode",
                            "Columns": ["Event.Mode"],
                            "Selectable": True,
                            "InputType": "Dropdown",
                            "RuleType": 0,
                            "Options": None,
                            "TargetCollection": "cases",
                            "UnderDevelopment": True,
                        },
                    },
                ],
                "AndOr": "and",
                "inLastSearch": False,
                "editedSinceLastSearch": False,
            }
        ],
        "AndOr": "and",
        "TargetCollection": "cases",
        "ExportFormat": "data",
        "SessionId": 227230,
        "ResultSetSize": 500,
        "SortDescending": True,
    }


async def fetch_ntsb_carol_cases(client: httpx.AsyncClient, start_date: str, end_date: str) -> list:
    payload = _carol_date_range_payload(start_date, end_date)
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/json",
        "Origin": "https://data.ntsb.gov",
    }
    response = await client.post(NTSB_CAROL_FILE_EXPORT_URL, json=payload, headers=headers, timeout=60)
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        json_names = [name for name in archive.namelist() if name.endswith(".json")]
        if not json_names:
            return []
        return json.loads(archive.read(json_names[0]))


def ntsb_make_model(vehicles: list) -> str:
    for vehicle in vehicles or []:
        make = vehicle.get("cm_make") or vehicle.get("make") or ""
        model = vehicle.get("cm_model") or vehicle.get("model") or ""
        text = f"{make} {model}".strip()
        if text:
            return text
    return ""


NTSB_PHASE_MAP = {
    "standing": "PREFLIGHT",
    "taxi": "PREFLIGHT",
    "takeoff": "PREFLIGHT",
    "initial climb": "CRUISE",
    "climb": "CRUISE",
    "en route": "CRUISE",
    "cruise": "CRUISE",
    "maneuvering": "CRUISE",
    "descent": "CRUISE",
    "approach": "APPROACH",
    "landing": "LANDING",
}


def ntsb_flight_phase(vehicles: list) -> str:
    for vehicle in vehicles or []:
        for event in vehicle.get("cm_events") or []:
            phase = str(event.get("cicttPhaseSOEGroup") or "").strip().lower()
            if phase in NTSB_PHASE_MAP:
                return NTSB_PHASE_MAP[phase]
    return ""


# Large jet transport-relevant 14 CFR parts (as opposed to Part 91 general
# aviation). Part 91 Subpart K (fractional ownership, e.g. NetJets) is NOT
# included here: CAROL reports it under the same "091" code as plain Part 91
# GA flights, so it can't be reliably distinguished from this field alone.
LARGE_JET_TRANSPORT_FAR_PARTS = {
    "121",  # scheduled/supplemental air carriers
    "135",  # commuter and on-demand (incl. charter jets)
    "125",  # large aircraft (20+ seats / 6,000+ lb) not operated as a carrier
    "129",  # foreign air carriers operating in the US
}


def ntsb_is_large_jet_transport(vehicles: list) -> bool:
    """True if any vehicle on the case was operated under a large jet
    transport-relevant FAR part, as opposed to Part 91 general aviation.
    Confirmed field from a live CAROL sample: vehicle.regulationFlightConductedUnder."""
    for vehicle in vehicles or []:
        far_part = str(vehicle.get("regulationFlightConductedUnder") or "").strip()
        if far_part in LARGE_JET_TRANSPORT_FAR_PARTS:
            return True
    return False


def ntsb_operator(vehicles: list) -> str:
    for vehicle in vehicles or []:
        operator = vehicle.get("operatorName") or vehicle.get("registeredOwner") or ""
        if operator:
            return operator
    return ""


def ntsb_aircraft_category(vehicles: list) -> str:
    for vehicle in vehicles or []:
        category = str(vehicle.get("cm_aircraftCategory") or vehicle.get("aircraftCategory") or "").upper()
        if "AIRPLANE" in category or "JET" in category:
            return "JET"
    return "TRANSPORT"


def upsert_ntsb_carol_event(db, case: dict) -> bool:
    ntsb_num = case.get("cm_ntsbNum") or case.get("cm_NtsbNo") or ""
    if not ntsb_num:
        return False
    event_id = re.sub(r"[^A-Z0-9-]+", "-", f"NTSB-{ntsb_num}".upper()).strip("-")
    item = db.get(Event, event_id)
    created = False
    if not item:
        item = Event(id=event_id)
        db.add(item)
        created = True
    event_date = str(case.get("cm_eventDate") or "")[:10]
    city = case.get("cm_city") or ""
    state = case.get("cm_state") or ""
    vehicles = case.get("cm_vehicles") or []
    make_model = ntsb_make_model(vehicles)
    highest_injury = str(case.get("cm_highestInjury") or "").upper()
    fatal = int(case.get("cm_fatalInjuryCount") or 0)
    far_parts = sorted({
        str(vehicle.get("regulationFlightConductedUnder") or "").strip()
        for vehicle in vehicles
        if str(vehicle.get("regulationFlightConductedUnder") or "").strip() in LARGE_JET_TRANSPORT_FAR_PARTS
    })

    item.source_name = "NTSB CAROL"
    item.source_url = f"https://data.ntsb.gov/carol-main-public/basic-search?NTSBNumber={ntsb_num}"
    item.event_date = event_date
    item.operation_type = f"Part {'/'.join(far_parts) or '121'} air transport (NTSB CAROL)"
    item.airport_iata = ""
    item.airport_icao = ""
    item.runway = ""
    item.approach_type = ""
    item.flight_phase = ntsb_flight_phase(vehicles)
    item.aircraft_type = make_model
    # Case is only reached here if ntsb_is_part121() passed, so this is
    # scheduled air-transportation, not general aviation.
    item.aircraft_category = "JET"
    item.operator = ntsb_operator(vehicles)
    item.weather_summary = ", ".join(part for part in [city, state] if part)
    item.runway_condition = ""
    item.event_type = "NTSB CASE"
    item.severity = 5 if fatal > 0 else (4 if "SERIOUS" in highest_injury else (3 if "MINOR" in highest_injury else 2))
    item.core_event = f"NTSB {ntsb_num}"
    item.lesson_keyword = "NTSB Case"
    item.summary = (
        f"NTSB case {ntsb_num} near {city or 'unspecified location'}{f', {state}' if state else ''}. "
        f"Highest injury level: {highest_injury or 'unknown'}."
    )
    item.contributing_factors = json.dumps([])
    item.operational_lessons = json.dumps([])
    item.pilot_briefing_sentence = (
        f"Review NTSB case {ntsb_num} in full before using it for briefing — this record only carries "
        "summary fields from CAROL, not the final probable-cause narrative."
    )
    item.confidence_score = 0.5
    db.query(EventTag).filter(EventTag.event_id == event_id).delete()
    tags = ["NTSB", "carol_case", "official_report_candidate", "part_121_135_screening_required"]
    if fatal > 0:
        tags.append("FATAL")
    for tag in tags:
        db.add(EventTag(event_id=event_id, tag_type="risk", tag_value=tag))
    return created


async def parse_ntsb_carol(client: httpx.AsyncClient, db, years_back: int) -> dict:
    """Pulls aviation cases directly from NTSB's public CAROL FileExport
    endpoint (no API key). Capped at 500 records per call (CAROL's
    ResultSetSize) — for a 20-year window this will not capture every case,
    only the most recent ~500 (SortDescending=True)."""
    end = datetime.utcnow().date()
    start = cutoff_date(years_back).date()
    try:
        cases = await fetch_ntsb_carol_cases(client, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    except (httpx.HTTPStatusError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        return {"checked": 0, "created": 0, "error": str(exc)}
    created = 0
    part121_matched = 0
    seen_ntsb_numbers: set[str] = set()
    for case in cases:
        ntsb_num = case.get("cm_ntsbNum") or case.get("cm_NtsbNo") or ""
        # CAROL returns one row per vehicle/party for multi-aircraft events,
        # so the same case number can repeat within a single export.
        if not ntsb_num or ntsb_num in seen_ntsb_numbers:
            continue
        seen_ntsb_numbers.add(ntsb_num)
        # Only keep Part 121 air-carrier cases; general aviation (Part 91 etc.)
        # is out of scope for this app.
        if not ntsb_is_large_jet_transport(case.get("cm_vehicles") or []):
            continue
        part121_matched += 1
        if upsert_ntsb_carol_event(db, case):
            created += 1
    return {"checked": len(cases), "part121_matched": part121_matched, "created": created}


async def parse_faa_transport_library(client: httpx.AsyncClient, db, years_back: int) -> dict:
    response = await client.get(FAA_TRANSPORT_LIBRARY_URL)
    response.raise_for_status()
    cutoff = cutoff_date(years_back)
    created = 0
    rows = []
    for row in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", response.text):
        cells = re.findall(r"(?is)<td[^>]*>(.*?)</td>", row)
        if len(cells) < 2:
            continue
        date_text = clean_text(cells[0])
        event_date = parse_date(date_text)
        if not event_date:
            continue
        link_match = re.search(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', cells[1], re.IGNORECASE | re.DOTALL)
        if not link_match:
            continue
        url = urljoin(FAA_TRANSPORT_LIBRARY_URL, unescape(link_match.group(1)))
        operator = clean_text(link_match.group(2))
        flight = clean_text(cells[2]) if len(cells) > 2 else ""
        location = clean_text(cells[3]) if len(cells) > 3 else ""
        state = clean_text(cells[4]) if len(cells) > 4 else ""
        country = clean_text(cells[5]) if len(cells) > 5 else ""
        make = clean_text(cells[6]) if len(cells) > 6 else ""
        model = clean_text(cells[7]) if len(cells) > 7 else ""
        rows.append({
            "event_date": event_date,
            "date_text": date_text,
            "url": url,
            "operator": operator,
            "flight": flight,
            "city": location,
            "state": state,
            "country": country,
            "make": make,
            "model": model,
        })
    rows.sort(key=lambda item: item["event_date"], reverse=True)
    selected = [row for row in rows if row["event_date"] >= cutoff]
    if len(selected) < 10:
        seen = {row["url"] for row in selected}
        selected.extend(row for row in rows if row["url"] not in seen)
        selected = selected[:10]
    event_created = 0
    for row in rows:
        if upsert_faa_event(db, row):
            event_created += 1
    checked = 0
    extended_count = 0
    for row in selected:
        is_recent = row["event_date"] >= cutoff
        if not is_recent:
            extended_count += 1
        date_text = row["date_text"]
        operator = row["operator"]
        flight = row["flight"]
        location = ", ".join(part for part in [row["city"], row["state"], row["country"]] if part)
        url = row["url"]
        title = f"FAA Transport Lessons Learned - {operator} {flight}".strip()
        checked += 1
        tags = ["FAA", "transport_airplane", "official_report_candidate", "part_121_135_relevant"]
        tags.append(f"recent_{years_back}_years" if is_recent else "extended_period_minimum_10")
        if upsert_official_item(
            db,
            source_name="FAA Transport Airplane Lessons Learned",
            source_url=url,
            title=title,
            category="Accident / Incident",
            severity="Medium",
            summary=official_summary(
                "FAA",
                title,
                f"Event date {date_text}. Location: {location or 'not listed'}. "
                f"{f'Selected within recent {years_back}-year window.' if is_recent else 'Selected by expanded period rule to keep at least 10 FAA cases in the database.'}",
            ),
            tags=tags,
        ):
            created += 1
    return {"checked": checked, "created": created, "events_created": event_created, "events_checked": len(rows), "extended_period": extended_count}


async def parse_asrs_report_sets(client: httpx.AsyncClient, db) -> dict:
    response = await client.get(ASRS_REPORTSETS_URL)
    response.raise_for_status()
    created = 0
    checked = 0
    pdf_links = list(re.finditer(r'<a[^>]+href=["\']([^"\']+\.pdf)["\']', response.text, re.IGNORECASE))
    for index, href_match in enumerate(pdf_links):
        next_start = pdf_links[index + 1].start() if index + 1 < len(pdf_links) else len(response.text)
        block = response.text[href_match.end():next_start]
        desc_match = re.search(r'(?is)<div class="fileDescription">\s*(.*?)\s*<div class="instructions">(.*?)</div>', block)
        if not desc_match:
            continue
        title = clean_text(desc_match.group(1))
        instructions = clean_text(desc_match.group(2))
        haystack = f"{title} {instructions}".lower()
        if not any(keyword in haystack for keyword in ASRS_RELEVANT_KEYWORDS):
            continue
        checked += 1
        url = urljoin(ASRS_REPORTSETS_URL, unescape(href_match.group(1)))
        if upsert_official_item(
            db,
            source_name="NASA ASRS Report Sets",
            source_url=url,
            title=f"ASRS Report Set - {title}",
            category=category_for_title(title),
            severity="Medium",
            summary=official_summary(
                "NASA ASRS",
                title,
                f"{instructions} ASRS report sets are pre-screened topic samples; individual report dates require downstream parsing.",
            ),
            tags=["ASRS", "asrs_report_set", "official_source", "part_121_135_relevant", "needs_individual_report_date_parse"],
        ):
            created += 1
    return {"checked": checked, "created": created}


async def collect_recent_official_events(years_back: int = 20) -> dict:
    db = SessionLocal()
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": "OpsBriefing/0.1"}) as client:
            ntsb = await parse_ntsb_carol(client, db, years_back)
            faa = await parse_faa_transport_library(client, db, years_back)
            asrs = await parse_asrs_report_sets(client, db)
        db.commit()
        total_checked = ntsb["checked"] + faa["checked"] + asrs["checked"]
        total_created = ntsb["created"] + faa["created"] + asrs["created"]
        return {
            "status": "complete",
            "years_back": years_back,
            "sources": {"ntsb": ntsb, "faa": faa, "asrs": asrs},
            "items_checked": total_checked,
            "items_saved": total_created,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
