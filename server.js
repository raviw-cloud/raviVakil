require('dotenv').config({ override: true });
const express     = require('express');
const rateLimit   = require('express-rate-limit');
const multer      = require('multer');
const pdfParse    = require('pdf-parse');
const PDFDocument = require('pdfkit');
const Anthropic   = require('@anthropic-ai/sdk');
const fs          = require('fs');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const skills = {
  clauses:         fs.readFileSync('./agents/legal-clauses.md',         'utf8'),
  risks:           fs.readFileSync('./agents/legal-risks.md',           'utf8'),
  compliance:      fs.readFileSync('./agents/legal-compliance.md',      'utf8'),
  terms:           fs.readFileSync('./agents/legal-terms.md',           'utf8'),
  recommendations: fs.readFileSync('./agents/legal-recommendations.md', 'utf8'),
};

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const reportCache = new Map();   // sessionId -> { results, score, grade, recommendation, filename }

const analyzeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait 15 minutes before analyzing again.' },
});

app.use(express.static('public'));
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(rawText) {
  return rawText.length > 12000 ? rawText.slice(0, 12000) + '\n...[truncated]' : rawText;
}

// Returns true if the extracted string contains enough meaningful text to be
// a usable legal document.  Normalises whitespace and requires at least 8
// dictionary-style words so garbage symbol runs and numeric-only pages are
// not treated as valid extractions.
function isUsableText(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 30) return false;
  const words = normalized.match(/[a-zA-Z]{3,}/g) || [];
  return words.length >= 8;
}

// Four-strategy PDF text extraction.
//
// S1 — standard pdf-parse              : works for most text-layer PDFs.
// S2 — custom item-level pagerender    : catches text missed by the default
//       renderer on mixed image+text PDFs (XObject forms, unusual operators).
// S3 — pdfjs-dist v3 direct           : newer engine that handles modern fonts
//       and encodings that pdf-parse's bundled pdf.js v1.10.100 cannot read.
// S4 — Claude AI PDF vision            : last resort for fully image-based PDFs
//       (e.g. Maharashtra eRegistration, scanned agreements).  Uses the same
//       Anthropic client that drives analysis — no extra dependencies.
//
// Returns the extracted string, or null only if all four strategies fail.
async function extractPdfText(buffer) {
  // Strategy 1: standard pdf-parse
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S1 (pdf-parse) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S1 returned', text.length, 'chars / insufficient words — trying S2');
  } catch (e) {
    console.warn('[pdf] S1 threw:', e.message, '— trying S2');
  }

  // Strategy 2: item-level renderer via pdf-parse
  try {
    const data = await pdfParse(buffer, {
      pagerender(pageData) {
        return pageData.getTextContent({ normalizeWhitespace: true })
          .then(function(tc) {
            var out = '', lastY = null;
            for (var i = 0; i < tc.items.length; i++) {
              var item = tc.items[i];
              if (!item.str) continue;
              var y = item.transform != null ? item.transform[5] : null;
              if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) out += '\n';
              out += item.str;
              lastY = y;
            }
            return out;
          });
      },
    });
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S2 (item renderer) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S2 returned', text.length, 'chars / insufficient words — trying S3');
  } catch (e) {
    console.warn('[pdf] S2 threw:', e.message, '— trying S3');
  }

  // Strategy 3: pdfjs-dist v3 (handles modern fonts/encodings)
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    let out = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const tc   = await page.getTextContent({ normalizeWhitespace: true });
      let lastY  = null;
      for (const item of tc.items) {
        if (!item.str) continue;
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) out += '\n';
        out += item.str;
        lastY = y;
      }
      out += '\n\n';
    }
    pdfDoc.destroy();
    const text = out.replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S3 (pdfjs-dist) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S3 returned', text.length, 'chars / insufficient words — trying S4 (AI vision)');
  } catch (e) {
    console.warn('[pdf] S3 threw:', e.message, '— trying S4 (AI vision)');
  }

  // Strategy 4: Claude AI PDF vision
  // Used when all text engines return empty — typical of government eRegistration
  // PDFs (Maharashtra IGR etc.) where every page is a rasterised JPEG image.
  // Sends the raw PDF to Claude and asks for a plain-text extraction.
  // Claude's PDF vision supports up to 100 pages; base64 adds ~33% size overhead.
  const S4_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — keeps base64 payload under ~6.7 MB
  if (buffer.length > S4_MAX_BYTES) {
    console.warn('[pdf] S4 skipped: buffer', (buffer.length / 1e6).toFixed(1), 'MB exceeds 5 MB limit for AI vision');
    return null;
  }
  try {
    console.log('[pdf] S4: Claude AI vision — image-based PDF detected, extracting via AI');
    const aiResp = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: buffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Extract ALL text from this legal document PDF. Include every party name, address, clause, term, condition, date, and amount visible on every page. Return only the extracted text — no commentary, no formatting marks.',
            },
          ],
        }],
      },
      { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } }
    );
    const text = (aiResp.content[0].text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S4 (Claude vision) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S4 returned', text.length, 'chars / insufficient words');
  } catch (e) {
    console.warn('[pdf] S4 threw:', e.message);
  }

  return null; // all four strategies exhausted
}

function parseAgentJson(raw) {
  if (!raw || typeof raw !== 'string') return { parseError: true };
  // Strategy 1: fenced code block
  const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fm) { try { return JSON.parse(fm[1].trim()); } catch {} }
  // Strategy 2: brace-depth scanner
  const findJson = (str, o, c) => {
    const s = str.indexOf(o);
    if (s === -1) return null;
    let d = 0;
    for (let i = s; i < str.length; i++) {
      if (str[i] === o) d++;
      else if (str[i] === c) { d--; if (d === 0) return str.slice(s, i + 1); }
    }
    return null;
  };
  const obj = findJson(raw, '{', '}');
  if (obj) { try { return JSON.parse(obj); } catch {} }
  const arr = findJson(raw, '[', ']');
  if (arr) { try { return JSON.parse(arr); } catch {} }
  // Strategy 3: raw
  try { return JSON.parse(raw.trim()); } catch {}
  console.warn('[parseAgentJson] failed:', raw.slice(0, 200));
  return { raw, parseError: true };
}

function calculateScore(results) {
  let score = 100;
  // Risks — capped at 45 pts
  const risks = Array.isArray(results.risks && results.risks.risks) ? results.risks.risks : [];
  let rd = 0;
  risks.forEach(r => {
    const s = (r.severity || '').toUpperCase();
    if (s === 'HIGH') rd += 10;
    else if (s === 'MEDIUM') rd += 4;
    else rd += 1;
  });
  score -= Math.min(45, rd);
  // Compliance — capped at 30 pts
  const issues = (results.compliance && (results.compliance.issues || results.compliance.flags || results.compliance.violations)) || [];
  let cd = 0;
  (Array.isArray(issues) ? issues : []).forEach(i => {
    const s = (i.severity || i.level || '').toUpperCase();
    if (s === 'HIGH') cd += 7;
    else if (s === 'MEDIUM') cd += 3;
    else cd += 1;
  });
  score -= Math.min(30, cd);
  // Vague obligations — capped at 10 pts
  const obs = Array.isArray(results.terms && results.terms.obligations) ? results.terms.obligations : [];
  score -= Math.min(10, obs.filter(o => !o.deadline || o.deadline === 'Not specified').length * 2);
  // Bonus for thorough clause extraction
  if ((Array.isArray(results.clauses && results.clauses.clauses) ? results.clauses.clauses : []).length >= 8) score += 3;
  return Math.max(10, Math.min(100, Math.round(score)));
}

const scoreToGrade = s => s >= 90 ? 'A+' : s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F';
const scoreToRec   = s => s >= 85 ? 'SIGN' : s >= 60 ? 'NEGOTIATE' : s >= 40 ? 'ESCALATE' : 'REJECT';

// ── Analyze route ──────────────────────────────────────────────────────────────

function isPdfBuffer(buf) {
  return buf.length >= 4 &&
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
}

app.post('/api/analyze', analyzeLimit, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded.' });
  if (!isPdfBuffer(req.file.buffer)) return res.status(400).json({ error: 'Only PDF files are accepted.' });

  try {
    const rawText = await extractPdfText(req.file.buffer);
    if (!rawText) {
      return res.status(422).json({
        error: 'No selectable text found in this PDF. If it is a scanned document, please run it through an OCR tool first (e.g. Adobe Acrobat, ILovePDF) to add a text layer, then re-upload.',
      });
    }

    const full    = extractText(rawText);
    const clause  = rawText.length > 6000 ? rawText.slice(0, 6000) + '\n...[truncated]' : rawText;

    const t0 = Date.now();
    const sys = name => [{ type: 'text', text: skills[name], cache_control: { type: 'ephemeral' } }];
    const [cR, rR, coR, tR, reR] = await Promise.all([
      client.messages.create({ model: HAIKU_MODEL, max_tokens: 4000, system: sys('clauses'),
        messages: [{ role: 'user', content: 'Analyze this contract. Return ONLY valid JSON:\n{"clauses":[{"clauseName":"...","location":"...","summary":"..."}],"metadata":{"contractType":"...","parties":"...","effectiveDate":"...","term":"...","governingLaw":"...","totalValue":"..."},"missingProtections":["missing clause 1","missing clause 2"],"score":0-100,"summary":"2 sentences"}\nMax 12 clauses, max 8 missing protections.\n\n' + full }] }),
      client.messages.create({ model: HAIKU_MODEL, max_tokens: 2500, system: sys('risks'),
        messages: [{ role: 'user', content: 'Assess risk. Return ONLY valid JSON: {"risks":[{"risk":"...","severity":"HIGH|MEDIUM|LOW","clauseRef":"...","explanation":"..."}],"score":0-100}. Max 10 risks.\n\n' + clause }] }),
      client.messages.create({ model: HAIKU_MODEL, max_tokens: 2500, system: sys('compliance'),
        messages: [{ role: 'user', content: 'Check Indian law compliance. Return ONLY valid JSON: {"issues":[{"issue":"...","severity":"HIGH|MEDIUM|LOW","statute":"..."}],"score":0-100}. Max 8 issues.\n\n' + full }] }),
      client.messages.create({ model: HAIKU_MODEL, max_tokens: 2500, system: sys('terms'),
        messages: [{ role: 'user', content: 'Map obligations and deadlines. Return ONLY valid JSON: {"obligations":[{"party":"...","obligation":"...","deadline":"...","consequence":"..."}],"score":0-100}. Max 10.\n\n' + clause }] }),
      client.messages.create({ model: HAIKU_MODEL, max_tokens: 3000, system: sys('recommendations'),
        messages: [{ role: 'user', content: 'Top 6 recommendations. Return ONLY valid JSON: {"recommendations":[{"priority":"P0-P4","action":"...","recommendation":"max 120 chars"}],"score":0-100}.\n\n' + clause }] }),
    ]);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const results = {
      clauses:         parseAgentJson(cR.content[0].text),
      risks:           parseAgentJson(rR.content[0].text),
      compliance:      parseAgentJson(coR.content[0].text),
      terms:           parseAgentJson(tR.content[0].text),
      recommendations: parseAgentJson(reR.content[0].text),
    };

    Object.entries(results).forEach(([agent, r]) => {
      if (r && r.parseError) console.error('[analyze] PARSE ERROR -', agent, ':', (r.raw || '').slice(0, 200));
    });

    const responses = [cR, rR, coR, tR, reR];
    const totalIn     = responses.reduce((s, r) => s + (r.usage.input_tokens          || 0), 0);
    const totalOut    = responses.reduce((s, r) => s + (r.usage.output_tokens         || 0), 0);
    const totalWrite  = responses.reduce((s, r) => s + (r.usage.cache_creation_input_tokens || 0), 0);
    const totalRead   = responses.reduce((s, r) => s + (r.usage.cache_read_input_tokens     || 0), 0);
    const cost = ((totalIn / 1e6) * 0.80 + (totalOut / 1e6) * 4.00
                + (totalWrite / 1e6) * 1.00 + (totalRead / 1e6) * 0.08).toFixed(4);
    console.log('[analyze]', req.file.originalname, '|', elapsed + 's |',
      totalIn + 'in/' + totalOut + 'out | cache write=' + totalWrite + ' read=' + totalRead + ' | $' + cost);

    const score          = calculateScore(results);
    const grade          = scoreToGrade(score);
    const recommendation = scoreToRec(score);
    const sessionId      = uuidv4();

    // Cache structured results — NOT markdown — so the PDF renderer uses direct data
    reportCache.set(sessionId, { results, score, grade, recommendation, filename: req.file.originalname });
    if (reportCache.size > 50) reportCache.delete(reportCache.keys().next().value);

    const summaryText = (results.clauses && results.clauses.summary) || 'Analysis complete. Download the full PDF report.';
    res.json({ sessionId, score, grade, recommendation, summary: summaryText, cost });

  } catch (err) {
    console.error('[analyze] error:', err);
    if (err.status === 401) return res.status(500).json({ error: 'Invalid API key.' });
    if (err.status === 429) return res.status(500).json({ error: 'Rate limit reached. Try again in a moment.' });
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

// ── PDF Download route ─────────────────────────────────────────────────────────

app.get('/api/download/:sessionId', function(req, res) {
  const cached = reportCache.get(req.params.sessionId);
  if (!cached) return res.status(404).json({ error: 'Report not found. Please re-analyze.' });

  const { results, score, grade, recommendation, filename } = cached;

  const baseName    = filename.replace(/\.pdf$/i, '').replace(/[^a-z0-9_\-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const today       = new Date().toISOString().slice(0, 10);
  const outFilename = 'CONTRACT-REVIEW-' + baseName + '-' + today + '.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  const encodedFilename = encodeURIComponent(outFilename).replace(/'/g, '%27');
  res.setHeader('Content-Disposition',
    'attachment; filename="' + outFilename + '"; filename*=UTF-8\'\'' + encodedFilename);

  // Extract structured arrays directly — no markdown parsing
  const clauseData = (results.clauses  && Array.isArray(results.clauses.clauses))                         ? results.clauses.clauses.slice(0, 12)          : [];
  const riskData   = (results.risks    && Array.isArray(results.risks.risks))                             ? results.risks.risks.slice(0, 10)              : [];
  const obligData  = (results.terms    && Array.isArray(results.terms.obligations))                       ? results.terms.obligations.slice(0, 10)         : [];
  const compData   = (results.compliance && Array.isArray(results.compliance.issues  ||
                                                           results.compliance.flags   ||
                                                           results.compliance.violations))
                       ? (results.compliance.issues || results.compliance.flags || results.compliance.violations).slice(0, 8) : [];
  const recoData    = (results.recommendations && Array.isArray(results.recommendations.recommendations))  ? results.recommendations.recommendations.slice(0, 6) : [];
  const metaData    = (results.clauses && results.clauses.metadata && typeof results.clauses.metadata === 'object') ? results.clauses.metadata : null;
  const missingData = (results.clauses && Array.isArray(results.clauses.missingProtections)) ? results.clauses.missingProtections.slice(0, 10) : [];
  const summaryText = (results.clauses && results.clauses.summary) || 'AI analysis complete. Review sections below.';
  const riskCounts  = riskData.reduce((a, r) => {
    const s = (r.severity || '').toUpperCase();
    if (s === 'HIGH') a.h++; else if (s === 'MEDIUM') a.m++; else a.l++;
    return a;
  }, { h: 0, m: 0, l: 0 });

  const NAVY = '#1a2744', GOLD = '#c9a84c', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
  const RED = '#DC2626', AMBER = '#D97706', GREEN = '#16A34A', GREY = '#6B7280';
  const ALTROW = '#F8FAFC';
  const W = 495, CTOP = 88, CBOT = 760;

  const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: false });
  doc.pipe(res);

  // Header + footer on every non-cover page
  let cover = true;
  let pageNum = 0;
  doc.on('pageAdded', function() {
    if (cover) return;
    pageNum++;
    // Page header bar
    doc.rect(0, 0, 595, 48).fill(NAVY);
    doc.rect(0, 48, 595, 3).fill(GOLD);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica')
      .text('CONTRACT REVIEW REPORT', 50, 18, { width: 300, align: 'left', lineBreak: false })
      .text('AI Legal Assistant', 295, 18, { width: 250, align: 'right', lineBreak: false });
    // Footer
    doc.moveTo(50, CBOT + 5).lineTo(545, CBOT + 5).lineWidth(0.5).strokeColor(GREY).stroke();
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text('AI Legal Assistant — Contract Review', 50, CBOT + 11, { width: 200, align: 'left',   lineBreak: false })
      .text('CONFIDENTIAL',                              200, CBOT + 11, { width: 195, align: 'center', lineBreak: false })
      .text('Page ' + pageNum,                          395, CBOT + 11, { width: 150, align: 'right',  lineBreak: false });
    doc.y = CTOP;
  });

  // Section header
  function secHdr(title) {
    doc.addPage();
    doc.rect(50, 60, 4, 26).fill(GOLD);
    doc.fontSize(18).fillColor(NAVY).font('Helvetica-Bold').text(title, 62, 60, { width: W - 12 });
    doc.moveTo(50, 90).lineTo(545, 90).lineWidth(0.5).strokeColor(GOLD).stroke();
    doc.y = 98;
  }

  // Callout block for NOTE / WARNING / TIP
  function drawCallout(type, text) {
    var map = { WARNING: [RED, '#FEF2F2'], NOTE: [GOLD, '#FFFBEB'], TIP: [GREEN, '#F0FDF4'] };
    var pair = map[type] || [GREY, LIGHTBG];
    var border = pair[0], bg = pair[1];
    var startY = doc.y;
    var textH = doc.heightOfString(text, { width: W - 24 });
    var h = textH + 28;
    doc.rect(50, startY, W, h).fill(bg);
    doc.rect(50, startY, 4, h).fill(border);
    doc.fontSize(8).fillColor(border).font('Helvetica-Bold')
      .text(type, 62, startY + 7, { width: 60, lineBreak: false });
    doc.fontSize(9).fillColor(NAVY).font('Helvetica')
      .text(text, 62, startY + 18, { width: W - 24 });
    doc.y = startY + h + 8;
  }

  // Table renderer — uses structured arrays, no markdown
  function drawTable(headers, rows, cols) {
    var RH = 22, FS = 8, LH = 10, PAD = 6;
    var y = doc.y;
    function hdr(atY) {
      doc.rect(50, atY, W, RH).fill(NAVY);
      var x = 50;
      for (var hi = 0; hi < headers.length; hi++) {
        doc.fontSize(FS).fillColor(WHITE).font('Helvetica-Bold')
          .text(headers[hi], x + 4, atY + 7, { width: cols[hi] - 8, lineBreak: false });
        x += cols[hi];
      }
    }
    hdr(y);
    y += RH;
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var cellH = RH;
      for (var ci = 0; ci < row.length; ci++) {
        var cpl = Math.max(1, Math.floor((cols[ci] - 8) / 5.5));
        var h   = Math.ceil(String(row[ci] || '').length / cpl) * LH + PAD * 2;
        if (h > cellH) cellH = h;
      }
      if (y + cellH > CBOT) {
        doc.addPage();
        y = CTOP;
        hdr(y);
        y += RH;
      }
      doc.rect(50, y, W, cellH).fill(ri % 2 === 0 ? ALTROW : WHITE);
      var x2 = 50;
      for (var ci2 = 0; ci2 < row.length; ci2++) {
        var s     = String(row[ci2] || '--');
        var u     = s.toUpperCase();
        var color = u === 'HIGH' ? RED : u === 'MEDIUM' ? AMBER : u === 'LOW' ? GREEN : NAVY;
        doc.fontSize(FS).fillColor(color).font('Helvetica')
          .text(s, x2 + 4, y + PAD, { width: cols[ci2] - 8, lineBreak: true, height: cellH - PAD, ellipsis: true });
        x2 += cols[ci2];
      }
      y += cellH;
    }
    doc.y = y + 8;
  }

  // Risk Assessment table — severity-tinted rows with left stripe, no badge column
  function drawRiskTable(risks) {
    var TINTS   = { HIGH: '#FEF2F2', MEDIUM: '#FFFBEB', LOW: '#F0FDF4' };
    var STRIPES = { HIGH: RED, MEDIUM: AMBER, LOW: GREEN };
    var headers = ['Risk', 'Clause', 'Action'];
    var cols    = [220, 58, W - 278];
    var RH = 22, FS = 8, PAD = 5;
    var y = doc.y;

    function riskHdr(atY) {
      doc.rect(50, atY, W, RH).fill(NAVY);
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
        action.length > 80 ? action.slice(0, 77) + '…' : action
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
        doc.fontSize(FS).fillColor(NAVY).font('Helvetica')
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

  // ── Cover — Dashboard ──────────────────────────────────────────────────────
  doc.addPage();
  var sc     = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  var ORANGE = '#EA580C';
  var recC   = recommendation === 'SIGN'      ? GREEN
             : recommendation === 'NEGOTIATE' ? AMBER
             : recommendation === 'ESCALATE'  ? ORANGE : RED;
  var gLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory'
             : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';

  // ── NAVY top band ───────────────────────────────────────────────────────────
  doc.rect(0, 0, 595, 175).fill(NAVY);
  doc.rect(0, 175, 595, 3).fill(GOLD);
  doc.fontSize(24).fillColor(WHITE).font('Helvetica-Bold')
    .text('CONTRACT REVIEW REPORT', 50, 52, { width: W, align: 'center' });
  doc.fontSize(10).fillColor('#CBD5E1').font('Helvetica')
    .text('AI-Powered Legal Analysis  ·  Indian Law', 50, 90, { width: W, align: 'center' });
  doc.fontSize(8).fillColor('#94A3B8').font('Helvetica')
    .text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
          50, 114, { width: W, align: 'center' });

  // ── Semicircle gauge (centred, dashboard-style) ─────────────────────────────
  var gCx = 297, gCy = 308, gR = 82;

  // Coloured zone bands (drawn as thick arcs)
  doc.save();
  doc.lineWidth(18).lineCap('butt');
  // Critical  0–35 → red
  doc.arc(gCx, gCy, gR, Math.PI, Math.PI + 0.35 * Math.PI, false).strokeColor('#ef4444').stroke();
  // Poor     35–55 → orange
  doc.arc(gCx, gCy, gR, Math.PI + 0.35 * Math.PI, Math.PI + 0.55 * Math.PI, false).strokeColor('#f97316').stroke();
  // Fair     55–70 → amber
  doc.arc(gCx, gCy, gR, Math.PI + 0.55 * Math.PI, Math.PI + 0.70 * Math.PI, false).strokeColor('#eab308').stroke();
  // Good    70–100 → green
  doc.arc(gCx, gCy, gR, Math.PI + 0.70 * Math.PI, 2 * Math.PI, false).strokeColor('#22c55e').stroke();
  doc.restore();

  // Needle pointer from centre to arc edge
  var needleAngle = Math.PI + (score / 100) * Math.PI;
  var nX = gCx + (gR - 4) * Math.cos(needleAngle);
  var nY = gCy + (gR - 4) * Math.sin(needleAngle);
  doc.save();
  doc.moveTo(gCx, gCy).lineTo(nX, nY).lineWidth(3).strokeColor(NAVY).stroke();
  doc.circle(gCx, gCy, 7).fill(NAVY);
  doc.restore();

  // End-of-arc labels
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text('0', gCx - gR - 20, gCy - 4, { lineBreak: false });
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text('100', gCx + gR + 5, gCy - 4, { lineBreak: false });

  // Score text + grade label below gauge
  doc.fontSize(32).fillColor(sc).font('Helvetica-Bold')
    .text(String(score), gCx - 60, gCy + 16, { width: 120, align: 'center', lineBreak: false });
  doc.fontSize(9).fillColor(GREY).font('Helvetica')
    .text('out of 100', gCx - 40, gCy + 50, { width: 80, align: 'center', lineBreak: false });
  doc.fontSize(11).fillColor(NAVY).font('Helvetica-Bold')
    .text('Grade ' + grade + '  —  ' + gLabel, gCx - 100, gCy + 64, { width: 200, align: 'center', lineBreak: false });

  // ── 4 Metric Cards ───────────────────────────────────────────────────────────
  var cRowY = gCy + 92, cW = Math.floor((W - 15) / 4), cH = 64;
  [
    { lbl: 'HIGH RISK',  val: String(riskCounts.h), color: '#ef4444', bg: '#FEF2F2' },
    { lbl: 'MEDIUM',     val: String(riskCounts.m), color: '#f97316', bg: '#FFF7ED' },
    { lbl: 'LOW RISK',   val: String(riskCounts.l), color: '#22c55e', bg: '#F0FDF4' },
    { lbl: 'VERDICT',    val: recommendation,       color: recC,      bg: '#F8FAFC' },
  ].forEach(function(card, i) {
    var cx = 50 + i * (cW + 5);
    doc.roundedRect(cx, cRowY, cW, cH, 4).fill(card.bg);
    doc.rect(cx, cRowY, cW, 3).fill(card.color);
    doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
      .text(card.lbl, cx, cRowY + 10, { width: cW, align: 'center', lineBreak: false });
    var vSize = card.lbl === 'VERDICT' ? 13 : 24;
    doc.fontSize(vSize).fillColor(card.color).font('Helvetica-Bold')
      .text(card.val, cx, cRowY + 24, { width: cW, align: 'center', lineBreak: false });
  });

  // ── Pie chart + summary text ──────────────────────────────────────────────
  var row3Y = cRowY + cH + 20;

  // Pie (left half)
  var pCx = 120, pCy = row3Y + 44, pR = 36;
  var pTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var pGap = 3 * Math.PI / 180, pStart = -Math.PI / 2;
  [[riskCounts.h, '#ef4444'], [riskCounts.m, '#f97316'], [riskCounts.l, '#22c55e']].forEach(function(seg) {
    if (seg[0] === 0) return;
    var sweep = (seg[0] / pTotal) * 2 * Math.PI - pGap;
    if (sweep <= 0) return;
    var sx = pCx + pR * Math.cos(pStart), sy = pCy + pR * Math.sin(pStart);
    doc.save();
    doc.moveTo(pCx, pCy).lineTo(sx, sy)
       .arc(pCx, pCy, pR, pStart, pStart + sweep, false)
       .closePath().fill(seg[1]);
    doc.restore();
    pStart += sweep + pGap;
  });
  var pLegY = pCy + pR + 8;
  [['#ef4444', riskCounts.h + ' High'], ['#f97316', riskCounts.m + ' Medium'], ['#22c55e', riskCounts.l + ' Low']]
    .forEach(function(leg, i) {
      doc.roundedRect(58, pLegY + i * 13, 8, 8, 1).fill(leg[0]);
      doc.fontSize(7.5).fillColor(GREY).font('Helvetica')
        .text(leg[1], 70, pLegY + i * 13 + 1, { lineBreak: false });
    });

  // Summary text (right of pie)
  var sumRX = 195, sumRW = W - 145;
  doc.fontSize(7.5).fillColor(GREY).font('Helvetica-Bold')
    .text('ANALYSIS SUMMARY', sumRX, row3Y, { width: sumRW, lineBreak: false });
  var coverSnip = summaryText.length > 290
    ? summaryText.slice(0, 290).replace(/\s+\S*$/, '') + '…'
    : summaryText;
  doc.fontSize(8.5).fillColor(NAVY).font('Helvetica')
    .text(coverSnip, sumRX, row3Y + 14, { width: sumRW, align: 'justify', lineGap: 2 });

  // ── Document info ─────────────────────────────────────────────────────────
  var divY = row3Y + 120;
  doc.moveTo(50, divY).lineTo(545, divY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text('Document:', 50, divY + 10, { lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica').text(filename, 110, divY + 10, { width: W - 60, lineBreak: false });
  doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text('Review Type:', 50, divY + 23, { lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica').text('Neutral Legal Analysis — AI Legal Assistant', 110, divY + 23, { width: W - 60, lineBreak: false });

  // ── Top risks at a glance ──────────────────────────────────────────────────
  var glanceY = divY + 50;
  doc.moveTo(50, glanceY).lineTo(545, glanceY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  doc.fontSize(7.5).fillColor(GREY).font('Helvetica-Bold')
    .text('TOP RISKS AT A GLANCE', 50, glanceY + 8, { lineBreak: false });
  var topRisks = riskData.slice().sort(function(a, b) {
    var o = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (o[(a.severity || '').toUpperCase()] || 3) - (o[(b.severity || '').toUpperCase()] || 3);
  }).slice(0, 4);
  topRisks.forEach(function(r, i) {
    var gy = glanceY + 22 + i * 28;
    var sev = (r.severity || '').toUpperCase();
    var bc  = sev === 'HIGH' ? '#ef4444' : sev === 'MEDIUM' ? '#f97316' : '#22c55e';
    var rTxt = (r.risk || r.description || '').replace(/\*\*/g, '');
    var eTxt = (r.explanation || '').replace(/\*\*/g, '');
    doc.roundedRect(50, gy, 44, 14, 2).fill(bc);
    doc.fontSize(6.5).fillColor(WHITE).font('Helvetica-Bold')
      .text(sev.slice(0, 3), 50, gy + 4, { width: 44, align: 'center', lineBreak: false });
    doc.fontSize(7.5).fillColor(NAVY).font('Helvetica-Bold')
      .text(rTxt.length > 72 ? rTxt.slice(0, 69) + '…' : rTxt, 100, gy, { width: 270, lineBreak: false });
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(eTxt.length > 90 ? eTxt.slice(0, 87) + '…' : eTxt, 100, gy + 11, { width: 445, lineBreak: false });
  });

  // ── Slim footer bar ───────────────────────────────────────────────────────
  doc.rect(0, 814, 595, 28).fill(NAVY);
  doc.rect(0, 814, 595, 2).fill(GOLD);
  doc.fontSize(7.5).fillColor('#94A3B8').font('Helvetica')
    .text('AI Legal Assistant  ·  For informational purposes only  ·  Not legal advice',
          50, 822, { width: W, align: 'center', lineBreak: false });

  cover = false;

  // ── Executive Summary ──────────────────────────────────────────────────────
  secHdr('Executive Summary');

  var esLeftW  = Math.floor(W * 0.57);
  var esRightW = Math.floor(W * 0.39);
  var esGap    = W - esLeftW - esRightW;
  var esRightX = 50 + esLeftW + esGap;
  var esStartY = doc.y;

  // ── LEFT COLUMN ────────────────────────────────────────────────────────────
  // Risk score inline badge
  var esScColor = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  doc.roundedRect(50, esStartY, 62, 22, 3).fill(esScColor);
  doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
    .text(String(score) + '/100', 50, esStartY + 5, { width: 62, align: 'center', lineBreak: false });
  var esGLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Satisfactory'
               : score >= 60 ? 'Fair' : score >= 50 ? 'Below Average' : score >= 35 ? 'Poor' : 'Critical Risk';
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text('Risk Score  ·  Grade ' + grade + ' — ' + esGLabel, 120, esStartY + 7, { width: esLeftW - 72, lineBreak: false });

  // Full prose summary
  doc.fontSize(9.5).fillColor(NAVY).font('Helvetica')
    .text(summaryText, 50, esStartY + 32, { width: esLeftW, align: 'justify', lineGap: 2 });

  // Risk count pills
  var esPillY = doc.y + 10;
  var esPillW = Math.floor((esLeftW - 10) / 3);
  if (esPillY + 42 < CBOT) {
    [[String(riskCounts.h), 'HIGH', '#ef4444'], [String(riskCounts.m), 'MEDIUM', '#f97316'], [String(riskCounts.l), 'LOW', '#22c55e']]
      .forEach(function(p, i) {
        var px = 50 + i * (esPillW + 5);
        doc.roundedRect(px, esPillY, esPillW, 40, 3).fill(p[2]);
        doc.fontSize(18).fillColor(WHITE).font('Helvetica-Bold').text(p[0], px, esPillY + 4, { width: esPillW, align: 'center' });
        doc.fontSize(7).fillColor(WHITE).font('Helvetica').text(p[1], px, esPillY + 26, { width: esPillW, align: 'center' });
      });
    doc.y = esPillY + 40 + 10;
  }

  // ── RIGHT COLUMN ────────────────────────────────────────────────────────────
  var rcY = esStartY;

  // Parties
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('PARTIES TO THE AGREEMENT', esRightX, rcY, { width: esRightW, lineBreak: false });
  rcY += 12;
  if (metaData && metaData.parties) {
    doc.fontSize(8).fillColor(NAVY).font('Helvetica')
      .text(String(metaData.parties).replace(/\*\*/g, ''), esRightX, rcY, { width: esRightW });
    rcY = doc.y + 6;
  } else {
    doc.fontSize(8).fillColor(GREY).font('Helvetica').text('—', esRightX, rcY, { lineBreak: false });
    rcY += 14;
  }

  // Contract snapshot
  doc.moveTo(esRightX, rcY).lineTo(esRightX + esRightW, rcY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  rcY += 8;
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('CONTRACT SNAPSHOT', esRightX, rcY, { width: esRightW, lineBreak: false });
  rcY += 11;
  [
    ['Type',  metaData && metaData.contractType  ? metaData.contractType  : '—'],
    ['Date',  metaData && metaData.effectiveDate  ? metaData.effectiveDate : '—'],
    ['Term',  metaData && metaData.term           ? metaData.term          : '—'],
    ['Value', metaData && metaData.totalValue     ? metaData.totalValue    : '—'],
    ['Law',   metaData && metaData.governingLaw   ? metaData.governingLaw  : '—'],
  ].forEach(function(sf) {
    if (rcY > CBOT - 12) return;
    doc.fontSize(7).fillColor(GOLD).font('Helvetica-Bold')
      .text(sf[0] + ':', esRightX, rcY, { width: 36, lineBreak: false });
    var v = String(sf[1]).length > 28 ? String(sf[1]).slice(0, 25) + '…' : String(sf[1]);
    doc.fontSize(7).fillColor(NAVY).font('Helvetica')
      .text(v, esRightX + 38, rcY, { width: esRightW - 40, lineBreak: false });
    rcY += 12;
  });

  // Recommended actions
  if (rcY < CBOT - 55 && recoData.length > 0) {
    doc.moveTo(esRightX, rcY + 2).lineTo(esRightX + esRightW, rcY + 2).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
    rcY += 10;
    doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
      .text('RECOMMENDED ACTIONS', esRightX, rcY, { width: esRightW, lineBreak: false });
    rcY += 11;
    recoData.slice(0, 3).forEach(function(reco) {
      if (rcY > CBOT - 20) return;
      var pri   = reco.priority || 'P?';
      var rtext = String(reco.recommendation || reco.action || reco.description || '').replace(/\*\*/g, '');
      var sR    = rtext.length > 52 ? rtext.slice(0, 49) + '…' : rtext;
      var pc    = pri === 'P0' ? RED : pri === 'P1' ? AMBER : GOLD;
      doc.rect(esRightX, rcY + 1, 20, 12).fill(pc);
      doc.fontSize(6.5).fillColor(WHITE).font('Helvetica-Bold')
        .text(pri, esRightX, rcY + 4, { width: 20, align: 'center', lineBreak: false });
      doc.fontSize(7).fillColor(NAVY).font('Helvetica')
        .text(sR, esRightX + 24, rcY, { width: esRightW - 26 });
      rcY = doc.y + 2;
    });
  }

  // ── Full risk list below columns (uses remaining whitespace) ─────────────────
  var esEndY = Math.max(doc.y, rcY) + 16;
  if (esEndY < CBOT - 80) {
    doc.moveTo(50, esEndY).lineTo(545, esEndY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
    doc.fontSize(7.5).fillColor(GREY).font('Helvetica-Bold')
      .text('ALL IDENTIFIED RISKS', 50, esEndY + 8, { lineBreak: false });
    var esRisks = riskData.slice().sort(function(a, b) {
      var o = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (o[(a.severity || '').toUpperCase()] || 3) - (o[(b.severity || '').toUpperCase()] || 3);
    });
    var esRY = esEndY + 20;
    esRisks.forEach(function(r) {
      if (esRY > CBOT - 28) return;
      var sev = (r.severity || '').toUpperCase();
      var bc  = sev === 'HIGH' ? '#ef4444' : sev === 'MEDIUM' ? '#f97316' : '#22c55e';
      var bg  = sev === 'HIGH' ? '#FEF2F2' : sev === 'MEDIUM' ? '#FFF7ED' : '#F0FDF4';
      var rt  = (r.risk || r.description || '').replace(/\*\*/g, '');
      var et  = (r.explanation || '').replace(/\*\*/g, '');
      doc.rect(50, esRY, W, 24).fill(bg);
      doc.rect(50, esRY, 3, 24).fill(bc);
      doc.roundedRect(57, esRY + 5, 32, 12, 2).fill(bc);
      doc.fontSize(6.5).fillColor(WHITE).font('Helvetica-Bold')
        .text(sev.slice(0, 3), 57, esRY + 8, { width: 32, align: 'center', lineBreak: false });
      doc.fontSize(7.5).fillColor(NAVY).font('Helvetica-Bold')
        .text(rt.length > 70 ? rt.slice(0, 67) + '…' : rt, 94, esRY + 2, { width: 240, lineBreak: false });
      doc.fontSize(7).fillColor(GREY).font('Helvetica')
        .text(et.length > 100 ? et.slice(0, 97) + '…' : et, 94, esRY + 13, { width: W - 50, lineBreak: false });
      esRY += 26;
    });
    doc.y = esRY + 4;
  }

  // ── Agreement Profile ──────────────────────────────────────────────────────
  if (metaData) {
    secHdr('Agreement Profile');

    // Intro banner
    doc.rect(50, doc.y, W, 22).fill('#F1F5F9');
    doc.rect(50, doc.y, 3, 22).fill(GOLD);
    doc.fontSize(8).fillColor(GREY).font('Helvetica-Oblique')
      .text('Structured metadata extracted by AI from the contract document.',
            60, doc.y + 7, { width: W - 20, lineBreak: false });
    doc.y += 30;

    var apFields = [
      ['Contract Type',    metaData.contractType                        || '—'],
      ['Parties',          metaData.parties                             || '—'],
      ['Effective Date',   metaData.effectiveDate                       || '—'],
      ['Term / Duration',  metaData.term                                || '—'],
      ['Governing Law',    metaData.governingLaw                        || '—'],
      ['Jurisdiction',     metaData.jurisdiction || metaData.governingLaw || '—'],
      ['Contract Value',   metaData.totalValue   || metaData.contractValue || '—'],
      ['Renewal Terms',    metaData.renewalTerms || metaData.renewal       || '—'],
    ];
    var apRH = 26, apY = doc.y;
    apFields.forEach(function(f, i) {
      if (apY + apRH > CBOT) { doc.addPage(); apY = 98; }
      var bg = i % 2 === 0 ? '#F8FAFC' : WHITE;
      doc.rect(50, apY, W, apRH).fill(bg);
      doc.rect(50, apY, 3, apRH).fill(GOLD);
      doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold')
        .text(f[0], 60, apY + 8, { width: 140, lineBreak: false });
      var val = String(f[1]).replace(/\*\*/g, '');
      doc.fontSize(9).fillColor(GREY).font('Helvetica')
        .text(val, 205, apY + 8, { width: W - 158, lineBreak: false, ellipsis: true });
      apY += apRH;
    });
    doc.y = apY + 12;
  }

  // ── Key Clauses ────────────────────────────────────────────────────────────
  secHdr('Key Clauses');
  if (clauseData.length > 0) {
    drawTable(
      ['Clause', 'Location', 'Summary'],
      clauseData.map(function(c) { return [c.clauseName || c.name || '--', c.location || '--', c.summary || '--']; }),
      [135, 75, W - 210]
    );
  } else {
    doc.fontSize(10).fillColor(GREY).text('No clause data available.', 50, doc.y);
  }

  // ── Risk Assessment ────────────────────────────────────────────────────────
  secHdr('Risk Assessment');

  // Count tiles
  var tileW = Math.floor((W - 10) / 3);
  var tileH = 56;
  var tileY = doc.y;
  [
    [String(riskCounts.h), 'HIGH RISK',   '#ef4444', '#FEF2F2'],
    [String(riskCounts.m), 'MEDIUM RISK', '#f97316', '#FFF7ED'],
    [String(riskCounts.l), 'LOW RISK',    '#22c55e', '#F0FDF4'],
  ].forEach(function(t, i) {
    var tx = 50 + i * (tileW + 5);
    doc.roundedRect(tx, tileY, tileW, tileH, 4).fill(t[3]);
    doc.rect(tx, tileY, tileW, 3).fill(t[2]);
    doc.fontSize(26).fillColor(t[2]).font('Helvetica-Bold').text(t[0], tx, tileY + 8,  { width: tileW, align: 'center' });
    doc.fontSize(7).fillColor(t[2]).font('Helvetica-Bold').text(t[1], tx, tileY + 40, { width: tileW, align: 'center' });
  });
  doc.y = tileY + tileH + 14;

  // Horizontal risk distribution bar
  var raBarTotal = riskCounts.h + riskCounts.m + riskCounts.l || 1;
  var raBarH = 10, raBarY = doc.y;
  doc.fontSize(7).fillColor(GREY).font('Helvetica-Bold')
    .text('Risk Distribution', 50, raBarY, { lineBreak: false });
  raBarY += 12;
  var raBarX = 50;
  [[riskCounts.h, '#ef4444'], [riskCounts.m, '#f97316'], [riskCounts.l, '#22c55e']].forEach(function(s) {
    if (s[0] === 0) return;
    var bw = Math.round((s[0] / raBarTotal) * W);
    doc.rect(raBarX, raBarY, bw, raBarH).fill(s[1]);
    raBarX += bw;
  });

  // Severity legend
  var raLegY = raBarY + raBarH + 6;
  [['#ef4444', 'High Risk'], ['#f97316', 'Medium Risk'], ['#22c55e', 'Low Risk']].forEach(function(leg, i) {
    var lx = 50 + i * 100;
    doc.roundedRect(lx, raLegY, 8, 8, 1).fill(leg[0]);
    doc.fontSize(7).fillColor(GREY).font('Helvetica').text(leg[1], lx + 11, raLegY + 1, { lineBreak: false });
  });
  doc.y = raLegY + 18;

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

  // ── Obligations & Deadlines ────────────────────────────────────────────────
  secHdr('Obligations & Deadlines');
  doc.rect(50, doc.y, W, 22).fill('#F1F5F9');
  doc.rect(50, doc.y, 3, 22).fill(GOLD);
  doc.fontSize(8).fillColor(GREY).font('Helvetica-Oblique')
    .text('Contractual duties, deadlines, and consequences of non-performance extracted from the agreement.',
          60, doc.y + 7, { width: W - 20, lineBreak: false });
  doc.y += 30;
  if (obligData.length > 0) {
    drawTable(
      ['Party', 'Obligation', 'Deadline', 'Consequence'],
      obligData.map(function(o) { return [o.party || '--', o.obligation || '--', o.deadline || '--', o.consequence || '--']; }),
      [80, 160, 85, W - 325]
    );
  } else {
    doc.fontSize(10).fillColor(GREY).text('No obligations data available.', 50, doc.y);
  }

  // ── Compliance Flags ───────────────────────────────────────────────────────
  secHdr('Compliance & Legal Issues');
  if (compData.length > 0) {
    for (var cli = 0; cli < compData.length; cli++) {
      var item = compData[cli];
      if (doc.y > CBOT - 40) { doc.addPage(); doc.y = 98; }
      var sev  = (item.severity || item.level || '').toUpperCase();
      var text = String(item.issue || item.description || item).replace(/\*\*/g, '');
      var calloutType = sev === 'HIGH' ? 'WARNING' : sev === 'LOW' ? 'TIP' : 'NOTE';
      drawCallout(calloutType, (sev ? sev + ': ' : '') + text);
    }
  } else {
    doc.fontSize(10).fillColor(GREY).text('No compliance flags identified.', 50, doc.y);
  }

  // ── Missing Protections ────────────────────────────────────────────────────
  secHdr('Missing Protections');
  if (missingData.length > 0) {
    drawCallout('WARNING', 'The following standard clauses are absent from this contract. Missing protections can be as dangerous as unfavorable clauses — they leave gaps the other party can exploit.');
    doc.y += 4;
    for (var mpi = 0; mpi < missingData.length; mpi++) {
      if (doc.y > CBOT - 28) { doc.addPage(); doc.y = 98; }
      var mptext = String(missingData[mpi] || '').replace(/\*\*/g, '');
      var mpy = doc.y;
      doc.rect(50, mpy + 4, 5, 5).fill(RED);
      doc.fontSize(10).fillColor(NAVY).font('Helvetica').text(mptext, 64, mpy, { width: W - 14 });
      doc.y += 4;
    }
  } else {
    doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
      .text('No missing protections identified — all standard clauses are present.', 50, doc.y);
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  secHdr('Recommendations');

  // Priority legend
  var recLegY = doc.y;
  [['P0', RED, 'Critical — Act immediately'],
   ['P1', '#E64A19', 'High — Before signing'],
   ['P2', AMBER, 'Medium — Negotiate'],
   ['P3', GREEN, 'Low — Best practice']].forEach(function(pl, i) {
    var plx = 50 + i * 120;
    doc.rect(plx, recLegY, 22, 13).fill(pl[1]);
    doc.fontSize(7).fillColor(WHITE).font('Helvetica-Bold')
      .text(pl[0], plx, recLegY + 3, { width: 22, align: 'center', lineBreak: false });
    doc.fontSize(7).fillColor(GREY).font('Helvetica')
      .text(pl[2], plx + 26, recLegY + 3, { lineBreak: false });
  });
  doc.y = recLegY + 22;

  if (recoData.length > 0) {
    var badgeColors = { P0: RED, P1: '#E64A19', P2: AMBER, P3: GREEN, P4: '#5C6BC0' };
    for (var rli = 0; rli < recoData.length; rli++) {
      var reco = recoData[rli];
      if (doc.y > CBOT - 22) { doc.addPage(); doc.y = 98; }
      var pri   = reco.priority || ('P' + (rli + 1));
      var bc    = badgeColors[pri] || NAVY;
      var rtext = String(reco.recommendation || reco.action || reco.description || '').replace(/\*\*/g, '');
      var iy    = doc.y;
      var recoSev = pri === 'P0' ? '#FEF2F2' : pri === 'P1' ? '#FFF7ED' : pri === 'P2' ? '#FFFBEB' : '#F0FDF4';
      doc.rect(50, iy, W, 0).fill(recoSev); // placeholder — height set after text
      doc.rect(50, iy, 28, 16).fill(bc);
      doc.fontSize(8).fillColor(WHITE).font('Helvetica-Bold').text(pri, 50, iy + 4, { width: 28, align: 'center', lineBreak: false });
      doc.fontSize(9.5).fillColor(NAVY).font('Helvetica').text(rtext, 84, iy, { width: W - 34, lineGap: 2 });
      doc.y += 8;
    }
  } else {
    doc.fontSize(10).fillColor(GREY).text('No recommendations available.', 50, doc.y);
  }

  doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Contract Analyzer running on http://localhost:' + PORT); });
