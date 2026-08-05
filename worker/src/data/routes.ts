export type RouteEntry = {
  departure_iata: string;
  arrival_iata: string;
  aircraft_type?: string;
  scheduled_arrival?: string;
};

export const LOCAL_ROUTES: Record<string, RouteEntry> = {
  // ── 미주 (North America) ──────────────────────────────────
  // JFK (뉴욕): KE081~086
  KE081: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE082: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE083: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "A380-800" },
  KE084: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE085: { departure_iata: "ICN", arrival_iata: "JFK", aircraft_type: "B777-300ER" },
  KE086: { departure_iata: "JFK", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // LAX (로스앤젤레스): KE011~018
  KE011: { departure_iata: "ICN", arrival_iata: "LAX", aircraft_type: "A380-800" },
  KE012: { departure_iata: "LAX", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE017: { departure_iata: "ICN", arrival_iata: "LAX", aircraft_type: "B777-300ER" },
  KE018: { departure_iata: "LAX", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // SFO (샌프란시스코): KE023~024
  KE023: { departure_iata: "ICN", arrival_iata: "SFO", aircraft_type: "B777-300ER" },
  KE024: { departure_iata: "SFO", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // SEA (시애틀): KE025~026
  KE025: { departure_iata: "ICN", arrival_iata: "SEA", aircraft_type: "B787-9" },
  KE026: { departure_iata: "SEA", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // ORD (시카고): KE035~036
  KE035: { departure_iata: "ICN", arrival_iata: "ORD", aircraft_type: "B777-300ER" },
  KE036: { departure_iata: "ORD", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // ATL (애틀랜타): KE037~038
  KE037: { departure_iata: "ICN", arrival_iata: "ATL", aircraft_type: "B777-300ER" },
  KE038: { departure_iata: "ATL", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // DFW (달라스): KE039~040
  KE039: { departure_iata: "ICN", arrival_iata: "DFW", aircraft_type: "B787-9" },
  KE040: { departure_iata: "DFW", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // HNL (호놀룰루): KE051~054
  KE051: { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE052: { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  KE053: { departure_iata: "ICN", arrival_iata: "HNL", aircraft_type: "B787-10" },
  KE054: { departure_iata: "HNL", arrival_iata: "ICN", aircraft_type: "B787-10" },
  // YVR (밴쿠버): KE071~072
  KE071: { departure_iata: "ICN", arrival_iata: "YVR", aircraft_type: "B787-9" },
  KE072: { departure_iata: "YVR", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // YYZ (토론토): KE073~074
  KE073: { departure_iata: "ICN", arrival_iata: "YYZ", aircraft_type: "B777-300ER" },
  KE074: { departure_iata: "YYZ", arrival_iata: "ICN", aircraft_type: "B777-300ER" },

  // ── 유럽 (Europe) ─────────────────────────────────────────
  // CDG (파리): KE901~906
  KE901: { departure_iata: "ICN", arrival_iata: "CDG", aircraft_type: "A380-800" },
  KE902: { departure_iata: "CDG", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE903: { departure_iata: "ICN", arrival_iata: "CDG", aircraft_type: "A380-800" },
  KE904: { departure_iata: "CDG", arrival_iata: "ICN", aircraft_type: "A380-800" },
  // LHR (런던): KE907~908
  KE907: { departure_iata: "ICN", arrival_iata: "LHR", aircraft_type: "B777-300ER" },
  KE908: { departure_iata: "LHR", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // FRA (프랑크푸르트): KE913~916
  KE913: { departure_iata: "ICN", arrival_iata: "FRA", aircraft_type: "A380-800" },
  KE914: { departure_iata: "FRA", arrival_iata: "ICN", aircraft_type: "A380-800" },
  KE915: { departure_iata: "ICN", arrival_iata: "FRA", aircraft_type: "B777-300ER" },
  KE916: { departure_iata: "FRA", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // AMS (암스테르담): KE925~926
  KE925: { departure_iata: "ICN", arrival_iata: "AMS", aircraft_type: "B777-300ER" },
  KE926: { departure_iata: "AMS", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // MXP (밀라노): KE927~928
  KE927: { departure_iata: "ICN", arrival_iata: "MXP", aircraft_type: "B777-300ER" },
  KE928: { departure_iata: "MXP", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // FCO (로마): KE929~930
  KE929: { departure_iata: "ICN", arrival_iata: "FCO", aircraft_type: "B787-9" },
  KE930: { departure_iata: "FCO", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // BCN (바르셀로나): KE933~934
  KE933: { departure_iata: "ICN", arrival_iata: "BCN", aircraft_type: "B787-9" },
  KE934: { departure_iata: "BCN", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // MAD (마드리드): KE935~936
  KE935: { departure_iata: "ICN", arrival_iata: "MAD", aircraft_type: "B787-9" },
  KE936: { departure_iata: "MAD", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // VIE (비엔나): KE937~938
  KE937: { departure_iata: "ICN", arrival_iata: "VIE", aircraft_type: "B787-9" },
  KE938: { departure_iata: "VIE", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // ZRH (취리히): KE939~940
  KE939: { departure_iata: "ICN", arrival_iata: "ZRH", aircraft_type: "B787-9" },
  KE940: { departure_iata: "ZRH", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // IST (이스탄불): KE957~958
  KE957: { departure_iata: "ICN", arrival_iata: "IST", aircraft_type: "B787-9" },
  KE958: { departure_iata: "IST", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // PRG (프라하): KE959~960
  KE959: { departure_iata: "ICN", arrival_iata: "PRG", aircraft_type: "B787-9" },
  KE960: { departure_iata: "PRG", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 중동 / 아프리카 ───────────────────────────────────────
  // DXB (두바이): KE951~952
  KE951: { departure_iata: "ICN", arrival_iata: "DXB", aircraft_type: "B777-300ER" },
  KE952: { departure_iata: "DXB", arrival_iata: "ICN", aircraft_type: "B777-300ER" },
  // NBO (나이로비): KE953~954
  KE953: { departure_iata: "ICN", arrival_iata: "NBO", aircraft_type: "B787-9" },
  KE954: { departure_iata: "NBO", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 호주 / 오세아니아 ─────────────────────────────────────
  // SYD (시드니): KE121~124
  KE121: { departure_iata: "ICN", arrival_iata: "SYD", aircraft_type: "B787-9" },
  KE122: { departure_iata: "SYD", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE123: { departure_iata: "ICN", arrival_iata: "SYD", aircraft_type: "B787-9" },
  KE124: { departure_iata: "SYD", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // MEL (멜버른): KE125~126
  KE125: { departure_iata: "ICN", arrival_iata: "MEL", aircraft_type: "B787-9" },
  KE126: { departure_iata: "MEL", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 인도 ──────────────────────────────────────────────────
  // DEL (뉴델리): KE471~474
  KE471: { departure_iata: "ICN", arrival_iata: "DEL", aircraft_type: "B787-9" },
  KE472: { departure_iata: "DEL", arrival_iata: "ICN", aircraft_type: "B787-9" },
  KE473: { departure_iata: "ICN", arrival_iata: "DEL", aircraft_type: "B787-9" },
  KE474: { departure_iata: "DEL", arrival_iata: "ICN", aircraft_type: "B787-9" },
  // BOM (뭄바이): KE475~476
  KE475: { departure_iata: "ICN", arrival_iata: "BOM", aircraft_type: "B787-9" },
  KE476: { departure_iata: "BOM", arrival_iata: "ICN", aircraft_type: "B787-9" },

  // ── 동남아 (Southeast Asia) ───────────────────────────────
  // BKK (방콕 수완나품): KE651~658
  KE651: { departure_iata: "ICN", arrival_iata: "BKK", aircraft_type: "A330-300" },
  KE652: { departure_iata: "BKK", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE653: { departure_iata: "ICN", arrival_iata: "BKK", aircraft_type: "A330-300" },
  KE654: { departure_iata: "BKK", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE657: { departure_iata: "ICN", arrival_iata: "BKK", aircraft_type: "B737-900ER" },
  KE658: { departure_iata: "BKK", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // MNL (마닐라): KE619~622
  KE619: { departure_iata: "ICN", arrival_iata: "MNL", aircraft_type: "A330-300" },
  KE620: { departure_iata: "MNL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE621: { departure_iata: "ICN", arrival_iata: "MNL", aircraft_type: "A330-300" },
  KE622: { departure_iata: "MNL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // SIN (싱가포르): KE643~648
  KE643: { departure_iata: "ICN", arrival_iata: "SIN", aircraft_type: "A330-300" },
  KE644: { departure_iata: "SIN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE645: { departure_iata: "ICN", arrival_iata: "SIN", aircraft_type: "A330-300" },
  KE646: { departure_iata: "SIN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // KUL (쿠알라룸푸르): KE671~678
  KE671: { departure_iata: "ICN", arrival_iata: "KUL", aircraft_type: "A330-300" },
  KE672: { departure_iata: "KUL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE673: { departure_iata: "ICN", arrival_iata: "KUL", aircraft_type: "A330-300" },
  KE674: { departure_iata: "KUL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE677: { departure_iata: "ICN", arrival_iata: "KUL", aircraft_type: "A330-300" },
  KE678: { departure_iata: "KUL", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // DPS (발리): KE629~630
  KE629: { departure_iata: "ICN", arrival_iata: "DPS", aircraft_type: "A350-900" },
  KE630: { departure_iata: "DPS", arrival_iata: "ICN", aircraft_type: "A350-900" },
  // HKG (홍콩): KE601~608
  KE601: { departure_iata: "ICN", arrival_iata: "HKG", aircraft_type: "A330-300" },
  KE602: { departure_iata: "HKG", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE603: { departure_iata: "ICN", arrival_iata: "HKG", aircraft_type: "A330-300" },
  KE604: { departure_iata: "HKG", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // SGN (호치민): KE683~688
  KE683: { departure_iata: "ICN", arrival_iata: "SGN", aircraft_type: "B737-900ER" },
  KE684: { departure_iata: "SGN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE685: { departure_iata: "ICN", arrival_iata: "SGN", aircraft_type: "B737-900ER" },
  KE686: { departure_iata: "SGN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // HAN (하노이): KE691~698
  KE691: { departure_iata: "ICN", arrival_iata: "HAN", aircraft_type: "B737-900ER" },
  KE692: { departure_iata: "HAN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE693: { departure_iata: "ICN", arrival_iata: "HAN", aircraft_type: "B737-900ER" },
  KE694: { departure_iata: "HAN", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // DAD (다낭): KE461~466
  KE461: { departure_iata: "ICN", arrival_iata: "DAD", aircraft_type: "B737-900ER" },
  KE462: { departure_iata: "DAD", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE463: { departure_iata: "ICN", arrival_iata: "DAD", aircraft_type: "B737-900ER" },
  KE464: { departure_iata: "DAD", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // CXR (나트랑): KE467~470
  KE467: { departure_iata: "ICN", arrival_iata: "CXR", aircraft_type: "B737-900ER" },
  KE468: { departure_iata: "CXR", arrival_iata: "ICN", aircraft_type: "B737-900ER" },

  // ── 일본 (Japan) ──────────────────────────────────────────
  // NRT (도쿄 나리타): KE701~708
  KE701: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "A330-300" },
  KE702: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE703: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "A330-300" },
  KE704: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE705: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "B737-900ER" },
  KE706: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE707: { departure_iata: "ICN", arrival_iata: "NRT", aircraft_type: "B737-900ER" },
  KE708: { departure_iata: "NRT", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // HND (도쿄 하네다): KE711~716
  KE711: { departure_iata: "ICN", arrival_iata: "HND", aircraft_type: "A330-300" },
  KE712: { departure_iata: "HND", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE713: { departure_iata: "ICN", arrival_iata: "HND", aircraft_type: "B737-900ER" },
  KE714: { departure_iata: "HND", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // KIX (오사카 간사이): KE721~728
  KE721: { departure_iata: "ICN", arrival_iata: "KIX", aircraft_type: "A330-300" },
  KE722: { departure_iata: "KIX", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE723: { departure_iata: "ICN", arrival_iata: "KIX", aircraft_type: "B737-900ER" },
  KE724: { departure_iata: "KIX", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // FUK (후쿠오카): KE731~738
  KE731: { departure_iata: "ICN", arrival_iata: "FUK", aircraft_type: "B737-900ER" },
  KE732: { departure_iata: "FUK", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE733: { departure_iata: "ICN", arrival_iata: "FUK", aircraft_type: "B737-900ER" },
  KE734: { departure_iata: "FUK", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // NGO (나고야): KE741~744
  KE741: { departure_iata: "ICN", arrival_iata: "NGO", aircraft_type: "B737-900ER" },
  KE742: { departure_iata: "NGO", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  KE743: { departure_iata: "ICN", arrival_iata: "NGO", aircraft_type: "B737-900ER" },
  KE744: { departure_iata: "NGO", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // CTS (삿포로): KE771~774
  KE771: { departure_iata: "ICN", arrival_iata: "CTS", aircraft_type: "B737-900ER" },
  KE772: { departure_iata: "CTS", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // OKA (오키나와): KE757~760
  KE757: { departure_iata: "ICN", arrival_iata: "OKA", aircraft_type: "B737-900ER" },
  KE758: { departure_iata: "OKA", arrival_iata: "ICN", aircraft_type: "B737-900ER" },

  // ── 중국 (China) ──────────────────────────────────────────
  // PEK (베이징 수도): KE801~808
  KE801: { departure_iata: "ICN", arrival_iata: "PEK", aircraft_type: "A330-300" },
  KE802: { departure_iata: "PEK", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE803: { departure_iata: "ICN", arrival_iata: "PEK", aircraft_type: "B737-900ER" },
  KE804: { departure_iata: "PEK", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // PVG (상하이 푸동): KE881~886
  KE881: { departure_iata: "ICN", arrival_iata: "PVG", aircraft_type: "A330-300" },
  KE882: { departure_iata: "PVG", arrival_iata: "ICN", aircraft_type: "A330-300" },
  KE883: { departure_iata: "ICN", arrival_iata: "PVG", aircraft_type: "B737-900ER" },
  KE884: { departure_iata: "PVG", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // SHA (상하이 훙차오): KE885~886
  KE885: { departure_iata: "ICN", arrival_iata: "SHA", aircraft_type: "B737-900ER" },
  KE886: { departure_iata: "SHA", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // CAN (광저우): KE831~832
  KE831: { departure_iata: "ICN", arrival_iata: "CAN", aircraft_type: "A330-300" },
  KE832: { departure_iata: "CAN", arrival_iata: "ICN", aircraft_type: "A330-300" },
  // CTU (청두): KE855~856
  KE855: { departure_iata: "ICN", arrival_iata: "CTU", aircraft_type: "B737-900ER" },
  KE856: { departure_iata: "CTU", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
  // XIY (시안): KE857~858
  KE857: { departure_iata: "ICN", arrival_iata: "XIY", aircraft_type: "B737-900ER" },
  KE858: { departure_iata: "XIY", arrival_iata: "ICN", aircraft_type: "B737-900ER" },
};
