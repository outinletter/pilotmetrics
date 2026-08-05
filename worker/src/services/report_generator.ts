import type { OpsIntelItemRow } from "../types";

const SEVERITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const QUALITY_RANK: Record<string, number> = { official_report_candidate: 3, official_source: 2, supplementary_source: 1, needs_source_review: 0 };

export function cleanSummary(value: string | null | undefined, limit = 420): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit).trimEnd() + "..." : text;
}

function qualityRank(item: OpsIntelItemRow): number {
  const tags = item.tags ?? "";
  for (const [tag, rank] of Object.entries(QUALITY_RANK)) if (tags.includes(tag)) return rank;
  return 0;
}

export async function topItems(db: D1Database, limit = 10): Promise<OpsIntelItemRow[]> {
  const { results } = await db.prepare("SELECT * FROM ops_intel_items ORDER BY updated_at DESC LIMIT 100").all<OpsIntelItemRow>();
  return results
    .sort((a, b) => {
      const qd = qualityRank(b) - qualityRank(a);
      if (qd !== 0) return qd;
      return (SEVERITY_RANK[b.severity ?? "Low"] ?? 0) - (SEVERITY_RANK[a.severity ?? "Low"] ?? 0);
    })
    .slice(0, limit);
}

export async function dailyBriefingMarkdown(db: D1Database): Promise<string> {
  const items = await topItems(db);
  const today = new Date().toISOString().slice(0, 10);
  const categories = items.reduce<Record<string, number>>((acc, i) => { acc[i.category ?? "Unclassified"] = (acc[i.category ?? "Unclassified"] ?? 0) + 1; return acc; }, {});
  const topCats = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(", ");
  const highInterest = items.filter(i => ["Critical","High","Medium"].includes(i.severity ?? ""));
  const officialReports = items.filter(i => (i.tags ?? "").includes("official_report_candidate"));

  const lines = [
    "# Daily Part 121 / Part 135 Operations Intelligence Briefing",
    `\nDate: ${today} UTC\n`,
    "## Executive Summary\n",
    `- ${items.length} recent operational-intelligence items reviewed.`,
    `- Main categories: ${topCats || "none"}.`,
    `- ${officialReports.length} item(s) tagged as official report/event candidates.`,
    `- ${highInterest.length} items are Medium or higher severity.\n`,
    "## Top Events\n",
  ];
  for (const [i, item] of items.entries()) {
    lines.push(`### ${i + 1}. ${item.title ?? "Untitled item"}\n`);
    lines.push(`- Source: [${item.source_name}](${item.source_url})`);
    lines.push(`- Severity: ${item.severity ?? "Low"}`);
    lines.push(`- Category: ${item.category ?? "Unclassified"}`);
    lines.push(`- Summary: ${cleanSummary(item.summary)}`);
    lines.push(`- Operational Lesson: ${cleanSummary(item.operational_lesson, 300)}`);
    lines.push(`- A350/B787 Relevance: ${cleanSummary(item.a350_b787_applicability, 260)}`);
    lines.push(`- Recommended Action: ${cleanSummary(item.recommended_action, 260)}\n`);
  }
  return lines.join("\n");
}

export async function reviewMarkdown(db: D1Database, period: "weekly" | "monthly"): Promise<string> {
  const { results: items } = await db.prepare("SELECT * FROM ops_intel_items ORDER BY updated_at DESC LIMIT 100").all<OpsIntelItemRow>();
  const top = [...items]
    .sort((a, b) => qualityRank(b) - qualityRank(a) || (SEVERITY_RANK[b.severity ?? "Low"] ?? 0) - (SEVERITY_RANK[a.severity ?? "Low"] ?? 0))
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const title = period === "weekly" ? "Weekly" : "Monthly";
  const lines = [
    `# ${title} Part 121 / Part 135 Operations Intelligence Review`,
    `\nDate: ${today} UTC\n`,
    "## Executive Summary\n",
    `- ${items.length} stored operational-intelligence items reviewed.`,
    `- Official report/event candidates: ${items.filter(i => (i.tags ?? "").includes("official_report_candidate")).length}.\n`,
    "## Top 10 Events\n",
  ];
  for (const [i, item] of top.entries()) {
    lines.push(`${i + 1}. ${item.title ?? "Untitled item"}`);
    lines.push(`   - Source: ${item.source_name}`);
    lines.push(`   - Severity: ${item.severity ?? "Low"}`);
    lines.push(`   - Lesson: ${cleanSummary(item.operational_lesson, 260)}\n`);
  }
  return lines.join("\n");
}
