import requests
from bs4 import BeautifulSoup
import time
import re

# Config
LIST_URL = "https://araib.molit.go.kr/USR/BORD0201/m_34591/LST.jsp"
DETAIL_BASE = "https://araib.molit.go.kr/USR/BORD0201/m_34591/"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def collect():
    print(f"?? Starting ARAIB (Korea) English Archive Harvester...")
    records = []
    page = 1
    
    while True:
        print(f" -> Fetching page {page}...", end="\r")
        url = f"{LIST_URL}?lcmspage={page}"
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            if not res.ok: break
            
            soup = BeautifulSoup(res.text, "html.parser")
            rows = soup.select("tr")
            if not rows or len(rows) <= 1: break
                
            page_found = 0
            for row in rows[1:]: # Skip header
                cells = row.select("td")
                if len(cells) < 4: continue
                
                title_tag = row.select_one("td.tl a")
                if not title_tag: continue
                
                title = title_tag.get_text(strip=True)
                relative_link = title_tag['href']
                detail_url = requests.compat.urljoin(DETAIL_BASE, relative_link)
                date_str = cells[2].get_text(strip=True).replace(".", "-") # 2025.12.15
                
                try:
                    year = int(date_str.split("-")[0])
                    if year < 2000: continue
                except: continue

                id_match = re.search(r"idx=(\d+)", relative_link)
                id_val = id_match.group(1) if id_match else str(hash(detail_url))

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
