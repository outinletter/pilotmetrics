export function parseWeatherTags(metar = "", taf = ""): string[] {
  const text = `${metar} ${taf}`.toUpperCase();
  const tags = new Set<string>();

  const checks: Record<string, RegExp> = {
    TSRA: /\bTSRA\b|\+TSRA/,
    CB: /\bCB\b/,
    GUST: /G\d{2}KT/,
    WINDSHEAR: /\bWS\b|WINDSHEAR/,
    FOG: /\bFG\b|FOG/,
    HEAVY_RAIN: /\+RA|\+TSRA/,
    THUNDERSTORM: /\bTS\b|TSRA/,
  };
  for (const [tag, re] of Object.entries(checks)) if (re.test(text)) tags.add(tag);

  const visTokens = text.split(/\s+/).filter(t => /^\d{4}$/.test(t));
  if (visTokens.some(v => parseInt(v) <= 5000)) tags.add("LOW_VISIBILITY");
  if (["TSRA","CB","THUNDERSTORM"].some(t => tags.has(t))) tags.add("CONVECTIVE_WEATHER");
  if (["GUST","WINDSHEAR","LOW_VISIBILITY","CONVECTIVE_WEATHER"].some(t => tags.has(t))) tags.add("UNSTABLE_APPROACH_RISK");
  if (/\bRA\b|TSRA/.test(text)) tags.add("WET_RWY");

  return [...tags].sort();
}

function parseIsoUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  try { return new Date(value.replace("Z", "+00:00")); } catch { return null; }
}

function tafWindowMatches(token: string, arrival: Date): boolean {
  const m = token.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!m) return false;
  const [, sd, sh, ed, eh] = m.map(Number);
  const ad = arrival.getUTCDate(), ah = arrival.getUTCHours();
  let start = sd * 24 + sh, end = ed * 24 + eh, arr = ad * 24 + ah;
  if (end < start) { end += 31 * 24; if (arr < start) arr += 31 * 24; }
  return start <= arr && arr <= end;
}

export function selectArrivalTafSegment(taf: string, arrivalTime: string | null | undefined): string {
  const arrival = parseIsoUtc(arrivalTime);
  if (!taf || !arrival) return taf;
  const tokens = taf.split(/\s+/);
  const selected: string[] = [];
  let active = false;
  for (const token of tokens) {
    if (/^FM\d{6}$/.test(token)) {
      const day = parseInt(token.slice(2, 4)); const hour = parseInt(token.slice(4, 6));
      active = day === arrival.getUTCDate() && hour <= arrival.getUTCHours();
      if (active) selected.length = 0, selected.push(token);
      continue;
    }
    if (["TEMPO","BECMG","PROB30","PROB40"].includes(token)) { active = false; continue; }
    if (/^\d{4}\/\d{4}$/.test(token)) {
      active = tafWindowMatches(token, arrival);
      if (active) selected.length = 0, selected.push(token);
      continue;
    }
    if (active) selected.push(token);
  }
  return selected.length ? selected.join(" ") : taf;
}
