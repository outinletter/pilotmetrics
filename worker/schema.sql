CREATE TABLE IF NOT EXISTS flight_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_number TEXT NOT NULL,
  airline_iata TEXT,
  flight_iata TEXT,
  departure_iata TEXT,
  arrival_iata TEXT,
  departure_icao TEXT,
  arrival_icao TEXT,
  scheduled_departure TEXT,
  scheduled_arrival TEXT,
  estimated_departure TEXT,
  estimated_arrival TEXT,
  aircraft_type TEXT,
  raw_response_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weather_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  airport_icao TEXT NOT NULL,
  report_type TEXT NOT NULL,
  report_time TEXT,
  raw_text TEXT,
  parsed_json TEXT,
  risk_tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source_name TEXT,
  source_url TEXT,
  event_date TEXT,
  published_date TEXT,
  operation_type TEXT,
  airport_iata TEXT,
  airport_icao TEXT,
  runway TEXT,
  approach_type TEXT,
  flight_phase TEXT,
  aircraft_type TEXT,
  aircraft_category TEXT,
  operator TEXT,
  weather_summary TEXT,
  metar_text TEXT,
  visibility TEXT,
  wind TEXT,
  runway_condition TEXT,
  event_type TEXT,
  severity INTEGER DEFAULT 1,
  core_event TEXT,
  lesson_keyword TEXT,
  summary TEXT,
  contributing_factors TEXT,
  operational_lessons TEXT,
  pilot_briefing_sentence TEXT,
  confidence_score REAL DEFAULT 0.8,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id),
  tag_type TEXT,
  tag_value TEXT
);

CREATE TABLE IF NOT EXISTS ops_intel_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT DEFAULT 'running',
  items_checked INTEGER DEFAULT 0,
  items_saved INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ops_intel_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT,
  operation_type TEXT,
  category TEXT,
  severity TEXT DEFAULT 'Low',
  summary TEXT,
  operational_lesson TEXT,
  a350_b787_applicability TEXT,
  recommended_action TEXT,
  tags TEXT,
  last_status INTEGER,
  last_checked_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_airport_icao ON events(airport_icao);
CREATE INDEX IF NOT EXISTS idx_event_tags_event_id ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_ops_intel_items_url ON ops_intel_items(source_url);
