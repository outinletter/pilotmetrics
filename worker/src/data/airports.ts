export const AIRPORTS: Record<string, string> = {
  // 한국
  ICN: "RKSI", GMP: "RKSS",
  // 미주
  JFK: "KJFK", LAX: "KLAX", SFO: "KSFO", SEA: "KSEA",
  ORD: "KORD", ATL: "KATL", DFW: "KDFW",
  HNL: "PHNL", YVR: "CYVR", YYZ: "CYYZ",
  // 유럽
  CDG: "LFPG", LHR: "EGLL", FRA: "EDDF", AMS: "EHAM",
  MXP: "LIMC", FCO: "LIRF", BCN: "LEBL", MAD: "LEMD",
  VIE: "LOWW", ZRH: "LSZH", IST: "LTFM", PRG: "LKPR",
  // 중동 / 아프리카
  DXB: "OMDB", NBO: "HKJK",
  // 인도
  DEL: "VIDP", BOM: "VABB",
  // 동남아
  BKK: "VTBS", MNL: "RPLL", SIN: "WSSS",
  KUL: "WMKK", HKG: "VHHH", DPS: "WADD",
  SGN: "VVTS", HAN: "VVNB", DAD: "VVDN", CXR: "VVCR",
  // 일본
  NRT: "RJAA", HND: "RJTT", KIX: "RJBB",
  FUK: "RJFF", NGO: "RJGG", CTS: "RJCC", OKA: "ROAH",
  // 중국
  PEK: "ZBAA", PVG: "ZSPD", SHA: "ZSSS",
  CAN: "ZGGG", CTU: "ZUUU", XIY: "ZLXY",
  // 호주
  SYD: "YSSY", MEL: "YMML",
};

export function iataToIcao(iata: string | null | undefined): string {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()] ?? iata.toUpperCase();
}
