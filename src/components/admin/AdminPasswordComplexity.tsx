import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Shield, AlertTriangle, Check, Info } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { systemSettingsService } from '../../services/systemSettingsService';
import {
  PasswordComplexityRequirements,
  DEFAULT_PASSWORD_REQUIREMENTS,
  evaluatePasswordStrength
} from '../../types/passwordComplexity';
import { usePasswordComplexity } from '../../hooks/usePasswordComplexity';

interface AdminPasswordComplexityProps {
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export const AdminPasswordComplexity: React.FC<AdminPasswordComplexityProps> = ({
  loading: externalLoading = false,
  error: externalError = null,
  onRefresh
}) => {
  const {
    requirements: currentRequirements,
    loading: requirementsLoading,
    error: requirementsError,
    refreshRequirements,
    updateRequirements,
    clearError
  } = usePasswordComplexity();

  const [requirements, setRequirements] = useState<PasswordComplexityRequirements>(DEFAULT_PASSWORD_REQUIREMENTS);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testPassword, setTestPassword] = useState('');

  // MFA settings state
  const [mfaRequired, setMfaRequired] = useState(true);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [mfaSuccess, setMfaSuccess] = useState(false);

  // Sync with hook state
  useEffect(() => {
    if (currentRequirements) {
      setRequirements(currentRequirements);
    }
  }, [currentRequirements]);

  // Load MFA settings on component mount
  useEffect(() => {
    const loadMfaSettings = async () => {
      setMfaLoading(true);
      try {
        const required = await systemSettingsService.getMfaRequired();
        setMfaRequired(required);
      } catch (error) {
        console.error('Error loading MFA settings:', error);
        // Default to true for security
        setMfaRequired(true);
      } finally {
        setMfaLoading(false);
      }
    };

    loadMfaSettings();
  }, []);

  const loading = externalLoading || requirementsLoading;
  const error = externalError || requirementsError;

  // Test password strength with current settings
  const testPasswordStrength = evaluatePasswordStrength(testPassword, requirements);

  const handleSave = async () => {
    setSaving(true);
    clearError();

    try {
      await updateRequirements(requirements);
      setSaveSuccess(true);
      setIsEditing(false);

      // Call external refresh if provided
      if (onRefresh) {
        onRefresh();
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save password requirements:', error);
      // Error is handled by the hook and displayed in the UI
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRequirements(currentRequirements);
  };

  const handleRefresh = async () => {
    clearError();
    await refreshRequirements();
    if (onRefresh) {
      onRefresh();
    }
  };

  const updateRequirement = (key: keyof PasswordComplexityRequirements, value: boolean | number | string) => {
    setRequirements(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleMfaToggle = async (required: boolean) => {
    setMfaSaving(true);
    try {
      await systemSettingsService.updateMfaRequired(required);
      setMfaRequired(required);
      setMfaSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setMfaSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update MFA setting:', error);
      // Revert the toggle on error
      setMfaRequired(!required);
    } finally {
      setMfaSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Shield className="w-6 h-6 text-blue-600 mr-3" />
          <div>
            <h1 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
              Password Complexity Settings
            </h1>
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
              Configure password requirements for all users
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`p-2 ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-md transition-colors`}
          >
            <RefreshCw className={`w-4 h-4 ${themeClasses.text.secondary} ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {saveSuccess && (
        <div className="flex items-center p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-green-700 dark:text-green-300">
              Password complexity requirements saved successfully!
            </p>
          </div>
        </div>
      )}

      {/* MFA Success Message */}
      {mfaSuccess && (
        <div className="flex items-center p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-green-700 dark:text-green-300">
              Multi-factor authentication setting updated successfully!
            </p>
          </div>
        </div>
      )}

      {/* MFA Settings Section */}
      <div className={`${themeClasses.bg.card} ${themeClasses.border.primary} border rounded-lg p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Shield className="w-5 h-5 text-blue-600 mr-3" />
            <div>
              <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                Multi-Factor Authentication
              </h2>
              <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                Require MFA for all employee logins
              </p>
            </div>
          </div>
          {mfaSaving && (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex-1">
            <div className={`font-medium ${themeClasses.text.primary}`}>
              Require Multi-Factor Authentication
            </div>
            <div className={`text-sm ${themeClasses.text.secondary} mt-1`}>
              When enabled, all employees (admins, technicians, sales) must complete email verification after entering their password
            </div>
          </div>
          <div className="ml-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={mfaRequired}
                onChange={(e) => handleMfaToggle(e.target.checked)}
                disabled={mfaLoading || mfaSaving}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
            </label>
          </div>
        </div>

        {mfaRequired && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
            <div className="flex items-start">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-300">
                <strong>Important:</strong> All employees will be required to verify their identity via email code when logging in or after session timeout. This setting does not affect client users.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Panel */}
        <div className={`${themeClasses.bg.card} ${themeClasses.border.primary} border rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
              Password Requirements
            </h2>
            <div className="flex space-x-2">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  Edit Settings
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      handleReset();
                    }}
                    className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} transition-colors`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Length Requirements */}
            <div>
              <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Length Requirements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>
                    Minimum Length
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="256"
                    value={requirements.minLength}
                    onChange={(e) => updateRequirement('minLength', parseInt(e.target.value) || 8)}
                    disabled={!isEditing}
                    className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md text-sm px-3 py-2 disabled:opacity-50`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>
                    Maximum Length (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="256"
                    value={requirements.maxLength || ''}
                    onChange={(e) => updateRequirement('maxLength', parseInt(e.target.value) || undefined)}
                    disabled={!isEditing}
                    placeholder="No limit"
                    className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md text-sm px-3 py-2 disabled:opacity-50`}
                  />
                </div>
              </div>
            </div>

            {/* Character Requirements */}
            <div>
              <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Character Requirements</h3>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.requireUppercase}
                    onChange={(e) => updateRequirement('requireUppercase', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Require uppercase letters (A-Z)
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.requireLowercase}
                    onChange={(e) => updateRequirement('requireLowercase', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Require lowercase letters (a-z)
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.requireNumbers}
                    onChange={(e) => updateRequirement('requireNumbers', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Require numbers (0-9)
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.requireSpecialCharacters}
                    onChange={(e) => updateRequirement('requireSpecialCharacters', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Require special characters
                  </span>
                </label>

                {requirements.requireSpecialCharacters && (
                  <div className="ml-6">
                    <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>
                      Allowed Special Characters
                    </label>
                    <input
                      type="text"
                      value={requirements.specialCharacterSet || ''}
                      onChange={(e) => updateRequirement('specialCharacterSet', e.target.value)}
                      disabled={!isEditing}
                      placeholder="!@#$%^&*()_+-=[]{}|;:,.<>?"
                      className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md text-sm px-3 py-2 disabled:opacity-50`}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Security Requirements */}
            <div>
              <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Security Requirements</h3>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.preventCommonPasswords}
                    onChange={(e) => updateRequirement('preventCommonPasswords', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Prevent common passwords
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={requirements.preventUserInfoInPassword}
                    onChange={(e) => updateRequirement('preventUserInfoInPassword', e.target.checked)}
                    disabled={!isEditing}
                    className={`mr-3 rounded border ${themeClasses.border.primary} text-blue-600 focus:ring-blue-500 disabled:opacity-50`}
                  />
                  <span className={`text-sm ${themeClasses.text.secondary}`}>
                    Prevent user information in passwords (name, email)
                  </span>
                </label>
              </div>
            </div>

            {/* Password History and Expiration */}
            <div>
              <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Password History & Expiration</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Password History Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requirements.enablePasswordHistory ?? true}
                        onChange={(e) => updateRequirement('enablePasswordHistory', e.target.checked)}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 ${isEditing ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-gray-400'}`}></div>
                    </label>
                    <span className={`text-xs font-medium ${themeClasses.text.secondary}`}>
                      Password History
                    </span>
                  </div>
                  {requirements.enablePasswordHistory && (
                    <div className="pl-11">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={requirements.passwordHistoryCount || 5}
                        onChange={(e) => updateRequirement('passwordHistoryCount', parseInt(e.target.value) || 5)}
                        disabled={!isEditing}
                        className={`block w-16 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded text-xs px-2 py-1 disabled:opacity-50`}
                      />
                      <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                        Last N passwords
                      </p>
                    </div>
                  )}
                </div>

                {/* Password Expiration Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requirements.enablePasswordExpiration ?? true}
                        onChange={(e) => updateRequirement('enablePasswordExpiration', e.target.checked)}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 ${isEditing ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-gray-400'}`}></div>
                    </label>
                    <span className={`text-xs font-medium ${themeClasses.text.secondary}`}>
                      Password Expiration
                    </span>
                  </div>
                  {requirements.enablePasswordExpiration && (
                    <div className="pl-11">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={requirements.expirationDays || 90}
                        onChange={(e) => updateRequirement('expirationDays', parseInt(e.target.value) || 90)}
                        disabled={!isEditing}
                        className={`block w-16 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded text-xs px-2 py-1 disabled:opacity-50`}
                      />
                      <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                        Days to expire
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Test Panel */}
        <div className={`${themeClasses.bg.card} ${themeClasses.border.primary} border rounded-lg p-6`}>
          <h2 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4`}>
            Test Password Strength
          </h2>

          {/* Info Box */}
          <div className={`flex items-start p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md mb-4`}>
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Test how passwords will be evaluated with your current settings. This helps you validate your requirements before saving.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Test Password
              </label>
              <input
                type="text"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                placeholder="Enter a password to test..."
                className={`block w-full ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-md px-3 py-2`}
              />
            </div>

            {testPassword && (
              <div className="space-y-3">
                {/* Strength Indicator */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${themeClasses.text.secondary}`}>Password Strength:</span>
                    <span className={`text-xs font-medium ${
                      testPasswordStrength.score <= 2 ? 'text-red-600 dark:text-red-400' :
                      testPasswordStrength.score === 3 ? 'text-yellow-600 dark:text-yellow-400' :
                      testPasswordStrength.score === 4 ? 'text-blue-600 dark:text-blue-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {testPasswordStrength.score <= 2 ? 'Weak' :
                       testPasswordStrength.score === 3 ? 'Fair' :
                       testPasswordStrength.score === 4 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        testPasswordStrength.score <= 2 ? 'bg-red-500' :
                        testPasswordStrength.score === 3 ? 'bg-yellow-500' :
                        testPasswordStrength.score === 4 ? 'bg-blue-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(testPasswordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Requirements Check */}
                <div>
                  <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>Requirements Check</h4>
                  <div className="space-y-1">
                    {Object.entries(testPasswordStrength.meets).map(([key, met]) => {
                      const labels = {
                        minLength: `At least ${requirements.minLength} characters`,
                        hasUppercase: 'Uppercase letter',
                        hasLowercase: 'Lowercase letter',
                        hasNumber: 'Number',
                        hasSpecialChar: 'Special character',
                        noCommonPassword: 'Not a common password',
                        noUserInfo: 'No personal information'
                      };

                      // Only show requirements that are actually required
                      if (key === 'hasUppercase' && !requirements.requireUppercase) return null;
                      if (key === 'hasLowercase' && !requirements.requireLowercase) return null;
                      if (key === 'hasNumber' && !requirements.requireNumbers) return null;
                      if (key === 'hasSpecialChar' && !requirements.requireSpecialCharacters) return null;
                      if (key === 'noCommonPassword' && !requirements.preventCommonPasswords) return null;
                      if (key === 'noUserInfo' && !requirements.preventUserInfoInPassword) return null;

                      return (
                        <div key={key} className={`flex items-center text-xs ${met ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          <span className="mr-2">{met ? '✓' : '✗'}</span>
                          {labels[key as keyof typeof labels]}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Overall Result */}
                <div className={`p-3 rounded-md ${testPasswordStrength.isValid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                  <div className={`flex items-center text-sm font-medium ${testPasswordStrength.isValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {testPasswordStrength.isValid ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Password meets all requirements
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Password does not meet requirements
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};