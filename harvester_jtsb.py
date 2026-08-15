import requests
from bs4 import BeautifulSoup
import time
import re

# Config
BASE_URL = "https://www.mlit.go.jp/jtsb/english/aviation/aviation.html"
INGEST_URL = "https://pilot-briefing.outinletter.workers.dev/api/ops-intel/ingest-events"

def collect_jtsb():
    print(f"?? Starting JTSB (Japan) Harvester...")
    
    try:
        res = requests.get(BASE_URL, timeout=20)
        soup = BeautifulSoup(res.text, "html.parser")
        
        yearly_links = []
        # Find links like "rep-acc-2023.html"
        for a in soup.find_all("a", href=True):
            if re.search(r"rep-(?:acc|inc)[^/]*\d{4}\.html", a['href']):
                yearly_links.append(requests.compat.urljoin(BASE_URL, a['href']))
        
        # Include current page
        yearly_links.append(BASE_URL)
        yearly_links = list(set(yearly_links))
        
        all_records = []
        for year_url in yearly_links:
            year_match = re.search(r"(\d{4})", year_url)
            year_val = int(year_match.group(1)) if year_match else 0
            if year_val and year_val < 2000: continue
            
            print(f" -> Scanning {year_url}...")
            r_year = requests.get(year_url, timeout=20)
            s_year = BeautifulSoup(r_year.text, "html.parser")
            
            for link_tag in s_year.find_all("a", href=True):
                href = link_tag['href']
                if "/jtsb/aircraft/" in href and (href.endswith(".pdf") or "id=" in href):
                    title = link_tag.get_text(strip=True)
                    if len(title) < 10: continue
                    
                    full_link = requests.compat.urljoin(year_url, href)
                    
                    # Try to find a date or year in the title
                    found_year = 0
                    y_m = re.search(r"\b(20\d{2})\b", title)
                    if y_m: found_year = int(y_m.group(1))
                    elif year_val: found_year = year_val
                    
                    if found_year and found_year < 2000: continue
                    
                    all_records.append({
                        "id": f"JTSB-{hash(full_link)}",
                        "source_name": "JTSB (Japan)",
                        "source_url": full_link,
                        "event_date": f"{found_year}-01-01" if found_year else "2000-01-01",
                        "summary": title,
                        "severity": 3,
                        "tags": ["JTSB", "Japan", "OFFICIAL_REPORT"],
                        "event_type": "Investigation Report"
                    })
        
        print(f"?? Found {len(all_records)} potential JTSB records.")
        return all_records

    except Exception as e:
        print(f"?? Error: {e}")
        return []

def upload_batches(records, batch_size=50):
    total = len(records)
    print(f"?? Uploading {total} records to {INGEST_URL}...")
    for i in range(0, total, batch_size):
        batch = records[i:i+batch_size]
        try:
            res = requests.post(INGEST_URL, json={"records": batch}, timeout=60)
            print(f" [+] Batch {i//batch_size + 1}: {len(batch)} items. Status: {res.status_code}")
        except Exception as e:
            print(f" [!] Batch {i//batch_size + 1} Failed: {e}")

if __name__ == "__main__":
    records = collect_jtsb()
    if records:
        upload_batches(records)
