import requests
from bs4 import BeautifulSoup
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_araib():
    url = "https://araib.molit.go.kr/eng/main.do"
    print(f"DEBUG ARAIB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        if res.ok:
            soup = BeautifulSoup(res.text, "html.parser")
            links = soup.find_all("a", href=True)
            print(f"Links found: {len(links)}")
            matches = [a['href'] for a in links if "report" in a['href'].lower() or "list" in a['href'].lower()]
            print(f" Potential report links: {matches[:10]}")
    except Exception as e:
        print(f"Error: {e}")

def debug_jtsb():
    url = "https://www.mlit.go.jp/jtsb/eng-air_report.html"
    print(f"\nDEBUG JTSB: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        if res.ok:
            soup = BeautifulSoup(res.text, "html.parser")
            links = soup.find_all("a", href=True)
            print(f"Links found: {len(links)}")
            matches = [a['href'] for a in links if "rep-acc" in a['href'] or "rep-inc" in a['href'] or "202" in a['href']]
            print(f" Matching links: {matches[:10]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_araib()
    debug_jtsb()
