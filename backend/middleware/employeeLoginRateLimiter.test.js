import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';

// The module starts a 15-minute cleanup interval at import time. It must not
// hold the event loop open, otherwise any test (or script) importing it hangs
// on exit — this blocked the backend suite once auth/session.js imported it.
// Ground truth is process exit: a child that only imports the module must
// terminate on its own well before the exec timeout.
test('importing the limiter does not block process exit', async () => {
  await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', 'await import("./employeeLoginRateLimiter.js")'],
      { cwd: import.meta.dirname, timeout: 15000 },
      (err, _stdout, _stderr) => (err ? reject(err) : resolve())
    );
  });
  assert.ok(true, 'child process exited on its own after only importing the module');
});
