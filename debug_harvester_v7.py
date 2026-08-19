import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_araib():
    urls = [
        "https://araib.molit.go.kr/USR/airboard0201/m_34497/list.do",
        "https://araib.molit.go.kr/eng/publications/reports/list.do"
    ]
    for url in urls:
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
            else:
                print(f" Response text excerpt: {res.text[:200]}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    debug_araib()
