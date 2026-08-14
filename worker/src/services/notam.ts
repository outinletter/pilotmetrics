/**
 * FAA NOTAM integration — NMS-API (OAuth2) with legacy API fallback
 *
 * Primary:  NMS-API  https://api-staging.cgifederal-aim.com/nmsapi/v1
 *           Auth: OAuth2 client_credentials (NMS_CLIENT_ID / NMS_CLIENT_SECRET)
 * Fallback: legacy FAA NOTAM API (FAA_NOTAM_API_KEY = "client_id:client_secret")
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
  | "ILS_NAVAID"
  | "VOR_NDB"
  | "RUNWAY"
  | "TAXIWAY"
  | "AIRSPACE"
  | "LIGHTING"
  | "OBSTACLE"
  | "BIRD"
  | "COMM"
  | "CUSTOMS"
  | "OTHER";

// ── OAuth2 Token Cache ───────────────────────────────────────────────────────
// Workers는 동일 인스턴스 내에서 모듈 스코프를 재사용하므로 토큰을 캐싱해 재발급 최소화.
interface TokenEntry {
  token: string;
  expiresAt: number; // ms epoch
}
const tokenCache = new Map<string, TokenEntry>();

async function fetchOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cacheKey = `${tokenUrl}::${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  // FAQ 확인: curl -u CLIENT_ID:CLIENT_SECRET -d grant_type=client_credentials
  // → HTTP Basic Auth 헤더 + form body에 grant_type만 전송
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      // Content-Type 생략 or x-www-form-urlencoded — FAQ: removing content-type resolves issues
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`OAuth2 token fetch failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);

  // expires_in은 문자열로 반환됨 ("1799") — FAQ 참고
  const json = await res.json() as { access_token: string; expires_in?: string | number };
  if (!json.access_token) throw new Error("OAuth2: no access_token in response");

  const ttlSec = Number(json.expires_in ?? 1799);
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + ttlSec * 1000 });
  return json.access_token;
}

// ── NMS-API NOTAM Fetch ──────────────────────────────────────────────────────
// FAQ 확인: 토큰 URL은 /nmsapi 없는 경로, NOTAM 조회는 /nmsapi/v1 경로
const NMS_STAGING_AUTH = "https://api-staging.cgifederal-aim.com/v1/auth/token";
const NMS_STAGING_API  = "https://api-staging.cgifederal-aim.com/nmsapi/v1";
const NMS_PROD_AUTH    = "https://api-nms.aim.faa.gov/v1/auth/token";
const NMS_PROD_API     = "https://api-nms.aim.faa.gov/nmsapi/v1";

interface NmsNotamItem {
  properties?: {
    coreNOTAMData?: {
      notam?: {
        id?: string;
        number?: string;
        text?: string;
        effectiveStart?: string;
        effectiveEnd?: string;
        classification?: string;
        location?: string;
      };
      notamTranslation?: Array<{ type?: string; simpleText?: string; domestic_message?: string }>;
    };
  };
  // flat fallback
  id?: string;
  notamNumber?: string;
  notamText?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
}

interface NmsResponse {
  status?: string;
  data?: {
    geojson?: NmsNotamItem[];
    aixm?: string[];
  };
}

async function fetchFromNms(
  icao: string,
  clientId: string,
  clientSecret: string,
  env: "staging" | "prod",
): Promise<NmsNotamItem[]> {
  const tokenUrl = env === "prod" ? NMS_PROD_AUTH  : NMS_STAGING_AUTH;
  const apiBase  = env === "prod" ? NMS_PROD_API   : NMS_STAGING_API;

  const token = await fetchOAuth2Token(tokenUrl, clientId, clientSecret);

  // spec: param is "location" (ICAO or domestic), nmsResponseFormat header is REQUIRED
  const url = `${apiBase}/notams?location=${icao.toUpperCase()}`;

  async function doFetch(tok: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "Authorization": `Bearer ${tok}`,
        "nmsResponseFormat": "GEOJSON",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  }

  let res = await doFetch(token);

  // 401 → 토큰 캐시 클리어 후 1회 재발급
  if (res.status === 401) {
    tokenCache.delete(`${tokenUrl}::${clientId}`);
    const token2 = await fetchOAuth2Token(tokenUrl, clientId, clientSecret);
    res = await doFetch(token2);
  }

  if (!res.ok) throw new Error(`NMS-API HTTP ${res.status}`);
  const data = await res.json() as NmsResponse;
  return data.data?.geojson ?? [];
}

// ── Legacy FAA API Fetch ─────────────────────────────────────────────────────
interface LegacyFaaResponse {
  items?: NmsNotamItem[];
  pageSize?: number;
  pageNum?: number;
  totalCount?: number;
}

async function fetchFromLegacyFaa(
  icao: string,
  apiKey: string,
): Promise<NmsNotamItem[]> {
  const [clientId, clientSecret] = apiKey.split(":");
  const url = `https://external-api.faa.gov/notamapi/v1/notams?` +
    `icaoLocation=${icao.toUpperCase()}&pageSize=100&pageNum=1`;
  const res = await fetch(url, {
    headers: { client_id: clientId, client_secret: clientSecret ?? clientId },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Legacy FAA API HTTP ${res.status}`);
  const data = await res.json() as LegacyFaaResponse;
  return data.items ?? [];
}

// ── NOTAM Item Normalizer ────────────────────────────────────────────────────
// NMS-API와 legacy API 모두 같은 내부 구조(coreNOTAMData 래핑)를 사용하지만,
// NMS-API가 일부 필드를 최상위로 올리는 경우 대비해 양쪽 모두 시도.
function extractNotamFields(item: NmsNotamItem): {
  id: string;
  text: string;
  start: string;
  end: string;
} {
  const core = item.properties?.coreNOTAMData?.notam;
  return {
    id:    core?.number ?? core?.id ?? item.notamNumber ?? item.id ?? "UNKNOWN",
    text:  core?.text   ?? item.notamText ?? "",
    start: core?.effectiveStart ?? item.effectiveStartDate ?? "",
    end:   core?.effectiveEnd   ?? item.effectiveEndDate   ?? "",
  };
}

// ── Classifier Rules ─────────────────────────────────────────────────────────

interface Rule {
  pattern: RegExp;
  category: NotamCategory;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number;
  tag: string;
  headline: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  {
    pattern: /RWY\s*([\d]{2}[LRC]?)\s*(?:CLSD|CLOSED|OTS|U\/S|OUT\s*OF\s*SERVICE)/i,
    category: "RUNWAY", severity: "CRITICAL", riskScore: 92,
    tag: "RUNWAY_CLOSURE",
    headline: m => `Runway ${m[1]} closed / unserviceable`,
  },
  {
    pattern: /RWY\s*([\d]{2}[LRC]?)\s*(?:RESTRICTED|AVBL\s*\d+M|WIP|WORK\s+IN\s+PROGRESS)/i,
    category: "RUNWAY", severity: "HIGH", riskScore: 72,
    tag: "RUNWAY_RESTRICTION",
    headline: m => `Runway ${m[1]} work in progress / restricted`,
  },
  {
    pattern: /ILS\s+(?:OR\s+LOC\s+)?(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:GP|GLIDE\s*PATH|GLIDESLOPE)?\s*(?:U\/S|OTS|UNMON|OUT\s*OF\s*SVC|NOT\s*AVBL|OUT\s*OF\s*SERVICE)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 78,
    tag: "ILS_OUTAGE",
    headline: () => "ILS out of service — precision approach unavailable",
  },
  {
    pattern: /(?:GP|GLIDE\s*(?:PATH|SLOPE))\s*(?:U\/S|OTS|UNMON|NOT\s*AVBL|OUT\s*OF\s*SERVICE)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 68,
    tag: "ILS_GP_OUTAGE",
    headline: () => "ILS glidepath unmonitored — non-precision approach only",
  },
  {
    pattern: /LOC\s+(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:U\/S|OTS|UNMON|NOT\s*AVBL|OUT\s*OF\s*SERVICE)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 65,
    tag: "LOC_OUTAGE",
    headline: () => "Localizer unserviceable",
  },
  {
    pattern: /(VOR|NDB|DME|TACAN)\s*(?:[\w]{2,4}\s*)?(?:U\/S|OTS|UNMON|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE)/i,
    category: "VOR_NDB", severity: "MEDIUM", riskScore: 48,
    tag: "NAVAID_OUTAGE",
    headline: m => `${m[1]} navaid unserviceable`,
  },
  {
    pattern: /(?:TFR|TEMPORARY\s*FLIGHT\s*RESTRICTION|RESTRICTED\s*AREA|PROHIBITED\s*AREA|MIL\s*OPS|EXERCISE)/i,
    category: "AIRSPACE", severity: "HIGH", riskScore: 70,
    tag: "AIRSPACE_RESTRICTION",
    headline: () => "Airspace restriction / active military exercise",
  },
  {
    pattern: /(PAPI|VASI|MALSR|SSALR|REIL|ODALS|ALS|LIGHTS|APCH\s+LGT)\s*(?:RWY\s*[\d]{2}[LRC]?)?\s*(?:U\/S|OTS|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE)/i,
    category: "LIGHTING", severity: "MEDIUM", riskScore: 42,
    tag: "APPROACH_LIGHTING_OUTAGE",
    headline: m => `${m[1]} lighting out of service`,
  },
  {
    pattern: /OBST\s+[\w\s]+\s+(\d+)FT/i,
    category: "OBSTACLE", severity: "MEDIUM", riskScore: 35,
    tag: "OBSTACLE",
    headline: m => `Obstacle reported at ${m[1]}ft`,
  },
  {
    pattern: /CRANE/i,
    category: "OBSTACLE", severity: "LOW", riskScore: 22,
    tag: "CRANE_OBSTACLE",
    headline: () => "Crane obstacle in vicinity",
  },
  {
    pattern: /(?:BIRD|WILDLIFE)\s*(?:ACTIVITY|HAZARD|WARNING)/i,
    category: "BIRD", severity: "MEDIUM", riskScore: 38,
    tag: "BIRD_STRIKE_RISK",
    headline: () => "Bird/wildlife activity hazard reported",
  },
  {
    pattern: /TWY\s*([A-Z][\w\s,]*)\s*(?:CLSD|CLOSED|OTS|U\/S|OUT\s*OF\s*SERVICE)/i,
    category: "TAXIWAY", severity: "LOW", riskScore: 15,
    tag: "TAXIWAY_CLOSURE",
    headline: m => `Taxiway ${m[1]} closed`,
  },
  {
    pattern: /(?:ATIS|D-ATIS)\s*(?:U\/S|OTS|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE)/i,
    category: "COMM", severity: "LOW", riskScore: 20,
    tag: "ATIS_OUTAGE",
    headline: () => "ATIS out of service — contact ATC for airport info",
  },
];

function classifyNotam(text: string): {
  category: NotamCategory; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number; tag: string; headline: string;
} | null {
  const upper = text.toUpperCase();
  for (const rule of RULES) {
    const m = upper.match(rule.pattern);
    if (m) return {
      category: rule.category, severity: rule.severity,
      riskScore: rule.riskScore, tag: rule.tag, headline: rule.headline(m),
    };
  }
  return null;
}

// ── ETA Overlap ──────────────────────────────────────────────────────────────

function overlapsEta(startIso: string, endIso: string, etaMs: number, windowMs = 60 * 60 * 1000): boolean {
  try {
    const s = new Date(startIso).getTime();
    const e = (endIso === "PERM" || !endIso) ? etaMs + windowMs + 1 : new Date(endIso).getTime();
    return s <= etaMs + windowMs && e >= etaMs - windowMs;
  } catch { return true; }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface NotamCredentials {
  nmsClientId?: string;
  nmsClientSecret?: string;
  nmsEnv?: string;
  legacyKey?: string;  // "client_id:client_secret"
}

export async function fetchNotamThreats(
  icao: string,
  etaIso: string | null,
  credOrKey: string | NotamCredentials,
): Promise<NotamThreat[]> {
  if (!icao) return [];

  // 하위 호환: 문자열로 넘어오면 legacy key로 처리
  const creds: NotamCredentials = typeof credOrKey === "string"
    ? { legacyKey: credOrKey }
    : credOrKey;

  const etaMs = etaIso ? new Date(etaIso).getTime() : Date.now();
  let items: NmsNotamItem[] = [];

  // 1순위: NMS-API OAuth2
  if (creds.nmsClientId && creds.nmsClientSecret) {
    try {
      const env = creds.nmsEnv === "prod" ? "prod" : "staging";
      items = await fetchFromNms(icao, creds.nmsClientId, creds.nmsClientSecret, env);
    } catch (e) {
      console.warn("[NOTAM] NMS-API failed, trying legacy:", e);
      // 폴백
      if (creds.legacyKey) {
        try { items = await fetchFromLegacyFaa(icao, creds.legacyKey); } catch { /* both failed */ }
      }
    }
  } else if (creds.legacyKey) {
    // NMS 크리덴셜 없으면 legacy만
    try { items = await fetchFromLegacyFaa(icao, creds.legacyKey); } catch { /* no data */ }
  } else {
    return [];
  }

  const threats: NotamThreat[] = [];
  for (const item of items) {
    const { id, text, start, end } = extractNotamFields(item);
    if (!text) continue;

    const classification = classifyNotam(text);
    if (!classification) continue;

    const active = overlapsEta(start, end, etaMs);
    threats.push({
      notamId: id,
      rawText: text.trim(),
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

  return threats.filter(t => t.isActive).sort((a, b) => b.riskScore - a.riskScore);
}
