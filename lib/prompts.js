'use strict';

function buildEconomyReviewPrompt(documentText) {
  return `Review this Indian legal document. Return ONLY valid JSON matching the exact shape below. No markdown, no commentary, no code fences.

IMPORTANT: Be extremely concise — max 20 words per text field. Return at most 3 items per array.

{
  "clauses": {
    "clauses": [{"id":"CL1","clauseName":"...","location":"Section x","summary":"<20 words","severity":"HIGH|MEDIUM|LOW","completeness":0}],
    "metadata": {"documentTitle":"...","documentType":"...","contractType":"...","parties":"...","effectiveDate":"...","term":"...","governingLaw":"India","jurisdiction":"...","state":"...","subjectMatter":"...","totalValue":"...","registrationDetails":"...","stampDuty":"..."},
    "missingProtections": [{"name":"...","criticality":"CRITICAL|IMPORTANT","reason":"<15 words"}],
    "summary":"<30 words."
  },
  "risks": {
    "risks": [{"id":"R1","section":"Section x","title":"<8 words","summary":"<20 words","categories":["FE"],"severity":"HIGH|MEDIUM|LOW","scores":{"severity":1,"likelihood":1,"financial":1,"asymmetry":1},"composite":1,"financialExposure":"<₹1L|₹1L-5L|₹5L-25L|₹25L-1Cr|>₹1Cr|Uncapped","poisonPill":false,"benefits":"Party A|Party B|Balanced","rationale":"<15 words","redline":"<15 words"}],
    "overallRiskRating":"CRITICAL|HIGH|MODERATE|LOW",
    "totalEstimatedExposure":"₹X",
    "signingRecommendation":"SIGN|NEGOTIATE|ESCALATE|REJECT"
  },
  "compliance": {
    "issues": [{"id":"C1","issue":"<20 words","severity":"HIGH|MEDIUM|LOW","statute":"...","section":"S.x","clauseLocation":"Section x","quote":"<80 chars","enforceability":"VOID|VOIDABLE|ENFORCEABLE_WITH_RISK|ENFORCEABLE","fix":"<15 words"}]
  },
  "terms": {
    "termOverview": {"type":"...","effectiveDate":"...","initialTerm":"...","autoRenewal":false,"renewalTerm":"...","optOutNoticeDays":0,"terminationForConvenience":{"available":false,"byParty":"either","noticeDays":0},"governingLaw":"India"},
    "obligations": [{"id":"OB1","section":"x","obligatedParty":"Contractor|Company|Both","type":"PERF|PAY|NOTC|APPR|RPT|INS|COMP|REST|COND|SURV","description":"<20 words","trigger":{"kind":"Calendar|Event|Condition","detail":"<10 words"},"deadline":"YYYY-MM-DD or descriptive","curePeriodDays":0,"consequenceOfBreach":"<15 words","consequenceSeverity":"HIGH|MEDIUM|LOW"}],
    "timeline": [{"id":"TL1","date":"YYYY-MM-DD or descriptive","label":"<10 words","kind":"MILESTONE|DEADLINE|RECURRING|RENEWAL_WINDOW|POST_TERMINATION","obligationIds":["OB1"],"critical":false}]
  },
  "recommendations": {
    "recommendations": [{"id":"REC1","priority":"P0|P1|P2|P3|P4","type":"REP|MOD|ADD|DEL|CO|CAP|MUT|CLR","section":"x","linkedRiskId":"R1","title":"<10 words","currentClause":"<30 chars","issue":"<20 words","recommendedLanguage":"<20 words","riskScoreBefore":0,"riskScoreAfter":0,"likelihoodOfAcceptance":"HIGH|MEDIUM|LOW"}]
  }
}

RULES:
- Infer document type from text.
- India-law: apply stamp/registration/employment/arbitration/data rules only when relevant.
- composite = round(scores.severity*0.40 + scores.likelihood*0.25 + scores.financial*0.20 + scores.asymmetry*0.15), scale 1-10.
- severity: composite>=7→HIGH, 5-6→MEDIUM, <=4→LOW.
- poisonPill=true only for hidden/notwithstanding/sole-discretion clauses.
- missingProtections CRITICAL only for: force majeure, limitation of liability, dispute resolution, data protection, termination for convenience.
- IDs unique within array (CL1..CL3, R1..R3, C1..C3, OB1..OB3, TL1..TL3, REC1..REC3).
- Never invent scores. Output must be complete, valid JSON.

DOCUMENT:
${documentText}`;
}

module.exports = { buildEconomyReviewPrompt };
