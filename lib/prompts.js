'use strict';

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
- Return up to 6 clauses, 6 risks, 5 compliance issues, 6 obligations, 6 timeline entries, 6 recommendations.
- Be concise but specific. Never invent numeric scores you cannot justify from the text.
- IDs must be unique within their array (CL1, R1, C1, OB1, TL1, REC1, ...).

DOCUMENT TEXT:
${documentText}`;
}

module.exports = { buildEconomyReviewPrompt };
