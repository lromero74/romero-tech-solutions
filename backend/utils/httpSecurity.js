const FILENAME_CONTROL_CHAR_RE = /[\r\n]/g;
const FILENAME_PATH_SEPARATORS_RE = /[\\/]/g;
const FILENAME_DISALLOWED_RE = /["%*:?|<>]/g;
const FILENAME_C0_RE = /[\x00-\x1F\x7F]+/g;

function normalizeFilenameInput(filename) {
  return (typeof filename === 'string' ? filename : String(filename || '')).trim();
}

export function sanitizeAttachmentFilename(filename) {
  let sanitized = normalizeFilenameInput(filename)
    .replace(FILENAME_CONTROL_CHAR_RE, ' ')
    .replace(FILENAME_DISALLOWED_RE, '_')
    .replace(FILENAME_PATH_SEPARATORS_RE, '-')
    .replace(/\.\.+/g, '.')
    .replace(FILENAME_C0_RE, '')
    .trim();

  if (!sanitized) {
    return 'download.bin';
  }

  if (sanitized.length > 150) {
    sanitized = sanitized.slice(0, 150);
  }

  return sanitized;
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

export function attachmentContentDisposition(filename) {
  const sanitized = sanitizeAttachmentFilename(filename);
  const asciiFallback = sanitized
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 100) || 'download.bin';

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRFC5987ValueChars(sanitized)}`;
}

export const SAFE_FILENAME_RE = /^[0-9A-Za-z._-]+(\.[0-9A-Za-z._-]+)*$/;

export function isSafeSanitizedFilename(filename) {
  return SAFE_FILENAME_RE.test(sanitizeAttachmentFilename(filename));
}
