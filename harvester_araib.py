import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime

# Configuration
BASE_URL = "https://araib.molit.go.kr/eng/section/list.do?menuSeq=1043"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def parse_date(text):
    # Try YYYY-MM-DD
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match: return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    # Try DD/MM/YYYY
    match = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
    if match: return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"
    return None

def collect_araib():
    records = []
    page = 1
    max_pages = 100 # Adjust as needed for full history
    
    print(f"?? Starting ARAIB (Korea) Harvester...")

    while page <= max_pages:
        print(f" -> Fetching page {page}...", end="\r")
        url = f"{BASE_URL}&pageIndex={page}"
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            if not res.ok: break
            
            soup = BeautifulSoup(res.text, "html.parser")
            rows = soup.select("table tbody tr")
            if not rows or "no data" in soup.text.lower():
                break
                
            page_found = 0
            for row in rows:
                cells = [c.get_text(strip=True) for c in row.select("td")]
                if len(cells) < 4: continue
                
                # Find date in cells
                date_str = None
                for c in cells:
                    parsed = parse_date(c)
                    if parsed:
                        date_str = parsed
                        break
                
                if not date_str: continue
                
                # 2000 year cutoff
                year = int(date_str.split("-")[0])
                if year < 2000:
                    print(f"\n?? Reached 2000 cutoff at page {page}. Stopping.")
                    return records

                link_tag = row.select_one("a")
                if not link_tag: continue
                
                title = link_tag.get_text(strip=True)
                link = "https://araib.molit.go.kr" + link_tag['href']
                id_val = re.search(r"id=(\d+)", link)
                id_val = id_val.group(1) if id_val else str(hash(link))

                records.append({
                    "id": f"ARAIB-{id_val}",
                    "source_name": "ARAIB (Korea)",
                    "source_url": link,
                    "event_date": date_str,
                    "summary": title,
                    "severity": 3,
                    "tags": ["ARAIB", "Korea", "OFFICIAL_REPORT"],
                    "event_type": "Investigation Report"
                })
                page_found += 1
            
            if page_found == 0: break
            page += 1
            time.sleep(1) # Be polite
            
        except Exception as e:
            print(f"\n?? Error at page {page}: {e}")
            break
            
    print(f"\n?? Collection complete. Found {len(records)} records.")
    return records

def upload_batches(records, batch_size=50):
    total = len(records)
    print(f"?? Uploading {total} records in batches of {batch_size}...")
    
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
