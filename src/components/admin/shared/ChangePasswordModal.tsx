import React, { useState, useEffect } from 'react';
import { X, Save, Eye, EyeOff, AlertTriangle, Check, Info } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import {
  PasswordComplexityRequirements,
  PasswordStrengthResult,
  DEFAULT_PASSWORD_REQUIREMENTS,
  evaluatePasswordStrength
} from '../../../types/passwordComplexity';
import { usePasswordComplexity } from '../../../hooks/usePasswordComplexity';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  userEmail?: string;
  userName?: string;
  passwordRequirements?: PasswordComplexityRequirements;
}


const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  userEmail,
  userName,
  passwordRequirements: propPasswordRequirements
}) => {
  const { theme } = useTheme();
  const { requirements: dynamicRequirements } = usePasswordComplexity();

  // Use dynamic requirements if available, fallback to prop requirements or defaults
  const passwordRequirements = dynamicRequirements || propPasswordRequirements || DEFAULT_PASSWORD_REQUIREMENTS;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = evaluatePasswordStrength(
    newPassword,
    passwordRequirements,
    { name: userName, email: userEmail }
  );
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = currentPassword.length > 0 &&
                     passwordStrength.isValid &&
                     passwordsMatch;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, isSubmitting]);

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(currentPassword, newPassword);
      setSuccess(true);

      // Close modal after success message
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength.score <= 2) return 'bg-red-500';
    if (passwordStrength.score === 3) return 'bg-yellow-500';
    if (passwordStrength.score === 4) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStrengthText = () => {
    if (passwordStrength.score <= 2) return 'Weak';
    if (passwordStrength.score === 3) return 'Fair';
    if (passwordStrength.score === 4) return 'Good';
    return 'Strong';
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-md ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden`}>
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Change Password</h3>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h4 className={`text-lg font-medium ${themeClasses.text.primary} mb-2`}>
              Password Changed Successfully
            </h4>
            <p className={`text-sm ${themeClasses.text.secondary}`}>
              Your password has been updated. This window will close automatically.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {userEmail && (
              <div className={`text-sm ${themeClasses.text.secondary} mb-4`}>
                Changing password for: <span className="font-medium">{userEmail}</span>
              </div>
            )}

            {/* Password Requirements Info Box */}
            <div className={`flex items-start p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md`}>
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>Password Requirements</h4>
                <div className="text-xs space-y-1">
                  <div className={`flex items-center ${themeClasses.text.secondary}`}>
                    <span className="mr-1">•</span>
                    At least {passwordRequirements.minLength} characters long
                  </div>
                  {passwordRequirements.requireUppercase && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      At least one uppercase letter (A-Z)
                    </div>
                  )}
                  {passwordRequirements.requireLowercase && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      At least one lowercase letter (a-z)
                    </div>
                  )}
                  {passwordRequirements.requireNumbers && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      At least one number (0-9)
                    </div>
                  )}
                  {passwordRequirements.requireSpecialCharacters && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      At least one special character ({passwordRequirements.specialCharacterSet || '!@#$%^&*()_+-=[]{}|;:,.<>?'})
                    </div>
                  )}
                  {passwordRequirements.preventUserInfoInPassword && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      Cannot contain your name or email address
                    </div>
                  )}
                  {passwordRequirements.maxLength && passwordRequirements.maxLength < 256 && (
                    <div className={`flex items-center ${themeClasses.text.secondary}`}>
                      <span className="mr-1">•</span>
                      Maximum {passwordRequirements.maxLength} characters
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10 disabled:opacity-50`}
                  placeholder="Enter your current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={isSubmitting}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${themeClasses.text.muted} hover:${themeClasses.text.secondary} disabled:opacity-50`}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10 disabled:opacity-50`}
                  placeholder="Enter your new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={isSubmitting}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${themeClasses.text.muted} hover:${themeClasses.text.secondary} disabled:opacity-50`}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${themeClasses.text.secondary}`}>Password Strength:</span>
                    <span className={`text-xs font-medium ${
                      passwordStrength.score <= 2 ? 'text-red-600 dark:text-red-400' :
                      passwordStrength.score === 3 ? 'text-yellow-600 dark:text-yellow-400' :
                      passwordStrength.score === 4 ? 'text-blue-600 dark:text-blue-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {getStrengthText()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor()}`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>

                  {/* Password Requirements */}
                  <div className="mt-2 text-xs space-y-1">
                    {Object.entries(passwordStrength.meets).map(([key, met]) => {
                      const labels = {
                        minLength: `At least ${passwordRequirements.minLength} characters`,
                        hasUppercase: 'One uppercase letter',
                        hasLowercase: 'One lowercase letter',
                        hasNumber: 'One number',
                        hasSpecialChar: 'One special character',
                        noCommonPassword: 'Not a common password',
                        noUserInfo: 'No personal information'
                      };

                      // Only show requirements that are actually required
                      if (key === 'hasUppercase' && !passwordRequirements.requireUppercase) return null;
                      if (key === 'hasLowercase' && !passwordRequirements.requireLowercase) return null;
                      if (key === 'hasNumber' && !passwordRequirements.requireNumbers) return null;
                      if (key === 'hasSpecialChar' && !passwordRequirements.requireSpecialCharacters) return null;
                      if (key === 'noCommonPassword' && !passwordRequirements.preventCommonPasswords) return null;
                      if (key === 'noUserInfo' && !passwordRequirements.preventUserInfoInPassword) return null;

                      return (
                        <div key={key} className={`flex items-center ${met ? 'text-green-600 dark:text-green-400' : themeClasses.text.muted}`}>
                          <span className="mr-1">{met ? '✓' : '○'}</span>
                          {labels[key as keyof typeof labels]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${
                    confirmPassword.length > 0 ?
                      (passwordsMatch ? 'border-green-500' : 'border-red-500') :
                      themeClasses.border.primary
                  } rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10 disabled:opacity-50`}
                  placeholder="Confirm your new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isSubmitting}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${themeClasses.text.muted} hover:${themeClasses.text.secondary} disabled:opacity-50`}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className="mt-1 text-xs">
                  {passwordsMatch ? (
                    <span className="text-green-600 dark:text-green-400">✓ Passwords match</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">○ Passwords do not match</span>
                  )}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} hover:${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Change Password
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;