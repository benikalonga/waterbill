import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceUsage, validateBands, zScore } from './tariff';

const bands = [
  { fromM3: 0, toM3: 20, centsPerM3: 25 },
  { fromM3: 20, toM3: null, centsPerM3: 35 },
];

test('usage inside the first band', () => {
  const p = priceUsage(10_000, bands, 350, 1600);
  assert.equal(p.usageCents, 250);
  assert.equal(p.vatCents, 96);
  assert.equal(p.totalCents, 696);
  assert.equal(p.lines.length, 1);
});

test('usage across bands is split at the boundary', () => {
  const p = priceUsage(25_000, bands, 0, 0);
  assert.deepEqual(p.lines.map((l) => [l.litres, l.cents]), [[20_000, 500], [5_000, 175]]);
  assert.equal(p.totalCents, 675);
});

test('zero usage still pays the fixed charge', () => {
  const p = priceUsage(0, bands, 350, 1600);
  assert.equal(p.usageCents, 0);
  assert.equal(p.totalCents, 406);
});

test('partial cubic metres are billed by the litre', () => {
  assert.equal(priceUsage(500, bands, 0, 0).usageCents, 13);
});

test('band validation', () => {
  assert.equal(validateBands(bands), null);
  assert.match(validateBands([{ fromM3: 5, toM3: null, centsPerM3: 1 }])!, /start at 0/);
  assert.match(validateBands([{ fromM3: 0, toM3: 10, centsPerM3: 1 }, { fromM3: 12, toM3: null, centsPerM3: 1 }])!, /must meet/);
  assert.match(validateBands([])!, /at least one/);
});

test('z-score', () => {
  assert.equal(zScore(10, [10, 10, 10]), 0);
  assert.equal(zScore(5, [5]), 0);
  assert.ok(zScore(100, [10, 12, 11, 9, 10]) > 2.5);
});
