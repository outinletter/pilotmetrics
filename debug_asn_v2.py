import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def debug_asn(country_code):
    # Try both patterns
    urls = [
        f"https://aviation-safety.net/database/country/country.php?id={country_code}",
        f"https://aviation-safety.net/database/dblist.php?Country={country_code}"
    ]
    
    for url in urls:
        print(f"DEBUG ASN ({country_code}): {url}")
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            print(f"Status: {res.status_code}")
            if res.ok:
                soup = BeautifulSoup(res.text, "html.parser")
                rows = soup.select("table tr")
                print(f"Rows found: {len(rows)}")
                if len(rows) > 1:
                    print(f"  First data row text: {rows[1].get_text(strip=True)[:100]}")
                    break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    debug_asn("HL") # Korea
    debug_asn("JA") # Japan
