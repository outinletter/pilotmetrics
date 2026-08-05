import { cleanSummary, topItems } from "./report_generator";

export async function telegramMessage(db: D1Database): Promise<string> {
  const items = await topItems(db, 3);
  if (!items.length) return "[121/135 OPS INTEL]\n\nNo operational-intelligence items are currently stored.";
  const lines = ["[121/135 OPS INTEL]", ""];
  for (const [i, item] of items.entries()) {
    lines.push(`${i + 1}. Severity: ${item.severity ?? "Low"}`);
    lines.push(`Category: ${item.category ?? "Unclassified"}`);
    lines.push(`Event: ${item.title ?? "Untitled item"}`);
    lines.push("", "Summary:", cleanSummary(item.summary, 320));
    lines.push("", "Operational Lesson:", cleanSummary(item.operational_lesson, 220));
    lines.push("", "A350/B787 Relevance:", cleanSummary(item.a350_b787_applicability, 220));
    lines.push("", "Action:", cleanSummary(item.recommended_action, 220), "");
  }
  return lines.join("\n").trim();
}

export async function sendTelegramMessage(db: D1Database, botToken: string, chatId: string): Promise<Record<string, unknown>> {
  const message = await telegramMessage(db);
  if (!botToken || !chatId) return { sent: false, reason: "telegram_not_configured", message };
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Telegram API error: ${res.status}`);
  return { sent: true, message };
}
