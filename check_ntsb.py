import sqlite3

con = sqlite3.connect("ops_briefing.db")
cur = con.execute(
    "SELECT id, event_date, weather_summary, operator, aircraft_type, flight_phase, severity "
    "FROM events WHERE id LIKE 'NTSB-%' ORDER BY event_date DESC LIMIT 10"
)
for row in cur.fetchall():
    print(row)

total = con.execute("SELECT COUNT(*) FROM events WHERE id LIKE 'NTSB-%'").fetchone()[0]
print("total:", total)
