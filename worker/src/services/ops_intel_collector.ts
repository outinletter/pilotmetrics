import type { OpsIntelItemRow, Source, Env } from "../types";
import { SOURCES } from "../data/sources";
import { collectRecentOfficialEvents } from "./official_event_parsers";
import { enrichWithLLM } from "./llm_classifier";

const OFFICIAL_HOSTS = ["faa.gov", "ntsb.gov", "nasa.gov", "icao.int", "easa.europa.eu", "skybrary.aero"];
const EVENT_KEYWORDS = ["accident","incident","investigation","safety","recommendation","safo","advisory","airworthiness","directive","runway","engine","fire","smoke","gps","gnss","jamming","mel","training","part-121","part 135","approach","landing","departure","takeoff"];
const REPORT_KEYWORDS = ["report","final","preliminary","investigation","recommendation","safo","advisory circular","airworthiness directive","safety alert","accident","incident","asrs","callback","lessons learned"];
const SKIP_LABELS = ["skip to","main content","enable javascript","subscribe","login","sign in","privacy","contact"];
const DEFAULT_MAX_DETAIL_FETCHES = 8;

function htmlTitle(text: string): string {
  const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractMainText(html: string, limit = 1400): string {
  const stripped = html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ");
  return cleanText(stripped).slice(0, limit);
}

function isOfficialUrl(url: string): boolean {
  try { return OFFICIAL_HOSTS.some(h => new URL(url).hostname.endsWith(h)); } catch { return false; }
}

function isSameSite(base: string, url: string): boolean {
  try { return new URL(base).hostname === new URL(url).hostname; } catch { return false; }
}

function classifyTitle(title: string, source: Source): [string, string] {
  const t = title.toLowerCase();
  if (["accident","incident","investigation","runway","engine","fire","smoke"].some(w => t.includes(w))) return ["Accident / Incident", "Medium"];
  if (["regulation","advisory","directive","safo","airworthiness"].some(w => t.includes(w))) return ["Regulation", "Medium"];
  if (["fatigue","crm","human factors"].some(w => t.includes(w))) return ["Human Factors / CRM", "Medium"];
  if (["gps","gnss","jamming","spoofing","security"].some(w => t.includes(w))) return ["Security / External Threat", "High"];
  return [source.category, "Low"];
}

function candidateQuality(sourceUrl: string, url: string, title: string, text: string, statusCode: number): string {
  if (statusCode >= 400) return "needs_source_review";
  if (!isOfficialUrl(url)) return "supplementary_source";
  const haystack = `${title} ${url} ${text.slice(0, 800)}`.toLowerCase();
  return REPORT_KEYWORDS.some(k => haystack.includes(k)) ? "official_report_candidate" : "official_source";
}

function extractEventLinks(html: string, source: Source): { url: string; title: string; category: string; severity: string }[] {
  const links: { url: string; title: string; category: string; severity: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, labelHtml] = m;
    let url: string;
    try { url = new URL(href, source.url).href; } catch { continue; }
    if (!url.startsWith("http") || !isSameSite(source.url, url) || seen.has(url)) continue;
    const label = cleanText(labelHtml);
    const haystack = `${label} ${url}`.toLowerCase();
    if (label.length < 8 || SKIP_LABELS.some(s => haystack.includes(s)) || !EVENT_KEYWORDS.some(k => haystack.includes(k))) continue;
    const [category, severity] = classifyTitle(label, source);
    links.push({ url, title: label.slice(0, 240), category, severity });
    seen.add(url);
    if (links.length >= 8) break;
  }
  return links;
}

async function upsertItem(db: D1Database, source: Source, url: string, title: string, category: string, severity: string, statusCode: number, summary: string, extraTags: string[] = []): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM ops_intel_items WHERE source_url = ?").bind(url).first<{ id: number }>();
  const tags = JSON.stringify([...new Set([...source.tags, category, severity, ...extraTags])]);
  const now = new Date().toISOString();
  const lesson = `Review new ${category} material from ${source.name} for procedure, training, dispatch, or safety-management relevance before using it in pilot briefings.`;
  const a350 = "Screen for relevance to A350/B787 long-haul operations, especially ETOPS, fatigue, dispatch, MEL, navigation, and approach threats.";
  const action = category === "Regulation" ? "Screen for regulatory or procedural changes and assign SOP/training review if applicable."
    : category === "Accident / Incident" ? "Check for new factual reports, classify severity, and extract operational lessons without assigning blame."
    : "Review source updates and convert relevant items into the operational lessons database.";

  if (!existing) {
    await db.prepare("INSERT INTO ops_intel_items (source_name,source_url,title,category,severity,summary,operational_lesson,a350_b787_applicability,recommended_action,tags,last_status,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(source.name, url, title || source.name, category, severity, summary, lesson, a350, action, tags, statusCode, now, now, now).run();
    return true;
  }
  await db.prepare("UPDATE ops_intel_items SET title=?,category=?,severity=?,summary=?,operational_lesson=?,a350_b787_applicability=?,recommended_action=?,tags=?,last_status=?,last_checked_at=?,updated_at=? WHERE source_url=?")
    .bind(title || source.name, category, severity, summary, lesson, a350, action, tags, statusCode, now, now, url).run();
  return false;
}

async function fetchSource(source: Source, maxDetailFetches: number, priorityHosts: Set<string>): Promise<{ source: Source; statusCode: number; title: string; links: { url: string; title: string; category: string; severity: string; detailStatus: number; detailText: string }[] }> {
  const res = await fetch(source.url, { headers: { "User-Agent": "OpsBriefing/0.1" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
  const html = await res.text();
  const rawLinks = extractEventLinks(html, source);

  // 우선 소스는 더 많은 링크 상세 탐색
  const isPriority = priorityHosts.size > 0 && [...priorityHosts].some(h => source.url.includes(h));
  const detailLimit = isPriority ? Math.max(maxDetailFetches, 12) : maxDetailFetches;

  const enriched = [];
  for (const link of rawLinks.slice(0, detailLimit)) {
    try {
      const dr = await fetch(link.url, { headers: { "User-Agent": "OpsBriefing/0.1" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
      const dt = extractMainText(await dr.text());
      const [cat, sev] = classifyTitle(`${link.title} ${dt.slice(0, 500)}`, source);
      enriched.push({ ...link, category: cat, severity: sev, detailStatus: dr.status, detailText: dt });
    } catch {
      enriched.push({ ...link, detailStatus: res.status, detailText: "" });
    }
  }
  enriched.push(...rawLinks.slice(detailLimit).map(l => ({ ...l, detailStatus: res.status, detailText: "" })));
  return { source, statusCode: res.status, title: htmlTitle(html), links: enriched };
}

export async function collectOnce(db: D1Database, env?: Env): Promise<Record<string, unknown>> {
  const runInsert = await db.prepare("INSERT INTO ops_intel_runs (started_at,status) VALUES (?,?) RETURNING id").bind(new Date().toISOString(), "running").first<{ id: number }>();
  const runId = runInsert!.id;

  const maxDetailFetches = parseInt(env?.MAX_DETAIL_FETCHES ?? String(DEFAULT_MAX_DETAIL_FETCHES), 10);
  const priorityHosts = new Set((env?.PRIORITY_FULL_SCAN ?? "faa.gov,ntsb.gov,easa.europa.eu,icao.int").split(",").map(s => s.trim()));

  let saved = 0;
  const seenUrls = new Set<string>();

  try {
    const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s, maxDetailFetches, priorityHosts)));
    for (const result of results) {
      if (result.status === "rejected") continue;
      const { source, statusCode, title, links } = result.value;
      if (!seenUrls.has(source.url)) {
        seenUrls.add(source.url);
        if (await upsertItem(db, source, source.url, title || source.name, source.category, "Low", statusCode,
            `Periodic source check saved for ${source.name}. HTTP status ${statusCode}. Latest page title: ${title || "not available"}.`)) saved++;
      }
      for (const link of links) {
        if (seenUrls.has(link.url)) continue;
        seenUrls.add(link.url);
        const quality = candidateQuality(source.url, link.url, link.title, link.detailText, link.detailStatus);
        const summary = link.detailText
          ? `${link.title}. Source: ${source.name}. Quality: ${quality}. Extract: ${link.detailText}`
          : `Collected event candidate from ${source.name}: ${link.title}.`;
        if (await upsertItem(db, source, link.url, link.title, link.category, link.severity, link.detailStatus, summary, [quality])) saved++;
      }
    }

    const officialResult = await collectRecentOfficialEvents(db, 20);
    saved += (officialResult.items_saved as number) ?? 0;

    // LLM enrichment: Workers AI가 있으면 신규 항목 일괄 분류
    let llmResult: Record<string, unknown> = { skipped: "no AI binding" };
    if (env?.AI) {
      try {
        llmResult = await enrichWithLLM(env.AI, db, 20);
      } catch (e) {
        llmResult = { error: String(e) };
      }
    }

    const now = new Date().toISOString();
    await db.prepare("UPDATE ops_intel_runs SET status=?,items_checked=?,items_saved=?,finished_at=? WHERE id=?")
      .bind("complete", SOURCES.length, saved, now, runId).run();
    return { status: "complete", items_checked: SOURCES.length, items_saved: saved, official_recent: officialResult, llm_enrichment: llmResult };
  } catch (err) {
    const now = new Date().toISOString();
    await db.prepare("UPDATE ops_intel_runs SET status=?,error=?,finished_at=? WHERE id=?")
      .bind("failed", String(err), now, runId).run();
    return { status: "failed", error: String(err) };
  }
}

export async function refineOfficialItems(db: D1Database): Promise<Record<string, unknown>> {
  const { results } = await db.prepare("SELECT * FROM ops_intel_items").all<OpsIntelItemRow>();
  const counts: Record<string, number> = { official_report_candidate: 0, official_source: 0, supplementary_source: 0, needs_source_review: 0 };
  for (const item of results) {
    const quality = candidateQuality(item.source_url, item.source_url, item.title ?? "", item.summary ?? "", item.last_status ?? 0);
    counts[quality] = (counts[quality] ?? 0) + 1;
    const tags = [...new Set([...JSON.parse(item.tags ?? "[]") as string[], quality])];
    const now = new Date().toISOString();
    await db.prepare("UPDATE ops_intel_items SET tags=?,severity=?,updated_at=? WHERE source_url=?")
      .bind(JSON.stringify(tags), quality === "official_report_candidate" && item.severity === "Low" ? "Medium" : item.severity, now, item.source_url).run();
  }
  return { items_refined: results.length, ...counts };
}
