"""
EASA Annual Safety Review - Fatal Accidents collector
Downloads ASR Appendix 1 PDFs (2018-2024) and ingests CAT fatal accidents.
"""
import urllib.request, pdfplumber, re, json, os, time, sys
from datetime import datetime

BASE_URL    = "https://www.easa.europa.eu"
WORKER_URL  = "https://pilot-briefing.outinletter.workers.dev"
BATCH_SIZE  = 20

# Appendix 1 download IDs (manually verified from EASA website)
# 2024 has separate App1; 2023 has combined appendices; older years vary
APP1_URLS = {
    2024: "/en/downloads/140050/en",   # ASR 2024 App1 – Fatal Accidents List
    2023: "/en/downloads/138371/en",   # ASR 2023 Appendices (combined)
    2022: "/en/downloads/136900/en",   # ASR 2022 App1
    2021: "/en/downloads/130516/en",   # ASR 2021 App1
    2020: "/en/downloads/117065/en",   # ASR 2020 main (appendices included)
    2019: "/en/downloads/101300/en",   # ASR 2019 main
    2018: "/en/downloads/48172/en",    # ASR 2018 main
}

# Section header patterns
CAT_SECTIONS = [
    "commercial air transport",
    "commercial air transport – complex",
    "commercial air transport - complex",
    "commercial air transport (cat)",
]
END_SECTIONS = [
    "specialised operations",
    "specialised operation",
    "general aviation",
    "helicopter",
    "sailplane",
    "balloon",
    "parachute",
]

DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+(.+)$")
DATE_ONLY_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")

# Known aircraft manufacturer keywords (to help split location from aircraft type)
MFR_KEYWORDS = [
    "AIRBUS", "BOEING", "BOMBARDIER", "EMBRAER", "ATR", "CESSNA", "PIPER",
    "BEECH", "LEARJET", "GULFSTREAM", "DASSAULT", "FALCON", "HAWKER",
    "RAYTHEON", "PILATUS", "SAAB", "DE HAVILLAND", "FOKKER", "DORNIER",
    "BAE", "DOUGLAS", "MCDONNELL", "AVRO", "SHORTS", "BRITTEN",
    "PIAGGIO", "SOCATA", "MOONEY", "DIAMOND", "CIRRUS", "ROBIN",
    "EUROCOPTER", "BELL", "SIKORSKY", "AGUSTA", "ROBINSON",
]

def download_pdf(year: int, dest: str) -> bool:
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        print(f"  Using cached: {dest}")
        return True
    url = BASE_URL + APP1_URLS[year]
    print(f"  Downloading ASR {year}: {url}")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; research bot)"
        })
        with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
            f.write(r.read())
        sz = os.path.getsize(dest)
        print(f"  Done: {sz:,} bytes")
        return sz > 10000
    except Exception as e:
        print(f"  FAILED: {e}")
        return False

def parse_date(s: str) -> str:
    """DD/MM/YYYY -> YYYY-MM-DD"""
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except:
        return ""

def extract_cat_accidents(dest: str, source_year: int) -> list[dict]:
    """Extract CAT fatal accident records from a PDF."""
    records = []
    in_cat = False
    pending_lines: list[str] = []

    def flush_pending():
        if not pending_lines:
            return None
        block = " ".join(pending_lines).strip()
        # Try to find date at start
        m = re.match(r"^(\d{2}/\d{2}/\d{4})\s*(.*)", block)
        if not m:
            return None
        date_str = parse_date(m.group(1))
        if not date_str:
            return None
        rest = m.group(2).strip()
        if not rest:
            return None
        # Try to split: state + location + aircraft + headline
        # Strategy: find first manufacturer keyword
        country, location, aircraft, headline = "", "", "", rest

        parts = rest.split()
        mfr_idx = -1
        for i, word in enumerate(parts):
            for mfr in MFR_KEYWORDS:
                if mfr in rest.upper()[rest.upper().find(" ".join(parts[:i+1])):rest.upper().find(" ".join(parts[:i+1]))+len(mfr)+1]:
                    mfr_idx = i
                    break
            if mfr_idx >= 0:
                break

        if mfr_idx > 0:
            prefix = " ".join(parts[:mfr_idx])
            # First word(s) are country/state, then location
            prefix_parts = prefix.split(" ", 1)
            country = prefix_parts[0] if prefix_parts else ""
            location = prefix_parts[1] if len(prefix_parts) > 1 else ""
            # From mfr_idx: aircraft type until headline
            suffix = " ".join(parts[mfr_idx:])
            # Headline usually starts after aircraft model pattern (MANUFACTURER - MODEL)
            ac_m = re.match(r"([A-Z][A-Z\s\-\d\.]+?)\s{2,}(.+)", suffix)
            if ac_m:
                aircraft = ac_m.group(1).strip()
                headline = ac_m.group(2).strip()
            else:
                aircraft = suffix[:50]
                headline = suffix[50:].strip()
        else:
            headline = rest

        return {
            "accidentId": f"{source_year}-{date_str}",
            "occDate": date_str,
            "country": country.strip().title()[:80],
            "location": location.strip()[:120],
            "aircraftType": aircraft.strip()[:80],
            "operationType": "CAT",
            "headline": headline.strip()[:400],
            "fatalCount": 1,  # All records in Appendix 1 are fatal
            "sourceYear": source_year,
        }

    def commit():
        rec = flush_pending()
        pending_lines.clear()
        if rec and rec.get("occDate"):
            records.append(rec)

    try:
        with pdfplumber.open(dest) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for raw_line in text.splitlines():
                    line = raw_line.strip()
                    if not line:
                        continue

                    low = line.lower()

                    # Detect CAT section start
                    if any(s in low for s in CAT_SECTIONS):
                        in_cat = True
                        commit()
                        continue

                    # Detect section end
                    if in_cat and any(s in low for s in END_SECTIONS):
                        commit()
                        in_cat = False
                        continue

                    if not in_cat:
                        continue

                    # Skip header rows
                    if "local date" in low and "state of occurrence" in low:
                        commit()
                        continue

                    # New record starts with date
                    if re.match(r"^\d{2}/\d{2}/\d{4}", line):
                        commit()
                        pending_lines.append(line)
                    elif DATE_ONLY_RE.match(line):
                        # Standalone date line
                        commit()
                        pending_lines.append(line)
                    else:
                        if pending_lines:
                            pending_lines.append(line)

            commit()  # flush last

    except Exception as e:
        print(f"  PDF parse error: {e}")

    # Deduplicate by accidentId+date
    seen = set()
    unique = []
    for r in records:
        key = (r["occDate"], r["country"][:20], r["aircraftType"][:20])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    # Make accidentId unique by adding sequence number
    by_date: dict[str, int] = {}
    for r in unique:
        k = r["occDate"]
        by_date[k] = by_date.get(k, 0) + 1
        r["accidentId"] = f"{source_year}-{r['occDate']}-{by_date[k]:02d}"

    return unique

def post_batch(records: list[dict]) -> dict:
    payload = json.dumps({"records": records}).encode()
    req = urllib.request.Request(
        f"{WORKER_URL}/api/ops-intel/ingest-easa",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "PilotBriefing-EASA-Collector/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

def main():
    years = list(APP1_URLS.keys())
    print(f"\n[EASA] Collecting fatal accidents from {min(years)}-{max(years)}")

    # Collect all records from all years, then deduplicate keeping latest source
    # Key = (occDate, country[:15]) — same accident appears in multiple ASR editions
    best: dict[tuple, dict] = {}

    for year in sorted(years, reverse=True):  # newest first → keep newest source
        dest = f"easa_asr_{year}.pdf"
        print(f"\n[{year}] Downloading PDF...")
        if not download_pdf(year, dest):
            print(f"  Skipping {year}")
            continue

        print(f"[{year}] Parsing PDF...")
        recs = extract_cat_accidents(dest, year)
        print(f"  Found {len(recs)} CAT fatal accidents")
        for r in recs:
            key = (r["occDate"], r["country"][:15].lower())
            if key not in best:  # keep newest (first seen in reverse-year order)
                best[key] = r
            print(f"    {r['occDate']} {r['country']:20s} {r['aircraftType'][:30]:30s} {r['headline'][:60]}")

    all_records = list(best.values())
    # Re-assign unique IDs
    for i, r in enumerate(all_records):
        r["accidentId"] = f"EASA-CAT-{r['occDate']}-{i+1:03d}"

    print(f"\n[Upload] {len(all_records)} unique records (deduplicated) -> {WORKER_URL}")
    total_checked = 0
    total_created = 0

    for i in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[i:i + BATCH_SIZE]
        result = post_batch(batch)
        chk = result.get("checked", 0)
        crt = result.get("created", 0)
        err = result.get("error", "")
        total_checked += chk
        total_created += crt
        print(f"  Batch {i//BATCH_SIZE+1}: checked={chk} new={crt} {f'ERROR={err}' if err else ''}")
        time.sleep(1)

    print(f"\n[Done] EASA collection complete")
    print(f"  Total checked: {total_checked}  New: {total_created}")

if __name__ == "__main__":
    main()
