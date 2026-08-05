export type RouteEntry = {
  departure_iata: string;
  arrival_iata: string;
  aircraft_type?: string;
  scheduled_arrival?: string;
};

export const LOCAL_ROUTES: Record<string, RouteEntry> = {
  KE053: { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE53:  { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE054: { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  KE54:  { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  KE629: { departure_iata: "ICN", arrival_iata: "DPS", aircraft_type: "A350-900" },
  KE630: { departure_iata: "DPS", arrival_iata: "ICN", aircraft_type: "A350-900" },
  KE017: { departure_iata: "ICN", arrival_iata: "LAX", aircraft_type: "B777-300ER" },
  KE018: { departure_iata: "LAX", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE705: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "A330-300" },
  KE706: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // flight_routes.json
  KE081: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE81:  { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE082: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE82:  { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
};
