import sqlite3

con = sqlite3.connect("ops_briefing.db")
cur = con.execute("DELETE FROM event_tags WHERE event_id LIKE 'NTSB-%'")
tags_deleted = cur.rowcount
cur = con.execute("DELETE FROM events WHERE id LIKE 'NTSB-%'")
events_deleted = cur.rowcount
con.commit()
print("events deleted:", events_deleted)
print("event_tags deleted:", tags_deleted)
