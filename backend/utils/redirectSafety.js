export function sanitizeRelativeRedirectPath(candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = candidate.trim();
  if (!normalized || !normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }

  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return null;
  }

  if (/[\r\n\x00-\x1f]/.test(decoded)) {
    return null;
  }

  const safePrefixes = ['/dashboard', '/schedule-service', '/onboarding', '/rapid-service-resume'];
  if (!safePrefixes.some(prefix => decoded === prefix || decoded.startsWith(`${prefix}?`))) {
    return null;
  }

  return normalized;
}
