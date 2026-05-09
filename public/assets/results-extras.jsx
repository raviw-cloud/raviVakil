// VakilDesk results — secondary components
// Timeline, Missing protections, Talking points generator, AI drafter

const { useState: useStateB, useEffect: useEffectB, useRef: useRefB } = React;

/* ──────────────────────────────────────────────────────────────────
   Timeline — milestones light up sequentially
   ────────────────────────────────────────────────────────────────── */
function Timeline({ items, palette, animate }) {
  const [lit, setLit] = useStateB(animate ? 0 : items.length);
  useEffectB(() => {
    if (!animate) { setLit(items.length); return; }
    setLit(0);
    const ids = items.map((_, i) => setTimeout(() => setLit((n) => Math.max(n, i + 1)), 250 + i * 220));
    return () => ids.forEach(clearTimeout);
  }, [animate, items.length]);

  return (
    <div style={{ position: "relative", paddingLeft: 28 }}>
      <style>{`@keyframes vd-pulse{0%,100%{box-shadow:0 0 0 0 rgba(26,20,16,.25)}50%{box-shadow:0 0 0 8px rgba(26,20,16,0)}}`}</style>
      <div style={{ position: "absolute", left: 9, top: 8, bottom: 8, width: 2, background: palette.border }} />
      {items.map((it, i) => {
        const on = i < lit;
        const isCurrent = it.status === "due";
        return (
          <div key={i} style={{ position: "relative", marginBottom: 22, opacity: on ? 1 : 0.25, transition: "opacity .4s ease" }}>
            <div style={{
              position: "absolute", left: -28, top: 4,
              width: 20, height: 20, borderRadius: "50%",
              background: on ? (isCurrent ? palette.ink : palette.surface) : palette.surface,
              border: `2px solid ${on ? palette.ink : palette.border}`,
              animation: isCurrent && on ? "vd-pulse 2s ease-in-out infinite" : "none",
              transition: "all .3s",
            }} />
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: ".08em", color: palette.muted, fontWeight: 600, textTransform: "uppercase" }}>
              {it.date}
            </div>
            <div style={{ fontFamily: "Newsreader, serif", fontSize: 18, fontWeight: 500, color: palette.ink, marginTop: 2, lineHeight: 1.3 }}>
              {it.title}
            </div>
            <div style={{ fontSize: 13, color: palette.body, marginTop: 4, lineHeight: 1.55 }}>
              {it.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Missing protections grid
   ────────────────────────────────────────────────────────────────── */
function MissingGrid({ items, palette }) {
  const priColors = { P0: palette.risk, P1: palette.amber, P2: palette.muted };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {items.map((m, i) => (
        <div key={i} style={{
          background: palette.surface, border: `1px solid ${palette.border}`,
          borderTop: `3px solid ${priColors[m.priority] || palette.muted}`,
          borderRadius: 10, padding: "16px 18px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", color: priColors[m.priority], fontWeight: 700 }}>
              {m.priority} · MISSING
            </span>
          </div>
          <div style={{ fontFamily: "Newsreader, serif", fontSize: 17, fontWeight: 500, color: palette.ink, lineHeight: 1.3, marginBottom: 6 }}>
            {m.item}
          </div>
          <div style={{ fontSize: 13, color: palette.body, lineHeight: 1.55 }}>
            {m.impact}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Talking Points Generator — animates points appearing
   ────────────────────────────────────────────────────────────────── */
function TalkingPoints({ points, palette }) {
  const [shown, setShown] = useStateB(0);
  const [generating, setGenerating] = useStateB(false);
  const generate = () => {
    setShown(0); setGenerating(true);
    points.forEach((_, i) => setTimeout(() => setShown((n) => Math.max(n, i + 1)), 280 + i * 220));
    setTimeout(() => setGenerating(false), 280 + points.length * 220 + 100);
  };
  const copyAll = () => {
    const txt = points.map((p, i) => `${i + 1}. ${p}`).join("\n\n");
    navigator.clipboard?.writeText(txt);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={generate} disabled={generating} style={{
          background: palette.ink, color: palette.surface,
          border: "none", borderRadius: 100, padding: "10px 18px",
          fontSize: 13, fontWeight: 600, cursor: generating ? "default" : "pointer",
          fontFamily: "DM Sans, sans-serif", letterSpacing: ".02em",
          opacity: generating ? .6 : 1, transition: "all .15s",
        }}>
          {generating ? "◐ Generating…" : shown ? "↻ Regenerate" : "⚡ Generate Talking Points"}
        </button>
        {shown > 0 && (
          <button onClick={copyAll} style={{
            background: "transparent", color: palette.body,
            border: `1px solid ${palette.border}`, borderRadius: 100,
            padding: "10px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif",
          }}>Copy all</button>
        )}
      </div>
      <ol style={{ counterReset: "tp", listStyle: "none", padding: 0, margin: 0 }}>
        {points.map((p, i) => (
          <li key={i} style={{
            counterIncrement: "tp",
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "translateY(0)" : "translateY(8px)",
            transition: "opacity .4s ease, transform .4s cubic-bezier(.34,1.4,.64,1)",
            display: "flex", gap: 16, marginBottom: 14,
            paddingBottom: 14, borderBottom: i < points.length - 1 ? `1px solid ${palette.border}` : "none",
          }}>
            <div style={{
              fontFamily: "Newsreader, serif", fontSize: 28, fontWeight: 500,
              color: palette.amber, lineHeight: 1, minWidth: 32,
              fontStyle: "italic",
            }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: palette.ink, fontFamily: "Newsreader, serif", fontWeight: 400 }}>
              {p}
            </div>
          </li>
        ))}
      </ol>
      {!shown && !generating && (
        <div style={{ fontSize: 13, color: palette.muted, fontStyle: "italic", padding: "12px 0" }}>
          {points.length === 0
            ? "No recommendations found. Re-run the review on a contract with identifiable risk clauses."
            : "Click \"Generate Talking Points\" to get a negotiation script ready for your client meeting."}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   AI Drafter — POSTs to /api/draft (server.js routes to Claude)
   ────────────────────────────────────────────────────────────────── */
function AIDrafter({ contractContext, palette }) {
  const [prompt, setPrompt] = useStateB("");
  const [output, setOutput] = useStateB("");
  const [loading, setLoading] = useStateB(false);
  const [error, setError] = useStateB("");

  const presets = [
    { label: "Dispute Resolution Clause", p: `Draft a dispute resolution clause for ${contractContext} under Indian arbitration law.` },
    { label: "Force Majeure Clause", p: `Draft a balanced force majeure clause for ${contractContext} covering pandemic, government action, and natural disaster.` },
    { label: "Breach & Cure", p: `Draft a breach-and-cure clause for ${contractContext} with 15-day written cure opportunity before termination.` },
    { label: "Termination Clause", p: `Draft a mutual termination clause for ${contractContext} with 60 days notice and immediate exit for material breach.` },
    { label: "Indemnity Clause", p: `Draft an indemnity clause for ${contractContext} with mutual obligations and standard carve-outs.` },
  ];

  const generate = async (pp) => {
    const usePrompt = (pp || prompt).trim();
    if (!usePrompt) { setError("Enter a drafting request first."); return; }
    setError(""); setLoading(true); setOutput("");
    try {
      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Context: ${contractContext}\n\nRequest: ${usePrompt}`, sessionId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Draft generation failed.');
      setOutput(json.clause || 'No clause generated.');
    } catch (e) {
      setError(e.message || "Could not generate. Try again or rephrase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {presets.map((q) => (
          <button key={q.label} onClick={() => { setPrompt(q.p); generate(q.p); }} disabled={loading}
            style={{
              background: palette.surface, color: palette.body,
              border: `1px solid ${palette.border}`, borderRadius: 100,
              padding: "7px 13px", fontSize: 12, fontWeight: 500, cursor: loading ? "default" : "pointer",
              fontFamily: "DM Sans, sans-serif", transition: "all .15s",
              opacity: loading ? .5 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = palette.ink; e.currentTarget.style.color = palette.ink; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = palette.border; e.currentTarget.style.color = palette.body; }}>
            {q.label}
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the clause you need — e.g. 'Draft a landlord-friendly termination clause with 30 days notice and immediate exit for illegal use.'"
        style={{
          width: "100%", minHeight: 90,
          background: palette.surface, color: palette.ink,
          border: `1px solid ${palette.border}`, borderRadius: 12,
          padding: 14, fontSize: 14, fontFamily: "DM Sans, sans-serif",
          lineHeight: 1.5, resize: "vertical", outline: "none",
          marginBottom: 12,
        }}
        onFocus={(e) => e.target.style.borderColor = palette.ink}
        onBlur={(e) => e.target.style.borderColor = palette.border}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => generate()} disabled={loading} style={{
          background: palette.ink, color: palette.surface,
          border: "none", borderRadius: 100, padding: "10px 20px",
          fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer",
          fontFamily: "DM Sans, sans-serif", letterSpacing: ".02em",
          opacity: loading ? .6 : 1, display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          {loading && <span className="vd-spin" style={{ width: 12, height: 12, border: `2px solid ${palette.surface}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }} />}
          {loading ? "Drafting clause…" : "✦ Generate Clause"}
        </button>
        {output && (
          <button onClick={() => navigator.clipboard?.writeText(output)} style={{
            background: "transparent", color: palette.body,
            border: `1px solid ${palette.border}`, borderRadius: 100,
            padding: "10px 16px", fontSize: 13, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif",
          }}>Copy clause</button>
        )}
        {output && (
          <button onClick={() => { setOutput(""); setPrompt(""); setError(""); }} style={{
            background: "transparent", color: palette.muted,
            border: "none", padding: "10px 6px", fontSize: 13, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif",
          }}>Clear</button>
        )}
      </div>

      {error && (
        <div style={{ background: palette.surfaceMuted, border: `1px solid ${palette.risk}`, color: palette.risk, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{
        background: palette.surfaceMuted, border: `1px solid ${palette.border}`,
        borderRadius: 14, padding: output ? "22px 26px" : "30px 26px",
        minHeight: 140, fontFamily: "Newsreader, serif", fontSize: 15.5, lineHeight: 1.75,
        color: output ? palette.ink : palette.muted, fontStyle: output ? "normal" : "italic",
        whiteSpace: "pre-wrap",
      }}>
        {loading ? (
          <div style={{ color: palette.muted, fontStyle: "italic" }}>
            <span className="vd-typing">Drafting your clause</span>
          </div>
        ) : output || "Your drafted clause will appear here. It will reference relevant Indian statutes and read like proper contract language."}
      </div>
    </div>
  );
}

Object.assign(window, { Timeline, MissingGrid, TalkingPoints, AIDrafter });
