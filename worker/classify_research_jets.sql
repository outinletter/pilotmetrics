-- Conservative multilingual classification for the research archive.
-- Source records remain intact; only normalized_json and status metadata are enriched.
UPDATE research_source_records
SET normalized_json=json_set(normalized_json,
  '$.commercial_jet_eligible',1,
  '$.eligibility_reason','jet_type_evidence_without_operation_part'),
  record_status='eligible_jet'
WHERE lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*boeing*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*airbus*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*embraer*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*bombardier*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*737*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*747*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*757*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*767*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*777*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*787*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*a320*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*a330*'
   OR lower(COALESCE(json_extract(normalized_json,'$.aircraft_type'),'')) GLOB '*a350*'
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'ボーイング')>0
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'エアバス')>0
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'ジェット')>0
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'보잉')>0
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'에어버스')>0
   OR instr(json_extract(normalized_json,'$.aircraft_type'),'제트')>0;

UPDATE research_source_records
SET normalized_json=json_set(normalized_json,
  '$.commercial_jet_eligible',0,
  '$.eligibility_reason','no_jet_type_evidence'),
  record_status='needs_jet_review'
WHERE json_extract(normalized_json,'$.commercial_jet_eligible') IS NULL;
