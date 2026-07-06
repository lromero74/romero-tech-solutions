// Regression guard — source-lint style.
//
// Bug (2026-07-05): alertNotificationService.js and subscriberManagementService.js
// both SELECT `u.preferred_language` from a `JOIN users u`, but the users table's
// language column is `language_preference` — `preferred_language` lives on
// client_alert_subscriptions (aliased `cas`). Every alert-notification routing
// call threw "column u.preferred_language does not exist", so no client alert
// ever routed. (Latent until the confluence-detection + alert_type/severity
// constraint fixes let alerts actually reach routeAlert.) This pins the users-
// table language column name so the typo can't come back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = ['alertNotificationService.js', 'subscriberManagementService.js'];

for (const f of files) {
  test(`${f}: does not select the non-existent users.preferred_language (it is language_preference)`, () => {
    const src = readFileSync(join(here, f), 'utf8');
    assert.ok(!/\bu\.preferred_language\b/.test(src),
      `${f} references u.preferred_language — the users table column is language_preference`);
  });
}
