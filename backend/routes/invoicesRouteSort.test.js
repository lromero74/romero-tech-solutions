import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function readSource(fileName) {
  return readFileSync(join(here, fileName), 'utf8');
}

test('client invoices route validates ORDER BY inputs', () => {
  const src = readSource('client/invoices.js');
  assert.ok(src.includes('resolveSortParameters'));
  assert.ok(src.includes('ORDER BY i.${safeSortBy} ${safeSortOrder}'));
  assert.ok(!src.includes('ORDER BY i.${sortBy} ${sortOrder}'));
});

test('admin invoices route validates ORDER BY inputs', () => {
  const src = readSource('admin/invoices.js');
  assert.ok(src.includes('resolveSortParameters'));
  assert.ok(src.includes('ORDER BY i.${safeSortBy} ${safeSortOrder}'));
  assert.ok(!src.includes('ORDER BY i.${sortBy} ${sortOrder}'));
});
