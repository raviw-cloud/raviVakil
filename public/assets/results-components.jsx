// VakilDesk results — components
// All major pieces of the interactive review page.

const { useState, useEffect, useRef, useMemo } = React;

/* ──────────────────────────────────────────────────────────────────
   Animated number — tweens from 0 to value
   ────────────────────────────────────────────────────────────────── */
function AnimatedNumber({ value, duration = 1400, animate = true, format = (v) => v, prefix = "", suffix = "" }) {
  const [n, setN] = useState(animate ? 0 : value);
  const startRef = useRef(0);
  useEffect(() => {
    if (!animate) { setN(value); return; }
    let raf;
    const start = performance.now();
    startRef.current = start;
    const from = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animate, duration]);
  return <span>{prefix}{format(n)}{suffix}</span>;
}

/* ──────────────────────────────────────────────────────────────────
   Score Donut — radial chart with severity breakdown
   ────────────────────────────────────────────────────────────────── */
function ScoreDonut({ score, breakdown, animate, palette }) {
  // breakdown: {high, medium, low}
  const total = breakdown.high + breakdown.medium + breakdown.low || 1;
  const circ = 2 * Math.PI * 88;
  const seg = (n) => (n / total) * circ;
  const colors = { high: palette.risk, medium: palette.amber, low: palette.moss };

  const [drawn, setDrawn] = useState(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) { setDrawn(1); return; }
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1400);
      const eased = 1 - Math.pow(1 - p, 3);
      setDrawn(eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, total]);

  let offset = 0;
  const segs = ["high", "medium", "low"].map((k) => {
    const len = seg(breakdown[k]) * drawn;
    const dasharray = `${len} ${circ}`;
    const dashoffset = -offset;
    offset += seg(breakdown[k]) * drawn;
    return { k, dasharray, dashoffset, color: colors[k] };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 220, height: 220 }}>
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="110" cy="110" r="88" fill="none" stroke={palette.borderSoft} strokeWidth="14" />
          {segs.map((s) => (
            <circle key={s.k} cx="110" cy="110" r="88" fill="none"
              stroke={s.color} strokeWidth="14" strokeLinecap="butt"
              strokeDasharray={s.dasharray} strokeDashoffset={s.dashoffset}
              style={{ transition: animate ? "none" : "stroke-dasharray .3s" }} />
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", color: palette.muted, fontWeight: 600 }}>Health</div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 64, fontWeight: 500, lineHeight: 1, color: score === 0 ? palette.risk : palette.ink, fontFeatureSettings: "'lnum'" }}>
            <AnimatedNumber value={score} animate={animate} format={(v) => Math.round(v)} />
          </div>
          <div style={{ fontSize: 12, color: palette.muted, marginTop: 4 }}>out of 100</div>
        </div>
      </div>
      {score === 0 && (
        <div style={{ fontSize: 11, color: palette.risk, textAlign: "center", marginTop: 10, fontFamily: "JetBrains Mono, monospace", letterSpacing: ".06em", maxWidth: 200 }}>
          Critical risks exceed scoring capacity
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Risk row — clickable list item with severity bar
   ────────────────────────────────────────────────────────────────── */
function RiskRow({ clause, active, onClick, palette, density }) {
  const sevColors = {
    HIGH: palette.risk, CRITICAL: palette.risk,
    MEDIUM: palette.amber, LOW: palette.moss
  };
  const c = sevColors[clause.severity] || palette.muted;
  const pad = density === "compact" ? "12px 14px" : density === "roomy" ? "20px 22px" : "16px 18px";
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: active ? palette.surfaceActive : palette.surface,
        border: `1px solid ${active ? palette.ink : palette.border}`,
        borderLeft: `4px solid ${c}`,
        borderRadius: 10, padding: pad, cursor: "pointer",
        transition: "all .18s ease",
        boxShadow: active ? `0 6px 20px ${palette.shadow}` : "none",
        marginBottom: density === "compact" ? 6 : 10,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = palette.borderHover; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = palette.border; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".08em", color: palette.muted, textTransform: "uppercase" }}>
          {clause.location} · {clause.party}
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: c, textTransform: "uppercase" }}>
          ● {clause.severity}
        </span>
      </div>
      <div style={{ fontFamily: "Newsreader, serif", fontSize: density === "compact" ? 17 : 19, fontWeight: 500, color: palette.ink, marginTop: 4, lineHeight: 1.25 }}>
        {clause.name}
      </div>
      {density !== "compact" && (
        <div style={{ fontSize: 13, color: palette.body, marginTop: 6, lineHeight: 1.5 }}>
          {clause.summary}
        </div>
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Risk Detail — slide-in panel: original | redline | talking points
   ────────────────────────────────────────────────────────────────── */
function RiskDetail({ clause, palette, onClose }) {
  if (!clause) return null;
  const sevColors = {
    HIGH: palette.risk, CRITICAL: palette.risk,
    MEDIUM: palette.amber, LOW: palette.moss
  };
  const c = sevColors[clause.severity] || palette.muted;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(clause.redline);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div style={{
      background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 14,
      padding: 0, overflow: "hidden", animation: "slideIn .3s cubic-bezier(.34,1.4,.64,1)",
    }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${palette.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: c, textTransform: "uppercase", padding: "3px 8px", border: `1px solid ${c}`, borderRadius: 100 }}>
              {clause.severity}
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: palette.muted }}>{clause.location}</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: palette.muted }}>· {clause.party}</span>
          </div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 26, fontWeight: 500, color: palette.ink, lineHeight: 1.2 }}>
            {clause.name}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: palette.muted, marginTop: 8 }}>
            {clause.icaRef}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${palette.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: palette.body, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "20px 22px", borderRight: `1px solid ${palette.border}`, background: palette.surfaceMuted }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.risk, fontWeight: 700, marginBottom: 10 }}>
            ⚠ Current Position
          </div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 15, lineHeight: 1.65, color: palette.body, fontStyle: "italic" }}>
            "{clause.current}"
          </div>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.moss, fontWeight: 700 }}>
              ✓ Proposed Redline
            </div>
            <button onClick={copy} style={{ fontSize: 11, background: "transparent", border: `1px solid ${palette.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: palette.body, fontFamily: "JetBrains Mono, monospace" }}>
              {copied ? "✓ copied" : "copy"}
            </button>
          </div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 15, lineHeight: 1.65, color: palette.ink }}>
            {clause.redline}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 22px", background: palette.surfaceMuted, borderTop: `1px solid ${palette.border}` }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.muted, fontWeight: 700, marginBottom: 10 }}>
          ◇ Talking Points for Negotiation
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.65, color: palette.body }}>
          {clause.talking}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Filter bar — severity, party, search
   ────────────────────────────────────────────────────────────────── */
function FilterBar({ filters, setFilters, parties, counts, palette }) {
  const sevs = [
    { key: "ALL", label: "All", count: counts.total, color: palette.ink },
    { key: "HIGH", label: "High", count: counts.high, color: palette.risk },
    { key: "MEDIUM", label: "Medium", count: counts.medium, color: palette.amber },
    { key: "LOW", label: "Low", count: counts.low, color: palette.moss },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
      {sevs.map((s) => {
        const active = filters.sev === s.key;
        return (
          <button key={s.key}
            onClick={() => setFilters({ ...filters, sev: s.key })}
            style={{
              background: active ? s.color : "transparent",
              color: active ? palette.surface : s.color,
              border: `1px solid ${s.color}`,
              borderRadius: 100, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "JetBrains Mono, monospace", letterSpacing: ".02em",
              transition: "all .15s",
            }}>
            {s.label} <span style={{ opacity: .7, marginLeft: 4 }}>{s.count}</span>
          </button>
        );
      })}
      <div style={{ width: 1, height: 22, background: palette.border, margin: "0 4px" }} />
      <select
        value={filters.party}
        onChange={(e) => setFilters({ ...filters, party: e.target.value })}
        style={{
          background: "transparent", color: palette.body,
          border: `1px solid ${palette.border}`, borderRadius: 100,
          padding: "5px 10px", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
          cursor: "pointer",
        }}>
        <option value="ALL">All parties</option>
        {parties.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select
        value={filters.sort}
        onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
        style={{
          background: "transparent", color: palette.body,
          border: `1px solid ${palette.border}`, borderRadius: 100,
          padding: "5px 10px", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
          cursor: "pointer",
        }}>
        <option value="severity">Sort: Severity</option>
        <option value="clause">Sort: Clause #</option>
        <option value="party">Sort: Party</option>
      </select>
      <input
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        placeholder="search clauses…"
        style={{
          flex: 1, minWidth: 140,
          background: "transparent", color: palette.ink,
          border: `1px solid ${palette.border}`, borderRadius: 100,
          padding: "6px 12px", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
          outline: "none",
        }}/>
    </div>
  );
}

Object.assign(window, { AnimatedNumber, ScoreDonut, RiskRow, RiskDetail, FilterBar });
