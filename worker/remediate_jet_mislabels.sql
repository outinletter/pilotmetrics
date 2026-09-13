-- Existing aircraft_category=JET is known to be unreliable in ASN/TSB imports.
-- Retain the original value, but require aircraft-name evidence or explicit Part 121/129 evidence.
UPDATE event_quality_review
SET commercial_jet_status='review',
    eligibility_reason='legacy_jet_category_without_type_evidence',
    analysis_status='needs_jet_review'
WHERE commercial_jet_status='eligible'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%boeing%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%airbus%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%embraer%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%bombardier%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%737%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%747%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%757%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%767%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%777%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%787%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%a320%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%a330%'
  AND lower(COALESCE((SELECT aircraft_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%a350%'
  AND lower(COALESCE((SELECT operation_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%121%'
  AND lower(COALESCE((SELECT operation_type FROM events WHERE events.id=event_quality_review.event_id),'')) NOT LIKE '%129%';
