import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_araib():
    # Attempting the URL from search result
    url = "https://araib.molit.go.kr/en/USR/airboard0201/m_34497/list.jsp"
    print(f"DEBUG ARAIB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        if res.ok:
            soup = BeautifulSoup(res.text, "html.parser")
            rows = soup.select("table tr")
            print(f"Rows found: {len(rows)}")
            if len(rows) > 0:
                print(f"  First row text: {rows[0].get_text(strip=True)[:100]}")
            # Try to see if it redirects
            if len(res.history) > 0:
                print(f" Redirect history: {[r.url for r in res.history]}")
        else:
            print(f" Response text excerpt: {res.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

def debug_jtsb():
    url = "https://www.mlit.go.jp/jtsb/english/airaccidents/index.html"
    print(f"\nDEBUG JTSB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        if res.ok:
            soup = BeautifulSoup(res.text, "html.parser")
            links = soup.find_all("a", href=True)
            print(f"Links found: {len(links)}")
            matches = [a['href'] for a in links if "rep-acc" in a['href'] or "rep-inc" in a['href']]
            print(f" Matching links (first 5): {matches[:5]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_araib()
    debug_jtsb()
