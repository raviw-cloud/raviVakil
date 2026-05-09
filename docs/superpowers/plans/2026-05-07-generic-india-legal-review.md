# Generic India Legal Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server generate generic India-law-focused legal document reviews instead of Leave & License-specific reports.

**Architecture:** Keep the existing single-file Express server pattern, but replace Leave & License-specific normalization and PDF generation with generic legal-review helpers. Preserve current analysis and results APIs, add `/api/download-report/:sessionId`, and keep the old download path as a compatibility alias.

**Tech Stack:** Node.js, Express, Anthropic SDK, pdf-parse, Puppeteer, PDFKit.

---

## Files

- Modify: `server.js`
- Add: `docs/superpowers/specs/2026-05-07-generic-india-legal-review-design.md`
- Add: `docs/superpowers/plans/2026-05-07-generic-india-legal-review.md`

## Task 1: Replace Contract-Specific Report Helpers

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Remove `normalizeLeaveLicenseData` and `buildLeaveLicenseReviewHtml`**

Delete the Leave & License-specific helper functions and their hard-coded defaults.

- [ ] **Step 2: Add generic extraction helpers**

Add small helpers for arrays, severity grouping, display fields, and safe filenames.

- [ ] **Step 3: Add `normalizeLegalReviewData(cached)`**

Build a generic view model from cached results without assuming licensor/licensee, rent, deposit, property, or Maharashtra-specific defaults.

- [ ] **Step 4: Add `buildGenericLegalReviewHtml(vm)`**

Generate a complete HTML report with neutral sections: Document Profile, Risk Dashboard, Clauses, Risks, Compliance Flags, Missing Protections, Obligations, and Recommendations.

## Task 2: Generalize Analysis Prompts

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update clauses prompt**

Ask the model to detect legal document type and return flexible metadata fields: title, documentType, parties, effectiveDate, term, governingLaw, jurisdiction, state, subjectMatter, totalValue, registrationDetails, stampDuty.

- [ ] **Step 2: Update compliance prompt**

Keep India-law focus while instructing the model to apply document-type-specific and state-specific rules only where relevant.

- [ ] **Step 3: Keep risks, terms, and recommendations generic**

Use language that applies to any legal document instead of contract-only or lease-only language.

## Task 3: Replace Download Route

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add `sendReviewPdf(req, res)`**

Use the generic view model and HTML builder for Puppeteer PDF generation, with a PDFKit fallback.

- [ ] **Step 2: Add `/api/download-report/:sessionId`**

Route the generic report download through `sendReviewPdf`.

- [ ] **Step 3: Preserve `/api/download-leave-license/:sessionId`**

Keep it as an alias to `sendReviewPdf` so existing frontend links do not break.

## Task 4: Verification

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Run Node syntax check**

Run: `node --check server.js`

Expected: no syntax errors.

- [ ] **Step 2: Search for removed report-specific symbols**

Run a text search for `normalizeLeaveLicenseData`, `buildLeaveLicenseReviewHtml`, and `LEAVE & LICENSE AGREEMENT REVIEW`.

Expected: no matches.

- [ ] **Step 3: Search for compatibility route**

Run a text search for `/api/download-report/:sessionId` and `/api/download-leave-license/:sessionId`.

Expected: both routes exist and call the same generic handler.
