CREATE VIEW IF NOT EXISTS commercial_jet_verified_events AS
SELECT e.* FROM events e JOIN event_quality_review q ON q.event_id=e.id
WHERE q.analysis_status='included'
  AND q.commercial_jet_status='eligible'
  AND q.duplicate_url_group=0
  AND q.date_review_required=0;
