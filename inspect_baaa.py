import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

def inspect():
    url = "https://www.baaa-acro.com/country/south-korea"
    res = requests.get(url, headers=HEADERS)
    soup = BeautifulSoup(res.text, "html.parser")
    
    # Find all crash links
    links = soup.find_all("a", href=True)
    for a in links:
        if "/crash/" in a['href']:
            print(f"LINK: {a['href']}")
            # Look at parent to find the row container
            parent = a.find_parent("tr")
            if parent:
                print(" Found in Table Row")
                print(parent.prettify()[:500])
                break
            parent = a.find_parent("div", class_=re.compile("views-row")) if 're' in globals() else a.find_parent("div")
            if parent:
                print(" Found in Div")
                # print(parent.prettify()[:500])
                break

if __name__ == "__main__":
    inspect()
