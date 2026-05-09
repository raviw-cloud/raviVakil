# Professional PDF Report — `/legal report-pdf`

Render the latest contract review as a professionally laid-out PDF. Triggered by `/legal report-pdf` (Claude Code) or by `GET /api/download-report/:sessionId` (web app). The web app is the canonical implementation in this project — this skill documents that flow rather than generating PDFs from scratch.

## How it works in this project

Unlike upstream `ai-legal-claude` (which shells out to a Python `ReportLab` script), VakilDesk renders the PDF in Node:

| Step | What happens | Where |
|---|---|---|
| 1 | The user runs `/api/analyze` with a PDF — see `skills/legal-review/legal-review.md`. | `server.js → POST /api/analyze` |
| 2 | The 5 agents return JSON. The aggregated review is cached in memory keyed by `sessionId`. | `server.js → reportCache` |
| 3 | The user clicks **Download Full Report (PDF)** in the web UI, or types `/legal report-pdf` in Claude Code. | front-end / CLI |
| 4 | The browser hits `GET /api/download-report/:sessionId`. | `server.js:1011` |
| 5 | The handler `sendReviewPdf()` pulls the cached review, calls `buildGenericLegalReviewHtml(vm)` to assemble HTML, and renders it to PDF via Puppeteer. | `server.js:921` and `server.js:513` |
| 6 | The PDF streams back as `application/pdf` with filename `CONTRACT-REVIEW-[name]-[YYYY-MM-DD].pdf`. | `server.js → sendReviewPdf` |

**Zero new LLM calls** — the PDF is rendered from cache. Repeat downloads are free.

## Section-by-section content

The HTML template (`buildGenericLegalReviewHtml` in `server.js`) renders these sections in order. Keep this skill's documentation aligned with that function — if either drifts, the other should be updated too.

1. **Cover page** — score gauge (color-coded circle: green ≥80, amber 60–79, red <60), letter grade (A+/A/B/C/D/F), signing recommendation badge (SIGN / NEGOTIATE / ESCALATE / REJECT), document metadata (parties, effective date, governing law, total value in ₹).
2. **Executive Summary** — 3–4 sentence plain-English overview from the orchestrator's `summary` field.
3. **Contract Details** — table: Type, Parties, Effective Date, Term, Total Value (₹), Governing Law, Stamp Duty Status, Registration Status.
4. **Risk Dashboard** — counts of 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW clauses, plus the total estimated financial exposure (₹ or "Uncapped").
5. **Key Clauses** — table from `results.clauses.clauses[]`: section, heading, plain-English summary, severity badge.
6. **Risk Assessment** — sorted HIGH → MEDIUM → LOW from `results.risks.risks[]`. For each: clause reference, composite score (1–10), financial exposure band (`<₹1L` … `>₹1Cr` / Uncapped), poison-pill flag, plain-English explanation, recommended replacement language.
7. **Obligations & Timeline** — split into two sub-sections sourced from `results.terms.obligations[]` and `results.terms.timeline[]`. Highlight any auto-renewal traps from `results.terms.autoRenewalTraps[]`.
8. **Missing Protections** — from `results.clauses.missingProtections[]`. Group by `criticality` (CRITICAL first). India-specific gaps that should appear if absent: force majeure, limitation of liability, dispute resolution naming an Indian seat, DPDP Act data-protection clause when personal data is involved, stamp-duty / registration confirmation.
9. **Compliance Flags** — from `results.compliance.issues[]`. Each row shows statute (ICA 1872, BNS, DPDP Act, Indian Stamp Act, A&C Act 1996, etc.), section, enforceability (VOID / VOIDABLE / ENFORCEABLE_WITH_RISK / ENFORCEABLE), and the one-sentence cure.
10. **Recommendations** — from `results.recommendations.recommendations[]`. Sorted P0 → P4. For each P0/P1, include the negotiation script (opening / justification / fallback / trade-off / walk-away).
11. **Walk-Away List** — from `results.recommendations.walkAways[]`. Conditions that, if not met, mean the user should not sign.
12. **Footer on every page** — page number + the legal disclaimer (single line).

## Visual style (already implemented in `buildGenericLegalReviewHtml`)

- **Page size:** A4 (Indian standard), 18mm margins.
- **Primary palette:** navy `#0f1d3d` and gold `#b8860b` — matches the existing dashboard.html.
- **Severity colors:** 🔴 `#c0392b` (HIGH), 🟡 `#d68910` (MEDIUM), 🟢 `#1e8449` (LOW).
- **Score gauge:** semicircle SVG; color follows the band (green/amber/red).
- **Body font:** Inter / system-ui sans-serif. Headings in `Georgia` for the document feel.
- **Currency:** always ₹ (Devanagari rupee). Never `$`, `Rs.`, `INR`, or `USD`.
- **Statute citations:** italicised, e.g. *ICA 1872, S.27*.

## Error handling

| Failure | Response |
|---|---|
| Session ID not found in cache | HTTP 404 with body `{"error":"Report not found. Please run analysis again."}` |
| Cache hit but `results` is empty | HTTP 422 with body `{"error":"Analysis was incomplete. Re-run /api/analyze."}` |
| Puppeteer crash mid-render | HTTP 500 + log to console; the user retries — cache is still populated, so retry costs nothing. |

## When invoked from Claude Code (offline mode)

If the user types `/legal report-pdf` inside Claude Code and the project's web server is **not** running:

1. Look for the most recent `CONTRACT-REVIEW-*.md` in the working directory.
2. If found, render it to PDF inline using a minimal `pdfkit` script — the same `buildGenericLegalReviewHtml` template is reusable from the CLI side because it only needs the JSON view-model.
3. If no markdown report is found, instruct: "Run `/legal review <file>` first, then `/legal report-pdf`."

The web-app path is preferred because it produces the visual gauge and consistent layout. The offline fallback is a graceful degradation, not the primary path.

## Disclaimer (rendered on every page footer)

```
⚠️ AI-generated. Not legal advice. Have an Indian advocate review before signing or filing.
```
