import { z } from 'zod';

export const SeveritySchema = z.string().transform(s => s.toUpperCase());
export const CriticalitySchema = z.string().transform(s => s.toUpperCase());

export const ClauseSchema = z.object({
  id: z.string().optional(),
  clauseName: z.string().optional(),
  name: z.string().optional(),
  location: z.string().optional(),
  position: z.string().optional(),
  clauseRef: z.string().optional(),
  summary: z.string().optional(),
  explanation: z.string().optional(),
  severity: z.string().optional(),
  level: z.string().optional(),
  completeness: z.number().optional()
}).passthrough();

export const MissingProtectionSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    protection: z.string().optional(),
    issue: z.string().optional(),
    criticality: z.string().optional(),
    reason: z.string().optional(),
    suggestedRemedy: z.string().optional()
  }).passthrough()
]);

export const RiskSchema = z.object({
  id: z.string().optional(),
  section: z.string().optional(),
  title: z.string().optional(),
  risk: z.string().optional(),
  summary: z.string().optional(),
  explanation: z.string().optional(),
  clauseRef: z.string().optional(),
  location: z.string().optional(),
  categories: z.array(z.string()).optional(),
  severity: z.string().optional(),
  scores: z.object({
    severity: z.number().optional(),
    likelihood: z.number().optional(),
    financial: z.number().optional(),
    asymmetry: z.number().optional()
  }).passthrough().optional(),
  composite: z.number().optional(),
  financialExposure: z.string().optional(),
  poisonPill: z.boolean().optional(),
  benefits: z.string().optional(),
  rationale: z.string().optional(),
  redline: z.string().optional()
}).passthrough();

export const ComplianceIssueSchema = z.object({
  id: z.string().optional(),
  issue: z.string().optional(),
  flag: z.string().optional(),
  violation: z.string().optional(),
  severity: z.string().optional(),
  level: z.string().optional(),
  statute: z.string().optional(),
  framework: z.string().optional(),
  law: z.string().optional(),
  section: z.string().optional(),
  clauseLocation: z.string().optional(),
  quote: z.string().optional(),
  enforceability: z.string().optional(),
  fix: z.string().optional()
}).passthrough();

export const ObligationSchema = z.object({
  id: z.string().optional(),
  section: z.string().optional(),
  party: z.string().optional(),
  obligatedParty: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  obligation: z.string().optional(),
  trigger: z.unknown().optional(),
  deadline: z.string().optional(),
  curePeriodDays: z.number().optional(),
  consequence: z.string().optional(),
  consequenceOfBreach: z.string().optional(),
  consequenceSeverity: z.string().optional()
}).passthrough();

export const TimelineEntrySchema = z.object({
  id: z.string().optional(),
  date: z.string().optional(),
  label: z.string().optional(),
  kind: z.string().optional(),
  obligationIds: z.array(z.string()).optional(),
  critical: z.boolean().optional()
}).passthrough();

export const RecommendationSchema = z.object({
  id: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  section: z.string().optional(),
  linkedRiskId: z.string().optional(),
  title: z.string().optional(),
  action: z.string().optional(),
  recommendation: z.string().optional(),
  currentClause: z.string().optional(),
  issue: z.string().optional(),
  recommendedLanguage: z.string().optional(),
  riskScoreBefore: z.number().optional(),
  riskScoreAfter: z.number().optional(),
  likelihoodOfAcceptance: z.string().optional()
}).passthrough();

export const DocumentMetadataSchema = z.object({
  documentTitle: z.string().optional(),
  title: z.string().optional(),
  documentType: z.string().optional(),
  contractType: z.string().optional(),
  parties: z.string().optional(),
  effectiveDate: z.string().optional(),
  executionDate: z.string().optional(),
  agreementDate: z.string().optional(),
  term: z.string().optional(),
  duration: z.string().optional(),
  governingLaw: z.string().optional(),
  jurisdiction: z.string().optional(),
  state: z.string().optional(),
  placeOfExecution: z.string().optional(),
  subjectMatter: z.string().optional(),
  propertyAddress: z.string().optional(),
  property: z.string().optional(),
  purpose: z.string().optional(),
  totalValue: z.string().optional(),
  contractValue: z.string().optional(),
  consideration: z.string().optional(),
  registrationDetails: z.string().optional(),
  registrationNumber: z.string().optional(),
  stampDuty: z.string().optional(),
  stampDetails: z.string().optional()
}).passthrough();

export const ReviewResultSchema = z.object({
  clauses: z.object({
    clauses: z.array(ClauseSchema).default([]),
    metadata: DocumentMetadataSchema.default({}),
    missingProtections: z.array(MissingProtectionSchema).default([]),
    summary: z.string().default('')
  }),
  risks: z.object({
    risks: z.array(RiskSchema).default([]),
    overallRiskRating: z.string().default(''),
    totalEstimatedExposure: z.string().default(''),
    signingRecommendation: z.string().default('')
  }),
  compliance: z.object({
    issues: z.array(ComplianceIssueSchema).default([])
  }),
  terms: z.object({
    termOverview: z.record(z.unknown()).default({}),
    obligations: z.array(ObligationSchema).default([]),
    timeline: z.array(TimelineEntrySchema).default([]),
    autoRenewalTraps: z.array(z.unknown()).default([]),
    financialExposure: z.record(z.unknown()).default({})
  }),
  recommendations: z.object({
    recommendations: z.array(RecommendationSchema).default([]),
    walkAways: z.array(z.unknown()).default([])
  })
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type Clause = z.infer<typeof ClauseSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type ComplianceIssue = z.infer<typeof ComplianceIssueSchema>;
export type Obligation = z.infer<typeof ObligationSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type MissingProtection = z.infer<typeof MissingProtectionSchema>;
