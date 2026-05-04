# PDF Overhaul & Indian Law Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the PDF report design (gauge, pie chart, two-column summary, severity-tinted risk table, amber-gold accent) and align all five agent prompts to Indian law (INR amounts, DPDP Act 2023, BNS/BNSS/BSA 2023 criminal liability section).

**Architecture:** All PDF changes are confined to the `app.get('/api/download/:sessionId')` route in `server.js`. Agent changes are isolated edits to five `.md` files in `agents/`. No new dependencies, no new routes, no frontend changes.

**Tech Stack:** Node.js, Express, PDFKit (PDF generation), Anthropic Claude Haiku (analysis), Vercel (deployment)

---

## File Map

| File | Change |
|---|---|
| `server.js` | PDF route: accent colour, cover gauge+pie, exec summary two-col, drawRiskTable, count tiles |
| `agents/legal-risks.md` | INR financial exposure amounts, S.27 ICA non-compete rewrite |
| `agents/legal-clauses.md` | DPDP Act 2023 / IT Act SPDI Rules in Data Protection taxonomy row |
| `agents/legal-recommendations.md` | DPDP Act template replacing GDPR, `₹` replacing `$` |
| `agents/legal-terms.md` | DPDP Act example row, `₹` replacing `$` |
| `agents/legal-compliance.md` | Add Section 13: BNS/BNSS criminal liability, compromise deeds, Advocates Act |

---

## Task 1: Accent colour — replace #2563EB with #B45309 in server.js

**Files:** Modify `server.js`

- [ ] **Step 1: Replace the BLUE constant and all its direct uses**

In `server.js`, locate line 369:
```javascript
const SLATE = '#1E293B', BLUE = '#2563EB', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
```
Replace with:
```javascript
const SLATE = '#1E293B', BLUE = '#B45309', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
```

Also update the NOTE callout background in `drawCallout`. Find:
```javascript
var map = { WARNING: [RED, '#FEF2F2'], NOTE: [BLUE, '#EFF6FF'], TIP: [GREEN, '#F0FDF4'] };
```
Replace with:
```javascript
var map = { WARNING: [RED, '#FEF2F2'], NOTE: [BLUE, '#FFFBEB'], TIP: [GREEN, '#F0FDF4'] };
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -5
```
Expected: server starts listening (shows port message). Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: replace blue accent with amber gold #B45309 throughout PDF"
```

---

## Task 2: legal-risks.md — INR amounts + S.27 ICA non-compete

**Files:** Modify `agents/legal-risks.md`

- [ ] **Step 1: Replace USD financial exposure thresholds**

Find the scoring criteria block under **C. Estimated Financial Exposure (20% of score)**:
```
    - 1-2: Under $10,000
    - 3-4: $10,000 - $50,000
    - 5-6: $50,000 - $250,000
    - 7-8: $250,000 - $1,000,000
    - 9-10: Over $1,000,000 or uncapped
```
Replace with:
```
    - 1-2: Under ₹1 lakh
    - 3-4: ₹1 lakh – ₹5 lakh
    - 5-6: ₹5 lakh – ₹25 lakh
    - 7-8: ₹25 lakh – ₹1 crore
    - 9-10: Over ₹1 crore or uncapped
```

- [ ] **Step 2: Replace USD amounts in Risk Matrix example**

Find the Risk Matrix table example rows containing dollar amounts:
```
| 1 | 6.2 | Broad indemnification for all third-party claims | BI, UL, OS | 9 | 6 | Uncapped | 9 | 8 | Party A |
| 2 | 7.1 | 2-year nationwide non-compete | NC, RC | 8 | 7 | $200K-$500K est. | 8 | 8 | Party A |
| 3 | 8.1 | Liability cap excludes indemnification | UL, FE | 8 | 5 | Uncapped | 7 | 7 | Party A |
```
Replace the `$200K-$500K est.` with `₹15L–₹40L est.`

- [ ] **Step 3: Replace USD amounts in Top Risks Detailed Analysis example**

Find:
```
Financial Exposure:
- Single lawsuit defense costs: $50,000 - $500,000+
- Settlement or judgment: potentially unlimited
- Total exposure: UNCAPPED
```
Replace with:
```
Financial Exposure:
- Single lawsuit defence costs: ₹5 lakh – ₹50 lakh+
- Settlement or judgment: potentially unlimited
- Total exposure: UNCAPPED
```

- [ ] **Step 4: Rewrite Non-Compete Overreach section**

Find the **10. Non-Compete Overreach (NC)** section opening lines:
```
- Duration exceeds 12 months (18+ months is aggressive in most states)
- Geographic scope is nationwide or global without business justification
- Activity restriction covers entire industry rather than specific competing products
- Applies after termination without cause or layoff
- No consideration provided in exchange for the covenant
- Covers independent contractors (increasingly unenforceable)
```
Replace with:
```
**Indian law — S.27 Indian Contract Act 1872 (ICA):**
Under S.27 ICA, any post-employment non-compete is void regardless of duration,
geography, or reasonableness. There is no blue-pencilling or reasonableness
exception under Indian law (unlike English or US law).

Flag ALL of the following as void or high-risk:
- Post-termination non-compete of any duration — automatically void under S.27 ICA
- Post-termination non-solicitation of clients — consistently held void by Indian High Courts
- Geographic or time-bound framing does not save the clause
- Exception: restrictions operative only DURING active employment are permissible
- Exception: sale of goodwill with local/reasonable limits — valid under S.27 proviso
```

- [ ] **Step 5: Commit**

```bash
git add agents/legal-risks.md
git commit -m "feat: replace USD with INR in risk agent, rewrite non-compete to S.27 ICA"
```

---

## Task 3: legal-clauses.md — DPDP Act in Data Protection row

**Files:** Modify `agents/legal-clauses.md`

- [ ] **Step 1: Update Data Protection taxonomy row**

Find this row in the Primary Clause Categories table:
```
| **Data Protection** | Personal data handling, GDPR/CCPA compliance, data processing | Data Protection, Privacy, Data Processing Agreement |
```
Replace with:
```
| **Data Protection** | Personal data handling, DPDP Act 2023 / IT Act SPDI Rules 2011 compliance, data processing | Data Protection, Privacy, Data Processing Agreement, Data Principal Rights |
```

- [ ] **Step 2: Commit**

```bash
git add agents/legal-clauses.md
git commit -m "feat: replace GDPR/CCPA with DPDP Act 2023 / IT Act in clause taxonomy"
```

---

## Task 4: legal-recommendations.md — DPDP Act template + INR

**Files:** Modify `agents/legal-recommendations.md`

- [ ] **Step 1: Replace Data Protection template**

Find the *Data Protection* template block:
```
*Data Protection*:
```
```
"Processor shall (a) process Personal Data only on documented instructions
from Controller, (b) ensure personnel are bound by confidentiality obligations,
(c) implement appropriate technical and organizational security measures,
(d) not engage sub-processors without Controller's prior written consent,
(e) assist Controller in responding to data subject requests within [5]
business days, (f) notify Controller of any Personal Data breach within
[48/72] hours of becoming aware, (g) delete or return all Personal Data upon
termination within [30] days, and (h) make available information necessary to
demonstrate compliance and allow for audits."
```
Replace with:
```
*Data Protection (DPDP Act 2023)*:
```
```
"Data Fiduciary shall: (a) process Personal Data only for the specific purpose
for which consent was obtained under DPDP Act 2023 S.7; (b) implement reasonable
security safeguards to prevent Personal Data breach; (c) notify the Data
Protection Board and affected Data Principals of any breach without undue delay
and within 72 hours of becoming aware; (d) erase Personal Data upon withdrawal
of consent or upon the purpose being served, unless retention is required by
applicable law; (e) not transfer Personal Data outside India except to countries
notified by the Central Government under DPDP Act S.16; (f) honour Data
Principal rights: access (S.11), correction and erasure (S.12), grievance
redressal (S.13), and nomination (S.14). These obligations survive termination."
```

- [ ] **Step 2: Replace Liability Cap template dollar amounts**

Find:
```
"In no event shall either party's total aggregate liability under this
Agreement exceed [the greater of (a) the total fees paid or payable under
this Agreement during the twelve (12) month period preceding the claim, or
(b) $[amount]]. This limitation shall apply regardless of the form of action,
whether in contract, tort, strict liability, or otherwise."
```
Replace with:
```
"In no event shall either party's total aggregate liability under this
Agreement exceed the greater of: (a) the total fees paid or payable under
this Agreement during the twelve (12) month period preceding the claim; or
(b) ₹[amount]. This limitation shall apply regardless of the form of action,
whether in contract, tort (including negligence), or otherwise, and shall
survive termination of this Agreement."
```

- [ ] **Step 3: Replace GDPR example in obligations matrix**

Find in the Obligations Matrix example:
```
| 4 | 6.1 | Both | COMP | Maintain GDPR compliance | Continuous | Ongoing | 30 days to cure | Termination for cause |
```
Replace with:
```
| 4 | 6.1 | Both | COMP | Maintain DPDP Act 2023 / IT Act SPDI Rules 2011 compliance | Continuous | Ongoing | 30 days to cure | Termination for cause |
```

- [ ] **Step 4: Commit**

```bash
git add agents/legal-recommendations.md
git commit -m "feat: replace GDPR template with DPDP Act 2023, USD with INR in recommendations agent"
```

---

## Task 5: legal-terms.md — DPDP Act + INR

**Files:** Modify `agents/legal-terms.md`

- [ ] **Step 1: Replace GDPR compliance row in obligations matrix example**

Find:
```
| 4 | 6.1 | Both | COMP | Maintain GDPR compliance | Continuous | Ongoing | 30 days to cure | Termination for cause |
```
Replace with:
```
| 4 | 6.1 | Both | COMP | Maintain DPDP Act 2023 compliance | Continuous | Ongoing | 30 days to cure | Termination for cause |
```

- [ ] **Step 2: Replace all dollar amounts in Financial Exposure Calculation section**

Find and replace each of these (all appear in the Step 5 financial exposure block):

| Find | Replace |
|---|---|
| `Base contract value: $___` | `Base contract value: ₹___` |
| `Minimum commitments: $___` | `Minimum commitments: ₹___` |
| `Required insurance premiums: $___` | `Required insurance premiums: ₹___` |
| `Subtotal A: $___` | `Subtotal A: ₹___` |
| `Early termination fees: $___` | `Early termination fees: ₹___` |
| `Liquidated damages (maximum): $___` | `Liquidated damages (maximum): ₹___` |
| `Late payment interest (estimated): $___` | `Late payment interest (estimated): ₹___` |
| `Penalty clauses: $___` | `Penalty clauses: ₹___` |
| `Subtotal B: $___` | `Subtotal B: ₹___` |
| `Indemnification cap (if any): $___` | `Indemnification cap (if any): ₹___` |
| `Lost profits claims (if not excluded): $___` | `Lost profits claims (if not excluded): ₹___` |
| `Business interruption (if not excluded): $___` | `Business interruption (if not excluded): ₹___` |
| `Subtotal D: $___` | `Subtotal D: ₹___` |
| `TOTAL MAXIMUM EXPOSURE: A + B + C + D = $___` | `TOTAL MAXIMUM EXPOSURE: A + B + C + D = ₹___` |
| `TOTAL GUARANTEED EXPOSURE: A = $___` | `TOTAL GUARANTEED EXPOSURE: A = ₹___` |

Also in Financial Exposure Summary output format block, replace:
```
  Base Contract Value (full term): $[amount]
  Minimum Commitments: $[amount]
  Insurance Requirements: $[amount]/year
  Total Guaranteed: $[amount]
...
  Early Termination Penalty: $[amount]
  Maximum Liquidated Damages: $[amount]
  Late Payment Interest (estimated annual): $[amount]
  Other Penalties: $[amount]
  Total Contingent: $[amount]
...
  Indemnification: [Capped at $X / UNCAPPED]
...
TOTAL MAXIMUM FINANCIAL EXPOSURE: $[amount] + [uncapped items]
```
Replace all `$` with `₹` and `$X` with `₹X`.

- [ ] **Step 3: Commit**

```bash
git add agents/legal-terms.md
git commit -m "feat: replace GDPR with DPDP Act, USD with INR in terms agent"
```

---

## Task 6: legal-compliance.md — Add Section 13 (Criminal Law)

**Files:** Modify `agents/legal-compliance.md`

- [ ] **Step 1: Append Section 13 after Section 12**

Find the end of Section 12 (the last bullet point before `## Analysis Process`):
```
- **Foreign Parties**: FEMA 1999 compliance for payment terms, equity, and cross-border services; RBI approval requirements
```

After that line, insert a blank line then the full Section 13 block:

```markdown

### 13. Criminal Liability Exposure Under BNS/BNSS/BSA 2023

**Applies when:** Contract terms or the conduct they authorize may expose a party to criminal liability, or when the contract is a settlement/compromise deed connected to a criminal matter.

#### 13.1 Contract Clauses That May Constitute Offences (BNS 2023)

Flag any clause that may constitute or facilitate:

- **Cheating (BNS S.316):** Clause induces a party to deliver property or consent by deception — e.g., false representation of qualifications, undisclosed encumbrances on property, fabricated invoice terms
- **Fraud (BNS S.318):** Clause designed to deceive for wrongful gain — applies to contracts with fraudulent consideration or misrepresented purpose
- **Criminal Breach of Trust (BNS S.316):** Clause entrusting property or funds with open-ended discretionary payment authority and no accounting obligation — may facilitate misappropriation
- **Forgery (BNS S.336):** Any clause referencing execution of a false document or requiring alteration of a genuine document
- **Extortion (BNS S.308):** Clause that threatens harm to induce consent — voids the agreement for lack of free consent under ICA S.15 and may itself constitute extortion
- **Agreement to Commit Offence:** Any clause whose performance would require commission of an offence — void under ICA S.23 (unlawful object); both parties may face criminal liability

**Red Flags:**
- [ ] Does any party's core obligation require conduct that could be characterised as cheating, fraud, or criminal breach of trust?
- [ ] Does the contract purport to legitimise or regularise past conduct that may already be criminal?
- [ ] Is consideration for the contract itself potentially tainted (e.g., proceeds of crime)?

#### 13.2 Compromise Deeds in Criminal Matters (BNSS S.359)

When reviewing a settlement or compromise deed connected to a criminal case:

- [ ] Identify the underlying offence — is it **compoundable** under BNSS S.359?
  - **Compoundable without court permission (BNSS S.359(1)):** Hurt (BNS S.115), defamation (S.356), assault (S.131), criminal trespass (S.329), mischief (S.324), dishonest misappropriation (S.314) and other offences in the BNSS S.359(1) schedule
  - **Compoundable with court permission (BNSS S.359(2)):** More serious offences including voluntarily causing grievous hurt (S.117), wrongful confinement (S.127), and others in the schedule
  - **Non-compoundable:** Murder, rape, dacoity, offences against the State, offences under special statutes — settlement deed cannot extinguish criminal proceedings regardless of terms
- [ ] If compoundable without permission: ensure the deed records voluntary, free consent of both parties
- [ ] If compoundable with court permission: flag that court approval is required before the deed has legal effect
- [ ] Flag any clause attempting to compound a non-compoundable offence as **HIGH severity — VOID and potentially contemptuous of court**
- [ ] BSA 2023 compliance: if the compromise deed is intended to be produced as evidence, verify it satisfies BSA S.57 (relevancy of facts in issue) and BSA S.65 (admissibility of electronic records if executed via e-signature or DocuSign)

#### 13.3 Advocates Act 1961 / Bar Council of India Rules

When reviewing professional service agreements, retainer agreements, or vakalatnama:

- [ ] **Contingency fee / percentage of damages:** BCI Rules, Chapter II, Part VI, Rule 20 — an advocate may not enter into a fee arrangement contingent on the result of litigation or as a percentage of damages recovered. Any such clause is **void and exposes the advocate to professional misconduct proceedings**
- [ ] **Champertous contracts:** Agreement by a third party to fund litigation in exchange for a share of proceeds — void under Indian law (*Re: A Vakil* AIR 1954 Mad and consistently followed). Flag any clause that looks like third-party litigation funding contingent on outcome
- [ ] **Vakalatnama validity:** Must (a) identify the specific court or authority, (b) be signed by the client personally, and (c) not be executed in blank awaiting insertion of court details — a pre-signed blank vakalatnama is void and may constitute forgery if misused
- [ ] **Fee agreements:** Fixed fees and time-based fees are permissible and enforceable. Written fee agreements are best practice; absence of a written agreement does not invalidate the engagement but creates disputes
- [ ] **Dual representation:** An advocate may not represent parties with conflicting interests without full disclosure and consent — any clause purporting to allow this is void and a professional misconduct risk

**Severity Guide for Section 13:**
- **HIGH:** Clause constitutes or facilitates a BNS offence; compromise of non-compoundable offence; champertous fee arrangement; void contingency fee clause
- **MEDIUM:** Clause is adjacent to criminal conduct depending on subsequent facts; compoundable offence without court permission where required; blank vakalatnama
- **LOW:** Best-practice gap in professional agreement; ambiguous clause that could be misused but is not currently illegal
```

- [ ] **Step 2: Verify the file is valid markdown (no broken headers)**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('./agents/legal-compliance.md', 'utf8');
const headers = content.match(/^#{1,4} .+/gm) || [];
headers.forEach(h => console.log(h));
"
```
Expected output: numbered headers 1–13 all visible, ending with `#### 13.3 Advocates Act 1961 / Bar Council of India Rules`.

- [ ] **Step 3: Commit**

```bash
git add agents/legal-compliance.md
git commit -m "feat: add Section 13 BNS/BNSS criminal liability, compromise deeds, Advocates Act"
```

---

## Task 7: server.js — Cover page gauge + pie chart

**Files:** Modify `server.js` lines ~486–507 (score panel section)

- [ ] **Step 1: Replace score number + grade letter with gauge + pie chart**

Find this block in the cover page section (after the `roundedRect` for the score panel):
```javascript
  // Left: large score number
  doc.fontSize(54).fillColor(sc).font('Helvetica-Bold')
    .text(String(score), 62, panelY + 16, { width: 104, align: 'center', lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text('/ 100', 62, panelY + 84, { width: 104, align: 'center', lineBreak: false });
  // Centre separator
  doc.moveTo(192, panelY + 16).lineTo(192, panelY + panelH - 16).lineWidth(0.5).strokeColor(GREY).stroke();
  // Grade letter + label
  var gradeLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory' : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';
  doc.fontSize(40).fillColor(sc).font('Helvetica-Bold')
    .text(grade, 202, panelY + 18, { width: 82, align: 'center', lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text(gradeLabel, 202, panelY + 80, { width: 82, align: 'center', lineBreak: false });
```

Replace entirely with:
```javascript
  // ── Left zone: semicircle gauge ──────────────────────────────────────────
  var gCx = 114, gCy = panelY + 78, gR = 44;
  // Track (full top semicircle, clockwise from left to right through top)
  doc.save();
  doc.lineWidth(11).lineCap('round');
  doc.arc(gCx, gCy, gR, Math.PI, 2 * Math.PI, false)
     .strokeColor('#E5E7EB').stroke();
  // Filled arc proportional to score
  if (score > 0) {
    doc.arc(gCx, gCy, gR, Math.PI, Math.PI + (score / 100) * Math.PI, false)
       .strokeColor(sc).stroke();
  }
  doc.restore();
  // Score text — below arc centre, no overlap with stroke
  doc.fontSize(22).fillColor(sc).font('Helvetica-Bold')
    .text(String(score), 62, gCy + 6, { width: 104, align: 'center', lineBreak: false });
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text('/ 100  ·  Grade ' + grade, 62, gCy + 30, { width: 104, align: 'center', lineBreak: false });

  // Centre separator
  doc.moveTo(192, panelY + 16).lineTo(192, panelY + panelH - 16).lineWidth(0.5).strokeColor(GREY).stroke();

  // ── Centre zone: pie chart (risk distribution) ───────────────────────────
  var pieCx = 243, pieCy = panelY + 56, pieR = 28;
  var pieTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var gapRad = 3 * Math.PI / 180;
  var pieStart = -Math.PI / 2; // start at 12 o'clock
  [[riskCounts.h, RED], [riskCounts.m, AMBER], [riskCounts.l, GREEN]].forEach(function(seg) {
    if (seg[0] === 0) return;
    var sweep = (seg[0] / pieTotal) * 2 * Math.PI - gapRad;
    doc.save();
    doc.moveTo(pieCx, pieCy);
    doc.arc(pieCx, pieCy, pieR, pieStart, pieStart + sweep, false);
    doc.closePath();
    doc.fill(seg[1]);
    doc.restore();
    pieStart += sweep + gapRad;
  });
  // Pie legend
  var legY = pieCy + pieR + 8;
  var gradeLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory' : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';
  [[riskCounts.h, RED, 'High'], [riskCounts.m, AMBER, 'Med'], [riskCounts.l, GREEN, 'Low']].forEach(function(leg, i) {
    var ly = legY + i * 10;
    doc.roundedRect(202, ly + 1, 7, 7, 1).fill(leg[1]);
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(leg[0] + ' ' + leg[2], 212, ly, { width: 72, lineBreak: false });
  });
```

- [ ] **Step 2: Verify no syntax errors and server starts**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```
Expected: `Contract Analyzer running on http://localhost:3000`  Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add semicircle gauge and pie chart to cover page score panel"
```

---

## Task 8: server.js — Executive Summary two-column layout

**Files:** Modify `server.js` lines ~549–587 (executive summary section)

- [ ] **Step 1: Replace the executive summary block**

Find the full executive summary block:
```javascript
  // ── Executive Summary ──────────────────────────────────────────────────────
  secHdr('Executive Summary');
  doc.fontSize(10.5).fillColor(SLATE).font('Helvetica')
    .text(summaryText, 50, doc.y, { width: W, align: 'justify', lineGap: 3 });

  // Risk count boxes
  var bY = doc.y + 24, bW = 150, bH = 58;
  if (bY + bH < CBOT) {
    var boxes = [[String(riskCounts.h), 'HIGH RISK', RED], [String(riskCounts.m), 'MEDIUM RISK', AMBER], [String(riskCounts.l), 'LOW RISK', GREEN]];
    for (var bi = 0; bi < boxes.length; bi++) {
      var bx = 50 + bi * (bW + 12);
      doc.roundedRect(bx, bY, bW, bH, 4).fill(boxes[bi][2]);
      doc.fontSize(26).fillColor(WHITE).font('Helvetica-Bold').text(boxes[bi][0], bx, bY + 6, { width: bW, align: 'center' });
      doc.fontSize(8).fillColor(WHITE).font('Helvetica').text(boxes[bi][1], bx, bY + 36, { width: bW, align: 'center' });
    }
    doc.y = bY + bH + 20;
  }

  // Top risks inline — fills remaining space, avoids a blank half-page
  var highRisks = riskData.filter(function(r) { return (r.severity || '').toUpperCase() === 'HIGH'; }).slice(0, 3);
  if (highRisks.length > 0 && doc.y < CBOT - 80) {
    doc.fontSize(9).fillColor(SLATE).font('Helvetica-Bold')
      .text('Critical Issues', 50, doc.y + 4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor(BLUE).stroke();
    doc.y += 8;
    highRisks.forEach(function(r) {
      if (doc.y > CBOT - 40) return;
      var rtext = (r.risk || r.description || '').replace(/\*\*/g, '');
      var expl  = (r.explanation || '').replace(/\*\*/g, '');
      var short = expl.length > 120 ? expl.substring(0, 120) + '…' : expl;
      var iy = doc.y;
      doc.rect(50, iy, 3, 34).fill(RED);
      doc.fontSize(9).fillColor(SLATE).font('Helvetica-Bold')
        .text(rtext, 60, iy, { width: W - 10, lineBreak: false });
      doc.fontSize(8).fillColor(GREY).font('Helvetica')
        .text(short, 60, iy + 13, { width: W - 10 });
      doc.y += 6;
    });
  }
```

Replace entirely with:
```javascript
  // ── Executive Summary ──────────────────────────────────────────────────────
  secHdr('Executive Summary');

  var sumLeftW  = Math.floor(W * 0.58);  // 287
  var sumRightW = Math.floor(W * 0.38);  // 188
  var sumGap    = W - sumLeftW - sumRightW; // 20
  var sumRightX = 50 + sumLeftW + sumGap;   // 357
  var sumStartY = doc.y;

  // ── LEFT COLUMN ────────────────────────────────────────────────────────────
  // Shortened prose (word-boundary truncation at 200 chars)
  var shortSummary = summaryText.length > 200
    ? summaryText.slice(0, 200).replace(/\s+\S*$/, '') + '…'
    : summaryText;
  doc.fontSize(10).fillColor(SLATE).font('Helvetica')
    .text(shortSummary, 50, sumStartY, { width: sumLeftW, align: 'justify', lineGap: 2 });

  // Risk count pills (below prose)
  var pillY = doc.y + 10;
  var pillW = Math.floor((sumLeftW - 10) / 3);
  var pillH = 40;
  if (pillY + pillH < CBOT) {
    [[String(riskCounts.h), 'HIGH', RED], [String(riskCounts.m), 'MED', AMBER], [String(riskCounts.l), 'LOW', GREEN]]
      .forEach(function(p, i) {
        var px = 50 + i * (pillW + 5);
        doc.roundedRect(px, pillY, pillW, pillH, 3).fill(p[2]);
        doc.fontSize(18).fillColor(WHITE).font('Helvetica-Bold').text(p[0], px, pillY + 4, { width: pillW, align: 'center' });
        doc.fontSize(7).fillColor(WHITE).font('Helvetica').text(p[1], px, pillY + 26, { width: pillW, align: 'center' });
      });
    doc.y = pillY + pillH + 10;
  }

  // Inline HIGH risks (top 2, red left bar)
  var sumHighRisks = riskData.filter(function(r) { return (r.severity || '').toUpperCase() === 'HIGH'; }).slice(0, 2);
  sumHighRisks.forEach(function(r) {
    if (doc.y > CBOT - 40) return;
    var rt   = (r.risk || r.description || '').replace(/\*\*/g, '');
    var expl = (r.explanation || '').replace(/\*\*/g, '');
    var iy   = doc.y;
    doc.rect(50, iy, 3, 30).fill(RED);
    doc.fontSize(8).fillColor(SLATE).font('Helvetica-Bold')
      .text(rt.length > 60 ? rt.slice(0, 57) + '…' : rt, 60, iy, { width: sumLeftW - 10, lineBreak: false });
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(expl.length > 80 ? expl.slice(0, 77) + '…' : expl, 60, iy + 13, { width: sumLeftW - 10 });
    doc.y += 6;
  });

  // ── RIGHT COLUMN ───────────────────────────────────────────────────────────
  var cardY = sumStartY;
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('CRITICAL ISSUES', sumRightX, cardY, { width: sumRightW, lineBreak: false });
  cardY += 12;

  var cardRisks = riskData.slice().sort(function(a, b) {
    var ord = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (ord[(a.severity || '').toUpperCase()] || 3) - (ord[(b.severity || '').toUpperCase()] || 3);
  }).slice(0, 3);

  cardRisks.forEach(function(r) {
    var sev    = (r.severity || '').toUpperCase();
    var cardBg = sev === 'HIGH' ? '#FEF2F2' : sev === 'MEDIUM' ? '#FFFBEB' : '#F0FDF4';
    var cardBd = sev === 'HIGH' ? RED : sev === 'MEDIUM' ? AMBER : GREEN;
    var label  = sev + (r.clauseRef ? ' · ' + r.clauseRef : '');
    var body   = (r.risk || r.description || '').replace(/\*\*/g, '');
    var bodyS  = body.length > 60 ? body.slice(0, 57) + '…' : body;
    var cardH  = 44;
    if (cardY + cardH > CBOT) return;
    doc.rect(sumRightX, cardY, sumRightW, cardH).fill(cardBg);
    doc.rect(sumRightX, cardY, 3, cardH).fill(cardBd);
    doc.fontSize(7).fillColor(cardBd).font('Helvetica-Bold')
      .text(label, sumRightX + 6, cardY + 5, { width: sumRightW - 10, lineBreak: false });
    doc.fontSize(7).fillColor(SLATE).font('Helvetica')
      .text(bodyS, sumRightX + 6, cardY + 17, { width: sumRightW - 10 });
    cardY += cardH + 5;
  });
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```
Expected: server starts. Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: restructure executive summary as two-column prose + critical issue cards"
```

---

## Task 9: server.js — drawRiskTable + count tiles for Risk Assessment

**Files:** Modify `server.js`

- [ ] **Step 1: Add drawRiskTable function after drawTable**

Find the end of the `drawTable` function — the closing brace followed by:
```javascript
  // ── Cover ──────────────────────────────────────────────────────────────────
```

Insert the new `drawRiskTable` function between them:

```javascript
  // Risk Assessment table — severity-tinted rows with left stripe, no badge column
  function drawRiskTable(risks) {
    var TINTS   = { HIGH: '#FEF2F2', MEDIUM: '#FFFBEB', LOW: '#F0FDF4' };
    var STRIPES = { HIGH: RED, MEDIUM: AMBER, LOW: GREEN };
    var headers = ['Risk', 'Clause', 'Action'];
    var cols    = [255, 60, W - 315];
    var RH = 22, FS = 8, PAD = 5;
    var y = doc.y;

    function riskHdr(atY) {
      doc.rect(50, atY, W, RH).fill(SLATE);
      var x = 50;
      headers.forEach(function(h, i) {
        doc.fontSize(FS).fillColor(WHITE).font('Helvetica-Bold')
          .text(h, x + PAD, atY + 7, { width: cols[i] - PAD * 2, lineBreak: false });
        x += cols[i];
      });
    }
    riskHdr(y);
    y += RH;

    risks.forEach(function(r) {
      var sev    = (r.severity || '').toUpperCase();
      var bg     = TINTS[sev]   || ALTROW;
      var stripe = STRIPES[sev] || GREY;
      var risk   = (r.risk || r.description || '--').replace(/\*\*/g, '');
      var action = (r.explanation || r.risk || '--').replace(/\*\*/g, '');
      var cells  = [
        risk.length   > 80 ? risk.slice(0, 77)   + '…' : risk,
        r.clauseRef || '--',
        action.length > 40 ? action.slice(0, 37) + '…' : action
      ];

      var lineCount = Math.max(1, Math.ceil(cells[0].length / 36));
      var cellH = Math.max(RH, lineCount * 10 + PAD * 2);

      if (y + cellH > CBOT) {
        doc.addPage();
        y = CTOP;
        riskHdr(y);
        y += RH;
      }

      doc.rect(50, y, W, cellH).fill(bg);
      doc.rect(50, y, 4, cellH).fill(stripe);

      var x = 50;
      cells.forEach(function(cell, ci) {
        doc.fontSize(FS).fillColor(SLATE).font('Helvetica')
          .text(cell, x + (ci === 0 ? 8 : PAD), y + PAD, {
            width:     cols[ci] - (ci === 0 ? 12 : PAD * 2),
            lineBreak: true,
            height:    cellH - PAD,
            ellipsis:  true
          });
        x += cols[ci];
      });
      y += cellH;
    });
    doc.y = y + 8;
  }

```

- [ ] **Step 2: Replace the Risk Assessment section to use count tiles + drawRiskTable**

Find the entire Risk Assessment section:
```javascript
  // ── Risk Assessment ────────────────────────────────────────────────────────
  secHdr('Risk Assessment');
  if (riskData.length > 0) {
    var sorted = riskData.slice().sort(function(a, b) {
      var ord = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (ord[a.severity] !== undefined ? ord[a.severity] : 3) - (ord[b.severity] !== undefined ? ord[b.severity] : 3);
    });
    drawTable(
      ['Risk', 'Severity', 'Clause Ref', 'Notes'],
      sorted.map(function(r) { return [r.risk || r.description || '--', r.severity || '--', r.clauseRef || '--', r.explanation || '--']; }),
      [130, 65, 70, W - 265]
    );
  } else {
    doc.fontSize(10).fillColor(GREY).text('No risk data available.', 50, doc.y);
  }
```

Replace entirely with:
```javascript
  // ── Risk Assessment ────────────────────────────────────────────────────────
  secHdr('Risk Assessment');

  // Count tiles — 3 equal tiles, no exposure estimate
  var tileW = Math.floor((W - 10) / 3);
  var tileH = 52;
  var tileY = doc.y;
  [[String(riskCounts.h), 'HIGH RISK', RED, '#FEF2F2'],
   [String(riskCounts.m), 'MEDIUM',    AMBER, '#FFFBEB'],
   [String(riskCounts.l), 'LOW RISK',  GREEN, '#F0FDF4']
  ].forEach(function(t, i) {
    var tx = 50 + i * (tileW + 5);
    doc.roundedRect(tx, tileY, tileW, tileH, 4).fill(t[3]);
    doc.fontSize(24).fillColor(t[2]).font('Helvetica-Bold').text(t[0], tx, tileY + 6,  { width: tileW, align: 'center' });
    doc.fontSize(7).fillColor(t[2]).font('Helvetica-Bold').text(t[1],  tx, tileY + 36, { width: tileW, align: 'center' });
  });
  doc.y = tileY + tileH + 10;

  if (riskData.length > 0) {
    var sortedRisks = riskData.slice().sort(function(a, b) {
      var ord = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (ord[(a.severity || '').toUpperCase()] !== undefined ? ord[(a.severity || '').toUpperCase()] : 3)
           - (ord[(b.severity || '').toUpperCase()] !== undefined ? ord[(b.severity || '').toUpperCase()] : 3);
    });
    drawRiskTable(sortedRisks);
  } else {
    doc.fontSize(10).fillColor(GREY).text('No risk data available.', 50, doc.y);
  }
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```
Expected: server starts. Kill with Ctrl+C.

- [ ] **Step 4: End-to-end smoke test**

Start the server:
```bash
node server.js
```
Open http://localhost:3000, upload any PDF contract, click "Analyze", then "Download Report". Verify:
- Cover page: gauge arc visible (amber/red/green), pie chart with 3 segments, verdict badge unchanged
- Executive Summary: short prose left, critical issue cards right, risk pills below prose
- Risk Assessment: 3 count tiles (HIGH/MED/LOW), striped table with left severity bar, no badge column
- All section accent lines and bars are amber gold, not blue
- No blank pages, no text overflow

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add drawRiskTable with count tiles and severity-tinted rows for Risk Assessment"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Accent colour #2563EB → #B45309 everywhere | Task 1 |
| Cover gauge replaces score number | Task 7 |
| Cover pie chart replaces grade letter | Task 7 |
| Exec summary two-column prose + cards | Task 8 |
| Risk Assessment count tiles (no exposure) | Task 9 |
| drawRiskTable with striped rows + stripe | Task 9 |
| Cell truncation 80 chars (Risk col) / 40 chars (Action col) | Task 9 |
| legal-risks.md INR amounts | Task 2 |
| legal-risks.md S.27 ICA non-compete rewrite | Task 2 |
| legal-clauses.md DPDP Act Data Protection row | Task 3 |
| legal-recommendations.md DPDP Act template | Task 4 |
| legal-recommendations.md INR Liability Cap | Task 4 |
| legal-recommendations.md DPDP Act obligations example | Task 4 |
| legal-terms.md DPDP Act example row | Task 5 |
| legal-terms.md INR financial exposure amounts | Task 5 |
| legal-compliance.md Section 13 BNS criminal clauses | Task 6 |
| legal-compliance.md Section 13 BNSS compromise deeds | Task 6 |
| legal-compliance.md Section 13 Advocates Act / BCI | Task 6 |
| NOTE callout bg #EFF6FF → #FFFBEB | Task 1 |

All spec requirements covered. No gaps.

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references. All code blocks are complete.

**Type consistency:** `drawRiskTable` defined in Task 9 Step 1 and called in Task 9 Step 2. `riskCounts` used in Task 7, 8, 9 — already defined in the existing codebase at line 363. `sumLeftW`, `sumRightW`, `sumRightX`, `sumStartY` all defined locally in Task 8 scope. No cross-task naming conflicts.
