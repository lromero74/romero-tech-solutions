export interface PasswordComplexityRequirements {
  id?: string;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialCharacters: boolean;
  specialCharacterSet?: string;
  maxLength?: number;
  preventCommonPasswords?: boolean;
  preventUserInfoInPassword?: boolean;
  enablePasswordHistory?: boolean;
  passwordHistoryCount?: number;
  enablePasswordExpiration?: boolean;
  expirationDays?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PasswordStrengthResult {
  score: number;
  meets: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
    noCommonPassword?: boolean;
    noUserInfo?: boolean;
  };
  isValid: boolean;
  feedback: string[];
}

export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordComplexityRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialCharacters: true,
  specialCharacterSet: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  maxLength: 128,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  enablePasswordHistory: true,
  passwordHistoryCount: 5,
  enablePasswordExpiration: true,
  expirationDays: 90,
  isActive: true
};

export const evaluatePasswordStrength = (
  password: string,
  requirements: PasswordComplexityRequirements,
  userInfo?: { name?: string; email?: string; }
): PasswordStrengthResult => {
  const meets = {
    minLength: password.length >= requirements.minLength,
    hasUppercase: requirements.requireUppercase ? /[A-Z]/.test(password) : true,
    hasLowercase: requirements.requireLowercase ? /[a-z]/.test(password) : true,
    hasNumber: requirements.requireNumbers ? /\d/.test(password) : true,
    hasSpecialChar: requirements.requireSpecialCharacters ?
      new RegExp(`[${requirements.specialCharacterSet?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '!@#$%^&*()_+\\-=\\[\\]{}|;:,.<>?'}]`).test(password) : true,
    noCommonPassword: true, // TODO: Implement common password check
    noUserInfo: true // TODO: Implement user info check
  };

  // Check user info in password if required and userInfo provided
  if (requirements.preventUserInfoInPassword && userInfo) {
    const lowerPassword = password.toLowerCase();
    if (userInfo.name && lowerPassword.includes(userInfo.name.toLowerCase())) {
      meets.noUserInfo = false;
    }
    if (userInfo.email) {
      const emailParts = userInfo.email.toLowerCase().split('@')[0];
      if (lowerPassword.includes(emailParts)) {
        meets.noUserInfo = false;
      }
    }
  }

  const metCount = Object.values(meets).filter(Boolean).length;
  const totalRequirements = Object.values(meets).length;
  const score = Math.round((metCount / totalRequirements) * 5);

  const isValid = Object.values(meets).every(Boolean);

  const feedback: string[] = [];
  if (!meets.minLength) feedback.push(`Must be at least ${requirements.minLength} characters long`);
  if (!meets.hasUppercase) feedback.push('Must contain at least one uppercase letter');
  if (!meets.hasLowercase) feedback.push('Must contain at least one lowercase letter');
  if (!meets.hasNumber) feedback.push('Must contain at least one number');
  if (!meets.hasSpecialChar) feedback.push('Must contain at least one special character');
  if (!meets.noCommonPassword) feedback.push('Cannot use common passwords');
  if (!meets.noUserInfo) feedback.push('Cannot contain your name or email');

  return {
    score,
    meets,
    isValid,
    feedback
  };
};