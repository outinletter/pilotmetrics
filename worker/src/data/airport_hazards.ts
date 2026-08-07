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

  // ── 호주 ──────────────────────────────────────────────────────────────────
  YSSY: { runways: [70, 250],  altitude_ft: 21,  terrain: "coastal",  fixed_risks: [], utc_offset: 10 },
};

/** 공항 ICAO 코드로 지형 위험 태그 반환 */
export function airportFixedRisks(icao: string | null | undefined): string[] {
  if (!icao) return [];
  return AIRPORT_HAZARDS[icao.toUpperCase()]?.fixed_risks ?? [];
}

/** 공항 UTC 오프셋 반환 (없으면 0) */
export function airportUtcOffset(icao: string | null | undefined): number {
  if (!icao) return 0;
  return AIRPORT_HAZARDS[icao.toUpperCase()]?.utc_offset ?? 0;
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
