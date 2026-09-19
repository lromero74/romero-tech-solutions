import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the agents.js aggregate wiring statically: the shared router must be
// declared before first use, every mount must be imported, and the complete
// mount list must stay pinned (a splice slip during the auth splits silently
// dropped mounts while the suite stayed green).
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents.js'), 'utf8');

test('agents aggregate declares its router before first use', () => {
  const decl = src.indexOf('const router = express.Router();');
  assert.ok(decl !== -1, 'agents.js must declare const router = express.Router()');
  const firstUse = src.indexOf('router.');
  assert.ok(firstUse > decl, 'router must be declared before its first use');
});

test('aggregate mounts all sub-routers in registration order', () => {
  const mounts = [...src.matchAll(/router\.use\((\w+)\)/g)].map(m => m[1]);
  assert.deepEqual(mounts, [
    'trialRoutes',
    'registrationRoutes',
    'inventoryRoutes',
    'commandsRoutes',
    'devicesRoutes',
    'monitoringRoutes'
  ]);
});
