CREATE TABLE IF NOT EXISTS event_quality_review (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  original_event_date TEXT,
  original_published_date TEXT,
  original_aircraft_category TEXT,
  original_weather_summary TEXT,
  commercial_jet_status TEXT NOT NULL,
  eligibility_reason TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  duplicate_url_group INTEGER DEFAULT 0,
  weather_review_required INTEGER DEFAULT 0,
  date_review_required INTEGER DEFAULT 0,
  reviewed_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_quality_analysis ON event_quality_review(analysis_status,commercial_jet_status);
CREATE VIEW IF NOT EXISTS commercial_jet_analysis_events AS
SELECT e.* FROM events e JOIN event_quality_review q ON q.event_id=e.id
WHERE q.analysis_status='included' AND q.commercial_jet_status='eligible';
