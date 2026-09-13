export function validateIngestRecord(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "record must be an object";
  const r = value as Record<string, unknown>;
  for (const key of ["id", "source_name", "source_url", "summary"]) {
    if (typeof r[key] !== "string" || !(r[key] as string).trim()) return `${key} is required`;
  }
  try {
    if (!["https:", "http:"].includes(new URL(r.source_url as string).protocol)) return "invalid source_url";
  } catch { return "invalid source_url"; }
  for (const key of ["event_date", "published_date"]) {
    const value = r[key];
    if (key === "published_date" && value == null) continue;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `invalid ${key}`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ||
        value > new Date().toISOString().slice(0, 10) || (key === "event_date" && value < "2000-01-01")) return `invalid ${key}`;
  }
  if (!Number.isInteger(r.severity) || (r.severity as number) < 1 || (r.severity as number) > 5) return "severity must be 1..5";
  if (!Array.isArray(r.tags) || r.tags.length > 30 || r.tags.some(t => typeof t !== "string" || t.length > 100)) return "invalid tags";
  if (r.confidence_score != null && (typeof r.confidence_score !== "number" || !Number.isFinite(r.confidence_score) || r.confidence_score < 0 || r.confidence_score > 1)) return "invalid confidence_score";
  return null;
}
