# Skills Reference

## Primary Skill: Contract Analysis Pipeline

**Trigger:** User uploads a PDF and clicks "Analyze Contract"

### Pipeline Steps

```
1. PDF Upload (multer, memory storage, 10MB limit)
        ↓
2. PDF → Raw Text  [pdf-parse, no LLM]
        ↓
3. Raw Text → Structured Markdown  [rule-based parser, no LLM]
   - Detects ALL-CAPS headings → ## headings
   - Detects numbered clauses → ### headings
   - Strips page numbers and repeated boilerplate
        ↓
4. Markdown → Document Slices
   - fullMd       → Clause Analyst, Compliance Checker, Summary
   - clausesSlice → Risk Assessor, Recommendations Engine
   - obligSlice   → Terms Mapper (lines with "shall/must/within X days")
        ↓
5. 5 Parallel Claude Haiku Agent Calls  [Promise.all]
   Each call:
   - system: full contents of the agent's .md skill file (loaded at startup)
   - user:   relevant slice + "Return valid JSON"
   - max_tokens: 800
        ↓
6. JSON Parsing + Score Aggregation
   - Weighted Contract Safety Score (0–100)
   - Letter grade and signing recommendation
        ↓
7. Markdown Report Assembly
   - Stored in memory cache (sessionId → reportMd)
   - NOT regenerated on repeat requests
        ↓
8. Response to frontend: { sessionId, score, grade, recommendation, summary, cost }
```

---

## Secondary Skill: PDF Report Generation

**Trigger:** User clicks "Download Full Report (PDF)"

- Served from in-memory cache — **zero new LLM calls**
- Rendered with `pdfkit` following the structure in `legal-report-pdf.md`
- Returned as `application/pdf` with filename `CONTRACT-REVIEW-[name]-[date].pdf`

### PDF Sections
1. Cover page — score gauge (color-coded circle), letter grade, recommendation badge, document metadata
2. Executive Summary — plain-English overview
2.1 Extract Contract Metadata
3. Key Clauses — table of all identified clauses
4. Risk Assessment — table sorted HIGH → MEDIUM → LOW, color-coded severity
5. Obligations & Deadlines — party duties, deadlines, consequences of breach
6. MISSING PROTECTIONS - List of clauses that SHOULD be in this contract but are NOT
7. Compliance Flags — Indian law violations and regulatory issues
8. Recommendations — prioritized P0–P4 action items
9. Footer on all pages — legal disclaimer

---

## Neutral Review Standard

- No party-bias selector
- All risks flagged neutrally ("This clause creates a strict liability obligation")
- No advocacy framing ("This is bad for the supplier")
- Governed by Indian law by default

---

## Caching Strategy

```js
reportCache = Map<sessionId, { md, score, grade, recommendation, filename }>
```

- Cache holds last 50 reports (oldest evicted automatically)
- Download endpoint reads from cache — no re-analysis
- Cache is in-memory (resets on server restart); for production, replace with Redis or file storage

---

## Cost Controls

| Control | Value |
|---------|-------|
| Model | `claude-haiku-4-5-20251001` (all agents) |
| Max output tokens per agent | 1200 |
| Input slicing | Each agent gets only its required slice |
| No redundant calls | Cache check before any LLM call |
| Cost logged | Per-review cost printed to server console |
| Hard budget | $0.10/review |
| Typical cost | ~$0.006–$0.025/review |

---

## Skill Files Used (read-only, never modified)

| File | Used As |
|------|---------|
| `legal-review.md` | Orchestration blueprint (score formula, report structure) |
| `legal-clauses.md` | System prompt for Clause Analyst agent |
| `legal-risks.md` | System prompt for Risk Assessor agent |
| `legal-compliance.md` | System prompt for Compliance Checker agent |
| `legal-terms.md` | System prompt for Terms Mapper agent |
| `legal-recommendations.md` | System prompt for Recommendations Engine agent |
| `legal-report-pdf.md` | PDF structure blueprint (sections, styling reference) |

---

## Limitations

- Scanned/image-based PDFs are not supported (no OCR)
- In-memory cache resets on server restart
- Analysis quality depends on text quality extracted from PDF
- Not a substitute for qualified legal counsel
