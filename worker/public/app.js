/* PilotMetrics — app.js */

const flightInput  = document.getElementById("flight");
const searchBtn    = document.getElementById("search");
const searchBtnTxt = document.getElementById("searchBtnText");
const statusEl     = document.getElementById("status");
const resultsWrap  = document.getElementById("resultsWrap");
const heroSection  = document.getElementById("heroSection");
const contextEl    = document.getElementById("context");
const threatsEl    = document.getElementById("threats");
const navNewSearch = document.getElementById("navNewSearch");
const navUtc       = document.getElementById("navUtc");

// 로고 클릭 / New Search 버튼 → 홈으로
function goHome() {
  resultsWrap.classList.add("hidden");
  heroSection.classList.remove("hidden");
  navNewSearch.classList.add("hidden");
  flightInput.value = "";
  statusEl.textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelector(".nav-brand").style.cursor = "pointer";
document.querySelector(".nav-brand").addEventListener("click", goHome);
navNewSearch.addEventListener("click", goHome);

// UTC clock
function updateUtc() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, "0");
  const m = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  navUtc.textContent = `${h}:${m}:${s}Z`;
}
updateUtc();
setInterval(updateUtc, 1000);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function simPct(event) {
  const v = Number(event.similarity ?? event.similarity_score ?? 50);
  return Math.round(Number.isFinite(v) ? (v > 1 ? v : v * 100) : 50);
}

function sevClass(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "critical" || Number(sev) >= 5) return "critical";
  if (s === "high"     || Number(sev) >= 4) return "high";
  if (s === "medium"   || Number(sev) >= 3) return "medium";
  return "low";
}

function matchClass(pct) {
  if (pct >= 75) return "match-high";
  if (pct >= 50) return "match-med";
  return "";
}

function renderContext(ctx) {
  const riskLow = (ctx.risk_level || "low").toLowerCase();
  navNewSearch.classList.remove("hidden");
  const msgs = (ctx.messages || []).map(m => `<p class="ctx-msg">${esc(m)}</p>`).join("");
  const links = (ctx.flight_search_links || []).map(l =>
    `<a class="ctx-link" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`
  ).join("");

  contextEl.innerHTML = `
    <div class="ctx-header">
      <div>
        <div class="ctx-flight">${esc(ctx.flight_number)}</div>
        <div class="ctx-route">${esc(ctx.route)} &nbsp;·&nbsp; ${esc(ctx.departure_icao || "—")} → ${esc(ctx.arrival_icao || "—")}</div>
        <div class="ctx-aircraft">${esc(ctx.aircraft)}</div>
      </div>
      <span class="risk-badge ${riskLow}">${esc(ctx.risk_level || "LOW")}</span>
    </div>
    <div class="ctx-body">
      <div class="ctx-chip-row">
        <span class="chip">${esc(ctx.destination_runway || "RWY TBD")}</span>
        <span class="chip">${esc(ctx.weather || "—")}</span>
        ${ctx.arrival_weather_time ? `<span class="chip">${esc(ctx.arrival_weather_time)}</span>` : ""}
      </div>
      ${msgs}
      ${links ? `<div class="ctx-links">${links}</div>` : ""}
      ${ctx.arrival_taf ? `
        <div class="ctx-block">
          <div class="ctx-block-label">Arrival TAF</div>
          <pre class="ctx-weather-text">${esc(ctx.arrival_taf)}</pre>
        </div>` : ""}
      ${ctx.metar ? `
        <div class="ctx-block">
          <div class="ctx-block-label">METAR</div>
          <pre class="ctx-weather-text">${esc(ctx.metar)}</pre>
        </div>` : ""}
    </div>
  `;
}

function renderThreats(threats) {
  if (!threats || threats.length === 0) {
    threatsEl.innerHTML = `<p style="color:var(--muted);font-size:14px">No threat data found for this route.</p>`;
    return;
  }
  threatsEl.innerHTML = `
    <div class="threats-header">
      <h2 class="threats-title">Top Threats</h2>
      <span class="threats-count">${threats.length} identified</span>
    </div>
    ${threats.map((t, i) => {
      const events = (t.events || []);
      return `
      <div class="threat-card">
        <div class="threat-card-header">
          <div class="threat-num">${i + 1}</div>
          <div class="threat-title-wrap">
            <div class="threat-title">${esc(t.title)}</div>
            ${t.description ? `<div class="threat-desc">${esc(t.description)}</div>` : ""}
          </div>
          <span class="threat-event-count">${events.length} event${events.length !== 1 ? "s" : ""}</span>
        </div>
        ${events.map(ev => {
          const pct = simPct(ev);
          const sc  = sevClass(ev.severity);
          return `
          <details class="event-item">
            <summary class="event-summary">
              <span class="event-chevron">›</span>
              <span class="sev-dot ${sc}"></span>
              <span class="event-one-line">${esc(ev.one_line)}</span>
              <span class="event-match ${matchClass(pct)}">${pct}% match</span>
            </summary>
            <div class="event-detail">
              <div class="event-detail-title">${esc(ev.detail_title)}</div>
              <div class="event-meta-row">
                ${ev.date ? `<span class="event-meta-chip">${esc(ev.date)}</span>` : ""}
                ${ev.operation_type ? `<span class="event-meta-chip">${esc(ev.operation_type)}</span>` : ""}
                ${ev.category ? `<span class="event-meta-chip">${esc(ev.category)}</span>` : ""}
                <span class="event-meta-chip sev-${sc}">${esc(String(ev.severity || "").toUpperCase() || "N/A")}</span>
              </div>
              <p class="event-summary-text">${esc(ev.summary)}</p>
              ${ev.contributing_factors?.length ? `
                <div class="event-section-label">Contributing Factors</div>
                <ul class="event-list">${ev.contributing_factors.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
              ${ev.operational_lessons?.length ? `
                <div class="event-section-label">Operational Lessons</div>
                <ul class="event-list">${ev.operational_lessons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
              ${ev.a350_b787_applicability ? `
                <div class="event-section-label">A350 / B787 Applicability</div>
                <p class="event-summary-text">${esc(ev.a350_b787_applicability)}</p>` : ""}
              ${ev.pilot_briefing_sentence ? `
                <div class="event-briefing">
                  <div class="event-briefing-label">Pilot Briefing</div>
                  <div class="event-briefing-text">${esc(ev.pilot_briefing_sentence)}</div>
                </div>` : ""}
            </div>
          </details>`;
        }).join("")}
      </div>`;
    }).join("")}
  `;
}

function normalizeInput(raw) {
  let fn = raw.trim().toUpperCase().replace(/\s+/g, "");
  // 숫자만 입력 시 KE 자동 추가
  if (/^\d+$/.test(fn)) fn = "KE" + fn;
  // KAL → KE 변환
  if (fn.startsWith("KAL")) fn = "KE" + fn.slice(3);
  return fn;
}

function isAirportCode(fn) {
  return /^[A-Z]{3}$/.test(fn) || /^[A-Z]{4}$/.test(fn);
}

async function loadBriefing(flightNum) {
  const fn = normalizeInput(flightNum || flightInput.value);
  if (!fn) { statusEl.textContent = "편명 또는 공항코드를 입력하세요."; return; }
  const isAirport = isAirportCode(fn);
  if (!isAirport && (!fn.startsWith("KE") || !/^KE\d{1,4}$/.test(fn))) {
    statusEl.textContent = "대한항공 편명(KE + 숫자) 또는 공항코드(LAX, KLAX)를 입력하세요.";
    return;
  }

  statusEl.textContent = "Analyzing…";
  searchBtn.disabled = true;
  searchBtnTxt.textContent = "…";

  try {
    const res = await fetch(`/api/briefing/${encodeURIComponent(fn)}`);
    if (!res.ok) throw new Error("Briefing unavailable");
    const data = await res.json();

    renderContext(data.flight_context);
    renderThreats(data.top_threats || []);

    heroSection.classList.add("hidden");
    resultsWrap.classList.remove("hidden");
    statusEl.textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    statusEl.textContent = "Unable to load briefing. Please try again.";
  } finally {
    searchBtn.disabled = false;
    searchBtnTxt.textContent = "Analyze";
  }
}

searchBtn.addEventListener("click", () => loadBriefing());
flightInput.addEventListener("keydown", e => { if (e.key === "Enter") loadBriefing(); });

// ── DB STATS SIDEBAR ──────────────────────────────────────────────────────────
const SEV_LABELS = { 5: "Critical", 4: "High", 3: "Medium", 2: "Low", 1: "Info" };
const SEV_COLORS = { 5: "#ef4444", 4: "#f97316", 3: "#f59e0b", 2: "#22c55e", 1: "#38bdf8" };

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const d = await res.json();

    document.getElementById("statTotal").textContent = Number(d.total_events).toLocaleString();
    document.getElementById("statYears").textContent =
      d.year_min && d.year_max ? `${d.year_min} – ${d.year_max}` : "—";
    document.getElementById("statAirports").textContent = d.airports_covered ?? "—";
    document.getElementById("statSources").textContent = d.sources ?? "—";

    if (d.last_updated) {
      const dt = new Date(d.last_updated);
      document.getElementById("statUpdated").textContent =
        dt.toISOString().slice(0, 10);
    }

    const sevData = (d.severity_breakdown || []).sort((a, b) => b.severity - a.severity);
    const maxN = Math.max(...sevData.map(s => s.n), 1);
    const barsEl = document.getElementById("statSevBars");
    barsEl.innerHTML = sevData.map(s => {
      const pct = Math.round((s.n / maxN) * 100);
      const label = SEV_LABELS[s.severity] || `Sev ${s.severity}`;
      const color = SEV_COLORS[s.severity] || "#8fa3b8";
      return `<div class="db-sev-row">
        <span class="db-sev-name">${label}</span>
        <div class="db-sev-bar-wrap"><div class="db-sev-bar" style="width:${pct}%;background:${color}"></div></div>
        <span class="db-sev-count">${s.n}</span>
      </div>`;
    }).join("");
  } catch { /* silent */ }
}

loadStats();
