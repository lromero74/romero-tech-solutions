// Regression guard for confluenceDetectionService.js — source-lint style.
//
// Bug (2026-07-04): detectAndCreateAlerts() called
// alertConfigService.getAllConfigurations(), which does not exist (the real
// method is getAllConfigs()). Every confluence-detection run threw
// "TypeError: alertConfigService.getAllConfigurations is not a function"
// (~55×/hour in prod) — the whole feature was silently dead. This pins every
// alertConfigService.<method>() call in this file to a method that actually
// exists on AlertConfigService, so a method-name typo can't ship again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'confluenceDetectionService.js'), 'utf8');
const SVC = readFileSync(join(here, 'alertConfigService.js'), 'utf8');

test('does not reference the non-existent getAllConfigurations', () => {
  assert.ok(!/getAllConfigurations/.test(SRC),
    "getAllConfigurations() does not exist on AlertConfigService — use getAllConfigs()");
});

test('every alertConfigService.<method>() call resolves to a real method', () => {
  // Method names defined on AlertConfigService (async foo( ... ) or foo( ... ) {)
  const defined = new Set(
    [...SVC.matchAll(/^\s*(?:async\s+)?([a-zA-Z_][\w]*)\s*\(/gm)].map(m => m[1])
  );
  // Every alertConfigService.X( call site in the confluence service.
  const called = [...SRC.matchAll(/alertConfigService\.([a-zA-Z_][\w]*)\s*\(/g)].map(m => m[1]);
  assert.ok(called.length > 0, 'expected at least one alertConfigService call to verify');
  for (const name of called) {
    assert.ok(defined.has(name),
      `alertConfigService.${name}() is called but not defined on AlertConfigService`);
  }
});
