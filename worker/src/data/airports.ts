export const AIRPORTS: Record<string, string> = {
  ICN: "RKSI", GMP: "RKSS",
  DPS: "WADD", HNL: "PHNL",
  NRT: "RJAA", HND: "RJTT", OSA: "RJBB", FUK: "RJFF", NGO: "RJGG",
  SIN: "WSSS", BKK: "VTBS", MNL: "RPLL", HKG: "VHHH",
  KUL: "WMKK", SGN: "VVTS", HAN: "VVNB", DAD: "VVDN",
  DXB: "OMDB", DEL: "VIDP",
  JFK: "KJFK", LAX: "KLAX", SFO: "KSFO", SEA: "KSEA",
  ORD: "KORD", ATL: "KATL", DFW: "KDFW", YVR: "CYVR", YYZ: "CYYZ",
  CDG: "LFPG", LHR: "EGLL", FRA: "EDDF", AMS: "EHAM",
  BCN: "LEBL", MAD: "LEMD", ZRH: "LSZH", VIE: "LOWW",
  MXP: "LIMC", FCO: "LIRF",
  PEK: "ZBAA", PVG: "ZSPD", CAN: "ZGGG", CTU: "ZUUU",
  SYD: "YSSY", NBO: "HKJK",
};

export function iataToIcao(iata: string | null | undefined): string {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()] ?? iata.toUpperCase();
}
