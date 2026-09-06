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
    geojson?: any; // Can be FeatureCollection or array of items
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

  const geo = data.data?.geojson;
  if (geo && typeof geo === "object" && !Array.isArray(geo)) {
    // GeoJSON FeatureCollection handles
    return (geo as any).features ?? [];
  }
  return (geo as any) ?? [];
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
  const props = (item as any).properties || {};
  const core = props.coreNOTAMData?.notam || item;
  const trans = props.coreNOTAMData?.notamTranslation;

  // Try all possible locations for text
  let text = core.text ?? item.notamText ?? props.text ?? "";
  if (!text && trans && trans.length > 0) {
    text = trans[0].simpleText ?? trans[0].domestic_message ?? trans[0].formattedText ?? "";
  }

  // Clean ICAO field identifiers (e.g. "E) ", "A) ")
  text = text.replace(/^[A-G]\)\s*/i, "").trim();

  // Try all possible locations for dates
  const start = core.effectiveStart ?? item.effectiveStartDate ?? core.effectiveStartDate ?? props.effectiveStart ?? "";
  const end = core.effectiveEnd ?? item.effectiveEndDate ?? core.effectiveEndDate ?? props.effectiveEnd ?? "";

  // Try all possible locations for number/ID
  const id = core.number ?? core.id ?? item.notamNumber ?? item.id ?? props.id ??
             (text ? `HASH-${text.slice(0, 16)}` : "UNKNOWN");

  return { id, text, start, end };
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
    pattern: /AD\s*(?:CLOSED|CLSD)/i,
    category: "OTHER", severity: "CRITICAL", riskScore: 98,
    tag: "AIRPORT_CLOSURE",
    headline: () => "Aerodrome closed to all traffic",
  },
  {
    pattern: /RWY\s*([\d]{2}[LRC]?(?:\/[\d]{2}[LRC]?)?)\s*(?:.*?\s+)?(?:CLSD|CLOSED|OTS|U\/S|OUT\s*OF\s*SERVICE|UNUSABLE)/i,
    category: "RUNWAY", severity: "CRITICAL", riskScore: 92,
    tag: "RUNWAY_CLOSURE",
    headline: m => `Runway ${m[1]} closed / unserviceable`,
  },
  {
    pattern: /RWY\s*([\d]{2}[LRC]?)\s*THR\s*DISPLACED\s*(\d+)/i,
    category: "RUNWAY", severity: "HIGH", riskScore: 65,
    tag: "RUNWAY_THRESHOLD_DISPLACED",
    headline: m => `Runway ${m[1]} threshold displaced by ${m[2]}ft`,
  },
  {
    pattern: /RWY\s*([\d]{2}[LRC]?(?:\/[\d]{2}[LRC]?)?)\s*(?:.*?\s+)?(?:RESTRICTED|AVBL\s*\d+M|WIP|WORK\s+IN\s+PROGRESS|LIMIT|WINGSPAN)/i,
    category: "RUNWAY", severity: "HIGH", riskScore: 72,
    tag: "RUNWAY_RESTRICTION",
    headline: m => `Runway ${m[1]} work in progress / restricted`,
  },
  {
    pattern: /(?:NAV\s+)?ILS\s+(?:OR\s+LOC\s+)?(?:RWY\s*[\d]{2}[LRC]?(?:\/[\d]{2}[LRC]?)?)?\s*(?:.*?\s+)?(?:U\/S|OTS|UNMON|OUT\s*OF\s*SVC|NOT\s*AVBL|OUT\s*OF\s*SERVICE|NA|IM|MM|OM|GS|GP)/i,
    category: "ILS_NAVAID", severity: "HIGH", riskScore: 78,
    tag: "ILS_OUTAGE",
    headline: m => `ILS/Instrument approach outage reported`,
  },
  {
    pattern: /TWY\s*([A-Z][\w\s,\/-]*?)\s*(?:.*?\s+)?(?:CLSD|CLOSED|OTS|U\/S|OUT\s*OF\s*SERVICE|UNUSABLE|LIMIT)/i,
    category: "TAXIWAY", severity: "MEDIUM", riskScore: 35,
    tag: "TAXIWAY_CLOSURE",
    headline: m => `Taxiway ${m[1]} closed / restricted`,
  },
  {
    pattern: /(?:APRON|RAMP|SPOT)\s*(.*?\s+)?(?:CLSD|CLOSED|OTS|U\/S|LIMIT|RELOCATED)/i,
    category: "OTHER", severity: "LOW", riskScore: 15,
    tag: "APRON_CLOSURE",
    headline: m => `Apron/Ramp area ${m[1] || ''} closed or restricted`,
  },
  {
    pattern: /(?:VOR|NDB|DME|TACAN)\s*(?:[\w]{2,4}\s*)?(?:U\/S|OTS|UNMON|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE)/i,
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
    pattern: /(PAPI|VASI|MALSR|SSALR|REIL|ODALS|ALS|LIGHTS|APCH\s+LGT|RAI)\s*(?:RWY\s*[\d]{2}[LRC]?(?:\/[\d]{2}[LRC]?)?)?\s*(?:U\/S|OTS|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE)/i,
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
    pattern: /(?:WIP|WORK\s+IN\s+PROGRESS|CONSTRUCTION|MEN\s+WORKING)/i,
    category: "OTHER", severity: "LOW", riskScore: 15,
    tag: "WIP_NOTICE",
    headline: () => "Work in progress / Construction reported",
  },
  {
    pattern: /(?:VHF|UHF|RADIO|FREQ|COMMUNICATION)\s*(?:U\/S|OTS|NOT\s*AVBL|OUT\s*OF\s*SVC|OUT\s*OF\s*SERVICE|CHANGED)/i,
    category: "COMM", severity: "MEDIUM", riskScore: 35,
    tag: "COMM_OUTAGE",
    headline: () => "Communication facility outage or change",
  },
  {
    pattern: /(?:LVP|LOW\s*VISIBILITY\s*PROC)\s*(?:ACT|ACTIVE|FORCE|EFFECT)/i,
    category: "OTHER", severity: "MEDIUM", riskScore: 45,
    tag: "LVP_ACTIVE",
    headline: () => "Low Visibility Procedures (LVP) active / standby",
  },
  {
    pattern: /(?:PROC|SID|STAR|IAP|IAC|APCH|INSTRUMENT\s+APPROACH)\s*(?:CHANGED|AMENDED|SUSPENDED|NOT\s*AVBL|NA)/i,
    category: "OTHER", severity: "MEDIUM", riskScore: 40,
    tag: "PROC_CHANGE",
    headline: () => "Instrument procedure change / suspension",
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

  // Very broad catch-all for any NOTAM that looks like it has operational impact
  // This ensures we don't show "No threats" when there are actually NOTAMs
  if (/(?:RWY|ILS|TWY|CLSD|OTS|U\/S|CLOSED|OUT\s*OF\s*SERVICE|LIMIT|RESTRICT|UNUSABLE|NOT\s*AVBL|AVBL|WIP|WORK|LGT|LIGHT|OBST|CRANE|BIRD|PROC|SID|STAR|IAC|APCH|MIN|ALT|FREQ|RADIO|CONSTRUCTION|MEN\s+WORKING)/i.test(upper)) {
    // Extract first 60 chars as a pseudo-headline
    const cleanText = text.replace(/\s+/g, " ").trim();
    let head = cleanText.slice(0, 70);
    if (cleanText.length > 70) head += "...";

    return {
      category: "OTHER",
      severity: "LOW",
      riskScore: 10,
      tag: "OP_NOTICE",
      headline: head,
    };
  }

  return null;
}

// ── Date Parsing Safety ──────────────────────────────────────────────────────
function parseFaaDate(dateStr: string): number {
  if (!dateStr || dateStr === "PERM") return Infinity;

  const clean = dateStr.trim().toUpperCase();
  if (clean === "PERM") return Infinity;

  // 1. Standard ISO attempt
  let t = new Date(clean.includes("T") ? clean : clean.replace(" ", "T")).getTime();
  if (!isNaN(t)) return t;

  // 2. FAA format: MM/DD/YYYY HHMM (e.g. 09/01/2026 1201)
  const mFaa = clean.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})(\d{2})/);
  if (mFaa) {
    const [_, month, day, year, hour, min] = mFaa;
    return Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
  }

  // 3. ICAO format: YYMMDDHHMM (e.g. 2609071200)
  const mIcao = clean.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (mIcao) {
    const [_, yy, mm, dd, hh, min] = mIcao;
    const year = 2000 + parseInt(yy);
    return Date.UTC(year, parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
  }

  return NaN;
}

function overlapsEta(startStr: string, endStr: string, etaMs: number, windowMs = 48 * 60 * 60 * 1000): boolean {
  try {
    const s = parseFaaDate(startStr);
    const e = parseFaaDate(endStr);

    // If start date is unknown, assume it might be relevant
    if (isNaN(s)) return true;

    // Expand window to 48h to account for timezone differences and early briefings
    const windowStart = etaMs - windowMs;
    const windowEnd = etaMs + windowMs;

    const actualEnd = (isNaN(e) || endStr.includes("PERM")) ? Infinity : e;

    // Active if the NOTAM starts before our window ends AND ends after our window starts
    return s <= windowEnd && actualEnd >= windowStart;
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

  const creds: NotamCredentials = typeof credOrKey === "string"
    ? { legacyKey: credOrKey }
    : credOrKey;

  const etaMs = etaIso ? new Date(etaIso).getTime() : Date.now();

  // US Airport logic: FAA stores NOTAMs under the 3-letter ID (e.g., DFW)
  // instead of the 4-letter ICAO (e.g., KDFW) for domestic NOTAMs.
  const locations = [icao.toUpperCase()];
  if (icao.toUpperCase().startsWith("K") && icao.length === 4) {
    locations.push(icao.toUpperCase().slice(1));
  }

  let allItems: NmsNotamItem[] = [];

  for (const loc of locations) {
    let items: NmsNotamItem[] = [];
    // 1순위: NMS-API OAuth2
    if (creds.nmsClientId && creds.nmsClientSecret) {
      try {
        const env = creds.nmsEnv === "prod" ? "prod" : "staging";
        items = await fetchFromNms(loc, creds.nmsClientId, creds.nmsClientSecret, env);
      } catch (e) {
        console.warn(`[NOTAM] NMS-API failed for ${loc}, trying legacy:`, e);
        if (creds.legacyKey) {
          try { items = await fetchFromLegacyFaa(loc, creds.legacyKey); } catch { }
        }
      }
    } else if (creds.legacyKey) {
      try { items = await fetchFromLegacyFaa(loc, creds.legacyKey); } catch { }
    }
    allItems = allItems.concat(items);
  }

  const threats: NotamThreat[] = [];
  const seenIds = new Set<string>();

  for (const item of allItems) {
    const { id, text, start, end } = extractNotamFields(item);
    if (!text || seenIds.has(id)) continue;
    seenIds.add(id);

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
