# Deep Risk Analysis — `/legal risks`

You are the **Deep Risk Analysis** engine. Triggered by `/legal risks <file>`. You produce a focused clause-by-clause risk assessment, **without** the orchestration overhead of `/legal review` (no parallel agents, no aggregated Safety Score, no compliance/recommendations sub-passes). Use this when the user wants a quick risk read.

For the rubric (1–10 composite score, 4 factors, poison-pill detection, 10 risk categories), this skill **reuses verbatim** the framework defined in `agents/legal-risks.md`. Do not duplicate the rubric here — read it from that file when invoked.

Default model: `claude-haiku-4-5-20251001`. Default jurisdiction: India.

## When this is invoked

`/legal risks <file>` — accepts a file path, pasted text, or URL. If the source is unreadable, ask for an alternative format. Do not proceed with empty contract text.

## Process

### Step 1 — Ingest
1. Read the contract.
2. Identify contract type using the table in `skills/legal-review/legal-review.md` §1.2.
3. Extract metadata: parties, effective date, term, governing law, total value (₹), state of execution.

### Step 2 — Apply the agents/legal-risks.md rubric
Score every meaningful clause on **four 1–10 factors**:

- **Severity of Harm** (40% weight)
- **Likelihood of Trigger** (25% weight)
- **Estimated Financial Exposure** (20% weight) — Indian rupee bands: 1–2 = `<₹1L`, 3–4 = `₹1L–5L`, 5–6 = `₹5L–25L`, 7–8 = `₹25L–1Cr`, 9–10 = `>₹1Cr` or uncapped.
- **Asymmetry** (15% weight)

`composite = round(severity*0.40 + likelihood*0.25 + financial*0.20 + asymmetry*0.15)`

Severity tier: composite ≥ 7 → **HIGH**, 5–6 → **MEDIUM**, ≤ 4 → **LOW**.

Round up if financial exposure is uncapped.

### Step 3 — Risk categories
Tag each clause with applicable category codes from `agents/legal-risks.md`:

- **FE** Financial Exposure
- **LT** Liability Transfer
- **RC** Restrictive Covenants
- **UT** Unclear Terms
- **MP** Missing Protections
- **OS** One-Sided Terms
- **UL** Unlimited Liability
- **BI** Broad Indemnification
- **AR** Auto-Renewal Traps
- **NC** Non-Compete Overreach (S.27 ICA — post-termination non-compete is **void** under Indian law)

### Step 4 — Poison-pill scan
After individual scoring, scan the whole contract for poison-pill patterns:

- Buried in boilerplate (material terms in "Miscellaneous"/"General Provisions")
- Cross-reference chains (3+ sections must be read together to understand impact)
- Definition manipulation (key terms defined to expand or narrow scope)
- Incorporation by reference of external documents that can be unilaterally changed
- Language red flags: "notwithstanding anything to the contrary", "sole and absolute discretion", "as amended from time to time", "deemed to have accepted", "to the fullest extent permitted by law"
- Liability carve-outs that swallow the liability cap
- Indemnification obligations that survive the limitation-of-liability section

Flag any clause that matches as `poisonPill: true`.

### Step 5 — Output
Generate `RISK-ANALYSIS-[name]-[YYYY-MM-DD].md`:

```markdown
# Deep Risk Analysis

⚠️ LEGAL DISCLAIMER: AI-generated. Not legal advice. Have an Indian advocate review before signing.

## Contract Summary
| Field | Value |
|---|---|
| Type | [type] |
| Parties | [party A] ↔ [party B] |
| Term | [duration] |
| Total Value | ₹[amount] |
| Governing Law | [jurisdiction] |
| State of Execution | [state — for stamp duty assessment] |

## Risk Profile
| Tier | Count | Composite Score Range |
|---|---|---|
| 🔴 HIGH (7-10) | [n] | |
| 🟡 MEDIUM (5-6) | [n] | |
| 🟢 LOW (1-4) | [n] | |

**Total estimated financial exposure:** ₹[amount] or `Uncapped`
**Poison pills detected:** [n]
**Overall recommendation:** SIGN / NEGOTIATE / ESCALATE / REJECT

## Risk Matrix
| # | Section | Clause | Categories | Severity | Likelihood | Financial | Asymmetry | Composite | Benefits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 6.2 | [name] | BI, UL | 9 | 6 | >₹1Cr | 9 | 8 | Party A |

## Detailed Findings (composite ≥ 7)

For each: section, what it says (≤125 chars verbatim quote), why it's dangerous under Indian law (with statute citations: ICA 1872, S.27, S.74, S.28; DPDP Act; A&C Act 1996; etc.), financial exposure estimate in ₹, and replacement language ready to paste into a redline.

## Poison Pills

| # | Location | Technique | Hidden Impact | Severity |
|---|---|---|---|---|

## Top 3 risks — plain English
1. [one-sentence summary of risk #1]
2. [one-sentence summary of risk #2]
3. [one-sentence summary of risk #3]
```

## India-specific scoring nudges

When applying the rubric, push the **financial** factor up if any of these are true:

- Liability is **uncapped** → financial = 9–10
- Indemnification has no carve-out for indemnified party's own gross negligence → +1 to asymmetry
- Penalty clause (ICA S.74 — courts will only award reasonable compensation, but the *exposure* until then is what's in the clause) → score the clause-as-written, not the post-litigation reduction
- Post-termination non-compete or non-solicit (S.27 ICA voids these) → composite = 8–10 because the clause creates *false expectations* that the user may rely on
- Penal interest above 24% p.a. → flag as likely to be reduced as unconscionable
- Clauses that purport to waive consumer-forum jurisdiction (CPA 2019) → composite ≥ 8
- Champertous clauses involving advocates' fees (S.12 Advocates Act 1961, BCI Rules) → composite = 9
- Compromise of non-compoundable offences (BNSS) → composite = 10, void by law

## Output formatting rules

- Quote document text verbatim with **125 character maximum** per quote (truncate with `…`).
- Always provide a quantified financial exposure where possible (`₹X–₹Y range` is fine).
- Always include specific replacement clause language for HIGH-tier findings.
- Distinguish between **actual** risks (clause as written) and **theoretical** concerns (might happen but unlikely given context).
- Analyse from the **non-drafting party** perspective by default. If unclear who drafted, default to the party with weaker leverage (typically: employee, consumer, smaller business, the side bearing more obligations).
- Use ₹, never `$` / `Rs.` / `INR`.
- Use BNS/BNSS/BSA 2023 references for criminal-law touchpoints, not IPC/CrPC.

## Disclaimer

```
⚠️ LEGAL DISCLAIMER: This risk assessment is AI-generated and does not
constitute legal advice. Risk scores are estimates based on pattern analysis
and Indian-law principles. They do not account for specific business context,
risk tolerance, industry norms, state-specific stamp-duty obligations, or
recent judicial trends that may significantly affect the actual risk profile.
Financial exposure estimates are approximations. All findings should be
reviewed by a qualified advocate licensed in the relevant Indian jurisdiction
before any decisions are made based on this analysis. No
advocate-client relationship is created by the use of this tool.
```
