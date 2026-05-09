# PDF Report Full Visual Overhaul — Implementation Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete visual and layout overhaul of the PDF report — fix all rendering bugs (pie chart, overlapping text), redesign cover as a consulting-grade dashboard, redesign inner pages with professional structure, and apply a new deep-navy/gold palette throughout.

**Architecture:** All changes are confined to `server.js` (the `app.get('/api/download/:sessionId')` route). No new dependencies. No agent prompt changes. All chart rendering uses PDFKit's existing arc/rect/path APIs.

**Tech Stack:** Node.js, Express, PDFKit, Anthropic Claude Haiku (analysis data consumed; not changed here)

---

## File Map

| File | Change |
|---|---|
| `server.js:369` | Color constants: NAVY + GOLD replace SLATE + BLUE |
| `server.js:380–396` | pageAdded handler: NAVY header, GOLD accent |
| `server.js:399–407` | secHdr: NAVY bar, GOLD rule, fix doc.y overlap |
| `server.js:532–643` | Cover page: pie fix, verdict fix, slim footer, dashboard redesign |
| `server.js:645–719` | Executive Summary: overlap fix, parties card, risk highlight, findings, actions |
| `server.js:721–733` | Contract Metadata: rename + redesign table |
| `server.js:747–774` | Risk Assessment: severity legend, bar chart, wider explanation |
| `server.js:776–840` | Pages 5–7: visual consistency |

---

## Task 1: New color palette — NAVY + GOLD throughout

**Files:** Modify `server.js:369–371`

### Background

Current constants: `SLATE = '#1E293B'`, `BLUE = '#B45309'`.  
New palette: `NAVY = '#1a2744'` (deep navy), `GOLD = '#c9a84c'` (accent gold).  
Every reference to `SLATE` and `BLUE` must change. `ALTROW`, `RED`, `AMBER`, `GREEN`, `GREY`, `WHITE`, `LIGHTBG` stay unchanged.

- [ ] **Step 1: Replace color constant declarations**

Find in `server.js:369`:
```javascript
  const SLATE = '#1E293B', BLUE = '#B45309', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
```
Replace with:
```javascript
  const NAVY = '#1a2744', GOLD = '#c9a84c', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
```

- [ ] **Step 2: Replace all uses of SLATE with NAVY in the PDF route**

In the PDF download route (lines 369 onwards), replace every occurrence of `SLATE` with `NAVY`. Do NOT touch lines above 336 (the route definition). Use a targeted replacement:

Find: `SLATE` (all occurrences from line 369 to end of file)  
Replace: `NAVY`

- [ ] **Step 3: Replace all uses of BLUE with GOLD in the PDF route**

Find: `BLUE` (all occurrences from line 369 to end of file)  
Replace: `GOLD`

- [ ] **Step 4: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```
Expected: `Contract Analyzer running on http://localhost:3000`

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: switch PDF palette to deep navy #1a2744 and accent gold #c9a84c"
```

---

## Task 2: Fix secHdr overlapping first line

**Files:** Modify `server.js` — `secHdr` function (~line 399)

### Background

`secHdr` draws a horizontal rule at `y=88`, then sets `doc.y = CTOP = 88`. Content drawn immediately after starts at `y=88` — exactly on top of the rule line. Fix: set `doc.y = 96` after the rule so content starts 8px below it.

Also update the function to use the new `NAVY`/`GOLD` constants.

- [ ] **Step 1: Update secHdr**

Find the entire secHdr function:
```javascript
  function secHdr(title) {
    doc.addPage();
    // Left accent bar + title
    doc.rect(50, 60, 4, 26).fill(BLUE);
    doc.fontSize(18).fillColor(SLATE).font('Helvetica-Bold').text(title, 62, 60, { width: W - 12 });
    // Bottom rule under heading
    doc.moveTo(50, 88).lineTo(545, 88).lineWidth(0.5).strokeColor(BLUE).stroke();
    doc.y = CTOP;
  }
```
Replace with:
```javascript
  function secHdr(title) {
    doc.addPage();
    doc.rect(50, 60, 4, 26).fill(GOLD);
    doc.fontSize(18).fillColor(NAVY).font('Helvetica-Bold').text(title, 62, 60, { width: W - 12 });
    doc.moveTo(50, 90).lineTo(545, 90).lineWidth(0.5).strokeColor(GOLD).stroke();
    doc.y = 98;
  }
```

- [ ] **Step 2: Verify**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "fix: secHdr doc.y=98 prevents first-line overlap with rule"
```

---

## Task 3: Fix pie chart rendering

**Files:** Modify `server.js` — pie chart drawing block (~lines 572–596)

### Background

PDFKit's `arc(cx, cy, r, start, end)` creates a new subpath starting at the arc's circumference point — it does NOT connect to the preceding `moveTo(cx, cy)`. So `closePath()` closes back to the arc start (a chord), not the center. Result: each segment looks like a filled arc segment with a chord base, not a pie slice.

Fix: explicitly draw a `lineTo` from center to the arc's start point before calling `arc()`. This creates: center → circumference start → arc → close back to center = proper pie slice.

- [ ] **Step 1: Replace the pie chart drawing block**

Find:
```javascript
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
```

Replace with:
```javascript
  var pieCx = 243, pieCy = panelY + 56, pieR = 28;
  var pieTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var gapRad = 3 * Math.PI / 180;
  var pieStart = -Math.PI / 2;
  [[riskCounts.h, RED], [riskCounts.m, AMBER], [riskCounts.l, GREEN]].forEach(function(seg) {
    if (seg[0] === 0) return;
    var sweep = (seg[0] / pieTotal) * 2 * Math.PI - gapRad;
    if (sweep <= 0) return;
    var sx = pieCx + pieR * Math.cos(pieStart);
    var sy = pieCy + pieR * Math.sin(pieStart);
    doc.save();
    doc.moveTo(pieCx, pieCy)
       .lineTo(sx, sy)
       .arc(pieCx, pieCy, pieR, pieStart, pieStart + sweep, false)
       .closePath()
       .fill(seg[1]);
    doc.restore();
    pieStart += sweep + gapRad;
  });
```

- [ ] **Step 2: Verify**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "fix: pie chart — explicit lineTo center before arc creates correct pie slices"
```

---

## Task 4: Cover page — verdict fix + slim footer + dashboard redesign

**Files:** Modify `server.js` — cover page block (~lines 532–643)

### Background

Four issues to fix on the cover page:

1. **Verdict**: `scoreToRec` returns `'ESCALATE'` (score 40–59) and `'REJECT'` (< 40). The color logic `recommendation === 'SIGN' ? GREEN : recommendation === 'NEGOTIATE' ? AMBER : RED` correctly shows RED for both ESCALATE/REJECT. However the verdict badge height (`84pt`) makes the panel feel heavy. Reduce to `68pt`. Also show ESCALATE in a distinct orange to separate it from hard REJECT.

2. **Score panel redesign**: Replace the current 3-zone (gauge | pie | verdict) single card with a **4-card row** — Score Card | H Risks | M Risks | Verdict. Cleaner grid, more dashboard-like.

3. **Slim footer bar**: The large `SLATE` band at `y=630–842` (lines 633–642) with two text lines is disproportionate. Replace with a slim 28px bar pinned at the very bottom of the A4 page (`y=814`).

4. **Layout tightening**: Move the risk count row and summary snippet into a cleaner mid-section. Add a thin GOLD separator between the header band and the cards.

- [ ] **Step 1: Replace entire cover page block**

Find the cover page block starting at:
```javascript
  // ── Cover ──────────────────────────────────────────────────────────────────
  doc.addPage();
  var sc = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  var recC = recommendation === 'SIGN' ? GREEN : recommendation === 'NEGOTIATE' ? AMBER : RED;
```

And ending at:
```javascript
  cover = false;
```

Replace the entire block with:
```javascript
  // ── Cover ──────────────────────────────────────────────────────────────────
  doc.addPage();
  var sc   = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  var ORANGE = '#EA580C';
  var recC = recommendation === 'SIGN' ? GREEN
           : recommendation === 'NEGOTIATE' ? AMBER
           : recommendation === 'ESCALATE'  ? ORANGE
           : RED;

  // Top band: NAVY 0–185, GOLD accent line at 185
  doc.rect(0, 0, 595, 185).fill(NAVY);
  doc.rect(0, 185, 595, 3).fill(GOLD);
  doc.fontSize(26).fillColor(WHITE).font('Helvetica-Bold')
    .text('CONTRACT REVIEW REPORT', 50, 58, { width: W, align: 'center' });
  doc.fontSize(11).fillColor(LIGHTBG).font('Helvetica')
    .text('AI-Powered Neutral Legal Analysis', 50, 100, { width: W, align: 'center' });
  doc.fontSize(9).fillColor('#9CA3AF').font('Helvetica')
    .text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
          50, 126, { width: W, align: 'center' });

  // ── Row 1: 4 metric cards (y=202–268) ───────────────────────────────────────
  var cardRowY = 202, cardH = 66;
  var cardW    = Math.floor((W - 15) / 4); // ~120
  var cards = [
    { label: 'RISK SCORE',  value: String(score) + '/100', color: sc,   bg: '#F8FAFC' },
    { label: 'HIGH RISKS',  value: String(riskCounts.h),   color: RED,  bg: '#FEF2F2' },
    { label: 'MEDIUM RISKS',value: String(riskCounts.m),   color: AMBER,bg: '#FFFBEB' },
    { label: 'VERDICT',     value: recommendation,         color: recC, bg: '#F0FDF4' },
  ];
  cards.forEach(function(c, i) {
    var cx = 50 + i * (cardW + 5);
    doc.roundedRect(cx, cardRowY, cardW, cardH, 4).fill(c.bg);
    doc.rect(cx, cardRowY, cardW, 3).fill(c.color);
    doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
      .text(c.label, cx, cardRowY + 10, { width: cardW, align: 'center', lineBreak: false });
    var valSize = c.label === 'VERDICT' ? 14 : 22;
    doc.fontSize(valSize).fillColor(c.color).font('Helvetica-Bold')
      .text(c.value, cx, cardRowY + 22, { width: cardW, align: 'center', lineBreak: false });
  });

  // ── Row 2: Gauge + pie + grade (y=282–370) ──────────────────────────────────
  var row2Y = 282;

  // Left: semicircle gauge
  var gCx = 130, gCy = row2Y + 60, gR = 44;
  doc.save();
  doc.lineWidth(11).lineCap('round');
  doc.arc(gCx, gCy, gR, Math.PI, 2 * Math.PI, false).strokeColor('#E5E7EB').stroke();
  if (score > 0) {
    doc.arc(gCx, gCy, gR, Math.PI, Math.PI + (score / 100) * Math.PI, false).strokeColor(sc).stroke();
  }
  doc.restore();
  doc.fontSize(18).fillColor(sc).font('Helvetica-Bold')
    .text(String(score), 86, gCy + 8, { width: 88, align: 'center', lineBreak: false });
  var gradeLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory'
                 : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text('Grade ' + grade + ' · ' + gradeLabel, 86, gCy + 30, { width: 88, align: 'center', lineBreak: false });

  // Centre separator
  doc.moveTo(200, row2Y + 10).lineTo(200, row2Y + 80).lineWidth(0.5).strokeColor(LIGHTBG).stroke();

  // Centre: pie chart
  var pieCx = 290, pieCy = row2Y + 48, pieR = 32;
  var pieTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var gapRad   = 3 * Math.PI / 180;
  var pieStart = -Math.PI / 2;
  [[riskCounts.h, RED], [riskCounts.m, AMBER], [riskCounts.l, GREEN]].forEach(function(seg) {
    if (seg[0] === 0) return;
    var sweep = (seg[0] / pieTotal) * 2 * Math.PI - gapRad;
    if (sweep <= 0) return;
    var sx = pieCx + pieR * Math.cos(pieStart);
    var sy = pieCy + pieR * Math.sin(pieStart);
    doc.save();
    doc.moveTo(pieCx, pieCy)
       .lineTo(sx, sy)
       .arc(pieCx, pieCy, pieR, pieStart, pieStart + sweep, false)
       .closePath()
       .fill(seg[1]);
    doc.restore();
    pieStart += sweep + gapRad;
  });
  // Pie legend
  var legY = pieCy + pieR + 10;
  [[riskCounts.h, RED, 'High'], [riskCounts.m, AMBER, 'Medium'], [riskCounts.l, GREEN, 'Low']]
    .forEach(function(leg, i) {
      var lx = 230 + i * 62;
      doc.roundedRect(lx, legY, 8, 8, 1).fill(leg[1]);
      doc.fontSize(7).fillColor(GREY).font('Helvetica')
        .text(leg[0] + ' ' + leg[2], lx + 11, legY + 1, { lineBreak: false });
    });

  // Right separator
  doc.moveTo(390, row2Y + 10).lineTo(390, row2Y + 80).lineWidth(0.5).strokeColor(LIGHTBG).stroke();

  // Right: summary snippet
  var snip = summaryText.length > 180 ? summaryText.slice(0, 180).replace(/\s+\S*$/, '') + '…' : summaryText;
  doc.fontSize(8).fillColor(GREY).font('Helvetica-Oblique')
    .text(snip, 400, row2Y + 6, { width: 145, lineGap: 2 });

  // ── Separator + document info (y=382–420) ────────────────────────────────────
  var divY = row2Y + 100;
  doc.moveTo(50, divY).lineTo(545, divY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold')
    .text('Document:', 50, divY + 10, { lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text(filename, 115, divY + 10, { width: W - 65, lineBreak: false });
  doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold')
    .text('Review Type:', 50, divY + 24, { lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text('Neutral Legal Analysis — AI Legal Assistant', 115, divY + 24, { width: W - 65, lineBreak: false });

  // ── Slim footer bar pinned at bottom of cover ─────────────────────────────────
  doc.rect(0, 814, 595, 28).fill(NAVY);
  doc.rect(0, 814, 595, 2).fill(GOLD);
  doc.fontSize(7).fillColor('#9CA3AF').font('Helvetica')
    .text('AI Legal Assistant  ·  For informational purposes only  ·  Not legal advice',
          50, 822, { width: W, align: 'center', lineBreak: false });

  cover = false;
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: redesign cover as 4-card dashboard, fix verdict colors, slim footer bar"
```

---

## Task 5: Executive Summary redesign

**Files:** Modify `server.js` — Executive Summary block (~lines 645–719)

### Background

Current layout: short prose (left) | critical issue cards (right). Issues:
- First line still overlaps (fixed by Task 2, but layout needs updating)
- No parties summary, no risk score highlight, no contract snapshot, no recommended actions

New layout:
```
[ Left 60% ]                       [ Right 40% ]
  Risk Score badge (inline card)     PARTIES
  Prose summary (2-3 sentences)      Party A / Party B from metadata
  Key findings bullet list           ─────────────────
  Risk pills (H/M/L counts)          CONTRACT SNAPSHOT
                                     Type / Date / Term / Value
                                     ─────────────────
                                     RECOMMENDED ACTIONS
                                     Top 2 P0/P1 recommendations
```

- [ ] **Step 1: Replace the Executive Summary block**

Find the full Executive Summary block starting at:
```javascript
  // ── Executive Summary ──────────────────────────────────────────────────────
  secHdr('Executive Summary');

  var sumLeftW  = Math.floor(W * 0.58);  // 287
```

And ending before:
```javascript
  // ── Contract Metadata ──────────────────────────────────────────────────────
```

Replace the entire block with:
```javascript
  // ── Executive Summary ──────────────────────────────────────────────────────
  secHdr('Executive Summary');

  var sumLeftW  = Math.floor(W * 0.58);
  var sumRightW = Math.floor(W * 0.38);
  var sumGap    = W - sumLeftW - sumRightW;
  var sumRightX = 50 + sumLeftW + sumGap;
  var sumStartY = doc.y;

  // ── LEFT COLUMN ──────────────────────────────────────────────────────────────
  // Risk score inline badge
  var scoreBadgeColor = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  doc.roundedRect(50, sumStartY, 60, 24, 3).fill(scoreBadgeColor);
  doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
    .text(String(score) + '/100', 50, sumStartY + 5, { width: 60, align: 'center', lineBreak: false });
  var gradeStr = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory'
               : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text('Risk Score  ·  Grade ' + grade + ' — ' + gradeStr, 118, sumStartY + 8, { width: sumLeftW - 68, lineBreak: false });

  // Prose summary
  var shortSummary = summaryText.length > 220
    ? summaryText.slice(0, 220).replace(/\s+\S*$/, '') + '…'
    : summaryText;
  doc.fontSize(9.5).fillColor(NAVY).font('Helvetica')
    .text(shortSummary, 50, sumStartY + 34, { width: sumLeftW, align: 'justify', lineGap: 2 });

  // Key findings header
  var findingsY = doc.y + 10;
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('KEY FINDINGS', 50, findingsY, { lineBreak: false });
  findingsY += 12;

  // Top 3 risks as bullet findings
  var findRisks = riskData.slice().sort(function(a, b) {
    var ord = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (ord[(a.severity || '').toUpperCase()] || 3) - (ord[(b.severity || '').toUpperCase()] || 3);
  }).slice(0, 3);
  findRisks.forEach(function(r) {
    if (findingsY > CBOT - 30) return;
    var sev = (r.severity || '').toUpperCase();
    var dotColor = sev === 'HIGH' ? RED : sev === 'MEDIUM' ? AMBER : GREEN;
    var rtext = (r.risk || r.description || '').replace(/\*\*/g, '');
    var short  = rtext.length > 70 ? rtext.slice(0, 67) + '…' : rtext;
    doc.roundedRect(50, findingsY + 2, 7, 7, 1).fill(dotColor);
    doc.fontSize(8).fillColor(NAVY).font('Helvetica')
      .text(short, 62, findingsY, { width: sumLeftW - 12, lineBreak: false });
    findingsY += 14;
  });
  doc.y = findingsY + 6;

  // Risk pills
  var pillY = doc.y;
  var pillW = Math.floor((sumLeftW - 10) / 3);
  var pillH = 38;
  if (pillY + pillH < CBOT) {
    [[String(riskCounts.h), 'HIGH', RED], [String(riskCounts.m), 'MED', AMBER], [String(riskCounts.l), 'LOW', GREEN]]
      .forEach(function(p, i) {
        var px = 50 + i * (pillW + 5);
        doc.roundedRect(px, pillY, pillW, pillH, 3).fill(p[2]);
        doc.fontSize(16).fillColor(WHITE).font('Helvetica-Bold').text(p[0], px, pillY + 4, { width: pillW, align: 'center' });
        doc.fontSize(7).fillColor(WHITE).font('Helvetica').text(p[1], px, pillY + 24, { width: pillW, align: 'center' });
      });
    doc.y = pillY + pillH + 8;
  }

  // ── RIGHT COLUMN ─────────────────────────────────────────────────────────────
  var rcY = sumStartY;

  // Parties panel
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('PARTIES', sumRightX, rcY, { width: sumRightW, lineBreak: false });
  rcY += 12;
  if (metaData && metaData.parties) {
    var partiesText = String(metaData.parties).replace(/\*\*/g, '');
    doc.fontSize(8).fillColor(NAVY).font('Helvetica')
      .text(partiesText.length > 80 ? partiesText.slice(0, 77) + '…' : partiesText,
            sumRightX, rcY, { width: sumRightW });
    rcY = doc.y + 6;
  } else {
    doc.fontSize(8).fillColor(GREY).font('Helvetica')
      .text('Not identified', sumRightX, rcY, { lineBreak: false });
    rcY += 14;
  }

  // Divider
  doc.moveTo(sumRightX, rcY).lineTo(sumRightX + sumRightW, rcY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  rcY += 8;

  // Contract snapshot
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('CONTRACT SNAPSHOT', sumRightX, rcY, { width: sumRightW, lineBreak: false });
  rcY += 11;
  var snapFields = [
    ['Type',  metaData && metaData.contractType  ? metaData.contractType  : '—'],
    ['Date',  metaData && metaData.effectiveDate  ? metaData.effectiveDate : '—'],
    ['Term',  metaData && metaData.term           ? metaData.term          : '—'],
    ['Value', metaData && metaData.totalValue     ? metaData.totalValue    : '—'],
    ['Law',   metaData && metaData.governingLaw   ? metaData.governingLaw  : '—'],
  ];
  snapFields.forEach(function(sf) {
    if (rcY > CBOT - 12) return;
    doc.fontSize(7).fillColor(GOLD).font('Helvetica-Bold')
      .text(sf[0] + ':', sumRightX, rcY, { width: 36, lineBreak: false });
    var val = String(sf[1]).length > 28 ? String(sf[1]).slice(0, 25) + '…' : String(sf[1]);
    doc.fontSize(7).fillColor(NAVY).font('Helvetica')
      .text(val, sumRightX + 38, rcY, { width: sumRightW - 40, lineBreak: false });
    rcY += 12;
  });

  // Divider
  if (rcY < CBOT - 50) {
    doc.moveTo(sumRightX, rcY + 2).lineTo(sumRightX + sumRightW, rcY + 2).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
    rcY += 10;

    // Recommended actions
    doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
      .text('RECOMMENDED ACTIONS', sumRightX, rcY, { width: sumRightW, lineBreak: false });
    rcY += 11;
    recoData.slice(0, 2).forEach(function(reco) {
      if (rcY > CBOT - 20) return;
      var pri    = reco.priority || 'P?';
      var rtext  = String(reco.recommendation || reco.action || reco.description || '').replace(/\*\*/g, '');
      var shortR = rtext.length > 55 ? rtext.slice(0, 52) + '…' : rtext;
      var pcolor = pri === 'P0' ? RED : pri === 'P1' ? AMBER : GOLD;
      doc.rect(sumRightX, rcY + 1, 18, 11).fill(pcolor);
      doc.fontSize(6.5).fillColor(WHITE).font('Helvetica-Bold')
        .text(pri, sumRightX, rcY + 3, { width: 18, align: 'center', lineBreak: false });
      doc.fontSize(7).fillColor(NAVY).font('Helvetica')
        .text(shortR, sumRightX + 22, rcY, { width: sumRightW - 24 });
      rcY = doc.y + 4;
    });
  }
```

- [ ] **Step 2: Verify**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: executive summary — risk score badge, parties panel, findings, contract snapshot, actions"
```

---

## Task 6: Contract Metadata — rename + redesign

**Files:** Modify `server.js` — Contract Metadata block (~lines 721–733)

### Background

Current: plain heading "Contract Metadata" + generic two-column table. Rename to "Agreement Profile". Redesign with alternating-row coloring, bold left labels, and add more fields from `metaData` if available (jurisdiction, renewal terms).

- [ ] **Step 1: Replace the Contract Metadata block**

Find:
```javascript
  // ── Contract Metadata ──────────────────────────────────────────────────────
  if (metaData) {
    secHdr('Contract Metadata');
    var mfields = [
      ['Contract Type',   metaData.contractType  || 'Not identified'],
      ['Parties',         metaData.parties        || 'Not specified'],
      ['Effective Date',  metaData.effectiveDate  || 'Not specified'],
      ['Term / Duration', metaData.term           || 'Not specified'],
      ['Governing Law',   metaData.governingLaw   || 'Not specified'],
      ['Total Value',     metaData.totalValue     || 'Not specified'],
    ];
    drawTable(['Field', 'Details'], mfields, [130, W - 130]);
  }
```

Replace with:
```javascript
  // ── Agreement Profile ──────────────────────────────────────────────────────
  if (metaData) {
    secHdr('Agreement Profile');

    // Styled key-value rows with alternating backgrounds
    var apFields = [
      ['Contract Type',    metaData.contractType    || 'Not identified'],
      ['Parties',          metaData.parties          || 'Not specified'],
      ['Effective Date',   metaData.effectiveDate    || 'Not specified'],
      ['Term / Duration',  metaData.term             || 'Not specified'],
      ['Governing Law',    metaData.governingLaw     || 'Not specified'],
      ['Jurisdiction',     metaData.jurisdiction     || metaData.governingLaw || 'Not specified'],
      ['Contract Value',   metaData.totalValue       || metaData.contractValue || 'Not specified'],
      ['Renewal Terms',    metaData.renewalTerms     || metaData.renewal || 'Not specified'],
    ];
    var apRH = 24, apY = doc.y;
    apFields.forEach(function(f, i) {
      if (apY + apRH > CBOT) { doc.addPage(); apY = CTOP; }
      var bg = i % 2 === 0 ? ALTROW : WHITE;
      doc.rect(50, apY, W, apRH).fill(bg);
      doc.rect(50, apY, 3, apRH).fill(GOLD);
      doc.fontSize(8.5).fillColor(NAVY).font('Helvetica-Bold')
        .text(f[0], 60, apY + 7, { width: 130, lineBreak: false });
      var val = String(f[1]).replace(/\*\*/g, '');
      doc.fontSize(8.5).fillColor(GREY).font('Helvetica')
        .text(val, 196, apY + 7, { width: W - 146, lineBreak: false, ellipsis: true });
      apY += apRH;
    });
    doc.y = apY + 10;
  }
```

- [ ] **Step 2: Verify**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: rename Contract Metadata to Agreement Profile, redesign with gold-stripe rows"
```

---

## Task 7: Risk Assessment — severity legend + bar chart

**Files:** Modify `server.js` — Risk Assessment block (~lines 747–774) and `drawRiskTable` (~lines 470–530)

### Background

Add two visual elements above the risk table:
1. **Severity legend** — a single-line row: `■ High  ■ Medium  ■ Low` with colored squares
2. **Horizontal bar chart** — proportional bars showing H/M/L distribution

Also widen the Action column explanation truncation from 40 to 60 chars so more context is shown.

- [ ] **Step 1: Update drawRiskTable to truncate at 60 chars in Action column**

Find in `drawRiskTable`:
```javascript
        action.length > 40 ? action.slice(0, 37) + '…' : action
```
Replace with:
```javascript
        action.length > 60 ? action.slice(0, 57) + '…' : action
```

- [ ] **Step 2: Update Risk Assessment section with legend + bar chart**

Find:
```javascript
  // ── Risk Assessment ────────────────────────────────────────────────────────
  secHdr('Risk Assessment');

  // Count tiles — 3 equal tiles, no exposure estimate
  var tileW = Math.floor((W - 10) / 3);
```

Replace the block through `drawRiskTable(sortedRisks);` with:
```javascript
  // ── Risk Assessment ────────────────────────────────────────────────────────
  secHdr('Risk Assessment');

  // Count tiles
  var tileW = Math.floor((W - 10) / 3);
  var tileH = 52;
  var tileY = doc.y;
  [[String(riskCounts.h), 'HIGH RISK', RED, '#FEF2F2'],
   [String(riskCounts.m), 'MEDIUM',    AMBER, '#FFFBEB'],
   [String(riskCounts.l), 'LOW RISK',  GREEN, '#F0FDF4']
  ].forEach(function(t, i) {
    var tx = 50 + i * (tileW + 5);
    doc.roundedRect(tx, tileY, tileW, tileH, 4).fill(t[3]);
    doc.fontSize(24).fillColor(t[2]).font('Helvetica-Bold').text(t[0], tx, tileY + 6, { width: tileW, align: 'center' });
    doc.fontSize(7).fillColor(t[2]).font('Helvetica-Bold').text(t[1], tx, tileY + 36, { width: tileW, align: 'center' });
  });
  doc.y = tileY + tileH + 14;

  // Horizontal distribution bar chart
  var barTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var barH = 10, barY = doc.y;
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('Risk Distribution', 50, barY, { lineBreak: false });
  barY += 12;
  var barX = 50;
  [[riskCounts.h, RED], [riskCounts.m, AMBER], [riskCounts.l, GREEN]].forEach(function(seg) {
    if (seg[0] === 0) return;
    var bw = Math.round((seg[0] / barTotal) * W);
    doc.rect(barX, barY, bw, barH).fill(seg[1]);
    barX += bw;
  });

  // Severity legend
  var legY2 = barY + barH + 6;
  [[RED, 'High Risk'], [AMBER, 'Medium Risk'], [GREEN, 'Low Risk']].forEach(function(leg, i) {
    var lx = 50 + i * 100;
    doc.roundedRect(lx, legY2, 8, 8, 1).fill(leg[0]);
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(leg[1], lx + 11, legY2 + 1, { lineBreak: false });
  });
  doc.y = legY2 + 16;

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

- [ ] **Step 3: Verify**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: risk assessment — severity legend, distribution bar chart, wider explanation column"
```

---

## Task 8: Pages 5–7 visual consistency

**Files:** Modify `server.js` — Obligations, Compliance Flags, Missing Protections, Recommendations blocks (~lines 776–840)

### Background

Pages 5–7 use the same boilerplate visual style. Key improvements:
- **Obligations**: add a GOLD-accented info banner explaining what obligations represent
- **Compliance Flags**: add a section intro callout; `drawCallout` already uses the palette — ensure NAVY/GOLD colors are used (covered by Task 1)
- **Missing Protections**: replace the red bullet squares with NAVY-outlined circles; add a GOLD-accented intro explaining significance
- **Recommendations**: add a priority legend row above the list; replace the plain priority badge with a pill that shows the label text

- [ ] **Step 1: Update Obligations & Deadlines section**

Find:
```javascript
  // ── Obligations & Deadlines ────────────────────────────────────────────────
  secHdr('Obligations & Deadlines');
  if (obligData.length > 0) {
    drawTable(
```

Replace the intro line (insert before `drawTable`):
```javascript
  // ── Obligations & Deadlines ────────────────────────────────────────────────
  secHdr('Obligations & Deadlines');
  // Intro banner
  doc.rect(50, doc.y, W, 20).fill(ALTROW);
  doc.rect(50, doc.y, 3, 20).fill(GOLD);
  doc.fontSize(8).fillColor(GREY).font('Helvetica-Oblique')
    .text('Contractual duties, deadlines, and consequences of non-performance identified in the agreement.',
          60, doc.y + 6, { width: W - 20, lineBreak: false });
  doc.y += 26;
  if (obligData.length > 0) {
    drawTable(
```

Also close the if block correctly — keep the original `else` block unchanged.

- [ ] **Step 2: Update Missing Protections — replace red squares with GOLD-accented circles**

Find:
```javascript
      doc.rect(50, mpy + 4, 5, 5).fill(RED);
      doc.fontSize(10).fillColor(SLATE).font('Helvetica').text(mptext, 64, mpy, { width: W - 14 });
```
Replace with:
```javascript
      doc.circle(53, mpy + 7, 3).fill(RED);
      doc.fontSize(9.5).fillColor(NAVY).font('Helvetica').text(mptext, 64, mpy, { width: W - 14 });
```

- [ ] **Step 3: Update Recommendations — add priority legend**

Find:
```javascript
  // ── Recommendations ────────────────────────────────────────────────────────
  secHdr('Recommendations');
  if (recoData.length > 0) {
    var badgeColors = { P0: RED, P1: '#E64A19', P2: AMBER, P3: GREEN, P4: '#5C6BC0' };
```

Insert after `secHdr('Recommendations');`:
```javascript
  secHdr('Recommendations');
  // Priority legend
  var prioLegY = doc.y;
  [['P0', RED, 'Critical'], ['P1', '#E64A19', 'High'], ['P2', AMBER, 'Medium'], ['P3', GREEN, 'Low']].forEach(function(pl, i) {
    var plx = 50 + i * 110;
    doc.rect(plx, prioLegY, 22, 13).fill(pl[1]);
    doc.fontSize(7).fillColor(WHITE).font('Helvetica-Bold')
      .text(pl[0], plx, prioLegY + 3, { width: 22, align: 'center', lineBreak: false });
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(pl[2], plx + 26, prioLegY + 3, { lineBreak: false });
  });
  doc.y = prioLegY + 20;
  if (recoData.length > 0) {
    var badgeColors = { P0: RED, P1: '#E64A19', P2: AMBER, P3: GREEN, P4: '#5C6BC0' };
```

- [ ] **Step 4: Verify no syntax errors**

```bash
node -e "require('./server.js')" 2>&1 | head -3
```

- [ ] **Step 5: End-to-end smoke test**

Start the server and generate a report. Verify:
- Cover: 4 metric cards, pie chart has visible colored segments, slim footer at bottom
- Executive Summary: risk badge, prose, key findings dots, parties panel on right, contract snapshot, recommended actions
- Agreement Profile: GOLD left stripe on each row, bold labels
- Risk Assessment: bar chart + legend + severity-tinted table
- Recommendations: priority legend row before the list
- All pages have NAVY header bar and GOLD accent line; footer shows page number

```bash
node server.js
```
Open http://localhost:3000, upload a contract, analyze, download report.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: pages 5-7 visual polish — obligations banner, missing protections circles, recommendations legend"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Fix broken pie chart | Task 3 |
| Fix Verdict row logic (ESCALATE color) + reduce height | Task 4 |
| Slim footer single-line bar on cover | Task 4 |
| Cover redesign as dashboard — 4 metric cards | Task 4 |
| Gauge + pie in Row 2 of cover | Task 4 |
| Fix Executive Summary overlapping first line | Task 2 (secHdr doc.y=98) |
| Key findings panel | Task 5 |
| Risk score highlight | Task 5 |
| Parties summary | Task 5 |
| Contract snapshot | Task 5 |
| Recommended actions block | Task 5 |
| Rename Contract Metadata → Agreement Profile | Task 6 |
| Redesign metadata table (alternating rows, bold labels, GOLD stripe) | Task 6 |
| Add jurisdiction, governing law, contract value, renewal terms fields | Task 6 |
| Fix Risk Assessment overlapping first line | Task 2 |
| Color-coded risk badges / severity legend | Task 7 |
| Risk distribution bar chart | Task 7 |
| Wider explanation text (60 chars) | Task 7 |
| Obligations intro banner | Task 8 |
| Missing Protections red dots → circles | Task 8 |
| Recommendations priority legend | Task 8 |
| Global palette NAVY + GOLD | Task 1 |
| Branded header + footer on every inner page | Tasks 1–2 (palette + secHdr) |
| All charts render without errors | Tasks 3, 4 |

### Placeholder scan

No TBDs, no "similar to above" references. All code blocks are complete and self-contained.

### Type consistency

- `NAVY`, `GOLD` defined in Task 1, used in Tasks 2–8
- `ORANGE = '#EA580C'` defined locally inside cover block (Task 4 scope only)
- `recoData`, `metaData`, `riskData`, `riskCounts`, `summaryText` all defined at line 352–367 before any of these tasks execute
- `drawRiskTable` defined before cover block (~line 471), called in Task 7 — no ordering issue
- `secHdr` updated in Task 2 used in Tasks 5–8 — updated before any section draws

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-pdf-overhaul-v2.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans with checkpoints

**Which approach?**
