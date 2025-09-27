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
  }
};

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
 * Validate and sanitize email addresses
 * @param {string} email - Email to validate
 * @returns {object} - {isValid: boolean, sanitized: string}
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { isValid: false, sanitized: '' };
  }

  const sanitized = validator.normalizeEmail(email);
  const isValid = validator.isEmail(sanitized);

  return { isValid, sanitized };
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

  // Check file extension
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (!config.allowedExtensions.includes(ext)) {
    return { isValid: false, error: `Invalid file extension. Allowed extensions: ${config.allowedExtensions.join(', ')}` };
  }

  // Additional security checks
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
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