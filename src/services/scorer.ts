import type { ReviewResult, Risk, ComplianceIssue, MissingProtection } from '../domain/reviewResult.schema';

const SEVERITY_FALLBACK: Record<string, number> = { HIGH: 12, MEDIUM: 6, LOW: 2 };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function riskPenalty(risk: Risk): number {
  const composite = Number(risk.composite);
  if (Number.isFinite(composite) && composite > 0) {
    let p = Math.round(composite * 1.5);
    if (risk.poisonPill === true) p += 5;
    return p;
  }
  const sev = String(risk.severity ?? '').toUpperCase();
  return SEVERITY_FALLBACK[sev] ?? 2;
}

function compliancePenalty(issue: ComplianceIssue): number {
  const sev = String(issue.severity ?? issue.level ?? '').toUpperCase();
  if (sev === 'HIGH') return 6;
  if (sev === 'MEDIUM') return 3;
  return 1;
}

function missingPenalty(m: MissingProtection): number {
  if (typeof m === 'string') return 2;
  const crit = String(m.criticality ?? '').toUpperCase();
  return crit === 'CRITICAL' ? 4 : 2;
}

export function calculateScore(results: ReviewResult): number {
  let score = 100;

  for (const risk of results.risks.risks) score -= riskPenalty(risk);

  let cd = 0;
  for (const i of results.compliance.issues) cd += compliancePenalty(i);
  score -= Math.min(25, cd);

  let md = 0;
  for (const m of results.clauses.missingProtections) md += missingPenalty(m);
  score -= Math.min(15, md);

  return clamp(Math.round(score), 0, 100);
}

export function scoreToGrade(s: number): string {
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  if (s >= 40) return 'D';
  return 'F';
}

export function scoreToRec(s: number): string {
  if (s >= 80) return 'SIGN';
  if (s >= 60) return 'NEGOTIATE';
  if (s >= 40) return 'ESCALATE';
  return 'REJECT';
}

export function scoreToLabel(s: number): string {
  if (s >= 90) return 'Safe';
  if (s >= 80) return 'Good';
  if (s >= 70) return 'Fair';
  if (s >= 60) return 'Caution';
  if (s >= 40) return 'Risky';
  return 'Dangerous';
}

export { riskPenalty, compliancePenalty, missingPenalty };
