import { ClauseAgent } from '../agents/ClauseAgent';
import { RiskAgent } from '../agents/RiskAgent';
import { ComplianceAgent } from '../agents/ComplianceAgent';
import { TermsAgent } from '../agents/TermsAgent';
import { RecommendationAgent } from '../agents/RecommendationAgent';
import { normalizeReviewResultsShape, hasUsableReviewResults, estimateClaudeCost, type CostEstimate } from './jsonParser';
import { ReviewResultSchema, type ReviewResult } from '../domain/reviewResult.schema';
import { truncateText } from './pdfExtractor';
import { config } from '../config';
import { logger } from '../infrastructure/logger';

const clauseAgent = new ClauseAgent();
const riskAgent = new RiskAgent();
const complianceAgent = new ComplianceAgent();
const termsAgent = new TermsAgent();
const recommendationAgent = new RecommendationAgent();

export interface ReviewOutcome {
  results: ReviewResult;
  cost: CostEstimate;
  elapsedMs: number;
}

export class UnusableReviewError extends Error {
  constructor(message: string = 'AI review returned an unusable result') {
    super(message);
    this.name = 'UnusableReviewError';
  }
}

export async function runReview(rawText: string): Promise<ReviewOutcome> {
  const t0 = Date.now();
  const fullText = truncateText(rawText, config.FULL_TEXT_LIMIT);
  const clauseText = truncateText(rawText, config.CLAUSE_TEXT_LIMIT);

  const [clauseR, riskR, complianceR, termsR, recoR] = await Promise.all([
    clauseAgent.analyze(fullText),
    riskAgent.analyze(clauseText),
    complianceAgent.analyze(fullText),
    termsAgent.analyze(clauseText),
    recommendationAgent.analyze(clauseText)
  ]);

  const merged = normalizeReviewResultsShape({
    clauses: clauseR.data,
    risks: riskR.data,
    compliance: complianceR.data,
    terms: termsR.data,
    recommendations: recoR.data
  });

  if (!hasUsableReviewResults(merged)) {
    logger.warn('[reviewer] model returned unusable JSON shape');
    throw new UnusableReviewError();
  }

  const parsed = ReviewResultSchema.safeParse(merged);
  if (!parsed.success) {
    logger.warn('[reviewer] zod validation failed', { issues: parsed.error.flatten() });
    throw new UnusableReviewError('Review result failed schema validation');
  }

  const cost = estimateClaudeCost([clauseR, riskR, complianceR, termsR, recoR]);
  const elapsedMs = Date.now() - t0;

  return { results: parsed.data, cost, elapsedMs };
}
