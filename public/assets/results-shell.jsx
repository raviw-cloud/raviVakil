// VakilDesk results — main app
// Wires palette, layout, sample switcher; composes screen.

const { useState: useS, useEffect: useE, useMemo: useM, useRef: useR } = React;

/* ──────── Palettes ──────── */
const PALETTES = {
  ink: {
    name: "Editorial Ink",
    swatch: ["#faf6ef", "#1a1410", "#c1272d", "#d4a574"],
    surface: "#faf6ef", surfaceMuted: "#f3ede1", surfaceActive: "#fff",
    ink: "#1a1410", body: "#3d342c", muted: "#7a6b5d",
    border: "#e7ddc9", borderHover: "#cbb88a", borderSoft: "#efe5d0",
    risk: "#c1272d", amber: "#b8722e", moss: "#3f6b3f",
    shadow: "rgba(26,20,16,.08)", page: "#f5efe2",
  },
  court: {
    name: "Classic Court",
    swatch: ["#f5f0e6", "#0a1628", "#9b1c1c", "#c9a961"],
    surface: "#fffaf2", surfaceMuted: "#f5f0e6", surfaceActive: "#fff",
    ink: "#0a1628", body: "#2c3e52", muted: "#6b7a8a",
    border: "#e0d9c8", borderHover: "#c9a961", borderSoft: "#ebe4d3",
    risk: "#9b1c1c", amber: "#b8862c", moss: "#2a6f4f",
    shadow: "rgba(10,22,40,.1)", page: "#ede4d0",
  },
  slate: {
    name: "Modern Slate",
    swatch: ["#fafafa", "#0a0a0a", "#dc2626", "#3b82f6"],
    surface: "#ffffff", surfaceMuted: "#f4f4f5", surfaceActive: "#fafafa",
    ink: "#0a0a0a", body: "#3f3f46", muted: "#71717a",
    border: "#e4e4e7", borderHover: "#a1a1aa", borderSoft: "#f4f4f5",
    risk: "#dc2626", amber: "#ea580c", moss: "#16a34a",
    shadow: "rgba(0,0,0,.08)", page: "#fafafa",
  },
  bold: {
    name: "Bold Contrast",
    swatch: ["#0a0a0a", "#fafafa", "#ff3b30", "#ffd60a"],
    surface: "#fafafa", surfaceMuted: "#ededed", surfaceActive: "#fff",
    ink: "#0a0a0a", body: "#1a1a1a", muted: "#666",
    border: "#0a0a0a", borderHover: "#ff3b30", borderSoft: "#dedede",
    risk: "#ff3b30", amber: "#ffaa00", moss: "#34c759",
    shadow: "rgba(0,0,0,.16)", page: "#e8e3d8",
  },
};

/* ──────── Defaults (persisted) ──────── */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "ink",
  "density": "cozy",
  "scoreAnimation": true,
  "layout": "sidebar",
  "sample": "leave_license"
}/*EDITMODE-END*/;

/* ──────── Top Header ──────── */
function HeaderBar({ data, palette, layout, samples, onSampleChange, currentSample }) {
  return (
    <div style={{
      background: palette.surface, borderBottom: `1px solid ${palette.border}`,
      padding: "14px 28px", position: "sticky", top: 0, zIndex: 50,
      backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <a href="index.html" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, background: palette.ink, color: palette.surface, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, fontFamily: "Newsreader, serif", fontWeight: 600, fontStyle: "italic", fontSize: 18 }}>V</div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 19, fontWeight: 500, color: palette.ink, letterSpacing: "-.01em" }}>VakilDesk</div>
        </a>
        <div style={{ width: 1, height: 22, background: palette.border }} />
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: palette.muted, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Review · {data.filename}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {samples && Object.keys(samples).length > 1 && (
          <select value={currentSample} onChange={(e) => onSampleChange(e.target.value)}
            style={{
              background: palette.surfaceMuted, color: palette.ink,
              border: `1px solid ${palette.border}`, borderRadius: 8,
              padding: "7px 12px", fontSize: 12, fontFamily: "DM Sans, sans-serif",
              cursor: "pointer", fontWeight: 500,
            }}>
            {Object.values(samples).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        <a href="dashboard.html" style={{
          background: "transparent", color: palette.body, textDecoration: "none",
          border: `1px solid ${palette.border}`, borderRadius: 8,
          padding: "7px 14px", fontSize: 13, cursor: "pointer",
          fontFamily: "DM Sans, sans-serif", fontWeight: 500,
        }}>New review</a>
        <button onClick={() => {
          const sid = new URLSearchParams(window.location.search).get('sessionId');
          if (sid) window.location.href = `/api/download-report/${encodeURIComponent(sid)}`;
        }} style={{
          background: palette.ink, color: palette.surface,
          border: "none", borderRadius: 8,
          padding: "7px 14px", fontSize: 13, cursor: "pointer",
          fontFamily: "DM Sans, sans-serif", fontWeight: 600, letterSpacing: ".01em",
        }}>↓ Export PDF</button>
      </div>
    </div>
  );
}

/* ──────── Hero summary ──────── */
function Hero({ data, palette, animate }) {
  const breakdown = {
    high: data.clauses.filter(c => c.severity === "HIGH" || c.severity === "CRITICAL").length,
    medium: data.clauses.filter(c => c.severity === "MEDIUM").length,
    low: data.clauses.filter(c => c.severity === "LOW").length,
  };
  return (
    <div style={{
      background: palette.surface, border: `1px solid ${palette.border}`,
      borderRadius: 16, padding: "32px 36px",
      display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 36, alignItems: "center",
    }}>
      <div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", color: palette.muted, fontWeight: 600, marginBottom: 14 }}>
          {data.contractType} · Audit Complete
        </div>
        <h1 style={{ fontFamily: "Newsreader, serif", fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 400, color: palette.ink, lineHeight: 1.06, letterSpacing: "-.02em", margin: "0 0 20px" }}>
          {data.licensor} <span style={{ fontStyle: "italic", color: palette.muted, fontWeight: 300 }}>vs.</span> {data.licensee}
        </h1>
        <p style={{ fontFamily: "Newsreader, serif", fontSize: 17, lineHeight: 1.65, color: palette.body, margin: "0 0 24px", maxWidth: 720, fontWeight: 400 }}>
          {data.summary}
        </p>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Stat label="Grade" value={data.grade} palette={palette} animate={animate} delay={400} />
          <Stat label="High Risks" value={breakdown.high} palette={palette} color={palette.risk} animate={animate} delay={500} />
          <Stat label="Missing" value={data.missingProtections.length} palette={palette} color={palette.amber} animate={animate} delay={600} />
          <Stat label="Clauses Reviewed" value={data.clauses.length} palette={palette} animate={animate} delay={700} />
        </div>
      </div>
      <ScoreDonut score={data.score} breakdown={breakdown} animate={animate} palette={palette} />
    </div>
  );
}

function Stat({ label, value, palette, color, animate, delay = 0 }) {
  const [show, setShow] = useS(!animate);
  useE(() => { if (animate) { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); } }, [animate, delay]);
  return (
    <div style={{ opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(8px)", transition: "all .5s cubic-bezier(.34,1.4,.64,1)" }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "Newsreader, serif", fontSize: 30, fontWeight: 500, color: color || palette.ink, lineHeight: 1 }}>
        {typeof value === "number" ? <AnimatedNumber value={value} animate={animate} format={(v) => Math.round(v)} /> : value}
      </div>
    </div>
  );
}

/* ──────── Contract metadata grid ──────── */
function ContractMeta({ data, palette }) {
  const items = [
    ["Contract Type", data.contractType || "—"],
    ["Parties", data.licensor && data.licensee ? `${data.licensor} / ${data.licensee}` : (data.licensor || data.licensee || "—")],
    ["Term / Duration", data.term || "—"],
    ["Total Value", data.totalValue || "—"],
    ["Execution Date", data.agreementDate || "—"],
    ["Governing Law", data.governingLaw || "—"],
    ["Registration", data.registrationDetails || "—"],
    ["Subject / Property", data.property || "—"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0, border: `1px solid ${palette.border}`, borderRadius: 14, overflow: "hidden", background: palette.surface }}>
      {items.map(([k, v], i) => (
        <div key={k} style={{
          padding: "18px 22px",
          borderRight: `1px solid ${palette.border}`,
          borderBottom: `1px solid ${palette.border}`,
        }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.muted, fontWeight: 600, marginBottom: 8 }}>{k}</div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 16, color: palette.ink, lineHeight: 1.4, fontWeight: 500 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ──────── Section header ──────── */
function SectionHead({ kicker, title, sub, palette }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 28, height: 1, background: palette.ink }} />
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", color: palette.ink, fontWeight: 600 }}>{kicker}</div>
      </div>
      <h2 style={{ fontFamily: "Newsreader, serif", fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 400, color: palette.ink, lineHeight: 1.1, letterSpacing: "-.02em", margin: "0 0 8px" }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: palette.muted, margin: 0, lineHeight: 1.6, maxWidth: 640 }}>{sub}</p>}
    </div>
  );
}

/* ──────── Side nav ──────── */
const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "overview", label: "Overview" },
  { id: "clauses", label: "Clauses & Risks" },
  { id: "timeline", label: "Timeline" },
  { id: "missing", label: "Missing Protections" },
  { id: "talking", label: "Talking Points" },
  { id: "drafter", label: "AI Drafter" },
];

function SideNav({ palette, layout }) {
  const [active, setActive] = useS("summary");
  useE(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-30% 0px -60% 0px" });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  if (layout === "topbar") {
    return (
      <div style={{
        position: "sticky", top: 60, zIndex: 40,
        background: palette.surface, borderBottom: `1px solid ${palette.border}`,
        padding: "10px 28px", display: "flex", gap: 6, overflowX: "auto",
      }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}
            style={{
              padding: "7px 14px", borderRadius: 100,
              fontSize: 13, fontFamily: "DM Sans, sans-serif",
              fontWeight: 500, textDecoration: "none",
              color: active === s.id ? palette.surface : palette.body,
              background: active === s.id ? palette.ink : "transparent",
              whiteSpace: "nowrap", transition: "all .15s",
            }}>{s.label}</a>
        ))}
      </div>
    );
  }
  return (
    <aside style={{ position: "sticky", top: 92, alignSelf: "start" }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: palette.muted, fontWeight: 600, marginBottom: 14, paddingLeft: 14 }}>Contents</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}
            style={{
              padding: "10px 14px", borderRadius: 8,
              fontSize: 14, fontFamily: "DM Sans, sans-serif",
              fontWeight: active === s.id ? 600 : 500, textDecoration: "none",
              color: active === s.id ? palette.ink : palette.muted,
              background: active === s.id ? palette.surfaceMuted : "transparent",
              borderLeft: `2px solid ${active === s.id ? palette.ink : "transparent"}`,
              transition: "all .15s",
            }}>{s.label}</a>
        ))}
      </nav>
    </aside>
  );
}

Object.assign(window, { PALETTES, TWEAK_DEFAULTS, HeaderBar, Hero, Stat, ContractMeta, SectionHead, SideNav, SECTIONS });
