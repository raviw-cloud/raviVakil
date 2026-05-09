// VakilDesk results — main App
// Fetches /api/results/:sessionId, adapts the JSON to the JSX components' shape,
// renders Editorial Ink theme. Sample/palette switchers removed.

const { useState: uS, useEffect: uE, useMemo: uM } = React;

/* ---------- API → view-model adapter ---------- */

function severityFromComposite(composite, fallback) {
  const c = Number(composite);
  if (!Number.isFinite(c) || c <= 0) return String(fallback || "MEDIUM").toUpperCase();
  if (c >= 9) return "CRITICAL";
  if (c >= 7) return "HIGH";
  if (c >= 5) return "MEDIUM";
  return "LOW";
}

function priorityFromCriticality(crit) {
  return String(crit || "").toUpperCase() === "CRITICAL" ? "P0" : "P1";
}

function partyFromBenefits(benefits, partyA, partyB) {
  const b = String(benefits || "").toLowerCase();
  if (b.includes("party a") || b.includes(String(partyA || "").toLowerCase())) return partyB || "Other Side";
  if (b.includes("party b") || b.includes(String(partyB || "").toLowerCase())) return partyA || "You";
  return "Both";
}

function statusFromKind(kind) {
  const k = String(kind || "").toUpperCase();
  if (k === "MILESTONE") return "due";
  if (k === "DEADLINE" || k === "RECURRING") return "upcoming";
  return "future";
}

function splitParties(metadata) {
  const partiesText = String((metadata && metadata.parties) || "");
  const parts = partiesText
    .split(/\s+vs\.?\s+|\s+and\s+|\s*,\s*|\s*↔\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
  return [parts[0] || "Party A", parts[1] || "Party B"];
}

function mapApiToView(api) {
  const r = (api && api.results) || {};
  const meta = (r.clauses && r.clauses.metadata) || {};
  const apiClauses = Array.isArray(r.clauses && r.clauses.clauses) ? r.clauses.clauses : [];
  const apiRisks = Array.isArray(r.risks && r.risks.risks) ? r.risks.risks : [];
  const apiCompliance = Array.isArray(r.compliance && r.compliance.issues) ? r.compliance.issues : [];
  const apiTimeline = Array.isArray(r.terms && r.terms.timeline) ? r.terms.timeline : [];
  const apiObligations = Array.isArray(r.terms && r.terms.obligations) ? r.terms.obligations : [];
  const apiMissing = Array.isArray(r.clauses && r.clauses.missingProtections) ? r.clauses.missingProtections : [];
  const apiRecs = Array.isArray(r.recommendations && r.recommendations.recommendations) ? r.recommendations.recommendations : [];

  const [partyA, partyB] = splitParties(meta);
  const partiesText = meta.parties || `${partyA} ↔ ${partyB}`;

  // Build the unified "clause" list the JSX expects.
  // Each risk becomes a clause row; if a risk has no matching clause, we still render it.
  // If there are clauses without risks, we render them as LOW severity entries.
  const risksBySection = new Map();
  for (const rk of apiRisks) {
    const key = String(rk.section || rk.location || "").toLowerCase();
    if (key) risksBySection.set(key, rk);
  }
  const clausesById = new Map();
  for (const cl of apiClauses) {
    const key = String(cl.section || cl.location || "").toLowerCase();
    if (key) clausesById.set(key, cl);
  }
  const recsByLinkedRisk = new Map();
  for (const rec of apiRecs) {
    if (rec.linkedRiskId) recsByLinkedRisk.set(String(rec.linkedRiskId), rec);
  }
  const complianceBySection = new Map();
  for (const c of apiCompliance) {
    const key = String(c.clauseLocation || c.location || c.section || "").toLowerCase();
    if (key) complianceBySection.set(key, c);
  }

  const seenSections = new Set();
  const merged = [];

  // Pass 1 — risks first (most informative)
  apiRisks.forEach((rk, i) => {
    const sectionKey = String(rk.section || "").toLowerCase();
    seenSections.add(sectionKey);
    const matchedClause = clausesById.get(sectionKey);
    const matchedRec = recsByLinkedRisk.get(String(rk.id || "")) || null;
    const matchedCompliance = complianceBySection.get(sectionKey);
    const sev = severityFromComposite(rk.composite, rk.severity);
    merged.push({
      id: rk.id || `r${i}`,
      name: rk.title || (matchedClause && matchedClause.heading) || "Clause",
      location: rk.section || (matchedClause && matchedClause.section) || "Unspecified section",
      severity: sev,
      party: partyFromBenefits(rk.benefits, partyA, partyB),
      summary: rk.summary || (matchedClause && matchedClause.summary) || rk.rationale || "",
      current: (matchedClause && matchedClause.summary) || rk.summary || rk.rationale || "—",
      redline: (matchedRec && matchedRec.recommendedLanguage) || rk.redline || "Redraft to remove the asymmetry; introduce mutuality and a hard cap.",
      talking: (matchedRec && matchedRec.negotiation && matchedRec.negotiation.opening) || rk.rationale || "Open by framing the change as alignment with Indian-law norms; offer a concession from your P3/P4 list in return.",
      icaRef: (matchedCompliance && (matchedCompliance.statute + (matchedCompliance.section ? `, ${matchedCompliance.section}` : ""))) || (rk.financialExposure === "Uncapped" ? "ICA 1872, S.74 (penalty doctrine)" : "Indian Contract Act 1872"),
      composite: rk.composite,
      financialExposure: rk.financialExposure,
      poisonPill: rk.poisonPill === true
    });
  });

  // Pass 2 — pure clauses (no risk match) → LOW severity rows
  apiClauses.forEach((cl, i) => {
    const sectionKey = String(cl.section || "").toLowerCase();
    if (seenSections.has(sectionKey)) return;
    merged.push({
      id: cl.id || `c${i}`,
      name: cl.clauseName || cl.heading || cl.name || cl.title || "Unnamed Clause",
      location: cl.section || "Unspecified section",
      severity: severityFromComposite(null, cl.severity || "LOW"),
      party: "Both",
      summary: cl.summary || "",
      current: cl.summary || "—",
      redline: "Standard clause — no redline required.",
      talking: "Standard clause within Indian-law norms; no negotiation needed.",
      icaRef: "Standard practice"
    });
  });

  const missingProtections = apiMissing.map((m, i) => {
    if (typeof m === "string") return { item: m, impact: "Add protective language or a signed addendum.", priority: "P1" };
    return {
      item: m.name || m.protection || "Missing protection",
      impact: m.reason || m.suggestedRemedy || "Add protective language or a signed addendum.",
      priority: priorityFromCriticality(m.criticality)
    };
  });

  const timeline = apiTimeline.length
    ? apiTimeline.map((t, i) => ({
        date: t.date || "Not specified",
        title: t.label || "Milestone",
        detail: Array.isArray(t.obligationIds) && t.obligationIds.length
          ? `Linked obligations: ${t.obligationIds.join(", ")}`
          : t.kind ? `Type: ${t.kind}` : "",
        status: t.critical ? "due" : statusFromKind(t.kind)
      }))
    : apiObligations.slice(0, 6).map((o, i) => ({
        date: o.deadline || "Not specified",
        title: o.description || "Obligation",
        detail: o.consequenceOfBreach || "",
        status: i === 0 ? "due" : "upcoming"
      }));

  // Talking points — derive from top 3-5 P0/P1 recommendations
  const talkingPoints = apiRecs
    .filter(rec => rec.priority === "P0" || rec.priority === "P1")
    .slice(0, 5)
    .map(rec => {
      const headline = rec.title || `Section ${rec.section || ""}`;
      const script = (rec.negotiation && rec.negotiation.opening) || rec.issue || rec.recommendedLanguage || "";
      return script ? `${headline}: ${script}` : headline;
    });

  // Heuristic fields the components reference but the API doesn't directly produce
  const totalValue = meta.totalValue || (r.terms && r.terms.financialExposure && r.terms.financialExposure.totalMaxExposure) || "Not specified";

  return {
    id: "review",
    label: meta.documentTitle || api.filename || "Contract Review",
    filename: api.filename || meta.documentTitle || "Document",
    score: api.score || 0,
    grade: api.grade || "—",
    recommendation: api.recommendation || "—",
    summary: api.summary || (r.clauses && r.clauses.summary) || "Review complete.",
    contractType: meta.contractType || meta.documentType || "Legal Document",
    licensor: partyA,
    licensee: partyB,
    party_role_a: meta.partyARole || "Party A",
    party_role_b: meta.partyBRole || "Party B",
    property: meta.subjectMatter || meta.propertyAddress || meta.property || "Subject matter not specified",
    agreementDate: meta.effectiveDate || "Not specified",
    registrationDetails: meta.registrationDetails || "Not specified",
    term: meta.term || "Not specified",
    monthlyRent: meta.monthlyRent || meta.rent || "—",
    deposit: meta.securityDeposit || meta.deposit || "—",
    governingLaw: meta.governingLaw || "India",
    totalValue,
    clauses: merged,
    missingProtections,
    timeline,
    talkingPoints,
    partiesText
  };
}

/* ---------- Loading / error UI ---------- */

function FullPageMsg({ palette, title, body, action }) {
  return (
    <div style={{ background: palette.page, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ maxWidth: 520, textAlign: "center", color: palette.ink }}>
        <div style={{ fontFamily: "Newsreader, serif", fontSize: 32, fontWeight: 400, marginBottom: 12, letterSpacing: "-.02em" }}>{title}</div>
        <div style={{ color: palette.muted, fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>{body}</div>
        {action}
      </div>
    </div>
  );
}

/* ---------- App ---------- */

function App() {
  const palette = PALETTES.ink;
  const sessionId = new URLSearchParams(window.location.search).get("sessionId");
  const [data, setData] = uS(null);
  const [error, setError] = uS("");
  const [loading, setLoading] = uS(true);
  const [filters, setFilters] = uS({ sev: "ALL", party: "ALL", sort: "severity", q: "" });
  const [selectedId, setSelected] = uS(null);

  uE(() => {
    if (!sessionId) {
      setError("No sessionId in the URL. Open this page from /dashboard.html after running an analysis.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/results/${encodeURIComponent(sessionId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load results.");
        if (!cancelled) {
          setData(mapApiToView(json));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Unable to load the result.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return <FullPageMsg palette={palette} title="Loading review…" body="Fetching the analysis from the server." action={null} />;
  }
  if (error || !data) {
    return <FullPageMsg
      palette={palette}
      title="We couldn't load this review"
      body={error || "The session may have expired. Run a fresh analysis from the dashboard."}
      action={<a href="dashboard.html" style={{ background: palette.ink, color: palette.surface, padding: "10px 22px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>Back to dashboard</a>} />;
  }

  const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const filteredClauses = (() => {
    let arr = data.clauses.filter((c) => {
      if (filters.sev !== "ALL") {
        if (filters.sev === "HIGH" ? !(c.severity === "HIGH" || c.severity === "CRITICAL") : c.severity !== filters.sev) return false;
      }
      if (filters.party !== "ALL" && c.party !== filters.party) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!(String(c.name).toLowerCase().includes(q) || String(c.summary).toLowerCase().includes(q) || String(c.location || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
    if (filters.sort === "severity") arr.sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0));
    if (filters.sort === "party") arr.sort((a, b) => String(a.party).localeCompare(String(b.party)));
    if (filters.sort === "clause") arr.sort((a, b) => String(a.location || "").localeCompare(String(b.location || "")));
    return arr;
  })();

  const counts = {
    total: data.clauses.length,
    high: data.clauses.filter(c => c.severity === "HIGH" || c.severity === "CRITICAL").length,
    medium: data.clauses.filter(c => c.severity === "MEDIUM").length,
    low: data.clauses.filter(c => c.severity === "LOW").length
  };
  const parties = [...new Set(data.clauses.map(c => c.party))];
  const selected = filteredClauses.find(c => c.id === selectedId) || data.clauses.find(c => c.id === selectedId);

  return (
    <div style={{ background: palette.page, minHeight: "100vh", color: palette.ink, fontFamily: "DM Sans, sans-serif" }}>
      <style>{`
        body { background: ${palette.page}; }
        ::selection { background: ${palette.ink}; color: ${palette.surface}; }
        @keyframes slideIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
        .vd-spin { animation: vd-spin 0.8s linear infinite; }
        @keyframes vd-spin { to { transform: rotate(360deg); } }
        .vd-typing::after { content:'…'; animation: vd-typing 1.4s steps(4) infinite; }
        @keyframes vd-typing { 0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'} }
      `}</style>

      <HeaderBar data={data} palette={palette} layout="sidebar"
        samples={{}} onSampleChange={() => {}} currentSample={null} />

      <div style={{ padding: "32px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", maxWidth: 1320, margin: "0 auto", gap: 36 }}>
          <SideNav palette={palette} layout="sidebar" />

          <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 56 }}>

            <section id="summary">
              <Hero data={data} palette={palette} animate={true} key={data.score} />
            </section>

            <section id="overview">
              <SectionHead kicker="01 · Document Overview"
                title="The Agreement at a Glance"
                sub="Parties, governing law, and commercial terms extracted from the executed text."
                palette={palette} />
              <ContractMeta data={data} palette={palette} />
            </section>

            <section id="clauses">
              <SectionHead kicker="02 · Clause Analysis"
                title="Risks, Read Clause by Clause"
                sub="Each provision in your agreement, scored against Indian law. Click any clause to see the redline and talking points."
                palette={palette} />
              <FilterBar filters={filters} setFilters={setFilters}
                parties={parties} counts={counts} palette={palette} />
              <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(0, 380px) minmax(0, 1fr)" : "1fr", gap: 18, transition: "grid-template-columns .3s ease" }}>
                <div>
                  {filteredClauses.length === 0 && (
                    <div style={{ padding: "30px 24px", border: `1px dashed ${palette.border}`, borderRadius: 12, color: palette.muted, fontStyle: "italic", fontFamily: "Newsreader, serif", fontSize: 15, textAlign: "center" }}>
                      No clauses match these filters.
                    </div>
                  )}
                  {filteredClauses.map((c) => (
                    <RiskRow key={c.id} clause={c}
                      active={selectedId === c.id}
                      onClick={() => setSelected(selectedId === c.id ? null : c.id)}
                      palette={palette} density="cozy" />
                  ))}
                </div>
                {selected && (
                  <div style={{ position: "sticky", top: 110, alignSelf: "start" }}>
                    <RiskDetail clause={selected} palette={palette} onClose={() => setSelected(null)} />
                  </div>
                )}
              </div>
            </section>

            <section id="timeline">
              <SectionHead kicker="03 · Obligation Timeline"
                title="Dates That Matter"
                sub="Milestones and deadlines extracted from the agreement."
                palette={palette} />
              <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 14, padding: "32px 36px" }}>
                {data.timeline.length > 0
                  ? <Timeline items={data.timeline} palette={palette} animate={true} />
                  : <div style={{ color: palette.muted, fontStyle: "italic", fontSize: 14, padding: "20px 0" }}>
                      No key dates extracted. Consider adding commencement date, expiry date, and notice periods to the contract.
                    </div>
                }
              </div>
            </section>

            <section id="missing">
              <SectionHead kicker="04 · Gaps in the Drafting"
                title="What's Missing"
                sub="Protections the agreement should have included but did not."
                palette={palette} />
              <MissingGrid items={data.missingProtections} palette={palette} />
            </section>

            <section id="talking">
              <SectionHead kicker="05 · Negotiation Brief"
                title="What to Say in the Room"
                sub="Talking points derived from the top P0/P1 recommendations. Copy and walk into your meeting prepared."
                palette={palette} />
              <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 14, padding: "26px 30px" }}>
                <TalkingPoints points={data.talkingPoints} palette={palette} />
              </div>
            </section>

            <section id="drafter" style={{ paddingBottom: 60 }}>
              <SectionHead kicker="06 · AI Drafting Assistant"
                title="Draft a Replacement Clause"
                sub="Live drafting in formal Indian contract language. Pick a quick-fix or describe what you need."
                palette={palette} />
              <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 14, padding: "26px 30px" }}>
                <AIDrafter
                  contractContext={`${data.contractType} between ${data.licensor} (${data.party_role_a}) and ${data.licensee} (${data.party_role_b})`}
                  palette={palette}
                />
              </div>
            </section>

            <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 24, marginTop: 16, color: palette.muted, fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>
              ⚠ AI-generated analysis does not constitute legal advice. Always exercise independent professional judgment.
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
