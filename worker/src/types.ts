export type Env = {
  DB: D1Database;
  AI: Ai;
  AVIATIONSTACK_API_KEY: string;
  OPS_INTEL_AUTOSTART?: string;
  OPS_INTEL_INTERVAL_HOURS?: string;
  MAX_DETAIL_FETCHES?: string;
  PRIORITY_FULL_SCAN?: string;
};

export type FlightRow = {
  flight_number: string;
  airline_iata: string | null;
  flight_iata: string | null;
  departure_iata: string | null;
  arrival_iata: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  aircraft_type: string | null;
};

export type EventRow = {
  id: string;
  source_name: string | null;
  source_url: string | null;
  event_date: string | null;
  published_date: string | null;
  operation_type: string | null;
  airport_iata: string | null;
  airport_icao: string | null;
  runway: string | null;
  approach_type: string | null;
  flight_phase: string | null;
  aircraft_type: string | null;
  aircraft_category: string | null;
  operator: string | null;
  weather_summary: string | null;
  runway_condition: string | null;
  event_type: string | null;
  severity: number | null;
  core_event: string | null;
  lesson_keyword: string | null;
  summary: string | null;
  contributing_factors: string | null;
  operational_lessons: string | null;
  pilot_briefing_sentence: string | null;
  confidence_score: number | null;
};

export type OpsIntelItemRow = {
  id: number;
  source_name: string;
  source_url: string;
  title: string | null;
  category: string | null;
  severity: string | null;
  summary: string | null;
  operational_lesson: string | null;
  a350_b787_applicability: string | null;
  recommended_action: string | null;
  tags: string | null;
  last_status: number | null;
  last_checked_at: string | null;
  updated_at: string;
};

export type OpsIntelRunRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  items_checked: number;
  items_saved: number;
  error: string | null;
};

export type Source = {
  name: string;
  url: string;
  category: string;
  tags: string[];
};
