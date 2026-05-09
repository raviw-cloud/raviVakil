# VakiDesk Web App — Project Summary

## What It Is

An AI-powered Indian legal document review tool for advocates and their clients. Users upload a PDF contract/agreement; the server extracts text, sends it to Claude (Haiku model), and returns a structured risk analysis with a Safety Score, grade, and actionable recommendations — all through Indian law.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Server | Express.js |
| AI | Anthropic Claude (claude-haiku-4-5) via `@anthropic-ai/sdk` |
| PDF ingestion | `pdf-parse` (S1), custom item renderer (S2), `pdfjs-dist` (S3) |
| PDF output | Puppeteer (primary) → PDFKit (fallback) |
| Rate limiting | `express-rate-limit` |
| File upload | `multer` (memory storage, 10 MB cap) |
| Session tracking | In-memory `Map` (max 50 entries, FIFO eviction) |

---

## Project Structure

```
VakiDeskWebAppV1/
├── server.js                  # Main Express server (all routes + business logic)
├── lib/
│   ├── config.js              # Constants, env vars, agent skill file reads
│   ├── score.js               # Safety score calculation, grade, recommendation
│   ├── prompts.js             # Prompt builder helpers
│   ├── parse-utils.js         # JSON parsing, text helpers
│   ├── pdf-extract.js         # Three-strategy PDF text extraction
│   ├── client.js              # Anthropic SDK singleton
│   └── cache.js               # reportCache module
├── agents/                    # System prompt markdown files (loaded at startup)
│   ├── legal-clauses.md
│   ├── legal-risks.md
│   ├── legal-compliance.md
│   ├── legal-terms.md
│   └── legal-recommendations.md
├── public/                    # Static frontend (served by Express)
│   ├── index.html             # Landing / upload page
│   ├── login.html
│   ├── dashboard.html
│   └── results.html
├── skills/                    # Claude Code skill definitions
├── templates/                 # PDF/HTML report templates
└── test/
    └── score.test.js
```

---

## Request Flow

### 1. Upload & Text Extraction

```
User uploads PDF
  → POST /api/analyze
  → multer buffers file in memory
  → isPdfBuffer() validates magic bytes (%PDF)
  → extractPdfText() tries three strategies in order:
      S1: pdf-parse default
      S2: pdf-parse with custom item renderer (preserves line breaks)
      S3: pdfjs-dist legacy build (scanned-PDF fallback)
  → isUsableText() rejects near-empty or garbled extraction
```

### 2. AI Review

Two modes, controlled by `REVIEW_DEPTH` env var:

**Economy mode** (default)
```
Single Claude Haiku call with buildEconomyReviewPrompt()
→ Returns one large JSON blob covering all 5 sections
→ Cheaper; suitable for most documents
```

**Full mode** (`REVIEW_DEPTH=full`)
```
Five concurrent Claude Haiku calls, each with a cached system prompt:
  clauses agent    → clause inventory + document metadata + missing protections
  risks agent      → risk list with severity scoring
  compliance agent → Indian statute compliance flags
  terms agent      → obligations, deadlines, timeline
  recommendations  → prioritised redline actions
```

### 3. Score Calculation (`lib/score.js`)

```
Start at 100
  - Risk penalties:  composite * 1.5 per risk  (+ 5 if poisonPill=true)
  - Compliance cap:  up to 25 points deducted
  - Missing clauses: up to 15 points deducted
  → clamp to [0, 100]
  → map to grade (A+ / A / B / C / D / F)
  → map to recommendation (SIGN / NEGOTIATE / ESCALATE / REJECT)
```

### 4. Session Storage & Results API

```
Analysis result stored in reportCache Map (keyed by UUID sessionId)
  → GET /api/results/:sessionId   returns full structured JSON
  → GET /api/download-report/:sessionId   generates PDF report:
       1. buildGenericLegalReviewHtml() → styled HTML
       2. Puppeteer renders HTML → PDF buffer → streamed to client
       3. On Puppeteer failure → PDFKit plain-text fallback
```

### 5. AI Clause Drafting

```
POST /api/draft
  { prompt: "...", sessionId: "..." }
  → Optional: pulls document context (type, parties, law) from cache
  → Claude Haiku with Indian legal drafting system prompt
  → Returns: { clause: "..." }
```

---

## AI Response Shape (Economy Mode)

The model returns one JSON object with five top-level keys. `normalizeReviewResultsShape()` coerces any shape variation into a consistent structure before scoring.

```json
{
  "clauses": { "clauses": [...], "metadata": {...}, "missingProtections": [...], "summary": "..." },
  "risks":   { "risks": [...], "overallRiskRating": "...", "signingRecommendation": "..." },
  "compliance": { "issues": [...] },
  "terms":   { "termOverview": {...}, "obligations": [...], "timeline": [...] },
  "recommendations": { "recommendations": [...] }
}
```

---

## Key Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required |
| `REVIEW_DEPTH` | `economy` | `economy` or `full` |
| `ECONOMY_TEXT_LIMIT` | 6000 | Max chars sent to model |
| `FULL_TEXT_LIMIT` | 12000 | Max chars in full mode |
| `ECONOMY_MAX_OUTPUT_TOKENS` | 20000 | Output token cap |
| `TEST_MODE` | `false` | Forces economy + tight limits |
| `TEST_COST_CEILING` | 0.05 | Warn if per-report cost exceeds this |
| `PORT` | 3000 | HTTP listen port |

---

## Indian Law Scope

- Defaults to Indian jurisdiction when not specified
- Applies: Indian Contract Act 1872, Stamp Act, Registration Act, RERA, IT Act/DPDP, Arbitration Act, state-specific rules
- Uses BNS/BNSS/BSA 2023 (not IPC/CrPC) for criminal references
- Financial exposure buckets are in INR (₹)

---

## Rate Limiting

`/api/analyze` is limited to **10 requests per 15 minutes** per IP.
