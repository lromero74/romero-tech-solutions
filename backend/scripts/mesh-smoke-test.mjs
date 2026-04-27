#!/usr/bin/env node
/**
 * Smoke test for backend/services/meshcentralService.js.
 *
 * Verifies we can authenticate to MeshCentral and round-trip a
 * `serverinfo` action. Run after generating a login token via the
 * MeshCentral web UI and storing the values in .env.
 *
 * Usage (from backend/ dir):
 *   node scripts/mesh-smoke-test.mjs
 *
 * Expected output on success:
 *   ✅ Connected to MeshCentral X.Y.Z
 *   Cert hash: <sha384 hex>
 *
 * If you see "MESHCENTRAL_TOKEN_KEY must be 160 hex chars" — the
 * key you copied from the UI is wrong (probably copied just the
 * username or just the partial key). The token UI shows two
 * fields; you need both, and the key is exactly 160 hex chars.
 */

import dotenv from 'dotenv';
dotenv.config();

import meshcentral from '../services/meshcentralService.js';

try {
  console.log('Calling serverInfo()…');
  const info = await meshcentral.serverInfo();
  console.log('✅ Connected to MeshCentral');
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.error('❌ MeshCentral connection failed:', e.message);
  process.exit(1);
}
process.exit(0);
