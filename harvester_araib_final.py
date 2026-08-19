import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime

# Configuration
LIST_URL = "https://araib.molit.go.kr/USR/BORD0201/m_34591/LST.jsp"
DETAIL_BASE = "https://araib.molit.go.kr/USR/BORD0201/m_34591/"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def collect_araib():
    records = []
    page = 1
    max_pages = 40 
    
    print(f"?? Starting ARAIB (Korea) Final Harvester...")

    while page <= max_pages:
        print(f" -> Fetching page {page}...", end="\r")
        url = f"{LIST_URL}?lcmspage={page}"
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            if not res.ok: break
            
            soup = BeautifulSoup(res.text, "html.parser")
            # The structure from Turn 30 show rows in table
            rows = soup.select("tr")
            if not rows or len(rows) <= 1: break # Header only
                
            page_found = 0
            for row in rows[1:]: # Skip header
                cells = [c.get_text(strip=True) for c in row.select("td")]
                if len(cells) < 4: continue
                
                # Cells: 0=No, 1=Title, 2=Date, 3=Hits
                title_cell = row.select_one("td.tl")
                if not title_cell: continue
                
                link_tag = title_cell.select_one("a")
                if not link_tag: continue
                
                title = link_tag.get_text(strip=True)
                relative_link = link_tag['href']
                detail_url = requests.compat.urljoin(DETAIL_BASE, relative_link)
                
                date_str = cells[2].replace(".", "-") # "2025.12.15" -> "2025-12-15"
                
                # 2000 year cutoff
                try:
                    year = int(date_str.split("-")[0])
                    if year < 2000:
                        print(f"\n?? Reached pre-2000 data. Stopping.")
                        return records
                except: continue

                # Get ID from link
                id_match = re.search(r"idx=(\d+)", relative_link)
                id_val = id_match.group(1) if id_match else str(hash(detail_url))

                # Quick fetch detail for better summary if needed, 
                # but for bulk we can use the title and basic metadata
                
                records.append({
                    "id": f"ARAIB-{id_val}",
                    "source_name": "ARAIB (Korea)",
                    "source_url": detail_url,
                    "event_date": date_str,
                    "summary": title,
                    "severity": 3,
                    "tags": ["ARAIB", "Korea", "OFFICIAL_REPORT"],
                    "event_type": "Investigation Report"
                })
                page_found += 1
            
            if page_found == 0: break
            page += 1
            time.sleep(0.5)
            
        except Exception as e:
            print(f"\n?? Error at page {page}: {e}")
            break
            
    print(f"\n?? Collection complete. Found {len(records)} records.")
    return records

def upload_batches(records, batch_size=50):
    total = len(records)
    print(f"?? Uploading {total} records to {INGEST_URL}...")
    for i in range(0, total, batch_size):
        batch = records[i:i + batch_size]
        payload = {"records": batch}
        try:
            res = requests.post(INGEST_URL, json=payload, timeout=30)
            if res.ok:
                data = res.json()
                print(f" [+] Batch {i//batch_size + 1}: Sent {len(batch)}, Created {data.get('created')}")
            else:
                print(f" [!] Batch {i//batch_size + 1} FAILED: HTTP {res.status_code}")
        except Exception as e:
            print(f" [!] Batch {i//batch_size + 1} EXCEPTION: {e}")

if __name__ == "__main__":
    all_records = collect_araib()
    if all_records:
        upload_batches(all_records)
