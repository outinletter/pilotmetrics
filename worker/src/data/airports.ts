export const AIRPORTS: Record<string, string> = {
  // 한국
  ICN: "RKSI", GMP: "RKSS", PUS: "RKPK", CJU: "RKPC",
  TAE: "RKTN", RSU: "RKJW", KPO: "RKTH", KWJ: "RKJJ",
  CJJ: "RKNC", USN: "RKPU", WJU: "RKNW", HIN: "RKPS",
  // 미주
  JFK: "KJFK", LAX: "KLAX", SFO: "KSFO", SEA: "KSEA",
  ORD: "KORD", ATL: "KATL", DFW: "KDFW", IAD: "KIAD",
  IAH: "KIAH", LAS: "KLAS", HNL: "PHNL",
  YVR: "CYVR", YYZ: "CYYZ",
  // 남미
  GRU: "SBGR",
  // 유럽
  CDG: "LFPG", LHR: "EGLL", FRA: "EDDF", AMS: "EHAM",
  MXP: "LIMC", FCO: "LIRF", BCN: "LEBL", MAD: "LEMD",
  VIE: "LOWW", ZRH: "LSZH", IST: "LTFM", PRG: "LKPR",
  ARN: "ESSA", LED: "ULLI", SVO: "UUEE",
  // 중동
  DXB: "OMDB", AUH: "OMAA", RUH: "OERK", JED: "OEJN",
  // 아프리카
  NBO: "HKJK",
  // 인도 / 남아시아
  DEL: "VIDP", BOM: "VABB", CMB: "VCBI", KTM: "VNKT",
  // 이스라엘
  TLV: "LLBG",
  // 중앙아시아
  TAS: "UTTT",
  // 동남아
  BKK: "VTBS", CNX: "VTCC", MNL: "RPLL", CEB: "RPVM",
  SIN: "WSSS", KUL: "WMKK", BKI: "WBKK",
  HKG: "VHHH", DPS: "WADD", CGK: "WIII",
  HKT: "VTSP", SGN: "VVTS", HAN: "VVNB",
  DAD: "VVDN", CXR: "VVCR", PNH: "VDPP",
  REP: "VDSR", RGN: "VYYY", ROR: "PTRO",
  // 일본
  NRT: "RJAA", HND: "RJTT", KIX: "RJBB",
  FUK: "RJFF", NGO: "RJGG", CTS: "RJCC",
  OKA: "ROAH", KIJ: "RJSN", KMQ: "RJNK",
  KOJ: "RJFK", OIT: "RJFO", OKJ: "RJOB",
  AOJ: "RJSA", AXT: "RJSK", MDG: "RJMD",
  // 중국
  PEK: "ZBAA", PVG: "ZSPD", SHA: "ZSSS",
  CAN: "ZGGG", CTU: "ZUUU", XIY: "ZLXY",
  DLC: "ZYTL", SHE: "ZYYY", HGH: "ZSHC",
  NKG: "ZSNJ", TAO: "ZSQD", TSN: "ZBSJ",
  CSX: "ZGHA", TNA: "ZSJN", TXN: "ZSTX",
  SZX: "ZGSZ", KMG: "ZPPP", WUH: "ZHHH",
  XMN: "ZSAM", YNJ: "ZYYJ", CGO: "ZHCC",
  // 호주 / 오세아니아
  SYD: "YSSY", MEL: "YMML", BNE: "YBBN",
  AKL: "NZAA", NAN: "NFFN", GUM: "PGUM",
  // 몽골
  ULN: "ZMUB",
};

export function iataToIcao(iata: string | null | undefined): string {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()] ?? iata.toUpperCase();
}

// ICAO → IATA 역방향 조회 (없으면 빈 문자열)
const ICAO_TO_IATA: Record<string, string> = Object.fromEntries(
  Object.entries(AIRPORTS).map(([iata, icao]) => [icao, iata])
);
export function icaoToIata(icao: string | null | undefined): string {
  if (!icao) return "";
  return ICAO_TO_IATA[icao.toUpperCase()] ?? "";
}
