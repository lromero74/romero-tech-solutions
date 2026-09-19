import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSortParameters, parseCappedLimit, parseCappedPage } from './sortValidation.js';

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

test('parseCappedLimit passes through sane values', () => {
  assert.equal(parseCappedLimit('20', 20), 20);
  assert.equal(parseCappedLimit('500', 50), 500);
});

test('parseCappedLimit clamps oversized limits to the maximum', () => {
  assert.equal(parseCappedLimit('1000000', 50), 500);
});

test('parseCappedLimit falls back to the default for missing or invalid input', () => {
  assert.equal(parseCappedLimit(undefined, 50), 50);
  assert.equal(parseCappedLimit('abc', 20), 20);
  assert.equal(parseCappedLimit('0', 20), 20);
  assert.equal(parseCappedLimit('-5', 20), 20);
});

test('parseCappedPage keeps sane pages and clamps the rest', () => {
  assert.equal(parseCappedPage('3'), 3);
  assert.equal(parseCappedPage(undefined), 1);
  assert.equal(parseCappedPage('abc'), 1);
  assert.equal(parseCappedPage('0'), 1);
  assert.equal(parseCappedPage('-5'), 1);
  assert.equal(parseCappedPage('1000000'), 1000);
});
