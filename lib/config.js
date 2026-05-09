'use strict';
const fs   = require('fs');
const path = require('path');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const TEST_MODE          = (process.env.TEST_MODE || 'false').toLowerCase() === 'true';
const TEST_COST_CEILING  = Number(process.env.TEST_COST_CEILING  || 0.05);
const TEST_TEXT_LIMIT    = Number(process.env.TEST_TEXT_LIMIT    || 2500);
const TEST_MAX_OUTPUT_TOKENS = Number(process.env.TEST_MAX_OUTPUT_TOKENS || 1500);

const REVIEW_DEPTH            = TEST_MODE ? 'economy' : (process.env.REVIEW_DEPTH || 'economy').toLowerCase();
const ECONOMY_TEXT_LIMIT      = TEST_MODE ? TEST_TEXT_LIMIT : Number(process.env.ECONOMY_TEXT_LIMIT || 6000);
const FULL_TEXT_LIMIT         = Number(process.env.FULL_TEXT_LIMIT   || 12000);
const CLAUSE_TEXT_LIMIT       = Number(process.env.CLAUSE_TEXT_LIMIT || 6000);
const ECONOMY_MAX_OUTPUT_TOKENS = TEST_MODE ? TEST_MAX_OUTPUT_TOKENS : Number(process.env.ECONOMY_MAX_OUTPUT_TOKENS || 5200);

if (TEST_MODE) {
  console.log(`[config] TEST_MODE active — economy mode forced, text limit=${ECONOMY_TEXT_LIMIT} chars, max_tokens=${ECONOMY_MAX_OUTPUT_TOKENS}, cost ceiling=$${TEST_COST_CEILING}`);
}

const AGENTS_DIR = path.join(__dirname, '..', 'agents');

const skills = {
  clauses:         fs.readFileSync(path.join(AGENTS_DIR, 'legal-clauses.md'),         'utf8'),
  risks:           fs.readFileSync(path.join(AGENTS_DIR, 'legal-risks.md'),           'utf8'),
  compliance:      fs.readFileSync(path.join(AGENTS_DIR, 'legal-compliance.md'),      'utf8'),
  terms:           fs.readFileSync(path.join(AGENTS_DIR, 'legal-terms.md'),           'utf8'),
  recommendations: fs.readFileSync(path.join(AGENTS_DIR, 'legal-recommendations.md'), 'utf8'),
};

module.exports = {
  HAIKU_MODEL,
  TEST_MODE, TEST_COST_CEILING, TEST_TEXT_LIMIT, TEST_MAX_OUTPUT_TOKENS,
  REVIEW_DEPTH,
  ECONOMY_TEXT_LIMIT, FULL_TEXT_LIMIT, CLAUSE_TEXT_LIMIT, ECONOMY_MAX_OUTPUT_TOKENS,
  skills,
};
