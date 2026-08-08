/**
 * FAA NOTAM API integration
 * Fetches NOTAMs for arrival airport, filters by ETA ±60 min,
 * classifies threats, and computes risk scores.
 *
 * API docs: https://api.faa.gov/s/article/NOTAM-Search-API-User-Guide
 */

export interface NotamThreat {
  notamId: string;
  rawText: string;
  category: NotamCategory;
  threatTag: string;
  headline: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number;
  effectiveStart: string;
  effectiveEnd: string;
  isActive: boolean;
}

export type NotamCategory =
  | "ILS_NAVAID"      // ILS/GP/LOC 장애
  | "VOR_NDB"         // VOR/NDB/DME 장애
  | "RUNWAY"          // 활주로 폐쇄·제한
  | "TAXIWAY"         // 유도로 폐쇄
  | "AIRSPACE"        // TFR·공역 제한
  | "LIGHTING"        // 조명 장애 (PAPI, MALSR, REIL)
  | "OBSTACLE"        // 장애물
  | "BIRD"            // 조류·야생동물
  | "COMM"            // ATIS·ATC 통신 장애
  | "CUSTOMS"         // 세관·서비스 시간 제한
  | "OTHER";          // 기타

interface FaaNotamItem {
  properties: {
    coreNOTAMData: {
      notam: {
        id: string;
        number: string;
        text: string;
        effectiveStart: string;   // ISO 8601
        effectiveEnd: string;
        classification: string;
        location: string;
      };
    };
  };
}

interface FaaNotamResponse {
  items: FaaNotamItem[];
  pageSize: number;
  pageNum: number;
  totalCount: number;
}

// ── Classifier rules ────────────────────────────────────────────────────────

interface Rule {
  pattern: RegExp;
  category: NotamCategory;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number;
  tag: string;
  headline: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  // CRITICAL — 활주로 폐쇄
  {
    pattern: /RWY\s*([\d]{2}[LRC]?)\s*(CLSD|CLOSED)/i,
    category: "RUNWAY", severity: "CRITICAL", riskScore: 88,
    tag: "RUNWAY_CLOSURE",
    headline: m => `Runway ${m[1]} closed`,
  },
  // CRITICAL — 활주로 임시 제한
  {
    pattern: /RWY\s*([\d]{2}[LRC]?)\s*(RESTRICTED|AVBL\s*\d+M)/i,
    category: "RUNWAY", severity: "HIGH", riskScore: 72,
    tag: "RUNWAY_RESTRICTION",
    headline: m => `Runway ${m[1]} restricted`,
  },
  // HIGH — ILS 장애
  {
    pattern: /ILS\s+(?:OR\s+LOC\s+)?(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:GP|GLIDE\s*PATH|GLIDESLOPE)?\s*(?:U\/S|UNMON|OUT\s*OF\s*SVC|NOT\s*AVBL)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 78,
    tag: "ILS_OUTAGE",
    headline: () => "ILS out of service — precision approach unavailable",
  },
  // HIGH — ILS GP 장애만
  {
    pattern: /(?:GP|GLIDE\s*(?:PATH|SLOPE))\s*(?:U\/S|UNMON|NOT\s*AVBL)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 68,
    tag: "ILS_GP_OUTAGE",
    headline: () => "ILS glidepath unmonitored — non-precision approach only",
  },
  // HIGH — LOC 장애
  {
    pattern: /LOC\s+(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:U\/S|UNMON|NOT\s*AVBL)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 65,
    tag: "LOC_OUTAGE",
    headline: () => "Localizer unserviceable",
  },
  // MEDIUM — VOR/NDB/DME 장애
  {
    pattern: /(VOR|NDB|DME|TACAN)\s*(?:[\w]{2,4}\s*)?(?:U\/S|UNMON|NOT\s*AVBL|OUT\s*OF\s*SVC)/i,
    category: "VOR_NDB", severity: "MEDIUM", riskScore: 48,
    tag: "NAVAID_OUTAGE",
    headline: m => `${m[1]} navaid unserviceable`,
  },
  // HIGH — 공역 제한
  {
    pattern: /(?:TFR|TEMPORARY\s*FLIGHT\s*RESTRICTION|RESTRICTED\s*AREA|PROHIBITED\s*AREA)/i,
    category: "AIRSPACE", severity: "HIGH", riskScore: 70,
    tag: "AIRSPACE_RESTRICTION",
    headline: () => "Airspace restriction / TFR active",
  },
  // MEDIUM — PAPI/VASI/MALSR 조명 장애
  {
    pattern: /(PAPI|VASI|MALSR|SSALR|REIL|ODALS|ALS)\s*(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:U\/S|NOT\s*AVBL|OUT\s*OF\s*SVC)/i,
    category: "LIGHTING", severity: "MEDIUM", riskScore: 42,
    tag: "APPROACH_LIGHTING_OUTAGE",
    headline: m => `${m[1]} approach lighting out of service`,
  },
  // MEDIUM — 장애물 (고도 300ft 이상)
  {
    pattern: /OBST\s+[\w\s]+\s+(\d+)FT/i,
    category: "OBSTACLE", severity: "MEDIUM", riskScore: 35,
    tag: "OBSTACLE",
    headline: m => `Obstacle reported at ${m[1]}ft`,
  },
  // LOW — 크레인
  {
    pattern: /CRANE/i,
    category: "OBSTACLE", severity: "LOW", riskScore: 22,
    tag: "CRANE_OBSTACLE",
    headline: () => "Crane obstacle in vicinity",
  },
  // MEDIUM — 조류
  {
    pattern: /(?:BIRD|WILDLIFE)\s*(?:ACTIVITY|HAZARD|WARNING)/i,
    category: "BIRD", severity: "MEDIUM", riskScore: 38,
    tag: "BIRD_STRIKE_RISK",
    headline: () => "Bird/wildlife activity hazard reported",
  },
  // LOW — 유도로 폐쇄
  {
    pattern: /TWY\s*([A-Z][\w]*)\s*(?:CLSD|CLOSED)/i,
    category: "TAXIWAY", severity: "LOW", riskScore: 15,
    tag: "TAXIWAY_CLOSURE",
    headline: m => `Taxiway ${m[1]} closed`,
  },
  // LOW — ATIS 장애
  {
    pattern: /(?:ATIS|D-ATIS)\s*(?:U\/S|NOT\s*AVBL|OUT\s*OF\s*SVC)/i,
    category: "COMM", severity: "LOW", riskScore: 20,
    tag: "ATIS_OUTAGE",
    headline: () => "ATIS out of service — contact ATC for airport info",
  },
];

function classifyNotam(text: string): {
  category: NotamCategory;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number;
  tag: string;
  headline: string;
} | null {
  const upper = text.toUpperCase();
  for (const rule of RULES) {
    const m = upper.match(rule.pattern);
    if (m) {
      return {
        category: rule.category,
        severity: rule.severity,
        riskScore: rule.riskScore,
        tag: rule.tag,
        headline: rule.headline(m),
      };
    }
  }
  return null;
}

// ── Time overlap check ───────────────────────────────────────────────────────

function overlapsEta(
  startIso: string,
  endIso: string,
  etaMs: number,
  windowMs = 60 * 60 * 1000,  // ±60 min
): boolean {
  try {
    const s = new Date(startIso).getTime();
    const e = endIso === "PERM" || !endIso
      ? etaMs + windowMs + 1
      : new Date(endIso).getTime();
    const lo = etaMs - windowMs;
    const hi = etaMs + windowMs;
    return s <= hi && e >= lo;
  } catch {
    return true; // if parse fails, include it
  }
}

// ── FAA API fetch ────────────────────────────────────────────────────────────

export async function fetchNotamThreats(
  icao: string,
  etaIso: string | null,
  apiKey: string,
): Promise<NotamThreat[]> {
  if (!icao || !apiKey) return [];

  const etaMs = etaIso ? new Date(etaIso).getTime() : Date.now();
  const url = `https://external-api.faa.gov/notamapi/v1/notams?` +
    `icaoLocation=${icao.toUpperCase()}&pageSize=100&pageNum=1`;

  let data: FaaNotamResponse;
  try {
    const res = await fetch(url, {
      headers: {
        "client_id": apiKey.split(":")[0],
        "client_secret": apiKey.split(":")[1] ?? apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    data = await res.json() as FaaNotamResponse;
  } catch {
    return [];
  }

  const threats: NotamThreat[] = [];

  for (const item of data.items ?? []) {
    const n = item.properties?.coreNOTAMData?.notam;
    if (!n) continue;

    const start = n.effectiveStart ?? "";
    const end   = n.effectiveEnd ?? "";
    const active = overlapsEta(start, end, etaMs);

    const classification = classifyNotam(n.text ?? "");
    if (!classification) continue;  // 위협 없는 NOTAM은 skip

    threats.push({
      notamId: n.number ?? n.id,
      rawText: (n.text ?? "").trim(),
      category: classification.category,
      threatTag: classification.tag,
      headline: classification.headline,
      severity: classification.severity,
      riskScore: classification.riskScore,
      effectiveStart: start,
      effectiveEnd: end,
      isActive: active,
    });
  }

  // ETA 시간대 활성 NOTAM만 반환, 위험도 내림차순 정렬
  return threats
    .filter(t => t.isActive)
    .sort((a, b) => b.riskScore - a.riskScore);
}
