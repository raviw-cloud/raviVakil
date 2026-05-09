# server.js Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `server.js` (1,081 lines, 9 concerns in one file) into focused modules so each concern can be read, debugged, and changed independently without touching unrelated code.

**Architecture:** Extract pure utilities into `lib/`, route handlers into `routes/`, and leave `server.js` as a ~30-line entry point that wires express, registers routes, and calls `listen`. No logic changes — pure move-and-require refactoring.

**Tech Stack:** Node.js, Express 4, `@anthropic-ai/sdk`, `pdfkit`, `pdf-parse`, `pdfjs-dist`, `multer`, `express-rate-limit`, `uuid`

---

## File Structure

### Files to create

| File | Responsibility |
|---|---|
| `lib/config.js` | All constants: model IDs, token limits, text limits, agent skill file reads, TEST_MODE flags |
| `lib/client.js` | Single Anthropic SDK client instance |
| `lib/cache.js` | `reportCache` Map singleton (max 50 sessions, LRU eviction) |
| `lib/pdf-extract.js` | `extractText`, `isUsableText`, `extractPdfText` (3-strategy: pdf-parse default, pdf-parse custom renderer, pdfjs-dist) |
| `lib/parse-utils.js` | `parseAgentJson`, `estimateClaudeCost`, `isPdfBuffer`, `esc`, `asArray`, `firstText`, `severityOf`, `riskClass`, `safeReportBaseName` |
| `lib/prompts.js` | `buildEconomyReviewPrompt(documentText)` |
| `lib/normalize.js` | `normalizeReviewResultsShape`, `hasUsableReviewResults`, `normalizeLegalReviewData` |
| `lib/html-report.js` | `renderCards`, `buildGenericLegalReviewHtml` (all inline CSS HTML template) |
| `routes/analyze.js` | `POST /api/analyze` — upload, extract, call Claude, cache result, return sessionId |
| `routes/results.js` | `GET /api/results/:sessionId`, `GET /api/download-report/:sessionId`, `GET /api/download-leave-license/:sessionId`, `POST /api/draft` |

### Files to modify

| File | Change |
|---|---|
| `server.js` | Strip to ~30-line entry point: imports, multer setup, rate limiter, middleware, route registration, `app.listen` |

### Files NOT touched

| File | Reason |
|---|---|
| `lib/score.js` | Already extracted; no changes needed |
| `test/score.test.js` | Tests for `lib/score.js` only; no changes needed |
| All `public/` files | Frontend only; not in scope |
| All `skills/` files | Agent prompts; read by `lib/config.js` as before |

---

## Verification baseline (run before starting)

```powershell
node --check server.js
npm test
```

Expected: no syntax errors, 10/10 tests pass. Record this baseline — same must hold after every task.

---

### Task 1: Create `lib/config.js`

**Files:**
- Create: `lib/config.js`
- Modify: nothing yet (server.js still untouched until Task 9)

- [ ] **Step 1: Identify all constants in server.js (lines 1–50)**

The constants to extract:

```js
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const TEST_MODE = process.env.TEST_MODE === 'true';
const ECONOMY_MAX_OUTPUT_TOKENS = 5200;
const REVIEW_DEPTH = process.env.REVIEW_DEPTH || 'economy';
// full-mode per-agent token limits
const CLAUSE_MAX_OUTPUT_TOKENS   = parseInt(process.env.CLAUSE_MAX_OUTPUT_TOKENS,   10) || 3000;
const RISK_MAX_OUTPUT_TOKENS     = parseInt(process.env.RISK_MAX_OUTPUT_TOKENS,     10) || 2500;
const COMP_MAX_OUTPUT_TOKENS     = parseInt(process.env.COMP_MAX_OUTPUT_TOKENS,     10) || 2000;
const TERMS_MAX_OUTPUT_TOKENS    = parseInt(process.env.TERMS_MAX_OUTPUT_TOKENS,    10) || 2500;
const REC_MAX_OUTPUT_TOKENS      = parseInt(process.env.REC_MAX_OUTPUT_TOKENS,      10) || 3000;
// text limits
const TEST_TEXT_LIMIT             = parseInt(process.env.TEST_TEXT_LIMIT,            10) || 3000;
const ECONOMY_TEXT_LIMIT          = parseInt(process.env.ECONOMY_TEXT_LIMIT,         10) || 12000;
const FULL_TEXT_LIMIT             = parseInt(process.env.FULL_TEXT_LIMIT,            10) || 20000;
const TEST_MAX_OUTPUT_TOKENS      = parseInt(process.env.TEST_MAX_OUTPUT_TOKENS,     10) || 1200;
const TEST_COST_CEILING           = parseFloat(process.env.TEST_COST_CEILING)             || 0.05;
```

Also the agent skill file reads:
```js
const path = require('path');
const fs   = require('fs');
const SKILLS_DIR = path.join(__dirname, 'skills');
function readSkill(name) {
  const p = path.join(SKILLS_DIR, name, `${name}.md`);
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
const AGENT_SKILLS = {
  clauses:         readSkill('legal-risks'),
  risks:           readSkill('legal-risks'),
  compliance:      readSkill('legal-missing'),
  terms:           readSkill('legal-report-pdf'),
  recommendations: readSkill('legal-negotiate'),
};
```

- [ ] **Step 2: Write `lib/config.js`**

```js
'use strict';
const path = require('path');
const fs   = require('fs');

const HAIKU_MODEL               = 'claude-haiku-4-5-20251001';
const TEST_MODE                 = process.env.TEST_MODE === 'true';
const ECONOMY_MAX_OUTPUT_TOKENS = 5200;
const REVIEW_DEPTH              = process.env.REVIEW_DEPTH || 'economy';

const CLAUSE_MAX_OUTPUT_TOKENS  = parseInt(process.env.CLAUSE_MAX_OUTPUT_TOKENS,  10) || 3000;
const RISK_MAX_OUTPUT_TOKENS    = parseInt(process.env.RISK_MAX_OUTPUT_TOKENS,    10) || 2500;
const COMP_MAX_OUTPUT_TOKENS    = parseInt(process.env.COMP_MAX_OUTPUT_TOKENS,    10) || 2000;
const TERMS_MAX_OUTPUT_TOKENS   = parseInt(process.env.TERMS_MAX_OUTPUT_TOKENS,   10) || 2500;
const REC_MAX_OUTPUT_TOKENS     = parseInt(process.env.REC_MAX_OUTPUT_TOKENS,     10) || 3000;

const TEST_TEXT_LIMIT           = parseInt(process.env.TEST_TEXT_LIMIT,           10) || 3000;
const ECONOMY_TEXT_LIMIT        = parseInt(process.env.ECONOMY_TEXT_LIMIT,        10) || 12000;
const FULL_TEXT_LIMIT           = parseInt(process.env.FULL_TEXT_LIMIT,           10) || 20000;
const TEST_MAX_OUTPUT_TOKENS    = parseInt(process.env.TEST_MAX_OUTPUT_TOKENS,    10) || 1200;
const TEST_COST_CEILING         = parseFloat(process.env.TEST_COST_CEILING)            || 0.05;

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
function readSkill(name) {
  const p = path.join(SKILLS_DIR, name, `${name}.md`);
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
const AGENT_SKILLS = {
  clauses:         readSkill('legal-risks'),
  risks:           readSkill('legal-risks'),
  compliance:      readSkill('legal-missing'),
  terms:           readSkill('legal-report-pdf'),
  recommendations: readSkill('legal-negotiate'),
};

module.exports = {
  HAIKU_MODEL,
  TEST_MODE, TEST_COST_CEILING,
  ECONOMY_MAX_OUTPUT_TOKENS, ECONOMY_TEXT_LIMIT,
  REVIEW_DEPTH,
  CLAUSE_MAX_OUTPUT_TOKENS, RISK_MAX_OUTPUT_TOKENS, COMP_MAX_OUTPUT_TOKENS,
  TERMS_MAX_OUTPUT_TOKENS, REC_MAX_OUTPUT_TOKENS,
  TEST_TEXT_LIMIT, FULL_TEXT_LIMIT, TEST_MAX_OUTPUT_TOKENS,
  AGENT_SKILLS,
};
```

- [ ] **Step 3: Syntax check**

```powershell
node --check lib/config.js
```

Expected: no output (clean).

- [ ] **Step 4: Verify skill reads work**

```powershell
node -e "const c = require('./lib/config'); console.log('skills keys:', Object.keys(c.AGENT_SKILLS)); console.log('TEST_MODE:', c.TEST_MODE);"
```

Expected: `skills keys: [ 'clauses', 'risks', 'compliance', 'terms', 'recommendations' ]` and `TEST_MODE: false` (or true if env set).

- [ ] **Step 5: Commit**

```powershell
git add lib/config.js
git commit -m "refactor: extract constants and skill file reads into lib/config.js"
```

---

### Task 2: Create `lib/client.js` and `lib/cache.js`

**Files:**
- Create: `lib/client.js`
- Create: `lib/cache.js`

- [ ] **Step 1: Write `lib/client.js`**

```js
'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = { client };
```

- [ ] **Step 2: Write `lib/cache.js`**

```js
'use strict';

const reportCache = new Map();
const CACHE_MAX = 50;

function cacheSet(sessionId, data) {
  reportCache.set(sessionId, data);
  if (reportCache.size > CACHE_MAX) {
    reportCache.delete(reportCache.keys().next().value);
  }
}

function cacheGet(sessionId) {
  return reportCache.get(sessionId);
}

module.exports = { cacheGet, cacheSet };
```

- [ ] **Step 3: Syntax check both**

```powershell
node --check lib/client.js
node --check lib/cache.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add lib/client.js lib/cache.js
git commit -m "refactor: add Anthropic client singleton and cache module"
```

---

### Task 3: Create `lib/pdf-extract.js`

**Files:**
- Create: `lib/pdf-extract.js`
- Source: server.js lines 62–153

- [ ] **Step 1: Write `lib/pdf-extract.js`**

Copy the three functions verbatim from server.js lines 62–153, then export them:

```js
'use strict';
const pdfParse = require('pdf-parse');
const { TEST_MODE, TEST_TEXT_LIMIT, FULL_TEXT_LIMIT } = require('./config');

function isUsableText(t) {
  if (!t || t.length < 80) return false;
  const alpha = (t.match(/[a-zA-Z]/g) || []).length;
  return alpha / t.length > 0.2;
}

function extractText(raw, limit) {
  if (!raw || !raw.trim()) return '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const cap = TEST_MODE ? Math.min(limit, TEST_TEXT_LIMIT) : limit;
  return cleaned.slice(0, cap);
}

async function extractPdfText(buffer) {
  // Strategy 1: pdf-parse default
  try {
    const data = await pdfParse(buffer);
    if (isUsableText(data.text)) return data.text;
  } catch (e) {
    console.warn('[pdf] S1 failed:', e.message);
  }

  // Strategy 2: pdf-parse with custom page renderer
  try {
    const data = await pdfParse(buffer, {
      pagerender: function (pageData) {
        return pageData.getTextContent().then(function (textContent) {
          return textContent.items.map((item) => item.str).join(' ');
        });
      }
    });
    if (isUsableText(data.text)) return data.text;
  } catch (e) {
    console.warn('[pdf] S2 failed:', e.message);
  }

  // Strategy 3: pdfjs-dist
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdfDoc = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    if (isUsableText(text)) return text;
  } catch (e) {
    console.warn('[pdf] S3 failed:', e.message);
  }

  return '';
}

module.exports = { isUsableText, extractText, extractPdfText };
```

- [ ] **Step 2: Syntax check**

```powershell
node --check lib/pdf-extract.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add lib/pdf-extract.js
git commit -m "refactor: extract PDF text extraction into lib/pdf-extract.js"
```

---

### Task 4: Create `lib/parse-utils.js`

**Files:**
- Create: `lib/parse-utils.js`
- Source: server.js lines 155–224 (parseAgentJson, estimateClaudeCost) and lines 426–473 (helper utilities)

- [ ] **Step 1: Write `lib/parse-utils.js`**

```js
'use strict';

function parseAgentJson(text) {
  if (!text) return {};
  // Strip markdown code fence if present
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();

  // Try direct parse
  try { return JSON.parse(t); } catch (_) {}

  // Brace-matching fallback: find the outermost { ... }
  let depth = 0, start = -1, end = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (t[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch (_) {}
  }

  return {};
}

function estimateClaudeCost(responses) {
  let input = 0, output = 0, cacheWrite = 0, cacheRead = 0;
  for (const r of responses) {
    if (!r || !r.usage) continue;
    input      += r.usage.input_tokens      || 0;
    output     += r.usage.output_tokens     || 0;
    cacheWrite += r.usage.cache_creation_input_tokens || 0;
    cacheRead  += r.usage.cache_read_input_tokens     || 0;
  }
  // Haiku pricing (per million tokens, as of 2024)
  const dollars = (
    (input      * 0.80 / 1_000_000) +
    (output     * 4.00 / 1_000_000) +
    (cacheWrite * 1.00 / 1_000_000) +
    (cacheRead  * 0.08 / 1_000_000)
  ).toFixed(4);
  return { input, output, cacheWrite, cacheRead, dollars };
}

function isPdfBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.slice(0, 4).toString() === '%PDF';
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function firstText(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(firstText).join(' ');
  if (v && typeof v === 'object') return Object.values(v).map(firstText).join(' ');
  return String(v || '');
}

function severityOf(s) {
  const n = String(s || '').toUpperCase();
  if (n === 'CRITICAL' || n === 'HIGH') return 'HIGH';
  if (n === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function riskClass(sev) {
  if (sev === 'HIGH') return 'risk-high';
  if (sev === 'MEDIUM') return 'risk-medium';
  return 'risk-low';
}

function safeReportBaseName(filename) {
  return String(filename || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 60);
}

module.exports = {
  parseAgentJson,
  estimateClaudeCost,
  isPdfBuffer,
  esc,
  asArray,
  firstText,
  severityOf,
  riskClass,
  safeReportBaseName,
};
```

- [ ] **Step 2: Syntax check**

```powershell
node --check lib/parse-utils.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add lib/parse-utils.js
git commit -m "refactor: extract JSON parsing and utility helpers into lib/parse-utils.js"
```

---

### Task 5: Create `lib/prompts.js`

**Files:**
- Create: `lib/prompts.js`
- Source: server.js lines 226–360 (`buildEconomyReviewPrompt`)

- [ ] **Step 1: Write `lib/prompts.js`**

Copy the entire `buildEconomyReviewPrompt` function from server.js verbatim and export it:

```js
'use strict';

function buildEconomyReviewPrompt(documentText) {
  return `You are an expert Indian legal document reviewer...
  /* PASTE THE ENTIRE FUNCTION BODY FROM server.js lines 226-360 HERE */
  `;
}

module.exports = { buildEconomyReviewPrompt };
```

**Important:** Copy the exact function body from `server.js` lines 227–360 — do NOT paraphrase or shorten. The prompt is a carefully structured JSON schema instruction that must be preserved byte-for-byte.

- [ ] **Step 2: Syntax check**

```powershell
node --check lib/prompts.js
```

Expected: no output.

- [ ] **Step 3: Spot-check prompt content is intact**

```powershell
node -e "const {buildEconomyReviewPrompt} = require('./lib/prompts'); const p = buildEconomyReviewPrompt('TEST'); console.log('length:', p.length, '| has clauses:', p.includes('clauses'), '| has recommendations:', p.includes('recommendations'));"
```

Expected: `length: <number above 2000> | has clauses: true | has recommendations: true`

- [ ] **Step 4: Commit**

```powershell
git add lib/prompts.js
git commit -m "refactor: extract economy review prompt builder into lib/prompts.js"
```

---

### Task 6: Create `lib/normalize.js`

**Files:**
- Create: `lib/normalize.js`
- Source: server.js lines 362–424 (`normalizeReviewResultsShape`, `hasUsableReviewResults`) and lines 475–518 (`normalizeLegalReviewData`)

- [ ] **Step 1: Write `lib/normalize.js`**

```js
'use strict';
const { asArray, firstText, severityOf } = require('./parse-utils');
const { calculateScore, scoreToGrade, scoreToRec } = require('./score');

function normalizeReviewResultsShape(raw) {
  /* Copy verbatim from server.js lines 362-410 */
}

function hasUsableReviewResults(results) {
  /* Copy verbatim from server.js lines 412-424 */
}

function normalizeLegalReviewData(cached) {
  /* Copy verbatim from server.js lines 475-518 */
}

module.exports = { normalizeReviewResultsShape, hasUsableReviewResults, normalizeLegalReviewData };
```

**Important:** Copy each function body verbatim from server.js — do NOT simplify.

- [ ] **Step 2: Syntax check**

```powershell
node --check lib/normalize.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add lib/normalize.js
git commit -m "refactor: extract normalization functions into lib/normalize.js"
```

---

### Task 7: Create `lib/html-report.js`

**Files:**
- Create: `lib/html-report.js`
- Source: server.js lines 520–739 (`renderCards`, `buildGenericLegalReviewHtml` with all inline CSS)

- [ ] **Step 1: Write `lib/html-report.js`**

```js
'use strict';
const { esc, asArray, firstText, severityOf, riskClass } = require('./parse-utils');

function renderCards(items, type) {
  /* Copy verbatim from server.js */
}

function buildGenericLegalReviewHtml(vm) {
  /* Copy verbatim from server.js lines 540-739 */
}

module.exports = { renderCards, buildGenericLegalReviewHtml };
```

**Important:** The HTML template contains ~200 lines of inline CSS and HTML. Copy it exactly. Do not restructure the template string.

- [ ] **Step 2: Syntax check**

```powershell
node --check lib/html-report.js
```

Expected: no output.

- [ ] **Step 3: Spot-check HTML output**

```powershell
node -e "const {buildGenericLegalReviewHtml} = require('./lib/html-report'); const html = buildGenericLegalReviewHtml({documentTitle:'Test',documentType:'NDA',partiesText:'A vs B',effectiveDate:'2026-01-01',term:'1 year',governingLaw:'Maharashtra',jurisdiction:'Pune',summary:'Test',score:75,grade:'B',recommendation:'Review carefully',risks:[],obligations:[],compliance:[],missingProtections:[],recommendations:[],filename:'test.pdf'}); console.log('HTML length:', html.length, '| has DOCTYPE:', html.includes('<!DOCTYPE'));"
```

Expected: `HTML length: <number above 5000> | has DOCTYPE: true`

- [ ] **Step 4: Commit**

```powershell
git add lib/html-report.js
git commit -m "refactor: extract HTML report builder into lib/html-report.js"
```

---

### Task 8: Create `routes/analyze.js`

**Files:**
- Create: `routes/analyze.js`
- Source: server.js lines 740–916 (POST /api/analyze handler)

- [ ] **Step 1: Create routes directory if needed**

```powershell
if (!(Test-Path routes)) { New-Item -ItemType Directory routes }
```

- [ ] **Step 2: Write `routes/analyze.js`**

```js
'use strict';
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { client }                      = require('../lib/client');
const { cacheGet, cacheSet }          = require('../lib/cache');
const { HAIKU_MODEL, TEST_MODE, TEST_COST_CEILING, REVIEW_DEPTH,
        ECONOMY_MAX_OUTPUT_TOKENS, ECONOMY_TEXT_LIMIT,
        CLAUSE_MAX_OUTPUT_TOKENS, RISK_MAX_OUTPUT_TOKENS, COMP_MAX_OUTPUT_TOKENS,
        TERMS_MAX_OUTPUT_TOKENS, REC_MAX_OUTPUT_TOKENS, FULL_TEXT_LIMIT,
        TEST_TEXT_LIMIT, TEST_MAX_OUTPUT_TOKENS, AGENT_SKILLS } = require('../lib/config');
const { extractText, extractPdfText } = require('../lib/pdf-extract');
const { parseAgentJson, estimateClaudeCost } = require('../lib/parse-utils');
const { buildEconomyReviewPrompt }    = require('../lib/prompts');
const { normalizeReviewResultsShape, hasUsableReviewResults } = require('../lib/normalize');
const { calculateScore, scoreToGrade, scoreToRec } = require('../lib/score');

/* Copy the entire POST /api/analyze handler body from server.js lines 741-916 verbatim,
   replacing:
   - app.post('/api/analyze', ...) → router.post('/', ...)
   - reportCache.set(sessionId, data) + eviction → cacheSet(sessionId, data)
   All other logic stays identical. */

module.exports = router;
```

**Important:** Copy the handler body exactly. The only two changes are:
1. `app.post('/api/analyze', ...)` → `router.post('/', ...)`
2. The `reportCache.set` + size-check eviction block → `cacheSet(sessionId, data)`

- [ ] **Step 3: Syntax check**

```powershell
node --check routes/analyze.js
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add routes/analyze.js
git commit -m "refactor: extract POST /api/analyze handler into routes/analyze.js"
```

---

### Task 9: Create `routes/results.js`

**Files:**
- Create: `routes/results.js`
- Source: server.js lines 918–1074 (GET /api/results, sendReviewPdf, POST /api/draft)

- [ ] **Step 1: Write `routes/results.js`**

```js
'use strict';
const express      = require('express');
const PDFDocument  = require('pdfkit');
const router       = express.Router();

const { client }                          = require('../lib/client');
const { cacheGet }                        = require('../lib/cache');
const { HAIKU_MODEL }                     = require('../lib/config');
const { normalizeLegalReviewData }        = require('../lib/normalize');
const { buildGenericLegalReviewHtml }     = require('../lib/html-report');
const { safeReportBaseName }             = require('../lib/parse-utils');

/* GET /api/results/:sessionId
   Copy verbatim from server.js lines 918-934.
   - app.get('/api/results/:sessionId', ...) → router.get('/results/:sessionId', ...)
   - reportCache.get(...) → cacheGet(...)
*/

/* sendReviewPdf helper
   Copy verbatim from server.js lines 936-1024.
   - reportCache.get(...) → cacheGet(...)
*/

/* GET /api/download-report/:sessionId and /api/download-leave-license/:sessionId
   app.get('/api/download-report/:sessionId', sendReviewPdf);
   → router.get('/download-report/:sessionId', sendReviewPdf);
   → router.get('/download-leave-license/:sessionId', sendReviewPdf);
*/

/* POST /api/draft
   Copy verbatim from server.js lines 1029-1074.
   - app.post('/api/draft', express.json(), ...) → router.post('/draft', express.json(), ...)
   - reportCache.get(...) → cacheGet(...)
*/

module.exports = router;
```

**Important:** Copy all handler bodies exactly. Only change:
1. `app.get/app.post` → `router.get/router.post`
2. Route paths: keep `/results/:sessionId`, `/download-report/:sessionId`, etc. as-is in the router (they will be mounted at `/api` in server.js)
3. `reportCache.get(...)` → `cacheGet(...)`

- [ ] **Step 2: Syntax check**

```powershell
node --check routes/results.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add routes/results.js
git commit -m "refactor: extract results/download/draft routes into routes/results.js"
```

---

### Task 10: Slim down `server.js`

**Files:**
- Modify: `server.js` (replace entire content)

This is the most consequential step — the old server.js is replaced with a ~35-line entry point. All logic now lives in the extracted modules.

- [ ] **Step 1: Write the new `server.js`**

```js
'use strict';
require('dotenv').config();

const express      = require('express');
const multer       = require('multer');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const analyzeRouter = require('./routes/analyze');
const resultsRouter = require('./routes/results');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const analyzeLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait a moment.' }
});

app.use(express.static(path.join(__dirname, 'public')));

/* Inject upload middleware into the analyze router mount */
app.post('/api/analyze', analyzeLimit, upload.single('document'), (req, res, next) => {
  analyzeRouter.handle(req, res, next);
});

app.use('/api', resultsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Legal Document Analyzer running on http://localhost:' + PORT);
});
```

> **Note on multer + router:** Because `multer` middleware must run before the analyze handler but multer is not needed for results routes, the cleanest approach is to keep `upload.single('document')` in server.js and wire it inline for the `/api/analyze` POST only (as shown above), rather than putting multer inside the router.

- [ ] **Step 2: Syntax check**

```powershell
node --check server.js
```

Expected: no output.

- [ ] **Step 3: Run tests**

```powershell
npm test
```

Expected: 10/10 pass (score tests are independent of routing).

- [ ] **Step 4: Start the server and verify it boots**

```powershell
node server.js
```

Expected: `Legal Document Analyzer running on http://localhost:3000`

Press Ctrl+C after confirming boot.

- [ ] **Step 5: Smoke test the API endpoints**

Open a second terminal:

```powershell
# Health check — static file served
curl http://localhost:3000/index.html -o nul -w "%{http_code}"
# Expected: 200

# Results route — session not found (expected 404)
curl http://localhost:3000/api/results/nonexistent -w "%{http_code}"
# Expected: {"error":"Session not found..."} 404
```

- [ ] **Step 6: Commit**

```powershell
git add server.js
git commit -m "refactor: slim server.js to entry point — all logic now in lib/ and routes/"
```

---

## Final verification

After Task 10 completes:

```powershell
# 1. No syntax errors in any new file
node --check lib/config.js lib/client.js lib/cache.js lib/pdf-extract.js lib/parse-utils.js lib/prompts.js lib/normalize.js lib/html-report.js routes/analyze.js routes/results.js server.js

# 2. All 10 score tests pass
npm test

# 3. Server starts
node server.js
```

Then upload a real PDF via the web UI at `http://localhost:3000` and confirm:
- `/api/analyze` returns a `sessionId`
- `/api/results/:sessionId` returns full results JSON
- `results.html?sessionId=<id>` renders correctly
- PDF download works

---

## Line-count comparison (expected after refactor)

| File | Before | After |
|---|---|---|
| `server.js` | 1,081 | ~35 |
| `lib/config.js` | — | ~55 |
| `lib/client.js` | — | ~5 |
| `lib/cache.js` | — | ~15 |
| `lib/pdf-extract.js` | — | ~65 |
| `lib/parse-utils.js` | — | ~80 |
| `lib/prompts.js` | — | ~140 |
| `lib/normalize.js` | — | ~100 |
| `lib/html-report.js` | — | ~230 |
| `routes/analyze.js` | — | ~180 |
| `routes/results.js` | — | ~110 |
| **Total** | **1,081** | **~1,015** |

Total line count stays similar — this is a pure decomposition, not a reduction. The gain is that each file now has one clear responsibility, so debugging a prompt change only requires opening `lib/prompts.js`, and a route bug only requires opening `routes/analyze.js`.
