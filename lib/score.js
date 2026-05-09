'use strict';

const SEVERITY_FALLBACK = { HIGH: 12, MEDIUM: 6, LOW: 2 };

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function riskPenalty(risk) {
  const composite = Number(risk && risk.composite);
  if (Number.isFinite(composite) && composite > 0) {
    let p = Math.round(composite * 1.5);
    if (risk.poisonPill === true) p += 5;
    return p;
  }
  const sev = String((risk && risk.severity) || '').toUpperCase();
  return SEVERITY_FALLBACK[sev] != null ? SEVERITY_FALLBACK[sev] : 2;
}

function compliancePenalty(issue) {
  const sev = String((issue && (issue.severity || issue.level)) || '').toUpperCase();
  if (sev === 'HIGH') return 6;
  if (sev === 'MEDIUM') return 3;
  return 1;
}

function missingPenalty(m) {
  if (typeof m === 'string') return 2;
  const crit = String((m && m.criticality) || '').toUpperCase();
  return crit === 'CRITICAL' ? 4 : 2;
}

function calculateScore(results) {
  let score = 100;
  const r = (results && typeof results === 'object') ? results : {};

  const risks = asArray(r.risks && r.risks.risks);
  for (const risk of risks) score -= riskPenalty(risk);

  const issues = asArray(
    (r.compliance && (r.compliance.issues || r.compliance.flags || r.compliance.violations))
  );
  let cd = 0;
  for (const i of issues) cd += compliancePenalty(i);
  score -= Math.min(25, cd);

  const missing = asArray(r.clauses && r.clauses.missingProtections);
  let md = 0;
  for (const m of missing) md += missingPenalty(m);
  score -= Math.min(15, md);

  return clamp(Math.round(score), 0, 100);
}

function scoreToGrade(s) {
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  if (s >= 40) return 'D';
  return 'F';
}

function scoreToRec(s) {
  if (s >= 80) return 'SIGN';
  if (s >= 60) return 'NEGOTIATE';
  if (s >= 40) return 'ESCALATE';
  return 'REJECT';
}

function scoreToLabel(s) {
  if (s >= 90) return 'Safe';
  if (s >= 80) return 'Good';
  if (s >= 70) return 'Fair';
  if (s >= 60) return 'Caution';
  if (s >= 40) return 'Risky';
  return 'Dangerous';
}

module.exports = {
  calculateScore,
  scoreToGrade,
  scoreToRec,
  scoreToLabel,
  riskPenalty,
  compliancePenalty,
  missingPenalty
};
