// Regression guards for the MeshCentral iframe SSO URL builder.
//
// Today's outage trace, distilled — pin each finding so it can't
// silently regress:
//
//   1. ?login=<base64(user:pass)> is NOT auto-login. MC's ?login=
//      param expects a SERVER-SIGNED encrypted cookie; user:pass is
//      ignored. Prior code shipped this and users saw MC's login
//      form inside the iframe.
//
//   2. ?user=&pass= IS auto-login but uses createLoginToken token-
//      users, which authenticate AS the underlying user but inherit
//      ZERO mesh-link rights. Connect/RDP/HW buttons stay greyed.
//
//   3. The working path is logincookie via the management WS —
//      `getLoginCookie()` — passed as ?login=<cookie>. That binds
//      the iframe session to the management user directly (not
//      via a token-user proxy), so mesh.links rights flow through.
//
// This file does not import the routes (they pull in db, websocket,
// etc.), it just lints the source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'remoteControl.js'), 'utf8');

test('iframe URL must use cookie-based SSO via ?login=', () => {
  const m = /(const|let)\s+sessionUrl\s*=[\s\S]+?;/.exec(SRC);
  assert.ok(m, 'expected a sessionUrl assignment');
  const block = m[0];
  assert.ok(
    block.includes('login='),
    `sessionUrl must include login=<cookie> param, got:\n${block}`
  );
  assert.ok(
    !/\?user=\$\{|&user=\$\{|\?user=`|&user=`/.test(block),
    `sessionUrl must NOT use ?user=&pass= token-user auth (rights stripped). Got:\n${block}`
  );
});

test('start handler must mint the cookie via getLoginCookie', () => {
  const usesCookie = /getLoginCookie\s*\(\s*\)/.test(SRC);
  assert.ok(usesCookie, 'remoteControl.js must call getLoginCookie() to mint the SSO cookie');

  const startHandler = /router\.post\(\s*['"]\/agents\/:agent_id\/start['"][\s\S]+?\}\s*\)\s*;/.exec(SRC);
  assert.ok(startHandler, 'expected /agents/:agent_id/start handler');
  assert.ok(
    !/mintLoginToken\s*\(/.test(startHandler[0]),
    'start handler must not call mintLoginToken — that path produces a rights-stripped session'
  );
});

test('gotonode value must have node/<domain>/ prefix stripped', () => {
  const stripPattern = /\.replace\(\s*\/\^node\\\/\[\^\/\]\*\\\/\//;
  assert.ok(
    stripPattern.test(SRC),
    'must strip node/<domain>/ from node id before passing as gotonode (else MC builds node//node//xxx and matches nothing)'
  );
});
