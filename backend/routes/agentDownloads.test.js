import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'agentDownloads.js'), 'utf8');

function findRoute(method, path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`router\\.${method}\\(\\s*['\"]${escaped}['\"]`);
  const m = SRC.match(re);
  if (!m) return null;

  const start = m.index;
  let depth = 0;
  for (let i = start; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        const semi = SRC.indexOf(';', i);
        return SRC.slice(start, semi >= 0 ? semi + 1 : i + 1);
      }
    }
  }
  return null;
}

test('download endpoint validates version and architecture inputs', () => {
  const block = findRoute('get', '/download/:platform');
  assert.ok(block, "router.get('/download/:platform') must exist");
  assert.match(block, /SEMVER_WITH_PREFIX_RE/);
  assert.match(block, /Invalid version/);
  assert.match(block, /ALLOWED_ARCHES/);
  assert.match(block, /Invalid arch/);
});

test('download endpoint constrains linux format and uses safe content-disposition', () => {
  const block = findRoute('get', '/download/:platform');
  assert.ok(block);
  assert.match(block, /ALLOWED_FORMATS/);
  assert.match(block, /Invalid format/);
  assert.match(block, /attachmentContentDisposition\\(filename\\)/);
  assert.match(block, /createReadStream\\(binaryPath\\)/);
});
