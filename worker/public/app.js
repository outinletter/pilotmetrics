/* PilotMetrics — app.js */

// ── iOS Safari pull-to-refresh 방지 ───────────────────────
// passive:false는 렌더링 지연을 일으키므로 최소한으로만 사용
;(function() {
  let startX = 0, startY = 0;
  const EDGE_THRESHOLD = 30; // 왼쪽 엣지(뒤로가기 제스처) 보호 영역 px

  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    // 왼쪽 엣지 스와이프(iOS 뒤로가기)는 무조건 통과
    if (startX < EDGE_THRESHOLD) return;

    const scrollTop = (document.scrollingElement || document.documentElement).scrollTop;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = e.touches[0].clientY - startY;

    // 세로 당김이 가로보다 2배 이상 크고, 최상단이고, 아래 방향일 때만 차단
    if (scrollTop === 0 && dy > 10 && dy > dx * 2) {
      e.preventDefault();
    }
  }, { passive: false });
})();

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

function toUtcHHMM(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toISOString().slice(11, 16).replace(":", "") + "Z";
}

function fmtTime(iso) {
  return toUtcHHMM(iso) ?? null;
}

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
      <div class="ctx-header-inner">
        <div class="ctx-header-center">
        <div class="ctx-flight-row">
          <span class="ctx-flight">${esc(ctx.flight_number)}</span>
          <span class="ctx-flight-sep">·</span>
          <span class="ctx-route-inline">${esc(ctx.route)}</span>
          <span class="risk-badge ctx-risk-badge ${riskLow}">${esc(ctx.risk_level || "LOW")}</span>
        </div>
        <div class="ctx-icao-row">
          ${(() => {
            const dep   = esc(ctx.departure_icao || "—");
            const arr   = esc(ctx.arrival_icao   || "—");
            const depT  = fmtTime(ctx.estimated_departure ?? ctx.scheduled_departure);
            const arrT  = fmtTime(ctx.estimated_arrival  ?? ctx.scheduled_arrival);
            const fn    = esc(ctx.flight_number ?? "");
            const gLink = t => `https://www.google.com/search?q=${encodeURIComponent(t)}`;
            const depSeg = depT
              ? `<span class="ctx-icao-seg">${dep}<span class="ctx-time-paren">(${depT})</span></span>`
              : `<a class="ctx-icao-seg ctx-icao-search" href="${gLink(fn + ' departure time')}" target="_blank" rel="noreferrer">${dep}<span class="ctx-time-paren ctx-search-icon">🔍</span></a>`;
            const arrSeg = arrT
              ? `<span class="ctx-icao-seg">${arr}<span class="ctx-time-paren">(${arrT})</span></span>`
              : `<a class="ctx-icao-seg ctx-icao-search" href="${gLink(fn + ' arrival time')}" target="_blank" rel="noreferrer">${arr}<span class="ctx-time-paren ctx-search-icon">🔍</span></a>`;
            return `${depSeg}<span class="ctx-icao-arrow">→</span>${arrSeg}`;
          })()}
        </div>
        ${ctx.arrival_weather_brief ? `<div class="ctx-wx-brief">${esc(ctx.arrival_weather_brief)}</div>` : ""}
        </div>
      </div>
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
      ${(ctx.risk_breakdown && ctx.risk_breakdown.length > 0) ? `
        <div class="ctx-block">
          <div class="ctx-block-label">Risk Details (${ctx.risk_score}/100)</div>
          <div class="risk-breakdown-list">
            ${ctx.risk_breakdown.map(b => `
              <div class="risk-breakdown-item">
                <span class="risk-breakdown-tag">${esc(b.label || b.tag)}</span>
                <span class="risk-breakdown-bar-wrap">
                  <span class="risk-breakdown-bar" style="width:${Math.min(100, Math.round(b.score * 2.5))}%"></span>
                </span>
                <span class="risk-breakdown-score">+${b.score}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}
    </div>
  `;
}

// ── NOTAM 위협 렌더링 ─────────────────────────────────────────────────────────
const NOTAM_CATEGORY_ICON = {
  ILS_NAVAID:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 19h20L12 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5M12 17v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  VOR_NDB:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  RUNWAY:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  TAXIWAY:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12h16M4 8l8-4 8 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  AIRSPACE:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  LIGHTING:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1 8 9-12h-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  OBSTACLE:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  BIRD:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 10c3-4 7-5 9-2 2-3 6-2 9 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  COMM:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  OTHER:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4M12 16v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

const NOTAM_SEV_CLASS = {
  CRITICAL: "sev-critical", HIGH: "sev-high", MEDIUM: "sev-medium", LOW: "sev-low",
};

function formatNotamTime(iso) {
  if (!iso || iso === "PERM") return iso || "PERM";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch { return iso; }
}

function renderNotamThreats(notams) {
  // NOTAM 섹션 컨테이너 찾기 또는 생성
  let section = document.getElementById("notamSection");
  if (!section) {
    section = document.createElement("section");
    section.id = "notamSection";
    section.className = "notam-section";
    threatsEl.parentElement.insertBefore(section, threatsEl);
  }

  if (!notams || notams.length === 0) {
    section.innerHTML = "";
    return;
  }

  section.innerHTML = `
    <div class="notam-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      NOTAM 활성 위협
      <span class="notam-count">${notams.length}건 · ETA ±1h 이내</span>
    </div>
    <div class="notam-list">
      ${notams.map(n => `
        <div class="notam-card notam-${n.severity.toLowerCase()}">
          <div class="notam-card-top">
            <span class="notam-icon ${NOTAM_SEV_CLASS[n.severity]}">${NOTAM_CATEGORY_ICON[n.category] || NOTAM_CATEGORY_ICON.OTHER}</span>
            <div class="notam-card-main">
              <div class="notam-card-headline">${n.headline}</div>
              <div class="notam-card-meta">
                <span class="notam-id">${n.notamId}</span>
                <span class="notam-time">${formatNotamTime(n.effectiveStart)} – ${formatNotamTime(n.effectiveEnd)}</span>
              </div>
            </div>
            <div class="notam-score-badge notam-score-${n.severity.toLowerCase()}">${Math.round(n.riskScore)}</div>
          </div>
          <details class="notam-raw-wrap">
            <summary class="notam-raw-toggle">NOTAM 원문 보기</summary>
            <pre class="notam-raw">${n.rawText}</pre>
          </details>
        </div>
      `).join("")}
    </div>
  `;
}

function renderThreats(threats) {
  if (!threats || threats.length === 0) {
    threatsEl.innerHTML = `
      <div class="no-threat-wrap">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="rgba(56,189,248,0.2)" stroke-width="2"/>
          <path d="M24 14v12M24 32v2" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <p class="no-threat-title">No threat data found</p>
        <p class="no-threat-sub">No safety events in the database match this route. The route may have limited historical data.</p>
      </div>`;
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
              ${ev.briefing_keywords?.length ? `
                <div class="event-section-label">Watch For</div>
                <div class="briefing-kw-row">${ev.briefing_keywords.map(k => `<span class="briefing-kw">${esc(k)}</span>`).join("")}</div>` : ""}
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
  if (!fn) { statusEl.textContent = "Enter a flight number or airport code."; return; }
  const isAirport = isAirportCode(fn);
  if (!isAirport && (!fn.startsWith("KE") || !/^KE\d{1,4}$/.test(fn))) {
    statusEl.textContent = "Enter a Korean Air flight number (KE + digits) or airport code (LAX, KLAX).";
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
    renderNotamThreats(data.notam_threats || []);

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

let _lastStatsTs = null;

async function loadStats({ force = false } = {}) {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const d = await res.json();

    // last_updated가 바뀌었을 때만 렌더링 (force=true이면 무조건 렌더)
    if (!force && d.last_updated === _lastStatsTs) return;
    _lastStatsTs = d.last_updated ?? null;

    document.getElementById("statTotal").textContent = Number(d.total_events).toLocaleString();
    document.getElementById("statYears").textContent =
      d.year_min && d.year_max ? `${d.year_min} – ${d.year_max}` : "—";
    document.getElementById("statAirports").textContent = d.airports_covered ?? "—";
    const sourcesEl = document.getElementById("statSources");
    const sourceNames = Array.isArray(d.sources) ? d.sources : [];
    sourcesEl.innerHTML = sourceNames.map(s =>
      `<span class="db-source-tag">${esc(s)}</span>`
    ).join("");

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

// 최초 로드
loadStats({ force: true });
// 30초마다 last_updated 확인 — 변경됐을 때만 UI 갱신
setInterval(loadStats, 30 * 1000);
