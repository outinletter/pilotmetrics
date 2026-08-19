import requests
from bs4 import BeautifulSoup
import time
import re

# Ingest API
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def collect_from_baaa(country_slug):
    print(f"?? Collecting from BAAA-ACRO for {country_slug}...")
    base_url = f"https://www.baaa-acro.com/country/{country_slug}"
    records = []
    
    # BAAA uses page indexing like ?page=0, 1, 2...
    page = 0
    while True:
        url = f"{base_url}?page={page}"
        print(f" -> Fetching page {page}...", end="\r")
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            if not res.ok: break
            
            soup = BeautifulSoup(res.text, "html.parser")
            # Find the crash records in the view content
            items = soup.select(".view-content .views-row")
            if not items: break
            
            for item in items:
                # Basic info
                date_tag = item.select_one(".views-field-field-crash-date")
                title_tag = item.select_one(".views-field-title a")
                if not title_tag: continue
                
                title = title_tag.get_text(strip=True)
                link = "https://www.baaa-acro.com" + title_tag['href']
                date_str = date_tag.get_text(strip=True) if date_tag else "2000-01-01"
                
                # Try to parse date
                try:
                    dt = datetime.strptime(date_str, "%b %d, %Y")
                    iso_date = dt.strftime("%Y-%m-%d")
                    year = dt.year
                except:
                    iso_date = "2000-01-01"
                    year = 2000
                
                if year < 2000: continue
                
                # Fetch details for narrative
                print(f"    * Detail: {title[:40]}...", end="\r")
                res_d = requests.get(link, headers=HEADERS, timeout=15)
                soup_d = BeautifulSoup(res_d.text, "html.parser")
                
                summary = ""
                narrative_tag = soup_d.select_one(".field--name-field-crash-narrative")
                if narrative_tag:
                    summary = narrative_tag.get_text(strip=True)
                else:
                    summary = title
                
                # Extract Aircraft Type
                ac_type = ""
                ac_tag = soup_d.select_one(".field--name-field-crash-aircraft-type")
                if ac_tag: ac_type = ac_tag.get_text(strip=True)
                
                # Extract Location
                loc = ""
                loc_tag = soup_d.select_one(".field--name-field-crash-location")
                if loc_tag: loc = loc_tag.get_text(strip=True)

                records.append({
                    "id": f"BAAA-{hash(link)}",
                    "source_name": "BAAA-ACRO",
                    "source_url": link,
                    "event_date": iso_date,
                    "summary": summary[:4000],
                    "aircraft_type": ac_type,
                    "weather_summary": loc,
                    "severity": 4 if "fatal" in summary.lower() or "destroyed" in summary.lower() else 3,
                    "tags": ["BAAA", country_slug.upper(), "OFFICIAL_REPORT"],
                    "event_type": "Accident"
                })
                
                if len(records) % 10 == 0:
                    time.sleep(0.5)

            page += 1
            if page > 15: break # Safeguard
        except Exception as e:
            print(f"\n [!] Error: {e}")
            break
            
    print(f"\n?? Found {len(records)} records for {country_slug}.")
    return records

def upload_batches(records, batch_size=20):
    total = len(records)
    print(f"?? Uploading {total} records...")
    for i in range(0, total, batch_size):
        batch = records[i:i+batch_size]
        try:
            res = requests.post(INGEST_URL, json={"records": batch}, timeout=60)
            print(f" [+] Sent batch {i//batch_size + 1}. Status: {res.status_code}")
        except Exception as e:
            print(f" [!] Failed: {e}")

if __name__ == "__main__":
    from datetime import datetime
    for slug in ["south-korea", "japan"]:
        data = collect_from_baaa(slug)
        if data:
            upload_batches(data)
