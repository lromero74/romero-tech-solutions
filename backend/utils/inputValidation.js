import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

/**
 * Enhanced Input Validation Utilities
 * Provides comprehensive input sanitization and validation
 */

// File validation configurations
export const FILE_VALIDATION = {
  images: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  },
  documents: {
    allowedTypes: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: ['.pdf', '.txt', '.doc', '.docx']
  },
  avatars: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png'],
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedExtensions: ['.jpg', '.jpeg', '.png']
  },
  attachments: {
    allowedTypes: [
      // Documents
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/gzip'
    ],
    maxSize: 50 * 1024 * 1024, // 50MB (matches multer config in files.js)
    allowedExtensions: ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.zip', '.gz']
  }
};

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

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} input - HTML content to sanitize
 * @returns {string} - Sanitized HTML content
 */
export const sanitizeHtml = (input) => {
  if (!input || typeof input !== 'string') {
    return input;
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  });
};

/**
 * Sanitize plain text input
 * @param {string} input - Text to sanitize
 * @returns {string} - Sanitized text
 */
export const sanitizeText = (input) => {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // Remove any HTML tags and decode HTML entities
  return validator.escape(input.trim());
};

/**
 * Validate phone numbers
 * @param {string} phone - Phone number to validate
 * @returns {object} - {isValid: boolean, sanitized: string}
 */
export const validatePhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, sanitized: '' };
  }

  // Remove all non-digit characters
  const sanitized = phone.replace(/\D/g, '');

  // Check if it's a valid US phone number (10 digits)
  const isValid = /^[1-9]\d{9}$/.test(sanitized);

  return { isValid, sanitized };
};

/**
 * Validate ZIP codes
 * @param {string} zipCode - ZIP code to validate
 * @returns {object} - {isValid: boolean, sanitized: string}
 */
export const validateZipCode = (zipCode) => {
  if (!zipCode || typeof zipCode !== 'string') {
    return { isValid: false, sanitized: '' };
  }

  const sanitized = zipCode.trim();

  // US ZIP code (5 digits or 5+4 format)
  const isValid = /^\d{5}(-\d{4})?$/.test(sanitized);

  return { isValid, sanitized };
};

/**
 * Validate URLs
 * @param {string} url - URL to validate
 * @returns {object} - {isValid: boolean, sanitized: string}
 */
export const validateUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return { isValid: false, sanitized: '' };
  }

  const sanitized = url.trim();
  const isValid = validator.isURL(sanitized, {
    protocols: ['http', 'https'],
    require_protocol: true
  });

  return { isValid, sanitized };
};

/**
 * Validate file uploads based on type
 * @param {object} file - Multer file object
 * @param {string} type - File type category (images, documents, avatars)
 * @returns {object} - {isValid: boolean, error: string}
 */
export const validateFileUpload = (file, type = 'images') => {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  const config = FILE_VALIDATION[type];
  if (!config) {
    return { isValid: false, error: 'Invalid file type category' };
  }

  // Check file size
  if (file.size > config.maxSize) {
    const maxSizeMB = Math.round(config.maxSize / (1024 * 1024));
    return { isValid: false, error: `File too large. Maximum size is ${maxSizeMB}MB` };
  }

  // Check MIME type
  if (!config.allowedTypes.includes(file.mimetype)) {
    return { isValid: false, error: `Invalid file type. Allowed types: ${config.allowedTypes.join(', ')}` };
  }

  // Check file extension (use lastIndexOf to get the actual extension)
  const lastDotIndex = file.originalname.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { isValid: false, error: 'File must have an extension' };
  }
  const ext = file.originalname.toLowerCase().substring(lastDotIndex);
  if (!config.allowedExtensions.includes(ext)) {
    return { isValid: false, error: `Invalid file extension. Allowed extensions: ${config.allowedExtensions.join(', ')}` };
  }

  // Additional security checks - only reject path traversal patterns, not dots in filename
  if (file.originalname.includes('../') || file.originalname.includes('..\\') ||
      file.originalname.includes('/') || file.originalname.includes('\\')) {
    return { isValid: false, error: 'Invalid filename characters detected' };
  }

  return { isValid: true, error: null };
};

/**
 * Comprehensive input sanitization middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export const sanitizeInputMiddleware = (req, res, next) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.sanitized = req.sanitized || {};
    req.sanitized.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.sanitized = req.sanitized || {};
    req.sanitized.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.sanitized = req.sanitized || {};
    req.sanitized.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Recursively sanitize object properties
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Don't sanitize certain fields that might need special characters
      const preserveFields = ['password', 'token', 'secret'];
      if (preserveFields.includes(key.toLowerCase())) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeText(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * SQL injection prevention - validate against dangerous patterns
 * @param {string} input - Input to validate
 * @returns {boolean} - True if input appears safe
 */
export const validateSqlSafety = (input) => {
  if (!input || typeof input !== 'string') {
    return true;
  }

  const dangerousPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    /(--|\/\*|\*\/|;)/,
    /(\b(or|and)\b.*[=<>])/i,
    /(script|javascript|vbscript)/i
  ];

  return !dangerousPatterns.some(pattern => pattern.test(input));
};

export default {
  sanitizeHtml,
  sanitizeText,
  validateEmail,
  validatePhone,
  validateZipCode,
  validateUrl,
  validateFileUpload,
  sanitizeInputMiddleware,
  validateSqlSafety,
  FILE_VALIDATION
};
