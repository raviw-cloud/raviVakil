import assert from 'node:assert/strict';
import { calculateScore, scoreToGrade, scoreToRec } from '../src/services/scorer';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log('  ok  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL ' + name);
    console.log('       ' + (err && (err as Error).message ? (err as Error).message : err));
    failed++;
  }
}

console.log('src/services/scorer');

test('Fixture A — single low-composite risk → ~95, A+, SIGN', () => {
  const results = {
    risks: { risks: [{ id: 'R1', composite: 3, severity: 'LOW', poisonPill: false }] },
    compliance: { issues: [] },
    clauses: { missingProtections: [] }
  };
  const s = calculateScore(results);
  assert.equal(s, 95, 'expected score 95, got ' + s);
  assert.equal(scoreToGrade(s), 'A+');
  assert.equal(scoreToRec(s), 'SIGN');
});

test('Fixture B — composite=9, poisonPill, >₹1Cr → ~80, A, SIGN/NEGOTIATE boundary', () => {
  const results = {
    risks: { risks: [{ id: 'R1', composite: 9, severity: 'HIGH', poisonPill: true, financialExposure: '>₹1Cr' }] },
    compliance: { issues: [] },
    clauses: { missingProtections: [] }
  };
  const s = calculateScore(results);
  assert.equal(s, 81, 'expected score 81, got ' + s);
  assert.equal(scoreToGrade(s), 'A');
  assert.equal(scoreToRec(s), 'SIGN');
});

test('Fixture C — 3 high risks + 2 HIGH compliance + 1 CRITICAL missing → <60, C/D, ESCALATE', () => {
  const results = {
    risks: {
      risks: [
        { id: 'R1', composite: 8, severity: 'HIGH', poisonPill: false },
        { id: 'R2', composite: 7, severity: 'HIGH', poisonPill: false },
        { id: 'R3', composite: 9, severity: 'HIGH', poisonPill: true }
      ]
    },
    compliance: {
      issues: [
        { id: 'C1', severity: 'HIGH' },
        { id: 'C2', severity: 'HIGH' }
      ]
    },
    clauses: {
      missingProtections: [{ name: 'Force Majeure', criticality: 'CRITICAL' }]
    }
  };
  const s = calculateScore(results);
  assert.equal(s, 42, 'expected score 42, got ' + s);
  assert.ok(s < 60, 'expected <60');
  assert.equal(scoreToGrade(s), 'D');
  assert.equal(scoreToRec(s), 'ESCALATE');
});

test('Fallback — risk without composite uses severity tier', () => {
  const results = {
    risks: { risks: [{ severity: 'HIGH' }, { severity: 'MEDIUM' }, { severity: 'LOW' }] },
    compliance: { issues: [] },
    clauses: { missingProtections: [] }
  };
  const s = calculateScore(results);
  assert.equal(s, 80, 'expected score 80, got ' + s);
});

test('Cap — compliance deduction capped at 25', () => {
  const issues: Array<{ severity: string }> = [];
  for (let i = 0; i < 20; i++) issues.push({ severity: 'HIGH' });
  const results = {
    risks: { risks: [] },
    compliance: { issues },
    clauses: { missingProtections: [] }
  };
  const s = calculateScore(results);
  assert.equal(s, 75, 'expected score 75 (100-25 cap), got ' + s);
});

test('Cap — missing-protection deduction capped at 15', () => {
  const missing: Array<{ name: string; criticality: string }> = [];
  for (let i = 0; i < 10; i++) missing.push({ name: 'X', criticality: 'CRITICAL' });
  const results = {
    risks: { risks: [] },
    compliance: { issues: [] },
    clauses: { missingProtections: missing }
  };
  const s = calculateScore(results);
  assert.equal(s, 85, 'expected score 85 (100-15 cap), got ' + s);
});

test('Clamp — score floor 0', () => {
  const risks: Array<{ composite: number; poisonPill: boolean }> = [];
  for (let i = 0; i < 20; i++) risks.push({ composite: 10, poisonPill: true });
  const s = calculateScore({ risks: { risks }, compliance: { issues: [] }, clauses: { missingProtections: [] } });
  assert.equal(s, 0);
  assert.equal(scoreToGrade(s), 'F');
  assert.equal(scoreToRec(s), 'REJECT');
});

test('Empty input — perfect score', () => {
  assert.equal(calculateScore({}), 100);
  assert.equal(calculateScore(null), 100);
  assert.equal(calculateScore(undefined), 100);
});

test('Grade thresholds match skills/legal-review rubric', () => {
  assert.equal(scoreToGrade(100), 'A+');
  assert.equal(scoreToGrade(90), 'A+');
  assert.equal(scoreToGrade(89), 'A');
  assert.equal(scoreToGrade(80), 'A');
  assert.equal(scoreToGrade(79), 'B');
  assert.equal(scoreToGrade(70), 'B');
  assert.equal(scoreToGrade(69), 'C');
  assert.equal(scoreToGrade(60), 'C');
  assert.equal(scoreToGrade(59), 'D');
  assert.equal(scoreToGrade(40), 'D');
  assert.equal(scoreToGrade(39), 'F');
  assert.equal(scoreToGrade(0), 'F');
});

test('Recommendation thresholds: SIGN >=80, NEGOTIATE >=60, ESCALATE >=40, REJECT <40', () => {
  assert.equal(scoreToRec(100), 'SIGN');
  assert.equal(scoreToRec(80), 'SIGN');
  assert.equal(scoreToRec(79), 'NEGOTIATE');
  assert.equal(scoreToRec(60), 'NEGOTIATE');
  assert.equal(scoreToRec(59), 'ESCALATE');
  assert.equal(scoreToRec(40), 'ESCALATE');
  assert.equal(scoreToRec(39), 'REJECT');
});

console.log();
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
