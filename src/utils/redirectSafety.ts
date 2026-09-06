export function sanitizeRelativeDashboardRedirect(candidate: string | null): string {
  const normalized = (candidate || '/dashboard').trim();
  if (!normalized || !normalized.startsWith('/') || normalized.startsWith('//')) {
    return '/dashboard';
  }

  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return '/dashboard';
  }

  if (/[\r\n\x00-\x1f]/.test(decoded)) {
    return '/dashboard';
  }

  const safePrefixes = ['/dashboard', '/schedule-service', '/onboarding', '/rapid-service-resume'];

  if (!safePrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}?`))) {
    return '/dashboard';
  }

  return normalized;
}
