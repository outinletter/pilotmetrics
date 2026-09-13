-- Additive research store. Source records are NOT deduplicated occurrences.
CREATE TABLE IF NOT EXISTS research_source_records (
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  event_date TEXT,
  published_date TEXT,
  investigation_authority_country TEXT,
  occurrence_country TEXT,
  record_status TEXT NOT NULL,
  normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json)),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  content_sha256 TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY(source, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_research_event_date ON research_source_records(event_date);
CREATE INDEX IF NOT EXISTS idx_research_country ON research_source_records(occurrence_country,event_date);
CREATE VIEW IF NOT EXISTS research_coverage AS
SELECT source, substr(event_date,1,4) event_year, record_status, COUNT(*) source_records,
  SUM(occurrence_country IS NOT NULL) country_known,
  SUM(json_extract(normalized_json,'$.aircraft_type') IS NOT NULL) aircraft_known,
  SUM(json_extract(normalized_json,'$.operator') IS NOT NULL) operator_known
FROM research_source_records GROUP BY source,event_year,record_status;
-- Keep samples and unverified ARAIB dates out of the legacy analytical cohort.
CREATE VIEW IF NOT EXISTS research_legacy_candidates AS
SELECT * FROM events WHERE event_date >= '2000-01-01'
  AND event_date <= date('now') AND source_name <> 'Sample/demo data'
  AND source_name NOT LIKE '%ARAIB%';
CREATE VIEW IF NOT EXISTS research_commercial_jet_candidates AS
SELECT * FROM research_source_records
WHERE json_extract(normalized_json,'$.commercial_jet_eligible') = 1;
