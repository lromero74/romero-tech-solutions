import { getPool } from '../config/database.js';

/**
 * Validates a username according to the following rules:
 * 1. Must be alphanumeric only (no spaces or special characters)
 * 2. Must be between 3 and 30 characters
 * 3. Must be unique among all client usernames
 * 4. Must not contain profanity (with intelligent context recognition)
 */
export async function validateUsername(username, currentUserId = null) {
  const errors = [];

  // Basic format validation
  if (!username || typeof username !== 'string') {
    errors.push('Username is required');
    return { isValid: false, errors };
  }

  // Remove whitespace and convert to lowercase for validation
  const cleanUsername = username.trim().toLowerCase();

  if (cleanUsername.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (cleanUsername.length > 30) {
    errors.push('Username must not exceed 30 characters');
  }

  // Alphanumeric validation (letters and numbers only)
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  if (!alphanumericRegex.test(username.trim())) {
    errors.push('Username can only contain letters and numbers (no spaces or special characters)');
  }

  // If basic validation fails, return early
  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  try {
    const pool = await getPool();

    // Check for uniqueness
    const uniquenessQuery = currentUserId
      ? `SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2 AND role = 'client'`
      : `SELECT id FROM users WHERE LOWER(username) = $1 AND role = 'client'`;

    const uniquenessParams = currentUserId
      ? [cleanUsername, currentUserId]
      : [cleanUsername];

    const uniquenessResult = await pool.query(uniquenessQuery, uniquenessParams);

    if (uniquenessResult.rows.length > 0) {
      errors.push('This username is already taken');
    }

    // Check for profanity with intelligent context recognition
    const profanityResult = await checkProfanity(cleanUsername);
    if (!profanityResult.isValid) {
      errors.push(profanityResult.message);
    }

  } catch (error) {
    console.error('Error validating username:', error);
    errors.push('Unable to validate username at this time');
  }

  return {
    isValid: errors.length === 0,
    errors,
    cleanUsername: username.trim() // Return original case but trimmed
  };
}

/**
 * Intelligent profanity filter that considers context
 * For example, "ass" in "Assessment" is acceptable
 */
async function checkProfanity(username) {
  try {
    const pool = await getPool();

    // Get all active profanity terms
    const profanityQuery = `
      SELECT term, severity
      FROM profanity_filter
      WHERE is_active = true
      ORDER BY LENGTH(term) DESC
    `;

    const profanityResult = await pool.query(profanityQuery);
    const profanityTerms = profanityResult.rows;

    // Check each profanity term
    for (const { term, severity } of profanityTerms) {
      const lowerTerm = term.toLowerCase();
      const lowerUsername = username.toLowerCase();

      // Check if the term is found in the username
      if (lowerUsername.includes(lowerTerm)) {
        // Intelligent context checking
        if (isAcceptableContext(lowerUsername, lowerTerm)) {
          continue; // Skip this term, it's in an acceptable context
        }

        // Found inappropriate content
        return {
          isValid: false,
          message: `Username contains inappropriate content`,
          severity,
          term: lowerTerm
        };
      }
    }

    return { isValid: true };

  } catch (error) {
    console.error('Error checking profanity:', error);
    // In case of error, be permissive but log the issue
    return { isValid: true };
  }
}

/**
 * Determines if a profanity term is used in an acceptable context
 * For example: "ass" in "Assessment" or "Assignment" is OK
 * Supports both English and Spanish context patterns
 */
function isAcceptableContext(username, term) {
  // Define acceptable word patterns that contain common profanity (English & Spanish)
  const acceptablePatterns = {
    // English patterns
    'ass': [
      'assess', 'assessment', 'assign', 'assignment', 'assist', 'assistance',
      'associate', 'association', 'assume', 'assumption', 'class', 'classic',
      'brass', 'grass', 'glass', 'mass', 'pass', 'passage'
    ],
    'hell': [
      'hello', 'shell', 'spell', 'dwell', 'bell', 'well', 'cell', 'tell',
      'michelle', 'mitchell', 'rachel'
    ],
    'damn': [
      'fundamental', 'amendment'
    ],
    // Spanish patterns
    'con': [
      'acon', 'conference', 'confiar', 'construccion', 'consulta', 'contacto',
      'contenido', 'control', 'conversion', 'convenio', 'conversacion'
    ],
    'mal': [
      'normal', 'animal', 'formal', 'informal', 'thermal', 'minimal',
      'optimal', 'decimal', 'maximal', 'guatemala', 'maldives'
    ]
  };

  const patterns = acceptablePatterns[term];
  if (!patterns) {
    return false; // No acceptable patterns defined for this term
  }

  // Check if the username contains any of the acceptable patterns
  for (const pattern of patterns) {
    if (username.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Updates a user's username
 */
export async function updateUsername(userId, newUsername) {
  const validation = await validateUsername(newUsername, userId);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  try {
    const pool = await getPool();

    const updateQuery = `
      UPDATE users
      SET username = $1, username_set_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND role = 'client'
      RETURNING id, username, username_set_at
    `;

    const result = await pool.query(updateQuery, [validation.cleanUsername, userId]);

    if (result.rows.length === 0) {
      return {
        success: false,
        errors: ['User not found or not authorized to set username']
      };
    }

    return {
      success: true,
      data: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        usernameSetAt: result.rows[0].username_set_at
      }
    };

  } catch (error) {
    console.error('Error updating username:', error);

    if (error.code === '23505') { // Unique constraint violation
      return {
        success: false,
        errors: ['This username is already taken']
      };
    }

    return {
      success: false,
      errors: ['Failed to update username']
    };
  }
}