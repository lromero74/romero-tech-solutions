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
  failedAttempts.set(clientIP, recentAttempts);

  if (recentAttempts.length >= maxAttempts) {
    return {
      blocked: true,
      retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000)
    };
  }

  return { blocked: false };
};

export { failedAttempts, recordFailedAttempt, clearFailedAttempts, checkFailedAttempts };
