"""
대한항공(KE) 노선 데이터를 OpenFlights에서 다운로드하여 routes.ts 생성
실행: python generate_routes.py
"""
import urllib.request
import csv
import io
import json

# 기종 코드 매핑 (ICAO equipment → 일반 명칭)
AIRCRAFT_MAP = {
    "388": "A380-800", "380": "A380-800",
    "359": "A350-900", "351": "A350-900",
    "789": "B787-9",   "788": "B787-8", "781": "B787-10",
    "77W": "B777-300ER", "773": "B777-300ER", "772": "B777-200ER",
    "333": "A330-300", "332": "A330-200",
    "739": "B737-900ER", "738": "B737-800", "737": "B737-700",
    "321": "A321-200", "320": "A320-200",
}

def guess_aircraft(equip_str):
    if not equip_str or equip_str == "\\N":
        return None
    for code in equip_str.strip().split():
        if code in AIRCRAFT_MAP:
            return AIRCRAFT_MAP[code]
    return equip_str.strip().split()[0] if equip_str.strip() else None

print("Downloading OpenFlights routes.dat ...")
url = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat"
with urllib.request.urlopen(url, timeout=15) as r:
    data = r.read().decode("utf-8")

print(f"Downloaded {len(data)} bytes")

# KE 노선만 필터
# 컬럼: airline, airline_id, src_iata, src_id, dst_iata, dst_id, codeshare, stops, equipment
ke_routes = []
for row in csv.reader(io.StringIO(data)):
    if len(row) < 9:
        continue
    airline, _, src, _, dst, _, codeshare, stops, equip = row[:9]
    if airline != "KE":
        continue
    if codeshare == "Y":   # 코드쉐어 제외
        continue
    if stops != "0":       # 직항만
        continue
    if src == "\\N" or dst == "\\N":
        continue
    ke_routes.append({
        "src": src,
        "dst": dst,
        "aircraft": guess_aircraft(equip),
    })

print(f"Found {len(ke_routes)} KE direct routes")

# 중복 제거 (같은 src-dst 쌍)
seen = set()
unique = []
for r in ke_routes:
    key = (r["src"], r["dst"])
    if key not in seen:
        seen.add(key)
        unique.append(r)

print(f"Unique routes: {len(unique)}")

# 편번을 추론할 수 없으므로 JSON으로 출력 (참고용)
with open("ke_routes_raw.json", "w") as f:
    json.dump(unique, f, indent=2)
print("Saved ke_routes_raw.json")

# routes.ts 생성 (편번 없이 src-dst 기준 lookup 테이블)
lines = [
    'export type RouteEntry = {',
    '  departure_iata: string;',
    '  arrival_iata: string;',
    '  aircraft_type?: string;',
    '  scheduled_arrival?: string;',
    '};',
    '',
    '// Auto-generated from OpenFlights data (KE direct routes)',
    '// Keyed by "SRC-DST" for runtime lookup',
    'export const ROUTE_PAIRS: Record<string, RouteEntry> = {',
]
for r in sorted(unique, key=lambda x: (x["src"], x["dst"])):
    ac = f'"{r["aircraft"]}"' if r["aircraft"] else "undefined"
    lines.append(f'  "{r["src"]}-{r["dst"]}": {{ departure_iata: "{r["src"]}", arrival_iata: "{r["dst"]}", aircraft_type: {ac} }},')
lines += ['};', '', 'export const LOCAL_ROUTES: Record<string, RouteEntry> = {};']

with open("routes_generated.ts", "w") as f:
    f.write("\n".join(lines))
print("Saved routes_generated.ts")
print("\nDone! Check ke_routes_raw.json and routes_generated.ts")
