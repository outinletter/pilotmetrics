import requests
import time
import json

# API Config
API_KEY = "2113c549-8f2d-4a98-a587-e35192569e55"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"

# Master State List (ISO 3-letter) - Expanded for global coverage
STATES = [
    "KOR", "USA", "JPN", "CHN", "FRA", "CAN", "AUS", "GBR", "DEU", "BRA", "IND", "MEX", "ARE", "SGP", "HKG", 
    "ITA", "ESP", "CHE", "NLD", "RUS", "VNM", "THA", "IDN", "MYS", "PHL", "TUR", "ZAF", "ARG", "CHL", "COL",
    "NZL", "NOR", "SWE", "FIN", "DNK", "BEL", "AUT", "PRT", "GRC", "ISR", "SAU", "QAT", "ETH", "EGY", "KEN"
]

def collect_icao():
    current_year = 2026
    start_year = 2000
    
    # ICAO iSTARS 4.0 uses 'accidents' and 'incidents' endpoints separately
    endpoints = [
        "accidents",
        "incidents"
    ]
    
    print(f"?? Starting ICAO iSTARS Mass Harvester (2000-{current_year})...")
    
    for state in STATES:
        print(f"\n[?] Processing {state}...")
        for year in range(start_year, current_year + 1):
            year_records = []
            for ep in endpoints:
                # Use StateOfOccurrence or States based on API version
                url = f"https://applications.icao.int/dataservices/api/{ep}?api_key={API_KEY}&format=json&StateOfOccurrence={state}&year={year}"
                try:
                    res = requests.get(url, timeout=30)
                    
                    if res.status_code == 403:
                        print(f"\n[!] 403 Forbidden: API Quota exceeded for endpoint '{ep}'.")
                        print(f"    Moving to next state/year to preserve other endpoints if possible.")
                        break

                    if not res.ok:
                        # Fallback to 'States' parameter if StateOfOccurrence fails
                        url = f"https://applications.icao.int/dataservices/api/{ep}?api_key={API_KEY}&format=json&States={state}&Year={year}"
                        res = requests.get(url, timeout=30)
                        
                    if not res.ok:
                        if res.status_code != 404:
                            print(f"  [!] {year} ({ep}): HTTP {res.status_code}")
                        continue
                    
                    data = res.json()
                    list_data = data if isinstance(data, list) else data.get("data", []) or data.get("items", [])
                    
                    if not list_data or not isinstance(list_data, list):
                        continue
                        
                    for occ in list_data:
                        id_val = occ.get("OccurrenceNo") or occ.get("OccurrenceID") or occ.get("ID")
                        if not id_val: continue
                        
                        date = occ.get("Date") or occ.get("OccurrenceDate") or f"{year}-01-01"
                        summary = occ.get("Narrative") or occ.get("Summary") or f"ICAO {ep[:-1]} in {state} on {date}"
                        
                        year_records.append({
                            "id": f"ICAO-{id_val}",
                            "source_name": "ICAO iSTARS",
                            "source_url": "https://applications.icao.int/istars/",
                            "event_date": str(date)[:10],
                            "airport_iata": occ.get("AirportIATA", "") or occ.get("IATA", ""),
                            "airport_icao": occ.get("AirportICAO", "") or occ.get("ICAO", ""),
                            "summary": summary,
                            "severity": 3 if ep == "incidents" else 4,
                            "tags": ["ICAO", "iSTARS", state, ep.upper()[:-1]],
                            "event_type": occ.get("OccurrenceCategory", ep.capitalize()[:-1])
                        })
                except Exception as e:
                    print(f"  [!] {year} ({ep}): Error {e}")
            
            if year_records:
                print(f"  [+] {year}: Found {len(year_records)} occurrences. Uploading...", end="\r")
                try:
                    # Filter unique records within the same year if duplicates exist across endpoints
                    seen_ids = set()
                    unique_records = []
                    for r in year_records:
                        if r['id'] not in seen_ids:
                            unique_records.append(r)
                            seen_ids.add(r['id'])

                    upload_res = requests.post(INGEST_URL, json={"records": unique_records}, timeout=60)
                    if upload_res.ok:
                        created = upload_res.json().get("created", 0)
                        print(f"  [v] {year}: {len(unique_records)} records (New: {created})      ")
                    else:
                        print(f"  [x] {year}: Upload failed (HTTP {upload_res.status_code})")
                except Exception as e:
                    print(f"  [!] {year}: Upload error {e}")
            
            time.sleep(0.2)

if __name__ == "__main__":
    collect_icao()
