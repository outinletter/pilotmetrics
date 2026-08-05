export type RouteEntry = {
  departure_iata: string;
  arrival_iata: string;
  aircraft_type?: string;
  scheduled_arrival?: string;
};

export const LOCAL_ROUTES: Record<string, RouteEntry> = {
  // ── 미주 ──────────────────────────────────────────────────
  KE001: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE002: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE081: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE082: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE81:  { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE82:  { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE017: { departure_iata: "ICN", arrival_iata: "LAX", aircraft_type: "B777-300ER" },
  KE018: { departure_iata: "LAX", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE011: { departure_iata: "ICN", arrival_iata: "LAX", aircraft_type: "A380-800" },
  KE012: { departure_iata: "LAX", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE023: { departure_iata: "ICN", arrival_iata: "SFO", aircraft_type: "B777-300ER" },
  KE024: { departure_iata: "SFO", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE025: { departure_iata: "ICN", arrival_iata: "SEA", aircraft_type: "B787-9" },
  KE026: { departure_iata: "SEA", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE035: { departure_iata: "ICN", arrival_iata: "ORD", aircraft_type: "B777-300ER" },
  KE036: { departure_iata: "ORD", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE037: { departure_iata: "ICN", arrival_iata: "ATL", aircraft_type: "B777-300ER" },
  KE038: { departure_iata: "ATL", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE039: { departure_iata: "ICN", arrival_iata: "DFW", aircraft_type: "B787-9" },
  KE040: { departure_iata: "DFW", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE053: { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE054: { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  KE53:  { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE54:  { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  KE071: { departure_iata: "ICN", arrival_iata: "YVR", aircraft_type: "B787-9" },
  KE072: { departure_iata: "YVR", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE073: { departure_iata: "ICN", arrival_iata: "YYZ", aircraft_type: "B777-300ER" },
  KE074: { departure_iata: "YYZ", arrival_iata: "ICN", aircraft_type: "B777-300ER" },

  // ── 유럽 ──────────────────────────────────────────────────
  KE901: { departure_iata: "ICN", arrival_iata: "CDG", aircraft_type: "A380-800" },
  KE902: { departure_iata: "CDG", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE907: { departure_iata: "ICN", arrival_iata: "LHR", aircraft_type: "B777-300ER" },
  KE908: { departure_iata: "LHR", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE913: { departure_iata: "ICN", arrival_iata: "FRA", aircraft_type: "A380-800" },
  KE914: { departure_iata: "FRA", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE925: { departure_iata: "ICN", arrival_iata: "AMS", aircraft_type: "B777-300ER" },
  KE926: { departure_iata: "AMS", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE931: { departure_iata: "ICN", arrival_iata: "BCN", aircraft_type: "A330-300" },
  KE932: { departure_iata: "BCN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE935: { departure_iata: "ICN", arrival_iata: "MAD", aircraft_type: "B787-9" },
  KE936: { departure_iata: "MAD", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE937: { departure_iata: "ICN", arrival_iata: "ZRH", aircraft_type: "B787-9" },
  KE938: { departure_iata: "ZRH", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE951: { departure_iata: "ICN", arrival_iata: "VIE", aircraft_type: "B787-9" },
  KE952: { departure_iata: "VIE", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE955: { departure_iata: "ICN", arrival_iata: "MXP", aircraft_type: "B777-300ER" },
  KE956: { departure_iata: "MXP", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE957: { departure_iata: "ICN", arrival_iata: "FCO", aircraft_type: "B787-9" },
  KE958: { departure_iata: "FCO", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 중동 / 아프리카 ───────────────────────────────────────
  KE971: { departure_iata: "ICN", arrival_iata: "DXB", aircraft_type: "B777-300ER" },
  KE972: { departure_iata: "DXB", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  KE961: { departure_iata: "ICN", arrival_iata: "NBO", aircraft_type: "B787-9" },
  KE962: { departure_iata: "NBO", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 일본 ──────────────────────────────────────────────────
  KE701: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "B737-900ER" },
  KE702: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE705: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "A330-300" },
  KE706: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE711: { departure_iata: "ICN", arrival_iata: "HND", aircraft_type: "A330-300" },
  KE712: { departure_iata: "HND", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE721: { departure_iata: "ICN", arrival_iata: "OSA", aircraft_type: "A330-300" },
  KE722: { departure_iata: "OSA", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE731: { departure_iata: "ICN", arrival_iata: "FUK", aircraft_type: "B737-900ER" },
  KE732: { departure_iata: "FUK", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE741: { departure_iata: "ICN", arrival_iata: "NGO", aircraft_type: "B737-900ER" },
  KE742: { departure_iata: "NGO", arrival_iata: "ICN", aircraft_type: "B737-900ER" },

  // ── 중국 ──────────────────────────────────────────────────
  KE801: { departure_iata: "ICN", arrival_iata: "PEK", aircraft_type: "A330-300" },
  KE802: { departure_iata: "PEK", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE803: { departure_iata: "ICN", arrival_iata: "PVG", aircraft_type: "A330-300" },
  KE804: { departure_iata: "PVG", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE831: { departure_iata: "ICN", arrival_iata: "CAN", aircraft_type: "A330-300" },
  KE832: { departure_iata: "CAN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE851: { departure_iata: "ICN", arrival_iata: "CTU", aircraft_type: "B737-900ER" },
  KE852: { departure_iata: "CTU", arrival_iata: "ICN", aircraft_type: "B737-900ER" },

  // ── 동남아 ────────────────────────────────────────────────
  KE629: { departure_iata: "ICN", arrival_iata: "DPS", aircraft_type: "A350-900" },
  KE630: { departure_iata: "DPS", arrival_iata: "ICN", aircraft_type: "A350-900" },
  KE631: { departure_iata: "ICN", arrival_iata: "SIN", aircraft_type: "A330-300" },
  KE632: { departure_iata: "SIN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE651: { departure_iata: "ICN", arrival_iata: "BKK", aircraft_type: "A330-300" },
  KE652: { departure_iata: "BKK", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE659: { departure_iata: "ICN", arrival_iata: "MNL", aircraft_type: "A330-300" },
  KE660: { departure_iata: "MNL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE671: { departure_iata: "ICN", arrival_iata: "HKG", aircraft_type: "A330-300" },
  KE672: { departure_iata: "HKG", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE675: { departure_iata: "ICN", arrival_iata: "KUL", aircraft_type: "A330-300" },
  KE676: { departure_iata: "KUL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE677: { departure_iata: "ICN", arrival_iata: "KUL", aircraft_type: "A330-300" },
  KE678: { departure_iata: "KUL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE681: { departure_iata: "ICN", arrival_iata: "SGN", aircraft_type: "B737-900ER" },
  KE682: { departure_iata: "SGN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE685: { departure_iata: "ICN", arrival_iata: "HAN", aircraft_type: "B737-900ER" },
  KE686: { departure_iata: "HAN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE691: { departure_iata: "ICN", arrival_iata: "DAD", aircraft_type: "B737-900ER" },
  KE692: { departure_iata: "DAD", arrival_iata: "ICN", aircraft_type: "B737-900ER" },

  // ── 호주 / 오세아니아 ─────────────────────────────────────
  KE121: { departure_iata: "ICN", arrival_iata: "SYD", aircraft_type: "B787-9" },
  KE122: { departure_iata: "SYD", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 인도 ──────────────────────────────────────────────────
  KE471: { departure_iata: "ICN", arrival_iata: "DEL", aircraft_type: "B787-9" },
  KE472: { departure_iata: "DEL", arrival_iata: "ICN", aircraft_type: "B787-9" },
};
