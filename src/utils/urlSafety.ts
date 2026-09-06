const INVALID_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export const getSafeInternalPath = (path: string | null | undefined): string | null => {
  if (!path || typeof path !== 'string') {
    return null;
  }

  if (!path.startsWith('/') || path.startsWith('//')) {
    return null;
  }

  if (path.length > 2048 || INVALID_CONTROL_CHARS.test(path)) {
    return null;
  }

  try {
    const normalized = new URL(path, window.location.origin);

    if (normalized.origin !== window.location.origin) {
      return null;
    }

    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return null;
  }
};
