# PDF Overhaul & Indian Law Alignment — Design Spec
**Date:** 2026-05-04
**Project:** VakiDeskWebApp (AI Contract Review)
**Target users:** Indian advocates, primarily criminal law and legal dispute practice

---

## 1. Scope

Two parallel workstreams:

| Workstream | Files affected |
|---|---|
| PDF visual overhaul | `server.js` (PDF download route) |
| Agent prompt alignment | `agents/legal-compliance.md`, `agents/legal-risks.md`, `agents/legal-clauses.md`, `agents/legal-recommendations.md`, `agents/legal-terms.md` |

---

## 2. Design Tokens (updated)

| Token | Old value | New value | Usage |
|---|---|---|---|
| ACCENT | `#2563EB` (blue) | `#B45309` (amber gold) | Section bars, underlines, callout borders, cover band accent line |
| ACCENT_BG | `#EFF6FF` | `#FFFBEB` | NOTE callout backgrounds |
| All other tokens | — | Unchanged | See existing design token table in `skills/legal-report-pdf/legal-report-pdf.md` |

`#B45309` (amber gold) replaces `#2563EB` (blue) **everywhere** in the PDF: the 3pt cover accent line, the 4pt section bar, the 0.5pt horizontal rule under section titles, and NOTE callout borders/labels.

---

## 3. PDF Changes

### 3.1 Cover Page — Score Panel

**Current:** Left zone = large score number (54pt). Centre zone = grade letter (40pt).

**New:**

**Left zone — semicircle gauge:**
- Draw a semicircle arc track: `path("M 62,panelY+100 A 60,60 0 0,1 192,panelY+100")`, stroke `#E5E7EB`, width 14pt
- Draw filled arc over track proportional to score (0–100 maps to 0–180°), stroke color = `sc` (RED/AMBER/GREEN)
- Score number centered inside arc bottom — 22pt bold, color `sc`, at `y = panelY + 88`
- `/ 100` label — GREY, 7pt, centered at `y = panelY + 100`
- `Grade [letter]` label — GREY, 7pt, centered at `y = panelY + 110`
- **No text above `panelY + 80`** — keeps number clear of arc stroke

**Centre zone — pie chart (risk distribution):**
- Three SVG-style arc segments drawn with PDFKit arc/path for HIGH (RED), MEDIUM (AMBER), LOW (GREEN) counts
- Total slices = riskData.length (or 1 if zero to avoid divide-by-zero)
- Legend below pie: three rows of `[colored dot] N High/Med/Low` — 7pt, GREY
- Centered within the centre zone

**Right zone — verdict badge:** Unchanged.

**Constraint:** All text placed at `y < panelY + 120` (well within panel bounds). Arc drawn with `doc.save()` / `doc.restore()` to avoid clipping bleed into adjacent zones.

---

### 3.2 Executive Summary — Two-Column Layout

**Current:** Full-width prose paragraph → risk count boxes → inline high risks list.

**New layout:**

```
[ Left col — 60% width ]          [ Right col — 40% width ]
  Short prose (≤ 3 sentences)        "Critical Issues" label
  Risk count boxes (3 pills)         Top 3 callout cards
  Inline high risks (red left bar)   (HIGH first, then MED)
```

**Left column:**
- Prose: first 200 chars of `summaryText` truncated at word boundary — algorithm: `summaryText.slice(0, 200).replace(/\s+\S*$/, '') + '…'`
- Risk pills: unchanged (3 colored rounded rects)
- Inline risks: top 2 HIGH risks with red left bar (reduced from 3 to fit column)

**Right column:**
- Label: "Critical Issues" — GREY, 7pt bold, uppercase
- Cards: top 3 risks sorted by severity (HIGH first). Each card:
  - Background tint by severity (RED → `#FEF2F2`, AMBER → `#FFFBEB`, GREEN → `#F0FDF4`)
  - Left border 3pt, color by severity
  - Label line: `[SEVERITY] — [category]` — 7pt bold, border color
  - Body: risk description truncated to 60 chars — GREY, 7pt
  - Action: `→ [short action]` from recommendations if available — GREY, 7pt

**Column widths:** Left = `W * 0.58`, Right = `W * 0.38`, gap = `W * 0.04`.

---

### 3.3 Risk Assessment — Count Tiles + Striped Table

**New element added above existing table:**

**Count tiles (3 equal tiles, full width):**
- Tile 1: HIGH count — background `#FEF2F2`, large count number `#DC2626` 24pt bold, label "HIGH RISK" 7pt bold `#DC2626`
- Tile 2: MEDIUM count — background `#FFFBEB`, number `#D97706`, label "MEDIUM" 7pt bold
- Tile 3: LOW count — background `#F0FDF4`, number `#16A34A`, label "LOW RISK" 7pt bold
- Each tile: `(W - 10) / 3` wide, 52pt tall, 4pt rounded corners, 5pt gap between tiles
- No exposure estimate tile

**New `drawRiskTable(rows)` function** (separate from the generic `drawTable`; all other tables — metadata, clauses, obligations — continue to use `drawTable` unchanged):
- Headers: `['Risk', 'Clause', 'Action']` with column widths `[255, 60, W-315]`
- Row background tinted by severity field on each row object:
  - `'HIGH'` → `#FEF2F2`, `'MEDIUM'` → `#FFFBEB`, `'LOW'` → `#F0FDF4`, unknown → ALTROW
- Left severity stripe: 4pt wide colored rect (RED/AMBER/GREEN) drawn flush to left edge of each row before cell text
- Severity badge column removed — severity conveyed by row color + left stripe
- "Action" column: use `r.explanation` truncated to 40 chars. If `r.explanation` is empty, fall back to `r.risk` truncated to 40 chars.
- "Risk" cell text: truncated to 80 chars using `str.length > 80 ? str.slice(0, 77) + '…' : str`

---

### 3.4 Accent Color — Global Replacement

Replace every occurrence of `#2563EB` in the PDF route with `#B45309`:
- Cover page: 4pt accent line at `y = 185`
- `pageAdded` handler: 3pt header accent line
- `secHdr`: 4pt vertical bar + horizontal rule
- `drawCallout` NOTE type: border and label color
- Footer separator: keep GREY (unchanged)

---

## 4. Agent Prompt Changes

### 4.1 `agents/legal-risks.md` — INR Financial Exposure

Replace the financial exposure scoring criteria (Factor C) dollar amounts with INR equivalents:

| Old | New |
|---|---|
| Under $10,000 | Under ₹1 lakh |
| $10,000–$50,000 | ₹1 lakh–₹5 lakh |
| $50,000–$250,000 | ₹5 lakh–₹25 lakh |
| $250,000–$1,000,000 | ₹25 lakh–₹1 crore |
| Over $1,000,000 or uncapped | Over ₹1 crore or uncapped |

Also in the Risk Matrix example and output format sections: replace all `$` amounts with `₹`.

**Non-Compete Overreach section (RC-10):** Remove "most states" and "18+ months is aggressive in most states" (US context). Replace with:

> Under S.27 ICA, **any** post-employment non-compete is void regardless of duration, geography, or reasonableness. There is no blue-pencilling exception under Indian law. Flag all post-termination restrictions as void.

---

### 4.2 `agents/legal-clauses.md` — Data Protection Taxonomy Row

In the Primary Clause Categories table, Data Protection row:

| Field | Old | New |
|---|---|---|
| Description | Personal data handling, GDPR/CCPA compliance, data processing | Personal data handling, DPDP Act 2023 / IT Act SPDI Rules 2011 compliance, data processing |
| Common Section Titles | Data Protection, Privacy, Data Processing Agreement | Data Protection, Privacy, Data Processing Agreement, Data Principal Rights |

---

### 4.3 `agents/legal-recommendations.md` — DPDP Act Template + INR

**Replace Data Protection template** (current GDPR controller/processor language) with DPDP Act 2023 compliant language:

```
"Data Fiduciary shall: (a) process Personal Data only for the specific purpose
for which consent was obtained under DPDP Act 2023 S.7; (b) implement
reasonable security safeguards to prevent Personal Data breach; (c) notify
the Data Protection Board and affected Data Principals of any breach without
undue delay and within [72] hours of becoming aware; (d) erase Personal Data
upon withdrawal of consent or upon the purpose being served, unless retention
is required by law; (e) not transfer Personal Data outside India except to
countries notified by the Central Government; (f) honour Data Principal
rights: access (S.11), correction and erasure (S.12), grievance redressal
(S.13), and nomination (S.14). These obligations survive termination."
```

**Liability Cap template:** Replace `$[amount]` with `₹[amount]`.

**Obligations matrix example row:** "Maintain GDPR compliance" → "Maintain DPDP Act 2023 / IT Act SPDI Rules 2011 compliance"

---

### 4.4 `agents/legal-terms.md` — DPDP Act + INR

**Obligations matrix example row 4:** "Maintain GDPR compliance" → "Maintain DPDP Act 2023 compliance"

**Financial exposure calculation section:** Replace all `$` amounts with `₹` equivalents using same INR scale as 4.1.

---

### 4.5 `agents/legal-compliance.md` — Criminal Law Addition

Add new **Section 13: Criminal Liability Exposure** after the existing Section 12 (Industry-Specific Regulations):

---

**Section 13: Criminal Liability Exposure Under BNS/BNSS/BSA 2023**

*Applies when:* Contract terms or the conduct they authorize may expose a party to criminal liability, or when the contract is a settlement/compromise deed in a criminal matter.

**13.1 Contract Clauses That May Constitute Offences (BNS 2023)**

Flag any clause that may constitute or facilitate:

- **Cheating (BNS S.316):** Clause induces a party to deliver property or consent by deception — e.g., false representation of qualifications, undisclosed encumbrances, fabricated invoices
- **Fraud (BNS S.318):** Clause designed to deceive for wrongful gain — applies to contracts with fraudulent consideration or misrepresented purpose
- **Criminal Breach of Trust (BNS S.316):** Clause entrusting property or funds to a party who is contractually authorized to misappropriate — e.g., open-ended discretionary payment clauses without accounting obligations
- **Forgery (BNS S.336):** Any clause referencing execution of a false document or requiring alteration of a genuine document
- **Extortion (BNS S.308):** Clause that threatens harm to induce consent — voids the agreement for lack of free consent under ICA S.15 and may constitute extortion
- **Agreements to Commit Offence:** Any clause whose performance would require commission of an offence — void under ICA S.23 (unlawful object) and may attract criminal liability

**13.2 Compromise Deeds in Criminal Matters (BNSS S.359)**

When reviewing a settlement or compromise deed connected to a criminal case:

- [ ] Identify the offence — is it **compoundable** under BNSS S.359 Schedule?
  - Compoundable without court permission: hurt (BNS S.115), defamation (S.356), assault (S.131), criminal trespass (S.329), mischief (S.324) and other offences listed in BNSS S.359(1)
  - Compoundable with court permission: more serious offences listed in BNSS S.359(2)
  - **Non-compoundable:** Murder, rape, dacoity, offences against the State — settlement deed cannot extinguish criminal proceedings
- [ ] If compoundable: check whether court permission has been obtained or is required
- [ ] Flag any clause attempting to compound a non-compoundable offence as **VOID and potentially contemptuous**
- [ ] Check for BSA 2023 compliance: compromise deed intended as evidence must satisfy BSA S.57 (relevancy) and S.65 (admissibility of electronic records if executed digitally)

**13.3 Advocates Act 1961 / Bar Council of India Rules**

When reviewing professional service agreements, retainer agreements, or vakalatnama:

- [ ] **Contingency fee / percentage of damages:** BCI Rules Chapter II, Part VI, Rule 20 — advocates may not stipulate a fee contingent on the result of litigation. Any clause making advocate fees a percentage of damages recovered is **void and a professional misconduct risk**
- [ ] **Champertous contracts:** Agreement to share proceeds of litigation — void under Indian law (affirmed in *Re: A Vakil* AIR 1954 and consistently thereafter)
- [ ] **Vakalatnama validity:** Must identify the specific court/authority, be signed by the client, and not be pre-signed in blank — blank pre-signed vakalatnama is void
- [ ] **Fee agreements:** Must be reasonable; no prohibition on fixed or time-based fees; written fee agreements are best practice and enforceable

**Severity Guide for Section 13:**
- **HIGH:** Clause constitutes or facilitates a BNS offence; non-compoundable offence compromise; champertous fee arrangement
- **MEDIUM:** Clause is adjacent to criminal conduct but depends on subsequent facts; compoundable offence without court permission where required
- **LOW:** Best-practice gap in professional agreement; ambiguous clause that could be misused

---

### 4.6 `agents/legal-compliance.md` — No Other Changes

Sections 1–12 are already fully Indian-law aligned. Section 13 is additive only.

---

## 5. Implementation Notes

### PDF drawing (server.js)

- Gauge arc: use PDFKit `doc.path()` with SVG arc commands converted to PDFKit equivalents. Draw track first (LIGHTBG), then filled arc (score color). Place score number **below** the arc center, not inside it, to avoid overlap.
- Pie chart: compute start/end angles for each severity segment proportional to count. Use `doc.arc(cx, cy, r, startAngle, endAngle).fill(color)`. Draw segments sequentially. Gap between segments: subtract 3 degrees from each segment's end angle (i.e., draw to `endAngle - (3 * Math.PI / 180)`), leaving a white sliver that acts as a visual separator. If any count is zero, skip that segment entirely rather than drawing a zero-width arc.
- Two-column layout (Executive Summary): use absolute `x` positioning with PDFKit's `text(str, x, y, opts)`. Left column starts at x=50, right column starts at x=50 + leftWidth + gap.
- Severity-tinted rows: pass severity data alongside row data into `drawTable`; draw colored background rect before text, then 4pt left stripe.
- Cell truncation: apply before calling `drawTable` — `str.length > 80 ? str.slice(0, 77) + '…' : str`.

### Vercel compatibility

No new npm dependencies. All chart drawing uses PDFKit's existing path/arc/rect APIs. The pdfkit version already installed supports all required drawing primitives.

---

## 6. Files Changed Summary

| File | Change type |
|---|---|
| `server.js` | PDF route: gauge, pie chart, two-col summary, count tiles, striped table, #B45309 accent |
| `agents/legal-risks.md` | INR amounts, remove US non-compete language |
| `agents/legal-clauses.md` | DPDP Act / IT Act in Data Protection row |
| `agents/legal-recommendations.md` | DPDP Act template, INR amounts |
| `agents/legal-terms.md` | DPDP Act reference, INR amounts |
| `agents/legal-compliance.md` | Add Section 13: BNS/BNSS criminal liability, compromise deeds, Advocates Act |

---

## 7. Out of Scope

- No new npm dependencies
- No new PDF pages or sections
- No changes to the `/api/analyze` route or AI model selection
- No changes to the frontend (`public/`)
- No changes to `vercel.json`
