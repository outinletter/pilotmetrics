UPDATE event_quality_review SET duplicate_url_group=1
WHERE event_id IN (
  SELECT e.id FROM events e
  WHERE e.source_url<>'' AND e.source_url IN (
    SELECT source_url FROM events WHERE source_url<>'' GROUP BY source_url HAVING COUNT(*)>1
  )
);
