INSERT OR REPLACE INTO event_quality_review (
 event_id,original_event_date,original_published_date,original_aircraft_category,original_weather_summary,
 commercial_jet_status,eligibility_reason,analysis_status,duplicate_url_group,weather_review_required,date_review_required)
SELECT e.id,e.event_date,e.published_date,e.aircraft_category,e.weather_summary,
 CASE WHEN e.source_name='Sample/demo data' THEN 'excluded'
      WHEN lower(COALESCE(e.aircraft_type,'')) GLOB '*boeing*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*airbus*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*737*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a320*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a350*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*777*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*787*' THEN 'eligible'
      WHEN e.aircraft_category='JET' AND (e.operation_type LIKE '%121%' OR e.operation_type LIKE '%129%') THEN 'eligible'
      WHEN e.aircraft_category='JET' THEN 'review'
      ELSE 'unknown' END,
 CASE WHEN e.source_name='Sample/demo data' THEN 'demo_data'
      WHEN lower(COALESCE(e.aircraft_type,'')) GLOB '*boeing*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*airbus*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*737*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a320*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a350*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*777*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*787*' THEN 'jet_type_evidence'
      WHEN e.aircraft_category='JET' AND (e.operation_type LIKE '%121%' OR e.operation_type LIKE '%129%') THEN 'commercial_part_and_jet_type'
      WHEN e.aircraft_category='JET' THEN 'category_requires_source_review'
      ELSE 'no_jet_evidence' END,
 CASE WHEN e.source_name='Sample/demo data' THEN 'excluded'
      WHEN e.source_name LIKE '%ARAIB%' AND (e.event_date IS NULL OR e.published_date IS NULL) THEN 'needs_date_review'
      WHEN e.aircraft_category='JET' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*boeing*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*airbus*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*737*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a320*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*a350*' OR lower(COALESCE(e.aircraft_type,'')) GLOB '*777*'
        OR lower(COALESCE(e.aircraft_type,'')) GLOB '*787*' THEN 'included'
      ELSE 'excluded' END,
 0,
 CASE WHEN lower(COALESCE(e.weather_summary,'')) GLOB '*canada*' OR lower(COALESCE(e.weather_summary,'')) GLOB '*united states*' OR lower(COALESCE(e.weather_summary,'')) GLOB '*ontario*' THEN 1 ELSE 0 END,
 CASE WHEN e.source_name LIKE '%ARAIB%' AND (e.event_date IS NULL OR e.published_date IS NULL) THEN 1 ELSE 0 END
FROM events e;
