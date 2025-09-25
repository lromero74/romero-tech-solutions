import { useState, useEffect, useCallback } from 'react';
import { PasswordComplexityRequirements, DEFAULT_PASSWORD_REQUIREMENTS } from '../types/passwordComplexity';
import { passwordComplexityService } from '../services/passwordComplexityService';

export interface UsePasswordComplexityReturn {
  requirements: PasswordComplexityRequirements;
  loading: boolean;
  error: string | null;
  refreshRequirements: () => Promise<void>;
  updateRequirements: (requirements: PasswordComplexityRequirements) => Promise<void>;
  clearError: () => void;
}

export const usePasswordComplexity = (): UsePasswordComplexityReturn => {
  const [requirements, setRequirements] = useState<PasswordComplexityRequirements>(DEFAULT_PASSWORD_REQUIREMENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshRequirements = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const currentRequirements = await passwordComplexityService.getPasswordComplexityRequirements();
      setRequirements(currentRequirements);
    } catch (err: any) {
      console.error('Failed to fetch password complexity requirements:', err);
      setError(err.message || 'Failed to fetch password requirements');
      // Keep using current requirements or defaults
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRequirements = useCallback(async (newRequirements: PasswordComplexityRequirements) => {
    setError(null);

    try {
      const updatedRequirements = await passwordComplexityService.updatePasswordComplexityRequirements(newRequirements);
      setRequirements(updatedRequirements);
    } catch (err: any) {
      console.error('Failed to update password complexity requirements:', err);
      setError(err.message || 'Failed to update password requirements');
      throw err; // Re-throw so components can handle the error
    }
  }, []);

  // Load requirements on mount
  useEffect(() => {
    refreshRequirements();
  }, [refreshRequirements]);

  return {
    requirements,
    loading,
    error,
    refreshRequirements,
    updateRequirements,
    clearError
  };
};

// Hook for validating passwords against current requirements
export interface UsePasswordValidationReturn {
  validatePassword: (password: string, userInfo?: { name?: string; email?: string; }) => Promise<{
    isValid: boolean;
    feedback: string[];
    strength: number;
  }>;
  loading: boolean;
  error: string | null;
}

export const usePasswordValidation = (): UsePasswordValidationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePassword = useCallback(async (password: string, userInfo?: { name?: string; email?: string; }) => {
    setLoading(true);
    setError(null);

    try {
      const result = await passwordComplexityService.validatePassword(password, userInfo);
      return result;
    } catch (err: any) {
      console.error('Failed to validate password:', err);
      setError(err.message || 'Failed to validate password');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    validatePassword,
    loading,
    error
  };
};

// Hook for managing password expiration
export interface UsePasswordExpirationReturn {
  expirationInfo: {
    passwordChangedAt: string | null;
    passwordExpiresAt: string | null;
    daysUntilExpiration: number | null;
    isExpired: boolean;
    forcePasswordChange: boolean;
  } | null;
  loading: boolean;
  error: string | null;
  checkExpiration: (userId: string) => Promise<void>;
}

export const usePasswordExpiration = (): UsePasswordExpirationReturn => {
  const [expirationInfo, setExpirationInfo] = useState<UsePasswordExpirationReturn['expirationInfo']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExpiration = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);

    try {
      const info = await passwordComplexityService.getPasswordExpirationInfo(userId);
      setExpirationInfo(info);
    } catch (err: any) {
      console.error('Failed to check password expiration:', err);
      setError(err.message || 'Failed to check password expiration');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    expirationInfo,
    loading,
    error,
    checkExpiration
  };
};