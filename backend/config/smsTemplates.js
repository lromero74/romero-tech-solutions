/**
 * SMS Message Templates for Romero Tech Solutions
 *
 * Professional SMS templates for multi-factor authentication and security notifications.
 * These templates are designed to comply with A2P 10DLC requirements and provide
 * clear, secure messaging for client portal authentication and security alerts.
 */

export const SMS_TEMPLATES = {
  // Multi-Factor Authentication Templates
  MFA: {
    VERIFICATION_CODE: {
      template: "Your Romero Tech Solutions verification code is {code}. This code expires in {minutes} minutes. Do not share this code with anyone.",
      description: "Standard MFA verification code message",
      variables: ["code", "minutes"],
      defaultValues: { minutes: 10 }
    },

    LOGIN_CODE: {
      template: "Your Romero Tech Solutions login code is {code}. Enter this code to complete your sign-in. Code expires in {minutes} minutes.",
      description: "Login-specific verification code",
      variables: ["code", "minutes"],
      defaultValues: { minutes: 10 }
    }
  },

  // Password Management Templates
  PASSWORD: {
    RESET_CONFIRMATION: {
      template: "Your password has been successfully reset for your Romero Tech Solutions account. If you did not request this change, please contact support immediately.",
      description: "Password reset confirmation message",
      variables: [],
      defaultValues: {}
    },

    RESET_CODE: {
      template: "Your Romero Tech Solutions password reset code is {code}. Use this code to reset your password. Code expires in {minutes} minutes.",
      description: "Password reset verification code",
      variables: ["code", "minutes"],
      defaultValues: { minutes: 15 }
    }
  },

  // Security Alert Templates
  SECURITY: {
    NEW_LOGIN_ALERT: {
      template: "Security alert: New login detected on your Romero Tech Solutions account from a new device. If this was not you, please secure your account immediately.",
      description: "New device/location login alert",
      variables: [],
      defaultValues: {}
    },

    ACCOUNT_LOCKED: {
      template: "Your Romero Tech Solutions account has been temporarily locked due to multiple failed login attempts. Contact support to unlock your account.",
      description: "Account lockout notification",
      variables: [],
      defaultValues: {}
    },

    SUSPICIOUS_ACTIVITY: {
      template: "Security alert: Suspicious activity detected on your Romero Tech Solutions account. Please review your account and contact support if needed.",
      description: "General suspicious activity alert",
      variables: [],
      defaultValues: {}
    }
  },

  // Account Management Templates
  ACCOUNT: {
    WELCOME: {
      template: "Welcome to Romero Tech Solutions! Your account has been created successfully. Please verify your phone number to complete setup.",
      description: "New account welcome message",
      variables: [],
      defaultValues: {}
    },

    PHONE_VERIFICATION: {
      template: "Please verify your phone number for Romero Tech Solutions. Your verification code is {code}. Enter this code to confirm your number.",
      description: "Phone number verification",
      variables: ["code"],
      defaultValues: {}
    }
  }
};

/**
 * Format an SMS message using a template
 * @param {string} category - Template category (MFA, PASSWORD, SECURITY, ACCOUNT)
 * @param {string} type - Template type within category
 * @param {Object} variables - Variables to substitute in template
 * @returns {string} Formatted SMS message
 */
export function formatSMSMessage(category, type, variables = {}) {
  const template = SMS_TEMPLATES[category]?.[type];

  if (!template) {
    throw new Error(`SMS template not found: ${category}.${type}`);
  }

  // Merge provided variables with default values
  const mergedVariables = { ...template.defaultValues, ...variables };

  // Replace variables in template
  let message = template.template;
  template.variables.forEach(variable => {
    const value = mergedVariables[variable];
    if (value !== undefined) {
      message = message.replace(new RegExp(`{${variable}}`, 'g'), value);
    } else {
      console.warn(`Missing variable '${variable}' for SMS template ${category}.${type}`);
    }
  });

  return message;
}

/**
 * Get all available SMS templates with descriptions
 * @returns {Object} Object containing all templates with metadata
 */
export function getAllSMSTemplates() {
  const templates = {};

  Object.keys(SMS_TEMPLATES).forEach(category => {
    templates[category] = {};
    Object.keys(SMS_TEMPLATES[category]).forEach(type => {
      templates[category][type] = {
        ...SMS_TEMPLATES[category][type],
        id: `${category}.${type}`,
        fullName: `${category} - ${type}`
      };
    });
  });

  return templates;
}

/**
 * Validate SMS message length (160 character limit for single SMS)
 * @param {string} message - SMS message to validate
 * @returns {Object} Validation result with length info
 */
export function validateSMSLength(message) {
  const length = message.length;
  const singleSMSLimit = 160;
  const multiSMSLimit = 153; // Each part in multi-part SMS

  if (length <= singleSMSLimit) {
    return {
      valid: true,
      length,
      parts: 1,
      type: 'single',
      remaining: singleSMSLimit - length
    };
  } else {
    const parts = Math.ceil(length / multiSMSLimit);
    return {
      valid: parts <= 3, // Recommend max 3 parts
      length,
      parts,
      type: 'multi-part',
      recommendation: parts > 3 ? 'Consider shortening message' : 'Acceptable length'
    };
  }
}

// Example usage for MFA:
// const mfaMessage = formatSMSMessage('MFA', 'VERIFICATION_CODE', { code: '123456', minutes: 10 });
// const passwordResetMessage = formatSMSMessage('PASSWORD', 'RESET_CONFIRMATION');
// const securityAlert = formatSMSMessage('SECURITY', 'NEW_LOGIN_ALERT');

export default {
  SMS_TEMPLATES,
  formatSMSMessage,
  getAllSMSTemplates,
  validateSMSLength
};