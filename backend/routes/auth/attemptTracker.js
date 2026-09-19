// Shared in-process login-attempt tracker, extracted verbatim from
// routes/auth.js. One module instance == one process, so the rate-limit
// semantics are unchanged for every importer (session + magic-link routes).

const failedAttempts = new Map(); // Store failed login attempts by IP


const recordFailedAttempt = (clientIP) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes

  if (!failedAttempts.has(clientIP)) {
    failedAttempts.set(clientIP, []);
  }

  const attempts = failedAttempts.get(clientIP);
  attempts.push(now);

  // Remove attempts older than the window
  const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
  failedAttempts.set(clientIP, recentAttempts);
};

const clearFailedAttempts = (clientIP) => {
  failedAttempts.delete(clientIP);
};

const checkFailedAttempts = (clientIP) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5; // Maximum 5 failed attempts per 15 minutes

  if (!failedAttempts.has(clientIP)) {
    return { blocked: false };
  }

  const attempts = failedAttempts.get(clientIP);
  const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
  // Drop the key when nothing remains — otherwise the map grows one entry
  // per unique IP forever (same pattern as cleanupEmployeeLoginTracking).
  if (recentAttempts.length === 0) {
    failedAttempts.delete(clientIP);
  } else {
    failedAttempts.set(clientIP, recentAttempts);
  }

  if (recentAttempts.length >= maxAttempts) {
    return {
      blocked: true,
      retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000)
    };
  }

  return { blocked: false };
};

/**
 * Delete keys whose every attempt has expired. Runs on an unref()ed interval
 * so idle keys (IPs never seen again) cannot grow the map forever — the
 * request path alone cannot evict them because recording re-adds the key.
 */
const sweepAttemptTracker = (now = Date.now()) => {
  const windowMs = 15 * 60 * 1000; // 15 minutes
  for (const [key, attempts] of failedAttempts.entries()) {
    if (!attempts.some(attemptTime => now - attemptTime < windowMs)) {
      failedAttempts.delete(key);
    }
  }
};

// unref()ed so importing this module never holds the event loop open.
setInterval(sweepAttemptTracker, 15 * 60 * 1000).unref();

export { failedAttempts, recordFailedAttempt, clearFailedAttempts, checkFailedAttempts, sweepAttemptTracker };
