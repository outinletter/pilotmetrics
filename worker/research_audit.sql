-- Read-only. Source records are not necessarily unique accidents.
SELECT source_name, COUNT(*) records, MIN(event_date) first_date, MAX(event_date) last_date,
  SUM(NULLIF(aircraft_type,'') IS NOT NULL) aircraft_known,
  SUM(NULLIF(operator,'') IS NOT NULL) operator_known,
  SUM(NULLIF(flight_phase,'') IS NOT NULL) phase_nonempty,
  SUM(NULLIF(event_time,'') IS NOT NULL) time_nonempty,
  SUM(NULLIF(published_date,'') IS NOT NULL) publication_known
FROM events GROUP BY source_name ORDER BY records DESC;
SELECT source_name,substr(event_date,1,4) year,COUNT(*) records
FROM events GROUP BY source_name,year ORDER BY source_name,year;
SELECT source_name,flight_phase,COUNT(*) records FROM events
GROUP BY source_name,flight_phase ORDER BY records DESC LIMIT 25;
SELECT source_name,substr(weather_summary,1,220) weather_sample,length(weather_summary) weather_length,COUNT(*) records FROM events
GROUP BY source_name,weather_summary ORDER BY records DESC LIMIT 15;
SELECT COUNT(*) duplicate_url_groups FROM
 (SELECT source_url FROM events WHERE source_url<>'' GROUP BY source_url HAVING COUNT(*)>1);
SELECT COUNT(*) duplicate_tag_groups FROM
 (SELECT event_id,tag_type,tag_value FROM event_tags GROUP BY event_id,tag_type,tag_value HAVING COUNT(*)>1);
SELECT id,source_url,event_date,published_date,summary FROM events WHERE source_name LIKE '%ARAIB%';
SELECT * FROM ops_intel_runs ORDER BY id DESC LIMIT 10;
