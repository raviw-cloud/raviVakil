require('dotenv').config({ override: true });

const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const score = require('./lib/score');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const skills = {
  clauses: fs.readFileSync('./agents/legal-clauses.md', 'utf8'),
  risks: fs.readFileSync('./agents/legal-risks.md', 'utf8'),
  compliance: fs.readFileSync('./agents/legal-compliance.md', 'utf8'),
  terms: fs.readFileSync('./agents/legal-terms.md', 'utf8'),
  recommendations: fs.readFileSync('./agents/legal-recommendations.md', 'utf8')
};

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// TEST_MODE: forces economy mode and tighter limits to keep per-report cost under TEST_COST_CEILING.
// Set TEST_MODE=true in .env during local development. Remove or set to false before deploying.
const TEST_MODE = (process.env.TEST_MODE || 'false').toLowerCase() === 'true';
const TEST_COST_CEILING = Number(process.env.TEST_COST_CEILING || 0.05);
const TEST_TEXT_LIMIT = Number(process.env.TEST_TEXT_LIMIT || 2500);
const TEST_MAX_OUTPUT_TOKENS = Number(process.env.TEST_MAX_OUTPUT_TOKENS || 1500);

const REVIEW_DEPTH = TEST_MODE ? 'economy' : (process.env.REVIEW_DEPTH || 'economy').toLowerCase();
const ECONOMY_TEXT_LIMIT = TEST_MODE ? TEST_TEXT_LIMIT : Number(process.env.ECONOMY_TEXT_LIMIT || 6000);
const FULL_TEXT_LIMIT = Number(process.env.FULL_TEXT_LIMIT || 12000);
const CLAUSE_TEXT_LIMIT = Number(process.env.CLAUSE_TEXT_LIMIT || 6000);
const ECONOMY_MAX_OUTPUT_TOKENS = TEST_MODE ? TEST_MAX_OUTPUT_TOKENS : Number(process.env.ECONOMY_MAX_OUTPUT_TOKENS || 20000);

if (TEST_MODE) {
  console.log(`[config] TEST_MODE active — economy mode forced, text limit=${ECONOMY_TEXT_LIMIT} chars, max_tokens=${ECONOMY_MAX_OUTPUT_TOKENS}, cost ceiling=$${TEST_COST_CEILING}`);
}
const reportCache = new Map();

const analyzeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait 15 minutes before analyzing again.' }
});

app.use(express.static('public'));
app.use(express.json());

function extractText(rawText, limit = FULL_TEXT_LIMIT) {
  return rawText.length > limit ? rawText.slice(0, limit) + '\n...[truncated]' : rawText;
}

function isUsableText(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 30) return false;
  const words = normalized.match(/[a-zA-Z]{3,}/g) || [];
  return words.length >= 8;
}

async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S1 (pdf-parse) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S1 returned insufficient text, trying S2');
  } catch (e) {
    console.warn('[pdf] S1 threw:', e.message, 'trying S2');
  }

  try {
    const data = await pdfParse(buffer, {
      pagerender(pageData) {
        return pageData.getTextContent({ normalizeWhitespace: true }).then(function (tc) {
          let out = '';
          let lastY = null;
          for (let i = 0; i < tc.items.length; i++) {
            const item = tc.items[i];
            if (!item.str) continue;
            const y = item.transform != null ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) out += '\n';
            out += item.str;
            lastY = y;
          }
          return out;
        });
      }
    });

    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S2 (item renderer) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S2 returned insufficient text, trying S3');
  } catch (e) {
    console.warn('[pdf] S2 threw:', e.message, 'trying S3');
  }

  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise;

    let out = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const tc = await page.getTextContent({ normalizeWhitespace: true });
      let lastY = null;
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
  } catch (e) {
    console.warn('[pdf] S3 threw:', e.message);
  }

  return null;
}

function parseAgentJson(raw) {
  if (!raw || typeof raw !== 'string') return { parseError: true };

  const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fm) {
    try {
      return JSON.parse(fm[1].trim());
    } catch {}
  }

  const findJson = (str, o, c) => {
    const s = str.indexOf(o);
    if (s === -1) return null;
    let d = 0;
    for (let i = s; i < str.length; i++) {
      if (str[i] === o) d++;
      else if (str[i] === c) {
        d--;
        if (d === 0) return str.slice(s, i + 1);
      }
    }
    return null;
  };

  const obj = findJson(raw, '{', '}');
  if (obj) {
    try {
      return JSON.parse(obj);
    } catch {}
  }

  const arr = findJson(raw, '[', ']');
  if (arr) {
    try {
      return JSON.parse(arr);
    } catch {}
  }

  try {
    return JSON.parse(raw.trim());
  } catch {}

  console.warn('[parseAgentJson] failed:', raw.slice(0, 200));
  return { raw, parseError: true };
}

function estimateClaudeCost(responses) {
  const list = Array.isArray(responses) ? responses : [responses];
  const usage = list.reduce(
    (totals, response) => {
      const u = response.usage || {};
      totals.input += u.input_tokens || 0;
      totals.output += u.output_tokens || 0;
      totals.cacheWrite += u.cache_creation_input_tokens || 0;
      totals.cacheRead += u.cache_read_input_tokens || 0;
      return totals;
    },
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  );

  return {
    ...usage,
    dollars: (
      (usage.input / 1e6) * 1.0 +
      (usage.output / 1e6) * 5.0 +
      (usage.cacheWrite / 1e6) * 1.25 +
      (usage.cacheRead / 1e6) * 0.1
    ).toFixed(4)
  };
}

function buildEconomyReviewPrompt(documentText) {
  return `Review this uploaded legal document under Indian law.

Return ONLY valid JSON in this exact top-level shape (no markdown, no commentary):
{
  "clauses": {
    "clauses": [
      {
        "id":"CL1",
        "clauseName":"...",
        "location":"Section x.x",
        "summary":"Plain-English one-liner",
        "severity":"HIGH|MEDIUM|LOW",
        "completeness": 0
      }
    ],
    "metadata": {
      "documentTitle":"...","documentType":"...","contractType":"...",
      "parties":"...","effectiveDate":"...","term":"...",
      "governingLaw":"...","jurisdiction":"...","state":"...",
      "subjectMatter":"...","totalValue":"...",
      "registrationDetails":"...","stampDuty":"..."
    },
    "missingProtections": [
      {"name":"Force Majeure","criticality":"CRITICAL|IMPORTANT","reason":"..."}
    ],
    "summary":"Two sentence executive summary."
  },
  "risks": {
    "risks": [
      {
        "id":"R1",
        "section":"Section x.x",
        "title":"Short risk title",
        "summary":"1-2 sentence plain-English description",
        "categories":["FE","UL"],
        "severity":"HIGH|MEDIUM|LOW",
        "scores": {"severity":1, "likelihood":1, "financial":1, "asymmetry":1},
        "composite": 1,
        "financialExposure":"<₹1L|₹1L-5L|₹5L-25L|₹25L-1Cr|>₹1Cr|Uncapped",
        "poisonPill": false,
        "benefits":"Party A|Party B|Balanced",
        "rationale":"Why this is dangerous",
        "redline":"Specific replacement language"
      }
    ],
    "overallRiskRating":"CRITICAL|HIGH|MODERATE|LOW",
    "totalEstimatedExposure":"₹X or 'Uncapped'",
    "signingRecommendation":"SIGN|NEGOTIATE|ESCALATE|REJECT"
  },
  "compliance": {
    "issues": [
      {
        "id":"C1",
        "issue":"...",
        "severity":"HIGH|MEDIUM|LOW",
        "statute":"Indian Contract Act 1872",
        "section":"S.27",
        "clauseLocation":"Section x.x",
        "quote":"Verbatim text, max 240 chars",
        "enforceability":"VOID|VOIDABLE|ENFORCEABLE_WITH_RISK|ENFORCEABLE",
        "fix":"One-sentence cure"
      }
    ]
  },
  "terms": {
    "termOverview": {
      "type":"...",
      "effectiveDate":"...",
      "initialTerm":"...",
      "autoRenewal": false,
      "renewalTerm":"...",
      "optOutNoticeDays": 0,
      "terminationForConvenience": {"available": false, "byParty":"either|partyA|partyB", "noticeDays": 0},
      "governingLaw":"India"
    },
    "obligations": [
      {
        "id":"OB1","section":"x.x","obligatedParty":"Contractor|Company|Both",
        "type":"PERF|PAY|NOTC|APPR|RPT|INS|COMP|REST|COND|SURV",
        "description":"...",
        "trigger":{"kind":"Calendar|Event|Condition|Milestone|Rolling|Continuous|Negative","detail":"..."},
        "deadline":"YYYY-MM-DD or descriptive",
        "curePeriodDays": 0,
        "consequenceOfBreach":"...",
        "consequenceSeverity":"HIGH|MEDIUM|LOW"
      }
    ],
    "timeline": [
      {
        "id":"TL1","date":"YYYY-MM-DD or descriptive",
        "label":"...",
        "kind":"MILESTONE|DEADLINE|RECURRING|RENEWAL_WINDOW|POST_TERMINATION",
        "obligationIds":["OB1"],
        "critical": false
      }
    ]
  },
  "recommendations": {
    "recommendations": [
      {
        "id":"REC1",
        "priority":"P0|P1|P2|P3|P4",
        "type":"REP|MOD|ADD|DEL|CO|CAP|MUT|CLR",
        "section":"x.x",
        "linkedRiskId":"R1",
        "title":"...",
        "currentClause":"Verbatim or truncated",
        "issue":"2-3 sentence explanation",
        "recommendedLanguage":"Replacement text",
        "riskScoreBefore": 0,
        "riskScoreAfter": 0,
        "likelihoodOfAcceptance":"HIGH|MEDIUM|LOW"
      }
    ]
  }
}

SCORING RULES (the backend recomputes the final 0-100 Safety Score from this JSON, so be consistent):
- For each risk, composite = round(scores.severity*0.40 + scores.likelihood*0.25 + scores.financial*0.20 + scores.asymmetry*0.15) on 1-10.
- Severity tier: composite >=7 -> HIGH; 5-6 -> MEDIUM; <=4 -> LOW.
- financial score scale: 1-2=<₹1L; 3-4=₹1L-5L; 5-6=₹5L-25L; 7-8=₹25L-1Cr; 9-10=>₹1Cr or uncapped.
- poisonPill=true only when the clause is structurally hidden (buried in boilerplate / cross-reference chain / definition trap / incorporation by reference) or uses notwithstanding/sole-discretion/deemed-accepted language.
- missingProtections.criticality=CRITICAL only for: force majeure, limitation of liability, dispute resolution, data protection (when personal data is involved), termination for convenience.

OTHER RULES:
- Infer the document type from the text; do not assume it is a contract, lease, or license.
- India-law focused. Apply stamp/registration/state/employment/company/property/consumer/arbitration/tax/data/sector rules only when relevant.
- Return up to 4 clauses, 4 risks, 3 compliance issues, 4 obligations, 4 timeline entries, 4 recommendations.
- All text fields (summary, rationale, redline, recommendedLanguage, currentClause, issue, fix) must be 1 sentence max. Do not write paragraphs.
- Be concise but specific. Never invent numeric scores you cannot justify from the text.
- IDs must be unique within their array (CL1, R1, C1, OB1, TL1, REC1, ...).

DOCUMENT TEXT:
${documentText}`;
}

function normalizeReviewResultsShape(value) {
  const data = value && typeof value === 'object' ? value : {};
  const clausesBlock = data.clauses && !Array.isArray(data.clauses) ? data.clauses : {};
  const risksBlock = data.risks && !Array.isArray(data.risks) ? data.risks : {};
  const complianceBlock = data.compliance && !Array.isArray(data.compliance) ? data.compliance : {};
  const termsBlock = data.terms && !Array.isArray(data.terms) ? data.terms : {};
  const recommendationsBlock =
    data.recommendations && !Array.isArray(data.recommendations) ? data.recommendations : {};

  const rawMissing = asArray(clausesBlock.missingProtections || data.missingProtections);
  const missingProtections = rawMissing.map(m => {
    if (typeof m === 'string') return { name: m, criticality: 'IMPORTANT', reason: '' };
    return {
      name: m.name || m.protection || '',
      criticality: String(m.criticality || 'IMPORTANT').toUpperCase() === 'CRITICAL' ? 'CRITICAL' : 'IMPORTANT',
      reason: m.reason || '',
      suggestedRemedy: m.suggestedRemedy || ''
    };
  });

  return {
    clauses: {
      clauses: asArray(clausesBlock.clauses || data.clauses),
      metadata: clausesBlock.metadata || data.metadata || {},
      missingProtections,
      summary: clausesBlock.summary || data.summary || ''
    },
    risks: {
      risks: asArray(risksBlock.risks || data.risks),
      overallRiskRating: risksBlock.overallRiskRating || '',
      totalEstimatedExposure: risksBlock.totalEstimatedExposure || '',
      signingRecommendation: risksBlock.signingRecommendation || ''
    },
    compliance: {
      issues: asArray(complianceBlock.issues || complianceBlock.flags || data.issues || data.compliance)
    },
    terms: {
      termOverview: termsBlock.termOverview || {},
      obligations: asArray(termsBlock.obligations || data.obligations || data.terms),
      timeline: asArray(termsBlock.timeline),
      autoRenewalTraps: asArray(termsBlock.autoRenewalTraps),
      financialExposure: termsBlock.financialExposure || {}
    },
    recommendations: {
      recommendations: asArray(recommendationsBlock.recommendations || data.recommendations),
      walkAways: asArray(recommendationsBlock.walkAways)
    }
  };
}

function hasUsableReviewResults(results) {
  return Boolean(
    results &&
      !results.parseError &&
      (
        asArray(results.clauses?.clauses).length ||
        asArray(results.risks?.risks).length ||
        asArray(results.compliance?.issues).length ||
        asArray(results.terms?.obligations).length ||
        asArray(results.recommendations?.recommendations).length
      )
  );
}

const calculateScore = score.calculateScore;
const scoreToGrade = score.scoreToGrade;
const scoreToRec = score.scoreToRec;

function isPdfBuffer(buf) {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return 'Not specified';
}

function severityOf(item) {
  return String(item.severity || item.level || 'MEDIUM').toUpperCase();
}

function riskClass(severity) {
  const sev = String(severity || '').toUpperCase();
  if (sev === 'HIGH' || sev === 'CRITICAL') return 'high';
  if (sev === 'LOW') return 'low';
  return 'medium';
}

function safeReportBaseName(filename) {
  const baseName = (filename || 'legal-document')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9_\-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return baseName || 'legal-document';
}

function normalizeLegalReviewData(cached) {
  const { results, score, grade, recommendation, filename } = cached;

  const meta = results.clauses?.metadata || {};
  const clauses = asArray(results.clauses?.clauses);
  const risks = asArray(results.risks?.risks);
  const obligations = asArray(results.terms?.obligations);
  const recommendations = asArray(results.recommendations?.recommendations);
  const complianceIssues = asArray(results.compliance?.issues || results.compliance?.flags || results.compliance?.violations);
  const missingProtections = asArray(results.clauses?.missingProtections);

  const highRisks = risks.filter(r => ['HIGH', 'CRITICAL'].includes(severityOf(r)));
  const mediumRisks = risks.filter(r => severityOf(r) === 'MEDIUM');
  const lowRisks = risks.filter(r => severityOf(r) === 'LOW');

  return {
    filename,
    score,
    grade,
    recommendation,
    summary: results.clauses?.summary || 'Analysis complete.',
    documentTitle: firstText(meta.documentTitle, meta.title, filename),
    documentType: firstText(meta.documentType, meta.contractType, 'Legal Document'),
    partiesText: firstText(meta.parties),
    effectiveDate: firstText(meta.effectiveDate, meta.executionDate, meta.agreementDate),
    term: firstText(meta.term, meta.duration),
    governingLaw: firstText(meta.governingLaw),
    jurisdiction: firstText(meta.jurisdiction, meta.state, meta.placeOfExecution),
    subjectMatter: firstText(meta.subjectMatter, meta.propertyAddress, meta.property, meta.purpose),
    totalValue: firstText(meta.totalValue, meta.contractValue, meta.consideration),
    registrationDetails: firstText(meta.registrationDetails, meta.registrationNumber),
    stampDuty: firstText(meta.stampDuty, meta.stampDetails),
    clauses,
    risks,
    highRisks,
    mediumRisks,
    lowRisks,
    obligations,
    complianceIssues,
    recommendations,
    missingProtections,
    results
  };
}

function renderCards(items, renderer, emptyText) {
  if (!items.length) return `<p class="empty">${esc(emptyText)}</p>`;
  return items.map(renderer).join('');
}

function buildGenericLegalReviewHtml(vm) {
  const currentDate = new Date().toLocaleDateString('en-IN');
  const riskBadge = vm.score >= 70 ? 'low' : vm.score >= 50 ? 'medium' : 'high';
  const riskLabel = vm.score >= 70 ? 'Low Risk' : vm.score >= 50 ? 'Medium Risk' : 'High Risk';

  const profileRows = [
    ['Document Type', vm.documentType],
    ['Parties', vm.partiesText],
    ['Effective / Execution Date', vm.effectiveDate],
    ['Term / Duration', vm.term],
    ['Governing Law', vm.governingLaw],
    ['Indian State / Jurisdiction', vm.jurisdiction],
    ['Subject Matter', vm.subjectMatter],
    ['Total Value / Consideration', vm.totalValue],
    ['Registration Details', vm.registrationDetails],
    ['Stamp Duty Details', vm.stampDuty]
  ]
    .filter(([, value]) => value && value !== 'Not specified')
    .map(
      ([label, value]) => `
      <div class="profile-item">
        <div class="profile-label">${esc(label)}</div>
        <div class="profile-value">${esc(value)}</div>
      </div>
    `
    )
    .join('');

  const clauseRows = (vm.clauses.length ? vm.clauses : vm.risks)
    .slice(0, 10)
    .map(
      c => `
      <tr>
        <td><strong>${esc(c.clauseName || c.name || c.risk || 'Clause')}</strong></td>
        <td>${esc(c.location || c.position || c.clauseRef || 'Not specified')}</td>
        <td><span class="severity-${riskClass(severityOf(c))}">${esc(severityOf(c))}</span></td>
        <td>${esc(c.summary || c.explanation || '')}</td>
      </tr>
    `
    )
    .join('');

  const riskCards = renderCards(
    vm.risks.slice(0, 8),
    r => {
      const sev = severityOf(r);
      const cls = riskClass(sev);
      return `
      <div class="card ${cls}">
        <div class="card-title">${esc(sev)} RISK: ${esc(r.risk || 'Risk item')}</div>
        <p class="card-text">
          <strong>Issue:</strong> ${esc(r.risk || '')}<br><br>
          <strong>Impact:</strong> ${esc(r.explanation || '')}<br><br>
          <strong>Location:</strong> ${esc(r.clauseRef || r.location || 'Not specified')}
        </p>
      </div>
    `;
    },
    'No specific risks were returned by the review.'
  );

  const timelineItems = renderCards(
    vm.obligations.slice(0, 6),
    o => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-date">${esc(o.deadline || 'Not specified')}</div>
        <div class="timeline-text"><strong>${esc(o.party || 'Party')}:</strong> ${esc(o.obligation || '')} ${esc(
      o.consequence || ''
    )}</div>
      </div>
    </div>
  `,
    'No dated obligations were identified.'
  );

  const obligationsRows = vm.obligations
    .slice(0, 8)
    .map(
      o => `
      <tr>
        <td><strong>${esc(o.party || '')}</strong></td>
        <td>${esc(o.obligation || '')}</td>
        <td>${esc(o.deadline || '')}</td>
        <td>${esc(o.consequence || '')}</td>
      </tr>
    `
    )
    .join('');

  const complianceRows = vm.complianceIssues
    .slice(0, 8)
    .map(
      i => `
      <tr>
        <td><span class="severity-${riskClass(severityOf(i))}">${esc(severityOf(i))}</span></td>
        <td>${esc(i.issue || i.flag || i.violation || '')}</td>
        <td>${esc(i.statute || i.framework || i.law || 'Indian law review')}</td>
      </tr>
    `
    )
    .join('');

  const missingCards = renderCards(
    vm.missingProtections.slice(0, 8),
    m => `
      <div class="card critical">
        <div class="card-title">MISSING PROTECTION</div>
        <p class="card-text">
          ${esc(typeof m === 'string' ? m : m.protection || m.name || m.issue || '')}
        </p>
      </div>
    `,
    'No missing protections were identified.'
  );

  const recoCards = renderCards(
    vm.recommendations.slice(0, 8),
    r => {
      const pri = String(r.priority || 'P2').toUpperCase();
      const cls = pri === 'P0' ? 'critical' : pri === 'P1' ? 'high' : 'medium';
      return `
      <div class="card ${cls}">
        <div class="card-title">${esc(pri)}: ${esc(r.action || 'Recommendation')}</div>
        <p class="card-text">${esc(r.recommendation || '')}</p>
      </div>
    `;
    },
    'No recommendations were returned by the review.'
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>India Legal Document Review</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #f4f6f8; }
    .page { max-width: 960px; margin: 0 auto; background: #fff; min-height: 100vh; }
    .hero { background: #162235; color: #fff; padding: 34px 42px; }
    .eyebrow { color: #a7c7ff; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 8px; font-size: 30px; line-height: 1.2; }
    .subtitle { margin: 0; color: #d6deea; font-size: 14px; }
    .score-row { display: flex; gap: 16px; margin-top: 24px; flex-wrap: wrap; }
    .score-box { border: 1px solid rgba(255,255,255,.25); border-radius: 8px; padding: 14px 18px; min-width: 140px; }
    .score-value { font-size: 28px; font-weight: 700; }
    .score-label { color: #d6deea; font-size: 12px; text-transform: uppercase; }
    .section { padding: 24px 42px; border-bottom: 1px solid #e5e9ef; }
    h2 { margin: 0 0 14px; font-size: 18px; color: #162235; }
    p { line-height: 1.55; }
    .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .profile-item { border: 1px solid #e1e6ee; border-radius: 8px; padding: 10px 12px; }
    .profile-label { font-size: 11px; color: #66758a; text-transform: uppercase; margin-bottom: 4px; }
    .profile-value { font-size: 14px; color: #172033; }
    .dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .metric { border-radius: 8px; padding: 14px; border: 1px solid #e1e6ee; }
    .metric strong { display: block; font-size: 26px; }
    .metric.high { border-left: 5px solid #c0392b; }
    .metric.medium { border-left: 5px solid #d68910; }
    .metric.low { border-left: 5px solid #2e7d32; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #dfe5ed; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f1f4f8; color: #334155; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .card { border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px; break-inside: avoid; }
    .card.high, .card.critical { border-left: 5px solid #c0392b; }
    .card.medium { border-left: 5px solid #d68910; }
    .card.low { border-left: 5px solid #2e7d32; }
    .card-title { font-weight: 700; margin-bottom: 8px; color: #172033; }
    .card-text { margin: 0; font-size: 12px; }
    .severity-high { color: #a93226; font-weight: 700; }
    .severity-medium { color: #a15c00; font-weight: 700; }
    .severity-low { color: #1f7a3f; font-weight: 700; }
    .timeline-item { display: flex; gap: 10px; margin: 10px 0; }
    .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: #3662ff; margin-top: 5px; flex: 0 0 auto; }
    .timeline-date { font-weight: 700; color: #172033; }
    .timeline-text { font-size: 13px; color: #334155; }
    .empty { color: #66758a; font-style: italic; }
    .disclaimer { background: #fff7ed; color: #7c2d12; font-size: 12px; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="eyebrow">India-law focused AI review</div>
      <h1>${esc(vm.documentTitle)}</h1>
      <p class="subtitle">${esc(vm.documentType)} | Generated ${esc(currentDate)}</p>
      <div class="score-row">
        <div class="score-box ${esc(riskBadge)}"><div class="score-label">Safety Score</div><div class="score-value">${esc(vm.score)}/100</div></div>
        <div class="score-box"><div class="score-label">Grade</div><div class="score-value">${esc(vm.grade)}</div></div>
        <div class="score-box"><div class="score-label">Recommendation</div><div class="score-value">${esc(vm.recommendation)}</div></div>
        <div class="score-box"><div class="score-label">Risk Label</div><div class="score-value">${esc(riskLabel)}</div></div>
      </div>
    </section>
    <section class="section disclaimer">This AI-generated review is for general information only and is not legal advice. Consult a qualified advocate licensed in the relevant Indian jurisdiction before signing or acting on this document.</section>
    <section class="section"><h2>Executive Summary</h2><p>${esc(vm.summary)}</p></section>
    <section class="section"><h2>Document Profile</h2><div class="profile-grid">${profileRows || '<p class="empty">No document metadata was identified.</p>'}</div></section>
    <section class="section"><h2>Risk Dashboard</h2><div class="dashboard"><div class="metric high"><strong>${esc(vm.highRisks.length)}</strong>High / Critical</div><div class="metric medium"><strong>${esc(vm.mediumRisks.length)}</strong>Medium</div><div class="metric low"><strong>${esc(vm.lowRisks.length)}</strong>Low</div></div></section>
    <section class="section"><h2>Clause Review</h2><table><thead><tr><th>Clause</th><th>Location</th><th>Severity</th><th>Summary</th></tr></thead><tbody>${clauseRows || '<tr><td colspan="4">No clause inventory was returned.</td></tr>'}</tbody></table></section>
    <section class="section"><h2>Key Risks</h2><div class="cards">${riskCards}</div></section>
    <section class="section"><h2>Obligations and Deadlines</h2>${timelineItems}<table><thead><tr><th>Party</th><th>Obligation</th><th>Deadline</th><th>Consequence</th></tr></thead><tbody>${obligationsRows || '<tr><td colspan="4">No obligations were returned.</td></tr>'}</tbody></table></section>
    <section class="section"><h2>Compliance Flags</h2><table><thead><tr><th>Severity</th><th>Issue</th><th>Law / Framework</th></tr></thead><tbody>${complianceRows || '<tr><td colspan="3">No compliance flags were returned.</td></tr>'}</tbody></table></section>
    <section class="section"><h2>Missing Protections</h2><div class="cards">${missingCards}</div></section>
    <section class="section"><h2>Recommended Actions</h2><div class="cards">${recoCards}</div></section>
  </main>
</body>
</html>`;
}
app.post('/api/analyze', analyzeLimit, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded.' });
  if (!isPdfBuffer(req.file.buffer)) return res.status(400).json({ error: 'Only PDF files are accepted.' });

  try {
    const rawText = await extractPdfText(req.file.buffer);
    if (!rawText) {
      return res.status(422).json({
        error:
          'No selectable text found in this PDF. If it is a scanned document, please run it through an OCR tool first (e.g. Adobe Acrobat, ILovePDF) and re-upload.'
      });
    }

    const t0 = Date.now();
    let results;
    let responses;

    if (REVIEW_DEPTH === 'full') {
      const full = extractText(rawText, FULL_TEXT_LIMIT);
      const clause = extractText(rawText, CLAUSE_TEXT_LIMIT);
      const sys = name => [{ type: 'text', text: skills[name], cache_control: { type: 'ephemeral' } }];

      const [cR, rR, coR, tR, reR] = await Promise.all([
        client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 4000,
          system: sys('clauses'),
          messages: [
            {
              role: 'user',
              content:
                'Analyze this Indian legal document. First infer the document type from the text. Return ONLY valid JSON:\n{"clauses":[{"clauseName":"...","location":"...","summary":"...","severity":"HIGH|MEDIUM|LOW"}],"metadata":{"documentTitle":"...","documentType":"...","contractType":"...","parties":"...","effectiveDate":"...","term":"...","governingLaw":"...","jurisdiction":"...","state":"...","subjectMatter":"...","totalValue":"...","registrationDetails":"...","stampDuty":"..."},"missingProtections":["missing protection 1","missing protection 2"],"score":0-100,"summary":"2 sentences"}\n\n' +
                full
            }
          ]
        }),
        client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 2500,
          system: sys('risks'),
          messages: [
            {
              role: 'user',
              content:
                'Assess risks in this legal document regardless of document type. Return ONLY valid JSON: {"risks":[{"risk":"...","severity":"HIGH|MEDIUM|LOW","clauseRef":"...","explanation":"..."}],"score":0-100}.\n\n' +
                clause
            }
          ]
        }),
        client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 2500,
          system: sys('compliance'),
          messages: [
            {
              role: 'user',
              content:
                'Check India-law compliance for the detected document type. Apply Indian statutes, registration, stamp duty, state-specific, consumer, employment, company, property, data, arbitration, tax, and sector rules only where relevant to this document. Return ONLY valid JSON: {"issues":[{"issue":"...","severity":"HIGH|MEDIUM|LOW","statute":"..."}],"score":0-100}.\n\n' +
                full
            }
          ]
        }),
        client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 2500,
          system: sys('terms'),
          messages: [
            {
              role: 'user',
              content:
                'Map obligations, deadlines, notices, conditions, renewal dates, payment duties, filings, and consequences in this legal document. Return ONLY valid JSON: {"obligations":[{"party":"...","obligation":"...","deadline":"...","consequence":"..."}],"score":0-100}.\n\n' +
                clause
            }
          ]
        }),
        client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 3000,
          system: sys('recommendations'),
          messages: [
            {
              role: 'user',
              content:
                'Give prioritized recommendations for improving this Indian legal document. Return ONLY valid JSON: {"recommendations":[{"priority":"P0-P4","action":"...","recommendation":"..."}],"score":0-100}.\n\n' +
                clause
            }
          ]
        })
      ]);

      responses = [cR, rR, coR, tR, reR];
      results = normalizeReviewResultsShape({
        clauses: parseAgentJson(cR.content[0].text),
        risks: parseAgentJson(rR.content[0].text),
        compliance: parseAgentJson(coR.content[0].text),
        terms: parseAgentJson(tR.content[0].text),
        recommendations: parseAgentJson(reR.content[0].text)
      });
    } else {
      const reviewText = extractText(rawText, ECONOMY_TEXT_LIMIT);
      const economyResponse = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: ECONOMY_MAX_OUTPUT_TOKENS,
        system: [
          {
            type: 'text',
            text:
              'You are an India-law legal document review engine. Return concise, valid JSON only. Do not include markdown, commentary, or legal advice disclaimers inside JSON.',
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          {
            role: 'user',
            content: buildEconomyReviewPrompt(reviewText)
          }
        ]
      });

      if (economyResponse.stop_reason === 'max_tokens') {
        console.warn('[analyze] economy response hit max_tokens — JSON may be truncated');
        return res.status(502).json({
          error:
            'The document is too complex for economy mode. Please set REVIEW_DEPTH=full in your .env and restart, or use a shorter document.'
        });
      }
      responses = [economyResponse];
      results = normalizeReviewResultsShape(parseAgentJson(economyResponse.content[0].text));
    }

    if (!hasUsableReviewResults(results)) {
      console.warn('[analyze] model returned unusable JSON shape');
      return res.status(502).json({
        error:
          'The AI review returned an incomplete result. Please try again, or set REVIEW_DEPTH=full for a deeper review.'
      });
    }

    const score = calculateScore(results);
    const grade = scoreToGrade(score);
    const recommendation = scoreToRec(score);
    const sessionId = uuidv4();

    reportCache.set(sessionId, {
      results,
      score,
      grade,
      recommendation,
      filename: req.file.originalname
    });

    if (reportCache.size > 50) {
      reportCache.delete(reportCache.keys().next().value);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const cost = estimateClaudeCost(responses);
    console.log(
      '[analyze]',
      req.file.originalname,
      '| mode=' + REVIEW_DEPTH,
      '|',
      elapsed + 's |',
      cost.input + 'in/' + cost.output + 'out | cache write=' + cost.cacheWrite + ' read=' + cost.cacheRead + ' | $' + cost.dollars
    );
    if (TEST_MODE && Number(cost.dollars) > TEST_COST_CEILING) {
      console.warn(`[TEST_MODE] cost $${cost.dollars} exceeded ceiling $${TEST_COST_CEILING} — lower TEST_TEXT_LIMIT or TEST_MAX_OUTPUT_TOKENS`);
    }
    
    
    res.json({
      sessionId,
      score,
      grade,
      recommendation,
      summary: (results.clauses && results.clauses.summary) || 'Analysis complete.'
    });
  } catch (err) {
    console.error('[analyze] error:', err);
    if (err.status === 401) return res.status(500).json({ error: 'Invalid API key.' });
    if (err.status === 429) return res.status(500).json({ error: 'Rate limit reached. Try again in a moment.' });
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

app.get('/api/results/:sessionId', function (req, res) {
  const cached = reportCache.get(req.params.sessionId);
  if (!cached) return res.status(404).json({ error: 'Session not found. Please re-analyze.' });

  const { results, score, grade, recommendation, filename } = cached;
  const summaryText = (results.clauses && results.clauses.summary) || '';

  res.json({
    sessionId: req.params.sessionId,
    score,
    grade,
    recommendation,
    filename,
    summary: summaryText,
    results
  });
});

async function sendReviewPdf(req, res) {
  const cached = reportCache.get(req.params.sessionId);
  if (!cached) return res.status(404).json({ error: 'Report not found. Please re-analyze.' });

  const vm = normalizeLegalReviewData(cached);
  const html = buildGenericLegalReviewHtml(vm);
  const baseName = safeReportBaseName(vm.filename);
  const today = new Date().toISOString().slice(0, 10);
  const outFilename = `INDIA-LEGAL-REVIEW-${baseName}-${today}.pdf`;

  try {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    const encodedFilename = encodeURIComponent(outFilename).replace(/'/g, '%27');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${outFilename}"; filename*=UTF-8''${encodedFilename}`
    );

    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[download-report] puppeteer failed, fallback to pdfkit:', err.message);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');

    const encodedFilename = encodeURIComponent(outFilename).replace(/'/g, '%27');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${outFilename}"; filename*=UTF-8''${encodedFilename}`
    );

    doc.pipe(res);

    doc.fontSize(22).font('Helvetica-Bold').text('INDIA LEGAL DOCUMENT REVIEW', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(`${vm.documentType} | Legal Risk Assessment Report`, { align: 'center' });
    doc.moveDown(1.5);

    doc.font('Helvetica-Bold').text('Document: ', { continued: true });
    doc.font('Helvetica').text(vm.documentTitle);

    doc.font('Helvetica-Bold').text('Parties: ', { continued: true });
    doc.font('Helvetica').text(vm.partiesText);

    doc.font('Helvetica-Bold').text('Effective / Execution Date: ', { continued: true });
    doc.font('Helvetica').text(vm.effectiveDate);

    doc.font('Helvetica-Bold').text('Term: ', { continued: true });
    doc.font('Helvetica').text(vm.term);

    doc.font('Helvetica-Bold').text('Governing Law: ', { continued: true });
    doc.font('Helvetica').text(vm.governingLaw);

    doc.font('Helvetica-Bold').text('Jurisdiction: ', { continued: true });
    doc.font('Helvetica').text(vm.jurisdiction);

    doc.moveDown();
    doc.font('Helvetica-Bold').text('Summary');
    doc.font('Helvetica').text(vm.summary);

    doc.moveDown();
    doc.font('Helvetica-Bold').text('Top Risks');
    vm.risks.slice(0, 6).forEach(r => {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`${r.severity || 'MEDIUM'}: ${r.risk || 'Risk'}`);
      doc.font('Helvetica').text(r.explanation || '');
    });

    doc.end();
  }
}

app.get('/api/download-report/:sessionId', sendReviewPdf);
app.get('/api/download-leave-license/:sessionId', sendReviewPdf);

app.post('/api/draft', express.json(), async (req, res) => {
  const { prompt, sessionId } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'A drafting prompt is required.' });
  }

  let documentContext = '';
  if (sessionId) {
    const cached = reportCache.get(sessionId);
    if (cached && cached.results && cached.results.clauses) {
      const meta = cached.results.clauses.metadata || {};
      documentContext =
        '\n\nDocument context: ' +
        (meta.documentType || meta.contractType || '') +
        (meta.parties ? ', Parties: ' + meta.parties : '') +
        (meta.governingLaw ? ', Governing Law: ' + meta.governingLaw : '') +
        '.';
    }
  }

  try {
    const msg = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1200,
      system: [
        {
          type: 'text',
          text: 'You are an expert Indian legal drafting lawyer. Draft clear, precise, enforceable legal clauses compliant with Indian law. Return ONLY the drafted clause text.',
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: prompt.trim() + documentContext
        }
      ]
    });

    res.json({ clause: msg.content[0].text });
  } catch (err) {
    console.error('[draft] error:', err);
    res.status(500).json({ error: 'Drafting failed. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Legal Document Analyzer running on http://localhost:' + PORT);
});

