import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_baaa(slug):
    url = f"https://www.baaa-acro.com/country/{slug}"
    print(f"DEBUG BAAA: {url}")
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        print(f"Status: {res.status_code}")
        soup = BeautifulSoup(res.text, "html.parser")
        
        # Check for main container
        content = soup.select_one(".region-content")
        if content:
            print("Found .region-content")
            # Look for links that look like crash reports
            links = content.find_all("a", href=True)
            crash_links = [l['href'] for l in links if "/crash/" in l['href']]
            print(f"Crash links found: {len(crash_links)}")
            if crash_links:
                print(f" Sample link: {crash_links[0]}")
        else:
            print("NOT found .region-content")
            print(f"Body snippet: {soup.body.get_text(strip=True)[:200]}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_baaa("south-korea")
