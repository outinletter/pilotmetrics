/** 공항별 지형·접근·활주로 위험 데이터 */
export type AirportHazard = {
  /** 주요 착륙 활주로 방향(°자기) — 복수 활주로 */
  runways: number[];
  /** 고도(ft) */
  altitude_ft: number;
  /** 지형/접근 특성 */
  terrain: "standard" | "coastal" | "mountain" | "high_altitude" | "island" | "urban_confined";
  /** 고정 위험 태그 (날씨와 무관하게 항상 부가) */
  fixed_risks: string[];
  /** UTC 오프셋(h) — 야간 도착 판별용 */
  utc_offset: number;
};

export const AIRPORT_HAZARDS: Record<string, AirportHazard> = {
  // ── 한국 ──────────────────────────────────────────────────────────────────
  RKSI: { runways: [160, 340], altitude_ft: 23,  terrain: "coastal",  fixed_risks: [], utc_offset: 9 },
  RKSS: { runways: [140, 320], altitude_ft: 59,  terrain: "urban_confined", fixed_risks: ["SHORT_SECTOR"], utc_offset: 9 },
  RKPK: { runways: [180, 360], altitude_ft: 11,  terrain: "coastal",  fixed_risks: [], utc_offset: 9 },
  RKPC: { runways: [70, 250],  altitude_ft: 118, terrain: "island",   fixed_risks: ["ISLAND_APPROACH"], utc_offset: 9 },

  // ── 일본 ──────────────────────────────────────────────────────────────────
  RJAA: { runways: [160, 340], altitude_ft: 41,  terrain: "coastal",  fixed_risks: [], utc_offset: 9 },
  RJTT: { runways: [160, 340], altitude_ft: 21,  terrain: "urban_confined", fixed_risks: ["NOISE_ABATEMENT"], utc_offset: 9 },
  RJBB: { runways: [60, 240],  altitude_ft: 26,  terrain: "coastal",  fixed_risks: [], utc_offset: 9 },
  RJFF: { runways: [160, 340], altitude_ft: 32,  terrain: "standard", fixed_risks: [], utc_offset: 9 },
  RJCC: { runways: [110, 290], altitude_ft: 87,  terrain: "standard", fixed_risks: [], utc_offset: 9 },

  // ── 중국 ──────────────────────────────────────────────────────────────────
  ZBAA: { runways: [10, 190],  altitude_ft: 116, terrain: "standard", fixed_risks: [], utc_offset: 8 },
  ZSPD: { runways: [170, 350], altitude_ft: 13,  terrain: "coastal",  fixed_risks: [], utc_offset: 8 },
  ZUUU: { runways: [20, 200],  altitude_ft: 1624, terrain: "mountain", fixed_risks: ["MOUNTAIN_APPROACH", "HIGH_ALTITUDE"], utc_offset: 8 },
  ZPPP: { runways: [30, 210],  altitude_ft: 6404, terrain: "high_altitude", fixed_risks: ["HIGH_ALTITUDE", "MOUNTAIN_APPROACH"], utc_offset: 8 },

  // ── 동남아 ────────────────────────────────────────────────────────────────
  WADD: { runways: [90, 270],  altitude_ft: 14,  terrain: "coastal",  fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 8 },
  VTBS: { runways: [0, 180],   altitude_ft: 5,   terrain: "standard", fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 7 },
  WSSS: { runways: [20, 200],  altitude_ft: 22,  terrain: "island",   fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 8 },
  WMKK: { runways: [140, 320], altitude_ft: 69,  terrain: "standard", fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 8 },
  RPLL: { runways: [60, 240],  altitude_ft: 75,  terrain: "standard", fixed_risks: ["TYPHOON_RISK", "TROPICAL_CONVECTION"], utc_offset: 8 },
  WIII: { runways: [70, 250],  altitude_ft: 34,  terrain: "coastal",  fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 7 },
  VVTS: { runways: [70, 250],  altitude_ft: 33,  terrain: "standard", fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 7 },
  VVNB: { runways: [110, 290], altitude_ft: 40,  terrain: "standard", fixed_risks: ["TROPICAL_CONVECTION"], utc_offset: 7 },

  // ── 남아시아 ──────────────────────────────────────────────────────────────
  VIDP: { runways: [90, 270],  altitude_ft: 777, terrain: "standard", fixed_risks: [], utc_offset: 5.5 },
  VABB: { runways: [90, 270],  altitude_ft: 37,  terrain: "coastal",  fixed_risks: [], utc_offset: 5.5 },
  VNKT: { runways: [20, 200],  altitude_ft: 4390, terrain: "high_altitude", fixed_risks: ["HIGH_ALTITUDE", "MOUNTAIN_APPROACH", "ONE_SIDED_GO_AROUND"], utc_offset: 5.75 },

  // ── 중동 ──────────────────────────────────────────────────────────────────
  OMDB: { runways: [120, 300], altitude_ft: 62,  terrain: "coastal",  fixed_risks: ["DUST_RISK"], utc_offset: 4 },
  OMAA: { runways: [130, 310], altitude_ft: 88,  terrain: "standard", fixed_risks: ["DUST_RISK"], utc_offset: 4 },
  OERK: { runways: [150, 330], altitude_ft: 2049, terrain: "standard", fixed_risks: ["DUST_RISK", "HIGH_TEMP_PERF"], utc_offset: 3 },

  // ── 유럽 ──────────────────────────────────────────────────────────────────
  LFPG: { runways: [90, 270],  altitude_ft: 392, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  EGLL: { runways: [90, 270],  altitude_ft: 83,  terrain: "urban_confined", fixed_risks: ["NOISE_ABATEMENT", "CONGESTED_AIRSPACE"], utc_offset: 0 },
  EDDF: { runways: [70, 250],  altitude_ft: 364, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  EHAM: { runways: [40, 220],  altitude_ft: -11, terrain: "standard", fixed_risks: [], utc_offset: 1 },

  // ── 미주 ──────────────────────────────────────────────────────────────────
  KJFK: { runways: [40, 220],  altitude_ft: 13,  terrain: "coastal",  fixed_risks: ["CONGESTED_AIRSPACE"], utc_offset: -5 },
  KLAX: { runways: [70, 250],  altitude_ft: 126, terrain: "coastal",  fixed_risks: ["CONGESTED_AIRSPACE"], utc_offset: -8 },
  KSFO: { runways: [80, 280],  altitude_ft: 13,  terrain: "coastal",  fixed_risks: ["MARINE_LAYER_FOG"], utc_offset: -8 },
  KSEA: { runways: [160, 340], altitude_ft: 433, terrain: "coastal",  fixed_risks: [], utc_offset: -8 },
  KORD: { runways: [100, 280], altitude_ft: 672, terrain: "standard", fixed_risks: ["CONGESTED_AIRSPACE"], utc_offset: -6 },
  KATL: { runways: [80, 260],  altitude_ft: 1026, terrain: "standard", fixed_risks: ["CONGESTED_AIRSPACE"], utc_offset: -5 },
  KDFW: { runways: [180, 360], altitude_ft: 607, terrain: "standard", fixed_risks: [], utc_offset: -6 },
  KIAD: { runways: [10, 190],  altitude_ft: 313, terrain: "standard", fixed_risks: [], utc_offset: -5 },
  KIAH: { runways: [150, 330], altitude_ft: 96,  terrain: "standard", fixed_risks: [], utc_offset: -6 },
  KLAS: { runways: [70, 250],  altitude_ft: 2181, terrain: "standard", fixed_risks: ["HIGH_TEMP_PERF", "HIGH_ALTITUDE"], utc_offset: -8 },
  PHNL: { runways: [80, 260],  altitude_ft: 13,  terrain: "island",   fixed_risks: ["ISLAND_APPROACH"], utc_offset: -10 },
  CYVR: { runways: [80, 260],  altitude_ft: 14,  terrain: "coastal",  fixed_risks: ["MARINE_LAYER_FOG"], utc_offset: -8 },

  // ── 유럽 (추가) ────────────────────────────────────────────────────────────
  LIMC: { runways: [90, 270],  altitude_ft: 768, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  LIRF: { runways: [70, 250],  altitude_ft: 14,  terrain: "standard", fixed_risks: [], utc_offset: 1 },
  LEMD: { runways: [150, 330], altitude_ft: 2004, terrain: "high_altitude", fixed_risks: ["HIGH_ALTITUDE"], utc_offset: 1 },
  LEBL: { runways: [70, 250],  altitude_ft: 12,  terrain: "coastal",  fixed_risks: [], utc_offset: 1 },
  LSZH: { runways: [100, 280], altitude_ft: 1416, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  LOWW: { runways: [110, 290], altitude_ft: 600, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  LKPR: { runways: [130, 310], altitude_ft: 1247, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  LTFM: { runways: [30, 210],  altitude_ft: 325, terrain: "standard", fixed_risks: [], utc_offset: 3 },
  ESSA: { runways: [10, 190],  altitude_ft: 137, terrain: "standard", fixed_risks: [], utc_offset: 1 },
  ULLI: { runways: [100, 280], altitude_ft: 78,  terrain: "standard", fixed_risks: [], utc_offset: 3 },
  UUEE: { runways: [60, 240],  altitude_ft: 626, terrain: "standard", fixed_risks: [], utc_offset: 3 },

  // ── 중동 (추가) ────────────────────────────────────────────────────────────
  OEJN: { runways: [160, 340], altitude_ft: 48,  terrain: "coastal",  fixed_risks: ["DUST_RISK", "HIGH_TEMP_PERF"], utc_offset: 3 },
  LLBG: { runways: [80, 260],  altitude_ft: 135, terrain: "standard", fixed_risks: [], utc_offset: 2 },

  // ── 아프리카 / 기타 ────────────────────────────────────────────────────────
  HKJK: { runways: [60, 240],  altitude_ft: 5330, terrain: "high_altitude", fixed_risks: ["HIGH_ALTITUDE"], utc_offset: 3 },
  SBGR: { runways: [100, 280], altitude_ft: 2459, terrain: "standard", fixed_risks: ["HIGH_ALTITUDE"], utc_offset: -3 },

  // ── 오세아니아 ────────────────────────────────────────────────────────────
  PGUM: { runways: [60, 240],  altitude_ft: 299, terrain: "island",   fixed_risks: ["ISLAND_APPROACH", "TYPHOON_RISK"], utc_offset: 10 },
  NZAA: { runways: [50, 230],  altitude_ft: 23,  terrain: "coastal",  fixed_risks: [], utc_offset: 12 },
  NFFN: { runways: [100, 280], altitude_ft: 59,  terrain: "island",   fixed_risks: ["ISLAND_APPROACH", "TROPICAL_CONVECTION"], utc_offset: 12 },
  YMML: { runways: [160, 340], altitude_ft: 434, terrain: "standard", fixed_risks: [], utc_offset: 10 },
  YBBN: { runways: [140, 320], altitude_ft: 21,  terrain: "coastal",  fixed_risks: [], utc_offset: 10 },

  // ── 호주 ──────────────────────────────────────────────────────────────────
  YSSY: { runways: [70, 250],  altitude_ft: 21,  terrain: "coastal",  fixed_risks: [], utc_offset: 10 },
};

/** 공항 ICAO 코드로 지형 위험 태그 반환 */
export function airportFixedRisks(icao: string | null | undefined): string[] {
  if (!icao) return [];
  return AIRPORT_HAZARDS[icao.toUpperCase()]?.fixed_risks ?? [];
}

/**
 * 특정 시각(Date)에 대해 DST를 반영한 공항 UTC 오프셋 반환.
 * DST 규칙이 없는 지역(한국, 중동, 아시아 대부분)은 고정값 사용.
 * DST 적용 지역: 미국/캐나다(3월 둘째 일요일~11월 첫 일요일), 유럽(3월 마지막 일~10월 마지막 일), 호주(10월 첫 일~4월 첫 일)
 */
export function airportUtcOffset(icao: string | null | undefined, at?: Date): number {
  if (!icao) return 0;
  const hazard = AIRPORT_HAZARDS[icao.toUpperCase()];
  if (!hazard) return 0;
  const base = hazard.utc_offset;
  if (!at || isNaN(at.getTime())) return base;

  const icaoUpper = icao.toUpperCase();
  const y = at.getUTCFullYear();

  // US/캐나다: DST = 3월 둘째 일요일 02:00 ~ 11월 첫 일요일 02:00 (UTC 기준으로 근사)
  const usRegions = ["KJ","KL","KS","KO","KP","KD","KB","KH","KE","KF","KI","KM","KN","KT","KV","KY","PA","PH","CY"];
  if (usRegions.some(p => icaoUpper.startsWith(p))) {
    const dstStart = nthWeekdayOfMonth(y, 2, 0, 2);  // 3월 둘째 일요일
    const dstEnd   = nthWeekdayOfMonth(y, 10, 0, 1); // 11월 첫 일요일
    if (at >= dstStart && at < dstEnd) return base + 1;
    return base;
  }

  // 유럽: DST = 3월 마지막 일요일 01:00 UTC ~ 10월 마지막 일요일 01:00 UTC
  const euPrefixes = ["E","L","U"];
  if (euPrefixes.some(p => icaoUpper.startsWith(p)) && base >= 0 && base <= 2) {
    const dstStart = lastWeekdayOfMonth(y, 2, 0);  // 3월 마지막 일요일
    const dstEnd   = lastWeekdayOfMonth(y, 9, 0);  // 10월 마지막 일요일
    if (at >= dstStart && at < dstEnd) return base + 1;
    return base;
  }

  // 호주: DST = 10월 첫 일요일 ~ 같은 해 4월 첫 일요일 (NSW/VIC/TAS 기준, 남반구)
  // 4월~10월은 겨울(표준시), 10월~4월은 여름(DST)
  if (icaoUpper.startsWith("Y") && base === 10) {
    const dstStart = nthWeekdayOfMonth(y, 9, 0, 1); // 이 해 10월 첫 일요일
    const dstEnd   = nthWeekdayOfMonth(y, 3, 0, 1); // 이 해 4월 첫 일요일
    // DST 활성: 10월 이후 OR 4월 이전 (연도 내 기준)
    if (at >= dstStart || at < dstEnd) return base + 1;
    return base;
  }

  return base;
}

/** n번째 특정 요일 (month: 0-based, weekday: 0=일) */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) { count++; if (count === nth) return d; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** 월의 마지막 특정 요일 */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0)); // 월의 마지막 날
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** 공항 고도(ft) 반환 */
export function airportAltitudeFt(icao: string | null | undefined): number {
  if (!icao) return 0;
  return AIRPORT_HAZARDS[icao.toUpperCase()]?.altitude_ft ?? 0;
}

/**
 * 풍향(°)과 공항 활주로 방향으로 crosswind/tailwind 성분(kt) 계산
 * @returns { crosswind, tailwind } (절댓값, kt)
 */
export function calcWindComponents(
  windDir: number, windSpeed: number, icao: string
): { crosswind: number; tailwind: number } {
  const hazard = AIRPORT_HAZARDS[icao.toUpperCase()];
  if (!hazard || hazard.runways.length === 0) return { crosswind: 0, tailwind: 0 };

  let minCross = Infinity, minTail = Infinity;
  for (const rwyHdg of hazard.runways) {
    const delta = ((windDir - rwyHdg + 360) % 360);
    const rad = (delta * Math.PI) / 180;
    const cross = Math.abs(windSpeed * Math.sin(rad));
    // tailwind = wind component FROM behind (180° = direct tailwind)
    const tail  = windSpeed * Math.cos(rad); // 양수=headwind, 음수=tailwind
    // 가장 유리한 활주로 선택
    if (cross < minCross) { minCross = cross; minTail = -tail; /* 음수=tailwind */ }
  }
  return {
    crosswind: Math.round(minCross),
    tailwind:  Math.max(0, Math.round(minTail)),
  };
}
