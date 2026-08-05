export const AIRPORTS: Record<string, string> = {
  ICN: "RKSI", DPS: "WADD", LAX: "KLAX", HNL: "PHNL",
  NRT: "RJAA", HND: "RJTT", SIN: "WSSS", BKK: "VTBS",
  MNL: "RPLL", HKG: "VHHH", DXB: "OMDB", JFK: "KJFK",
  CDG: "LFPG", LHR: "EGLL",
};

export function iataToIcao(iata: string | null | undefined): string {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()] ?? iata.toUpperCase();
}
