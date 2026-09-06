import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAttachmentFilename, attachmentContentDisposition } from './httpSecurity.js';

test('sanitizeAttachmentFilename strips CR/LF and path separators', () => {
  assert.equal(
    sanitizeAttachmentFilename('report\r\n.pdf/../secret'),
    'report  .pdf-.-secret'
  );
});

test('sanitizeAttachmentFilename provides a safe fallback name', () => {
  assert.equal(sanitizeAttachmentFilename(''), 'download.bin');
  assert.equal(sanitizeAttachmentFilename(null), 'download.bin');
});

test('attachmentContentDisposition encodes for RFC 5987 and includes fallback', () => {
  const header = attachmentContentDisposition('weird "name"\nfile.rts');
  assert.equal(header.startsWith('attachment; filename="'), true);
  assert.ok(header.includes('filename*=UTF-8\'\''));
  assert.ok(header.includes('%22')); // encoded quote from unsafe input
});
