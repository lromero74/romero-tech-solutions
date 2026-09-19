import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMfaCode,
  generateClientBackupCodes,
  validateMfaCode
} from './inputValidation.js';

test('generateMfaCode returns zero-padded 6-digit strings', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generateMfaCode(), /^\d{6}$/);
  }
});

test('generateMfaCode output varies across a batch', () => {
  const batch = new Set(Array.from({ length: 50 }, () => generateMfaCode()));
  assert.ok(batch.size > 40);
});

test('generateClientBackupCodes returns 10 unique 8-char codes', () => {
  const codes = generateClientBackupCodes();
  assert.equal(codes.length, 10);
  for (const code of codes) {
    assert.match(code, /^[0-9A-F]{8}$/);
  }
  assert.equal(new Set(codes).size, 10);
});

test('validateMfaCode accepts 6 digits and rejects the rest', () => {
  assert.equal(validateMfaCode('123456').isValid, true);
  assert.equal(validateMfaCode('12345').isValid, false);
  assert.equal(validateMfaCode('abcdef').isValid, false);
  assert.equal(validateMfaCode(null).isValid, false);
});
