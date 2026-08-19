import requests
from bs4 import BeautifulSoup
import time
import re

# Config
SEARCH_URL = "https://jtsb.mlit.go.jp/jtsb/aircraft/air-kensaku-list.php"
DETAIL_BASE = "https://jtsb.mlit.go.jp/jtsb/aircraft/"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def collect():
    print(f"?? Starting JTSB (Japan) English Database Harvester...")
    records = []
    page = 1
    
    while True:
        print(f" -> Fetching page {page}...", end="\r")
        # Direct GET with search params
        params = {
            "lang": "en",
            "init": "1",
            "type[]": ["accident", "incident"],
            "page": page
        }
        try:
            res = requests.get(SEARCH_URL, params=params, headers=HEADERS, timeout=20)
            if not res.ok: break
            
            soup = BeautifulSoup(res.text, "html.parser")
            rows = soup.select("tr")
            if not rows or len(rows) <= 1: break
            
            page_found = 0
            for row in rows[1:]: # Skip header
                cells = row.select("td")
                if len(cells) < 6: continue
                
                # JTSB Table structure: 
                # 0=Type, 1=Date, 2=AC Type, 3=Registration, 4=Operator, 5=Location/Summary
                date_str = cells[1].get_text(strip=True).replace("/", "-")
                ac_type = cells[2].get_text(strip=True)
                operator = cells[4].get_text(strip=True)
                
                link_tag = cells[5].select_one("a")
                if not link_tag: continue
                
                summary = link_tag.get_text(strip=True)
                relative_link = link_tag['href']
                detail_url = requests.compat.urljoin(DETAIL_BASE, relative_link)
                
                try:
                    year = int(date_str.split("-")[0])
                    if year < 2000: continue
                except: continue

                id_match = re.search(r"id=(\d+)", relative_link)
                id_val = id_match.group(1) if id_match else str(hash(detail_url))

                records.append({
                    "id": f"JTSB-{id_val}",
                    "source_name": "JTSB (Japan)",
                    "source_url": detail_url,
                    "event_date": date_str,
                    "summary": f"{summary} - {ac_type} ({operator})",
                    "aircraft_type": ac_type,
                    "operator": operator,
                    "severity": 3 if "incident" in cells[0].get_text().lower() else 4,
                    "tags": ["JTSB", "Japan", "OFFICIAL_REPORT"],
                    "event_type": cells[0].get_text(strip=True)
                })
                page_found += 1
                
            if page_found == 0: break
            page += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"\n [!] Error: {e}")
            break
            
    print(f"\n?? Found {len(records)} records.")
    return records

def upload(records):
    print(f"?? Uploading to {INGEST_URL}...")
    batch_size = 50
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            res = requests.post(INGEST_URL, json={"records": batch}, timeout=60)
            print(f" [+] Batch {i//batch_size + 1}: {len(batch)} items. Status: {res.status_code}")
        except Exception as e:
            print(f" [!] Batch failed: {e}")

if __name__ == "__main__":
    data = collect()
    if data: upload(data)
