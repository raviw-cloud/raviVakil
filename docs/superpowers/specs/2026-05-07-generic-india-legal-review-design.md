# Generic India-Law Legal Review Design

## Goal

Make the server review any uploaded legal document under an India-law-focused lens instead of assuming a Leave & License agreement. The review should dynamically identify the document type, parties, jurisdiction, commercial terms, risks, obligations, compliance flags, missing protections, and recommendations.

## Scope

- Keep the current PDF upload and five-agent analysis flow.
- Keep India-law-focused compliance and drafting behavior.
- Remove Leave & License-specific report normalization, defaults, titles, route naming, and fallback report content where they are not needed.
- Keep result retrieval compatible with the current frontend.
- Replace the dedicated download route with a generic report download route, while preserving the old route as a compatibility alias if practical.

## Server Design

`server.js` will use generic review helpers:

- `normalizeLegalReviewData(cached)` converts cached agent results into a flexible report view model.
- `buildGenericLegalReviewHtml(vm)` renders a generic India legal review report.
- `sendReviewPdf(req, res)` generates and streams the report PDF.

The generic view model will include:

- filename, score, grade, recommendation, summary
- document title and document type
- parties, effective date, term, governing law, Indian state/jurisdiction, subject matter, total value
- clauses, risks grouped by severity, obligations, compliance issues, recommendations, missing protections

## Prompt Design

The analysis prompts will instruct agents to infer the uploaded document type first and return JSON that works across legal document categories. The compliance prompt remains India-law focused and should apply Indian statutes, stamp/registration checks, sector rules, and state-specific considerations only when relevant to the detected document.

## Report Design

The PDF report will be titled "India Legal Document Review" and use neutral sections:

- Document Profile
- Executive Summary
- Risk Dashboard
- Clause Review
- Key Risks
- Obligations and Deadlines
- Compliance Flags
- Missing Protections
- Recommended Actions

Hard-coded Leave & License labels such as licensor, licensee, property type, monthly rent, security deposit, and Maharashtra Leave & License Act defaults will be removed from the generic report.

## Compatibility

`/api/results/:sessionId` will keep returning the existing result shape. The new download route will be `/api/download-report/:sessionId`. The old `/api/download-leave-license/:sessionId` may call the same generic handler so existing frontend links do not immediately break.

## Error Handling

Unreadable or scanned PDFs should continue to return the existing OCR guidance. PDF generation should still fall back to PDFKit if browser rendering fails.

## Verification

- Start the server successfully.
- Confirm `server.js` parses with Node.
- Confirm the generic download route exists.
- Confirm removed code no longer references Leave & License-only report helpers.
