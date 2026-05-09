import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import type { CachedReport } from '../infrastructure/reportCache';
import type { Risk, Clause, Obligation, ComplianceIssue, Recommendation, MissingProtection } from '../domain/reviewResult.schema';
import { logger } from '../infrastructure/logger';

const TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'legal-review.hbs');
let compiledTemplate: HandlebarsTemplateDelegate | null = null;

function getTemplate(): HandlebarsTemplateDelegate {
  if (!compiledTemplate) {
    const src = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    compiledTemplate = Handlebars.compile(src);
  }
  return compiledTemplate;
}

function firstText(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return 'Not specified';
}

function severityOf(item: { severity?: string; level?: string }): string {
  return String(item.severity ?? item.level ?? 'MEDIUM').toUpperCase();
}

function riskClass(severity: string): 'high' | 'medium' | 'low' {
  const sev = severity.toUpperCase();
  if (sev === 'HIGH' || sev === 'CRITICAL') return 'high';
  if (sev === 'LOW') return 'low';
  return 'medium';
}

export function safeReportBaseName(filename: string | undefined): string {
  const baseName = (filename ?? 'legal-document')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9_\-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return baseName || 'legal-document';
}

interface ViewModel {
  documentTitle: string;
  documentType: string;
  currentDate: string;
  score: number;
  grade: string;
  recommendation: string;
  riskBadge: string;
  riskLabel: string;
  summary: string;
  profileRows: Array<{ label: string; value: string }>;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  clauseRows: Array<{ name: string; location: string; severity: string; severityClass: string; summary: string }>;
  riskCards: Array<{ severity: string; cls: string; title: string; issue: string; impact: string; location: string }>;
  timelineItems: Array<{ date: string; party: string; obligation: string; consequence: string }>;
  obligationsRows: Array<{ party: string; obligation: string; deadline: string; consequence: string }>;
  complianceRows: Array<{ severity: string; severityClass: string; issue: string; statute: string }>;
  missingCards: Array<{ text: string }>;
  recoCards: Array<{ priority: string; cls: string; action: string; recommendation: string }>;
}

function buildViewModel(cached: CachedReport): ViewModel {
  const { results, score, grade, recommendation, filename } = cached;
  const meta = (results.clauses.metadata ?? {}) as Record<string, string | undefined>;
  const clauses = results.clauses.clauses;
  const risks = results.risks.risks;
  const obligations = results.terms.obligations;
  const recommendations = results.recommendations.recommendations;
  const complianceIssues = results.compliance.issues;
  const missingProtections = results.clauses.missingProtections;

  const highRisks = risks.filter(r => ['HIGH', 'CRITICAL'].includes(severityOf(r)));
  const mediumRisks = risks.filter(r => severityOf(r) === 'MEDIUM');
  const lowRisks = risks.filter(r => severityOf(r) === 'LOW');

  const documentTitle = firstText(meta.documentTitle, meta.title, filename);
  const documentType = firstText(meta.documentType, meta.contractType, 'Legal Document');

  const profilePairs: Array<[string, string]> = [
    ['Document Type', documentType],
    ['Parties', firstText(meta.parties)],
    ['Effective / Execution Date', firstText(meta.effectiveDate, meta.executionDate, meta.agreementDate)],
    ['Term / Duration', firstText(meta.term, meta.duration)],
    ['Governing Law', firstText(meta.governingLaw)],
    ['Indian State / Jurisdiction', firstText(meta.jurisdiction, meta.state, meta.placeOfExecution)],
    ['Subject Matter', firstText(meta.subjectMatter, meta.propertyAddress, meta.property, meta.purpose)],
    ['Total Value / Consideration', firstText(meta.totalValue, meta.contractValue, meta.consideration)],
    ['Registration Details', firstText(meta.registrationDetails, meta.registrationNumber)],
    ['Stamp Duty Details', firstText(meta.stampDuty, meta.stampDetails)]
  ];
  const profileRows = profilePairs
    .filter(([, value]) => value && value !== 'Not specified')
    .map(([label, value]) => ({ label, value }));

  const clauseSource: (Clause | Risk)[] = clauses.length ? clauses : risks;
  const clauseRows = clauseSource.slice(0, 10).map(c => {
    const sev = severityOf(c as { severity?: string });
    return {
      name: firstText((c as Clause).clauseName, (c as Clause).name, (c as Risk).risk, 'Clause'),
      location: firstText((c as Clause).location, (c as Clause).position, (c as Clause).clauseRef),
      severity: sev,
      severityClass: riskClass(sev),
      summary: (c as Clause).summary ?? (c as Clause).explanation ?? ''
    };
  });

  const riskCards = risks.slice(0, 8).map(r => {
    const sev = severityOf(r);
    return {
      severity: sev,
      cls: riskClass(sev),
      title: r.risk ?? 'Risk item',
      issue: r.risk ?? '',
      impact: r.explanation ?? '',
      location: firstText(r.clauseRef, r.location)
    };
  });

  const timelineItems = obligations.slice(0, 6).map(o => ({
    date: firstText(o.deadline),
    party: firstText(o.party, 'Party'),
    obligation: o.obligation ?? '',
    consequence: o.consequence ?? ''
  }));

  const obligationsRows = obligations.slice(0, 8).map(o => ({
    party: o.party ?? '',
    obligation: o.obligation ?? '',
    deadline: o.deadline ?? '',
    consequence: o.consequence ?? ''
  }));

  const complianceRows = complianceIssues.slice(0, 8).map(i => {
    const sev = severityOf(i);
    return {
      severity: sev,
      severityClass: riskClass(sev),
      issue: firstText(i.issue, i.flag, i.violation),
      statute: firstText(i.statute, i.framework, i.law, 'Indian law review')
    };
  });

  const missingCards = missingProtections.slice(0, 8).map(m => ({
    text: typeof m === 'string' ? m : firstText(m.protection, m.name, m.issue)
  }));

  const recoCards = recommendations.slice(0, 8).map(r => {
    const pri = String(r.priority ?? 'P2').toUpperCase();
    const cls = pri === 'P0' ? 'critical' : pri === 'P1' ? 'high' : 'medium';
    return {
      priority: pri,
      cls,
      action: firstText(r.action, 'Recommendation'),
      recommendation: r.recommendation ?? ''
    };
  });

  return {
    documentTitle,
    documentType,
    currentDate: new Date().toLocaleDateString('en-IN'),
    score,
    grade,
    recommendation,
    riskBadge: score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high',
    riskLabel: score >= 70 ? 'Low Risk' : score >= 50 ? 'Medium Risk' : 'High Risk',
    summary: results.clauses.summary || 'Analysis complete.',
    profileRows,
    highRiskCount: highRisks.length,
    mediumRiskCount: mediumRisks.length,
    lowRiskCount: lowRisks.length,
    clauseRows,
    riskCards,
    timelineItems,
    obligationsRows,
    complianceRows,
    missingCards,
    recoCards
  };
}

export function renderHtml(cached: CachedReport): string {
  const vm = buildViewModel(cached);
  return getTemplate()(vm);
}

export async function renderPdf(cached: CachedReport): Promise<Buffer> {
  const html = renderHtml(cached);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close().catch(err => logger.warn('[reportRenderer] browser close failed', { error: (err as Error).message }));
  }
}

export function buildOutFilename(filename: string | undefined): string {
  const baseName = safeReportBaseName(filename);
  const today = new Date().toISOString().slice(0, 10);
  return `INDIA-LEGAL-REVIEW-${baseName}-${today}.pdf`;
}
