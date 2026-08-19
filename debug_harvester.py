import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_araib():
    url = "https://araib.molit.go.kr/eng/section/list.do?menuSeq=1043&pageIndex=1"
    print(f"DEBUG ARAIB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        soup = BeautifulSoup(res.text, "html.parser")
        tables = soup.find_all("table")
        print(f"Tables found: {len(tables)}")
        for i, table in enumerate(tables):
            rows = table.select("tr")
            print(f" Table {i} rows: {len(rows)}")
            if len(rows) > 1:
                print(f"  First row text: {rows[1].get_text(strip=True)[:100]}")
    except Exception as e:
        print(f"Error: {e}")

def debug_jtsb():
    url = "https://www.mlit.go.jp/jtsb/english/aviation/aviation.html"
    print(f"\nDEBUG JTSB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        soup = BeautifulSoup(res.text, "html.parser")
        links = soup.find_all("a", href=True)
        print(f"Links found: {len(links)}")
        for a in links:
            if "rep-acc" in a['href'] or "rep-inc" in a['href']:
                print(f" Found matching link: {a['href']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_araib()
    debug_jtsb()
