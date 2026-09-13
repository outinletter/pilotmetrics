CREATE TABLE IF NOT EXISTS event_corrections (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  corrected_event_date TEXT,
  corrected_published_date TEXT,
  corrected_aircraft_category TEXT,
  corrected_weather_summary TEXT,
  correction_reason TEXT NOT NULL,
  evidence_source TEXT,
  status TEXT NOT NULL DEFAULT 'applied_to_view',
  corrected_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_corrections_status ON event_corrections(status);

-- Remove demonstrably wrong legacy JET labels from the analytical layer.
INSERT OR REPLACE INTO event_corrections(event_id,corrected_aircraft_category,correction_reason,evidence_source)
SELECT id,NULL,'legacy_category_conflicts_with_aircraft_name',source_url
FROM events
WHERE aircraft_category='JET'
  AND (lower(COALESCE(aircraft_type,'')) LIKE '%balloon%'
    OR lower(COALESCE(aircraft_type,'')) LIKE '%dash 8%'
    OR lower(COALESCE(aircraft_type,'')) LIKE '%airvan%'
    OR lower(COALESCE(aircraft_type,'')) LIKE '%cessna 172%');

-- ARAIB detail records provide the event/publication date pair for a subset.
INSERT OR REPLACE INTO event_corrections(event_id,corrected_event_date,corrected_published_date,correction_reason,evidence_source)
SELECT e.id,
       json_extract(r.normalized_json,'$.event_date'),
       json_extract(r.normalized_json,'$.published_date'),
       'araib_detail_explicit_event_and_publication_dates',
       json_extract(r.normalized_json,'$.source_url')
FROM events e JOIN research_source_records r
  ON r.source='araib' AND e.id='ARAIB-'||r.source_record_id
WHERE json_extract(r.normalized_json,'$.event_date') IS NOT NULL;

CREATE VIEW IF NOT EXISTS corrected_commercial_jet_events AS
SELECT e.*,
       COALESCE(c.corrected_event_date,e.event_date) AS corrected_event_date,
       COALESCE(c.corrected_published_date,e.published_date) AS corrected_published_date,
       COALESCE(c.corrected_aircraft_category,e.aircraft_category) AS corrected_aircraft_category,
       c.correction_reason
FROM events e JOIN event_quality_review q ON q.event_id=e.id
LEFT JOIN event_corrections c ON c.event_id=e.id
WHERE q.commercial_jet_status='eligible'
  AND q.analysis_status='included'
  AND q.duplicate_url_group=0
  AND q.date_review_required=0
  AND q.weather_review_required=0
  AND e.source_name<>'Sample/demo data'
  AND NOT EXISTS (SELECT 1 FROM event_corrections x WHERE x.event_id=e.id AND x.corrected_aircraft_category IS NULL);
