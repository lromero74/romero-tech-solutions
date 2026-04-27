#!/usr/bin/env node
/**
 * Smoke test for backend/services/meshcentralService.js.
 *
 * Verifies we can authenticate to MeshCentral, receive its
 * push-on-connect serverinfo, AND round-trip a request-response
 * action (listDeviceGroups). If both work, the integration is
 * good for Phase 2 §16.3 (the routes layer) to build on.
 *
 * Usage (from backend/ dir):
 *   node scripts/mesh-smoke-test.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

import meshcentral from '../services/meshcentralService.js';

let exitCode = 0;

console.log('1. Calling serverInfo()…');
try {
  const info = await meshcentral.serverInfo();
  const v = info?.serverinfo?.version || info?.version || '?';
  console.log(`   ✅ MeshCentral v${v} reachable`);
  if (info?.serverinfo?.domain !== undefined) {
    console.log(`   domain: "${info.serverinfo.domain}"`);
  }
} catch (e) {
  console.error(`   ❌ ${e.message}`);
  exitCode = 1;
}

console.log('2. Calling listDeviceGroups()…');
try {
  const resp = await meshcentral.listDeviceGroups();
  const groups = resp?.meshes || [];
  console.log(`   ✅ ${groups.length} group(s) visible:`);
  for (const g of groups) {
    console.log(`      - ${g.name} (${g._id})`);
  }
} catch (e) {
  console.error(`   ❌ ${e.message}`);
  exitCode = 1;
}

console.log('3. Calling listDevices()…');
try {
  const resp = await meshcentral.listDevices();
  const meshes = Object.keys(resp?.nodes || {});
  let total = 0;
  for (const m of meshes) total += (resp.nodes[m] || []).length;
  console.log(`   ✅ ${total} device(s) across ${meshes.length} group(s)`);
  for (const m of meshes) {
    for (const n of resp.nodes[m]) {
      console.log(`      - ${n.name} [${n._id}]`);
    }
  }
} catch (e) {
  console.error(`   ❌ ${e.message}`);
  exitCode = 1;
}

if (exitCode === 0) console.log('\n✅ All MeshCentral checks passed — Phase 2 §16.3 unblocked.');
else console.log('\n❌ One or more checks failed.');
process.exit(exitCode);
