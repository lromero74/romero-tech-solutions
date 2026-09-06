import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSortingAndPagination } from './userQueryService.js';

test('buildSortingAndPagination allows safe explicit sort columns', () => {
  const queryParams = [];
  const { clause } = buildSortingAndPagination(
    { sortBy: 'last_login', sortOrder: 'ASC' },
    { limit: 25, offset: 0 },
    queryParams,
    0
  );

  assert.ok(clause.includes('ORDER BY last_login ASC'));
});

test('buildSortingAndPagination rejects dangerous sort columns', () => {
  const queryParams = [];
  const { clause } = buildSortingAndPagination(
    { sortBy: 'created_at;DROP TABLE users;', sortOrder: 'DROP' },
    { limit: 25, offset: 0 },
    queryParams,
    0
  );

  assert.ok(clause.includes('ORDER BY created_at DESC'));
  assert.ok(!clause.includes('DROP TABLE users'));
});
