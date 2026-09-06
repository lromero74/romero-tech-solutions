import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSortParameters } from './sortValidation.js';

test('resolveSortParameters keeps allowed sort columns and ORDER', () => {
  const result = resolveSortParameters({
    sortBy: 'updated_at',
    sortOrder: 'ASC',
    allowedSortBy: ['created_at', 'updated_at'],
    defaultSortBy: 'created_at'
  });

  assert.equal(result.safeSortBy, 'updated_at');
  assert.equal(result.safeSortOrder, 'ASC');
});

test('resolveSortParameters normalizes invalid sort column to default', () => {
  const result = resolveSortParameters({
    sortBy: 'created_at;DROP TABLE users;',
    sortOrder: 'ASC',
    allowedSortBy: ['created_at', 'updated_at'],
    defaultSortBy: 'created_at'
  });

  assert.equal(result.safeSortBy, 'created_at');
  assert.equal(result.safeSortOrder, 'ASC');
});

test('resolveSortParameters falls back to DESC when order is not ASC', () => {
  const result = resolveSortParameters({
    sortBy: 'created_at',
    sortOrder: 'DESC;--',
    allowedSortBy: ['created_at', 'updated_at'],
    defaultSortBy: 'created_at'
  });

  assert.equal(result.safeSortBy, 'created_at');
  assert.equal(result.safeSortOrder, 'DESC');
});
