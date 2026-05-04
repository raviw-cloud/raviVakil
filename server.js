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

  const SLATE = '#1E293B', BLUE = '#B45309', WHITE = '#FFFFFF', LIGHTBG = '#F3F4F6';
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
    doc.rect(0, 0, 595, 48).fill(SLATE);
    doc.rect(0, 48, 595, 3).fill(BLUE);
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
    // Left accent bar + title
    doc.rect(50, 60, 4, 26).fill(BLUE);
    doc.fontSize(18).fillColor(SLATE).font('Helvetica-Bold').text(title, 62, 60, { width: W - 12 });
    // Bottom rule under heading
    doc.moveTo(50, 88).lineTo(545, 88).lineWidth(0.5).strokeColor(BLUE).stroke();
    doc.y = CTOP;
  }

  // Callout block for NOTE / WARNING / TIP
  function drawCallout(type, text) {
    var map = { WARNING: [RED, '#FEF2F2'], NOTE: [BLUE, '#FFFBEB'], TIP: [GREEN, '#F0FDF4'] };
    var pair = map[type] || [GREY, LIGHTBG];
    var border = pair[0], bg = pair[1];
    var startY = doc.y;
    var textH = doc.heightOfString(text, { width: W - 24 });
    var h = textH + 28;
    doc.rect(50, startY, W, h).fill(bg);
    doc.rect(50, startY, 4, h).fill(border);
    doc.fontSize(8).fillColor(border).font('Helvetica-Bold')
      .text(type, 62, startY + 7, { width: 60, lineBreak: false });
    doc.fontSize(9).fillColor(SLATE).font('Helvetica')
      .text(text, 62, startY + 18, { width: W - 24 });
    doc.y = startY + h + 8;
  }

  // Table renderer — uses structured arrays, no markdown
  function drawTable(headers, rows, cols) {
    var RH = 22, FS = 8, LH = 10, PAD = 6;
    var y = doc.y;
    function hdr(atY) {
      doc.rect(50, atY, W, RH).fill(SLATE);
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
        var color = u === 'HIGH' ? RED : u === 'MEDIUM' ? AMBER : u === 'LOW' ? GREEN : SLATE;
        doc.fontSize(FS).fillColor(color).font('Helvetica')
          .text(s, x2 + 4, y + PAD, { width: cols[ci2] - 8, lineBreak: true, height: cellH - PAD, ellipsis: true });
        x2 += cols[ci2];
      }
      y += cellH;
    }
    doc.y = y + 8;
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  doc.addPage();
  var sc = score >= 70 ? GREEN : score >= 50 ? AMBER : RED;
  var recC = recommendation === 'SIGN' ? GREEN : recommendation === 'NEGOTIATE' ? AMBER : RED;

  // Top band: 0–185 (text stays well below y=185, safe from auto-page)
  doc.rect(0, 0, 595, 185).fill(SLATE);
  doc.rect(0, 185, 595, 4).fill(BLUE);
  doc.fontSize(26).fillColor(WHITE).font('Helvetica-Bold')
    .text('CONTRACT REVIEW REPORT', 50, 62, { width: W, align: 'center' });
  doc.fontSize(12).fillColor(LIGHTBG).font('Helvetica')
    .text('AI-Powered Neutral Legal Analysis', 50, 102, { width: W, align: 'center' });
  doc.fontSize(9).fillColor(LIGHTBG).font('Helvetica')
    .text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }), 50, 128, { width: W, align: 'center' });

  // Score panel — horizontal card replacing the isolated circle
  var panelY = 208, panelH = 124;
  doc.roundedRect(50, panelY, W, panelH, 5).fill(LIGHTBG);
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
  // Right: verdict badge
  doc.roundedRect(308, panelY + 20, 220, 84, 4).fill(recC);
  doc.fontSize(9).fillColor(WHITE).font('Helvetica')
    .text('VERDICT', 308, panelY + 32, { width: 220, align: 'center', lineBreak: false });
  doc.fontSize(20).fillColor(WHITE).font('Helvetica-Bold')
    .text(recommendation, 308, panelY + 52, { width: 220, align: 'center', lineBreak: false });

  // Risk count row
  var rY = panelY + panelH + 22, rW = 150, rH = 56;
  var rboxes = [[String(riskCounts.h), 'HIGH RISK', RED], [String(riskCounts.m), 'MEDIUM RISK', AMBER], [String(riskCounts.l), 'LOW RISK', GREEN]];
  for (var rbi = 0; rbi < rboxes.length; rbi++) {
    var rbx = 50 + rbi * (rW + 12);
    doc.roundedRect(rbx, rY, rW, rH, 4).fill(rboxes[rbi][2]);
    doc.fontSize(24).fillColor(WHITE).font('Helvetica-Bold').text(rboxes[rbi][0], rbx, rY + 6, { width: rW, align: 'center' });
    doc.fontSize(7).fillColor(WHITE).font('Helvetica').text(rboxes[rbi][1], rbx, rY + 36, { width: rW, align: 'center' });
  }

  // Summary snippet (first 240 chars)
  var snipY = rY + rH + 28;
  var snip = summaryText.length > 240 ? summaryText.substring(0, 240) + '…' : summaryText;
  doc.fontSize(9).fillColor(GREY).font('Helvetica-Oblique')
    .text(snip, 50, snipY, { width: W, align: 'justify', lineGap: 2 });

  // Document metadata (positioned after snippet, dynamic y)
  var metaY = doc.y + 22;
  doc.moveTo(50, metaY).lineTo(545, metaY).lineWidth(0.5).strokeColor(LIGHTBG).stroke();
  metaY += 12;
  doc.fontSize(8).fillColor(SLATE).font('Helvetica-Bold')
    .text('Document', 50, metaY, { width: 80, lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text(filename, 135, metaY, { width: W - 85, lineBreak: false });
  doc.fontSize(8).fillColor(SLATE).font('Helvetica-Bold')
    .text('Review Type', 50, metaY + 14, { width: 80, lineBreak: false });
  doc.fontSize(8).fillColor(GREY).font('Helvetica')
    .text('Neutral Legal Analysis — AI Legal Assistant', 135, metaY + 14, { width: W - 85, lineBreak: false });

  // Bottom band — ALL text kept at y < 792 (pdfkit safe zone: page_height 842 − margin 50 = 792)
  // Band starts at 630; text at 656 and 674 — both safe
  doc.rect(0, 630, 595, 212).fill(SLATE);
  doc.rect(0, 630, 595, 3).fill(BLUE);
  doc.fontSize(9).fillColor(LIGHTBG).font('Helvetica')
    .text('AI Legal Assistant', 50, 656, { width: W, align: 'center' });
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text('This report is for informational purposes only and does not constitute legal advice.',
          50, 674, { width: W, align: 'center' });

  cover = false;

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

  // ── Obligations & Deadlines ────────────────────────────────────────────────
  secHdr('Obligations & Deadlines');
  if (obligData.length > 0) {
    drawTable(
      ['Party', 'Obligation', 'Deadline', 'Consequence'],
      obligData.map(function(o) { return [o.party || '--', o.obligation || '--', o.deadline || '--', o.consequence || '--']; }),
      [90, 155, 85, W - 330]
    );
  } else {
    doc.fontSize(10).fillColor(GREY).text('No obligations data available.', 50, doc.y);
  }

  // ── Compliance Flags ───────────────────────────────────────────────────────
  secHdr('Compliance Flags');
  if (compData.length > 0) {
    for (var cli = 0; cli < compData.length; cli++) {
      var item = compData[cli];
      if (doc.y > CBOT - 40) { doc.addPage(); doc.y = CTOP; }
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
      if (doc.y > CBOT - 28) { doc.addPage(); doc.y = CTOP; }
      var mptext = String(missingData[mpi] || '').replace(/\*\*/g, '');
      var mpy = doc.y;
      doc.rect(50, mpy + 4, 5, 5).fill(RED);
      doc.fontSize(10).fillColor(SLATE).font('Helvetica').text(mptext, 64, mpy, { width: W - 14 });
      doc.y += 4;
    }
  } else {
    doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
      .text('No missing protections identified — all standard clauses are present.', 50, doc.y);
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  secHdr('Recommendations');
  if (recoData.length > 0) {
    var badgeColors = { P0: RED, P1: '#E64A19', P2: AMBER, P3: GREEN, P4: '#5C6BC0' };
    for (var rli = 0; rli < recoData.length; rli++) {
      var reco = recoData[rli];
      if (doc.y > CBOT - 22) { doc.addPage(); doc.y = CTOP; }
      var pri   = reco.priority || ('P' + (rli + 1));
      var bc    = badgeColors[pri] || SLATE;
      var rtext = String(reco.recommendation || reco.action || reco.description || '').replace(/\*\*/g, '');
      var iy    = doc.y;
      doc.rect(50, iy, 26, 15).fill(bc);
      doc.fontSize(7.5).fillColor(WHITE).font('Helvetica-Bold').text(pri, 50, iy + 4, { width: 26, align: 'center', lineBreak: false });
      doc.fontSize(9.5).fillColor(SLATE).font('Helvetica').text(rtext, 82, iy, { width: W - 32, lineGap: 2 });
      doc.y += 6;
    }
  } else {
    doc.fontSize(10).fillColor(GREY).text('No recommendations available.', 50, doc.y);
  }

  doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Contract Analyzer running on http://localhost:' + PORT); });
