import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePhone } from './userValidation.js';

test('validateEmail accepts a well-formed address', () => {
  assert.deepEqual(validateEmail('tech@romerotechsolutions.com'), { isValid: true });
});

test('validateEmail keeps the { isValid, message } shape admin/users.js renders', () => {
  assert.deepEqual(validateEmail('not-an-email'), {
    isValid: false,
    message: 'Invalid email format'
  });
  assert.deepEqual(validateEmail(''), {
    isValid: false,
    message: 'Email is required'
  });
});

test('validateEmail shares inputValidation rules (trims, enforces max length)', () => {
  assert.deepEqual(validateEmail('  tech@romerotechsolutions.com  '), { isValid: true });
  assert.equal(validateEmail(`${'a'.repeat(250)}@b.com`).isValid, false);
});

test('validatePhone leaves phone optional and accepts common formats', () => {
  assert.deepEqual(validatePhone(''), { isValid: true });
  assert.deepEqual(validatePhone(null), { isValid: true });
  assert.equal(validatePhone('+1 (734) 255-7060').isValid, true);
  assert.equal(validatePhone('nope').isValid, false);
});
