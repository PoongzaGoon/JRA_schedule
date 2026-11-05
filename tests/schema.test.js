import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { example } from '../src/example.js';
import { validateSchedule, jsonSchema } from '../src/schema.js';
import { extractionPrompt } from '../src/prompt.js';
const copy = () => structuredClone(example);
test('fictional screenshot-shaped data validates and reports row counts and warnings', () => {
  const r = validateSchedule(example);
  assert.equal(r.ok, true); assert.equal(r.totalRows, 7); assert.equal(r.counts.length, 4);
  assert(r.warnings.some(w => w.path.endsWith('weightKg')));
  assert(r.warnings.some(w => w.path === '$.isExample'));
});
test('invalid JSON and Markdown produce actionable errors without accepting code', () => {
  for (const raw of ['{', '```json\n{}\n```', '<script>alert(1)</script>']) assert.equal(validateSchedule(raw).ok, false);
});
test('schema rejects unknown keys, impossible dates, invalid units and unsafe source URLs', () => {
  for (const mutate of [d => { d.referenceDate = '2026-02-30'; }, d => { d.html = '<b>bad</b>'; }, d => { d.sourceUrl = 'javascript:alert(1)'; }, d => { d.stallions[0].raceDays[0].entries[0].weightKg = 55.3; }]) {
    const d = copy(); mutate(d); assert.equal(validateSchedule(d).ok, false);
  }
});
test('normalized duplicate rows in same race are blocked', () => {
  const d = copy(); const rows = d.stallions[0].raceDays[0].entries;
  const clone = structuredClone(rows[0]); clone.horse.ja = ' ' + clone.horse.ja + ' ';
  rows.push(clone); assert(validateSchedule(d).errors.some(e => e.message.includes('중복 행')));
});
test('duplicate date groups and stallion IDs are blocked', () => {
  const d = copy(); d.stallions.push(structuredClone(d.stallions[0]));
  d.stallions[0].raceDays.push(structuredClone(d.stallions[0].raceDays[0]));
  const r = validateSchedule(d); assert.equal(r.ok, false); assert(r.errors.length >= 2);
});
test('unknown values are warnings, not invented values', () => {
  const d = copy(); const row = d.stallions[0].raceDays[0].entries[0]; row.horse = null;
  const r = validateSchedule(d); assert.equal(r.ok, true); assert.equal(r.data.stallions[0].raceDays[0].entries[0].horse, null);
  assert(r.warnings.some(e => e.path.endsWith('.horse')));
});
test('Korean text must declare provenance', () => {
  const d = copy(); d.stallions[0].name.koKind = null; assert.equal(validateSchedule(d).ok, false);
});
test('generated JSON Schema, prompt and example match runtime sources', async () => {
  assert.deepEqual(JSON.parse(await readFile('public/schedule.schema.json', 'utf8')), jsonSchema);
  assert.equal(await readFile('public/extraction-prompt.txt', 'utf8'), extractionPrompt);
  assert(extractionPrompt.includes(JSON.stringify(jsonSchema, null, 2)));
  assert.deepEqual(JSON.parse(await readFile('examples/fictional-schedule.json', 'utf8')), example);
});
