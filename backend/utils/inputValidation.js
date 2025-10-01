import validator from 'validator';

/**
 * Input validation and sanitization utilities
 * Provides defense-in-depth against injection attacks and invalid data
 */

/**
 * Validate and sanitize email input
 * @param {string} email - Email address to validate
 * @returns {{ isValid: boolean, sanitized: string, error?: string }}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, sanitized: '', error: 'Email is required' };
  }

  // Trim and normalize
  const trimmed = email.trim();

  // Check length (RFC 5321 max is 254 characters)
  if (trimmed.length === 0) {
    return { isValid: false, sanitized: '', error: 'Email is required' };
  }

  if (trimmed.length > 254) {
    return { isValid: false, sanitized: '', error: 'Email is too long (max 254 characters)' };
  }

  // Validate format
  if (!validator.isEmail(trimmed)) {
    return { isValid: false, sanitized: '', error: 'Invalid email format' };
  }

  // Sanitize and normalize
  const sanitized = validator.normalizeEmail(trimmed, {
    all_lowercase: true,
    gmail_remove_dots: false // Keep dots in Gmail addresses
  });

  return { isValid: true, sanitized };
}

/**
 * Validate password input
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validatePassword(password, options = {}) {
  const { minLength = 8, maxLength = 128, requireComplexity = false } = options;

  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < minLength) {
    return { isValid: false, error: `Password must be at least ${minLength} characters` };
  }

  if (password.length > maxLength) {
    return { isValid: false, error: `Password is too long (max ${maxLength} characters)` };
  }

  if (requireComplexity) {
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      return {
        isValid: false,
        error: 'Password must contain uppercase, lowercase, number, and special character'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate MFA code (6-digit numeric)
 * @param {string} code - MFA code to validate
 * @returns {{ isValid: boolean, sanitized: string, error?: string }}
 */
export function validateMfaCode(code) {
  if (!code || typeof code !== 'string') {
    return { isValid: false, sanitized: '', error: 'MFA code is required' };
  }

  const trimmed = code.trim();

  // Must be exactly 6 digits
  if (!/^\d{6}$/.test(trimmed)) {
    return { isValid: false, sanitized: '', error: 'MFA code must be 6 digits' };
  }

  return { isValid: true, sanitized: trimmed };
}

/**
 * Validate device fingerprint (SHA-256 hex string)
 * @param {string} fingerprint - Device fingerprint to validate
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateDeviceFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'string') {
    return { isValid: false, error: 'Device fingerprint is required' };
  }

  const trimmed = fingerprint.trim();

  // SHA-256 produces 64 hex characters
  if (!/^[a-f0-9]{64}$/i.test(trimmed)) {
    return { isValid: false, error: 'Invalid device fingerprint format' };
  }

  return { isValid: true };
}

/**
 * Sanitize string input - remove HTML/script tags and dangerous characters
 * @param {string} input - String to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, options = {}) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const { maxLength = 1000, allowHtml = false } = options;

  let sanitized = input.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  if (!allowHtml) {
    // Strip HTML tags and entities
    sanitized = validator.escape(sanitized);

    // Additional security: remove common XSS patterns
    sanitized = sanitized
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick=
  }

  return sanitized;
}

/**
 * Validate device name (user-provided string)
 * @param {string} name - Device name to validate
 * @returns {{ isValid: boolean, sanitized: string, error?: string }}
 */
export function validateDeviceName(name) {
  if (!name || typeof name !== 'string') {
    return { isValid: false, sanitized: '', error: 'Device name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { isValid: false, sanitized: '', error: 'Device name cannot be empty' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, sanitized: '', error: 'Device name is too long (max 100 characters)' };
  }

  // Sanitize to prevent XSS
  const sanitized = sanitizeString(trimmed, { maxLength: 100, allowHtml: false });

  return { isValid: true, sanitized };
}

/**
 * Validate all login inputs at once
 * @param {Object} inputs - Object containing email and password
 * @returns {{ isValid: boolean, errors: Object, sanitized: Object }}
 */
export function validateLoginInputs({ email, password }) {
  const errors = {};
  const sanitized = {};

  // Validate email
  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    errors.email = emailResult.error;
  } else {
    sanitized.email = emailResult.sanitized;
  }

  // Validate password (no complexity check for login, only creation)
  const passwordResult = validatePassword(password, { minLength: 1, maxLength: 128 });
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized
  };
}

/**
 * Calculate password strength score (0-4)
 * @param {string} password - Password to evaluate
 * @returns {{ score: number, feedback: string }}
 */
export function calculatePasswordStrength(password) {
  if (!password) {
    return { score: 0, feedback: 'Password required' };
  }

  let score = 0;

  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Character variety
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

  // Common patterns (reduce score)
  if (/^[a-zA-Z]+$/.test(password)) score = Math.max(0, score - 1); // Only letters
  if (/^[0-9]+$/.test(password)) score = Math.max(0, score - 1); // Only numbers
  if (/(.)\1{2,}/.test(password)) score = Math.max(0, score - 1); // Repeated characters

  // Normalize to 0-4 scale
  score = Math.min(4, Math.max(0, score));

  // Generate feedback
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const feedbackText = strengthLabels[score];

  return { score, feedback: feedbackText };
}
