import { logger } from '../infrastructure/logger';

function findBalanced(str: string, open: string, close: string): string | null {
  const s = str.indexOf(open);
  if (s === -1) return null;
  let depth = 0;
  for (let i = s; i < str.length; i++) {
    if (str[i] === open) depth++;
    else if (str[i] === close) {
      depth--;
      if (depth === 0) return str.slice(s, i + 1);
    }
  }
  return null;
}

export function parseAgentJson(raw: string | null | undefined): unknown {
  if (!raw || typeof raw !== 'string') return { parseError: true };

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const obj = findBalanced(raw, '{', '}');
  if (obj) {
    try {
      return JSON.parse(obj);
    } catch {}
  }

  const arr = findBalanced(raw, '[', ']');
  if (arr) {
    try {
      return JSON.parse(arr);
    } catch {}
  }

  try {
    return JSON.parse(raw.trim());
  } catch {}

  logger.warn('[parseAgentJson] failed', { sample: raw.slice(0, 200) });
  return { raw, parseError: true };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeReviewResultsShape(value: unknown): Record<string, unknown> {
  const data = asObject(value);
  const clausesBlock = asObject(data.clauses);
  const risksBlock = asObject(data.risks);
  const complianceBlock = asObject(data.compliance);
  const termsBlock = asObject(data.terms);
  const recommendationsBlock = asObject(data.recommendations);

  const rawMissing = asArray<unknown>(clausesBlock.missingProtections ?? data.missingProtections);
  const missingProtections = rawMissing.map(m => {
    if (typeof m === 'string') return { name: m, criticality: 'IMPORTANT', reason: '' };
    const obj = asObject(m);
    return {
      name: (obj.name as string) ?? (obj.protection as string) ?? '',
      criticality: String(obj.criticality ?? 'IMPORTANT').toUpperCase() === 'CRITICAL' ? 'CRITICAL' : 'IMPORTANT',
      reason: (obj.reason as string) ?? '',
      suggestedRemedy: (obj.suggestedRemedy as string) ?? ''
    };
  });

  return {
    clauses: {
      clauses: asArray(clausesBlock.clauses ?? data.clauses),
      metadata: asObject(clausesBlock.metadata ?? data.metadata),
      missingProtections,
      summary: (clausesBlock.summary as string) ?? (data.summary as string) ?? ''
    },
    risks: {
      risks: asArray(risksBlock.risks ?? data.risks),
      overallRiskRating: (risksBlock.overallRiskRating as string) ?? '',
      totalEstimatedExposure: (risksBlock.totalEstimatedExposure as string) ?? '',
      signingRecommendation: (risksBlock.signingRecommendation as string) ?? ''
    },
    compliance: {
      issues: asArray(complianceBlock.issues ?? complianceBlock.flags ?? data.issues ?? data.compliance)
    },
    terms: {
      termOverview: asObject(termsBlock.termOverview),
      obligations: asArray(termsBlock.obligations ?? data.obligations ?? data.terms),
      timeline: asArray(termsBlock.timeline),
      autoRenewalTraps: asArray(termsBlock.autoRenewalTraps),
      financialExposure: asObject(termsBlock.financialExposure)
    },
    recommendations: {
      recommendations: asArray(recommendationsBlock.recommendations ?? data.recommendations),
      walkAways: asArray(recommendationsBlock.walkAways)
    }
  };
}

export function hasUsableReviewResults(results: unknown): boolean {
  const r = asObject(results);
  if ((r as any).parseError) return false;
  return Boolean(
    asArray(asObject(r.clauses).clauses).length ||
    asArray(asObject(r.risks).risks).length ||
    asArray(asObject(r.compliance).issues).length ||
    asArray(asObject(r.terms).obligations).length ||
    asArray(asObject(r.recommendations).recommendations).length
  );
}

export interface CostEstimate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  dollars: string;
}

export interface UsageLike {
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null;
}

export function estimateClaudeCost(responses: UsageLike | UsageLike[]): CostEstimate {
  const list = Array.isArray(responses) ? responses : [responses];
  const usage = list.reduce(
    (totals, response) => {
      const u = response.usage ?? {};
      totals.input += u.input_tokens ?? 0;
      totals.output += u.output_tokens ?? 0;
      totals.cacheWrite += u.cache_creation_input_tokens ?? 0;
      totals.cacheRead += u.cache_read_input_tokens ?? 0;
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
