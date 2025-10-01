import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { validateEmailDomain } from '../utils/domainValidation';
import { apiService } from '../services/apiService';

interface SimplifiedClientRegistrationProps {
  onSuccess: (credentials?: { email: string; password: string }) => void;
  onCancel: () => void;
}

interface FormData {
  // Business Information
  businessName: string;
  businessZipCode: string;
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  // Contact Information
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  cellPhone: string;
  // Account Setup
  password: string;
  confirmPassword: string;
}

interface PasswordRequirements {
  minLength: number;
  maxLength: number | null;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialCharacters: boolean;
  specialCharacterSet: string;
}

type Step = 'business' | 'contact' | 'verification' | 'password' | 'success';

const SimplifiedClientRegistration: React.FC<SimplifiedClientRegistrationProps> = ({
  onSuccess,
  onCancel
}) => {
  const { language, t } = useLanguage();
  const [currentStep, setCurrentStep] = useState<Step>('business');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [zipCodeValidation, setZipCodeValidation] = useState<{
    valid: boolean;
    message: string;
    city?: string;
    state?: string;
  } | null>(null);
  const [zipValidated, setZipValidated] = useState(false);
  const [zipValidating, setZipValidating] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);
  const [showExistingEmailModal, setShowExistingEmailModal] = useState(false);
  const [existingEmailData, setExistingEmailData] = useState<any>(null);
  const [resendCount, setResendCount] = useState(0);
  const [lastResendTime, setLastResendTime] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockUntil, setBlockUntil] = useState(0);
  const [passwordRequirements, setPasswordRequirements] = useState<PasswordRequirements | null>(null);
  const [passwordValidation, setPasswordValidation] = useState<{
    minLength: boolean;
    hasLowercase: boolean;
    hasNumbers: boolean;
    hasUppercase: boolean;
    hasSpecialChars: boolean;
  }>({
    minLength: false,
    hasLowercase: false,
    hasNumbers: false,
    hasUppercase: false,
    hasSpecialChars: false
  });
  const [emailDomainValid, setEmailDomainValid] = useState(true);
  const [emailDomainValidating, setEmailDomainValidating] = useState(false);
  const [emailDomainError, setEmailDomainError] = useState('');

  const [formData, setFormData] = useState<FormData>({
    businessName: '',
    businessZipCode: '',
    streetAddress1: '',
    streetAddress2: '',
    city: '',
    state: '',
    firstName: '',
    lastName: '',
    title: '',
    email: '',
    phone: '',
    cellPhone: '',
    password: '',
    confirmPassword: ''
  });

  const updateFormData = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // Phone number formatting utilities
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Apply progressive formatting
    if (digits.length === 0) return '';
    if (digits.length === 1) return `(${digits}`;
    if (digits.length === 2) return `(${digits}`;
    if (digits.length === 3) return `(${digits}) `;
    if (digits.length <= 5) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length === 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-`;
    if (digits.length >= 7) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;

    // Fallback (should not reach here)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (field: 'phone' | 'cellPhone', value: string, isBackspace = false) => {
    // Only allow digits and formatting characters
    const digits = value.replace(/\D/g, '');

    // Special handling for backspace - allow deletion through formatting
    if (isBackspace) {
      const formattedValue = formatPhoneNumber(digits);
      updateFormData(field, formattedValue);
      return;
    }

    // Limit to 10 digits for regular typing
    if (digits.length <= 10) {
      const formattedValue = formatPhoneNumber(value);
      updateFormData(field, formattedValue);
    }
  };

  // Handle backspace/delete key specifically
  const handlePhoneKeyDown = (field: 'phone' | 'cellPhone', e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    const currentValue = target.value;

    // Handle backspace and delete keys
    if (e.keyCode === 8 || e.keyCode === 46) { // Backspace or Delete
      e.preventDefault();

      // Get cursor position
      const cursorPos = target.selectionStart || 0;

      if (e.keyCode === 8 && cursorPos > 0) { // Backspace
        // Remove character before cursor, but if it's a formatting char, remove the digit before it
        let newValue = currentValue;
        let posToRemove = cursorPos - 1;

        // If we're about to delete a formatting character, find the previous digit
        while (posToRemove >= 0 && !/\d/.test(newValue[posToRemove])) {
          posToRemove--;
        }

        if (posToRemove >= 0) {
          newValue = newValue.slice(0, posToRemove) + newValue.slice(posToRemove + 1);
          handlePhoneChange(field, newValue, true);

          // Set cursor position after formatting
          setTimeout(() => {
            const digits = newValue.replace(/\D/g, '');
            const formattedValue = formatPhoneNumber(digits);
            let newCursorPos = Math.min(posToRemove, formattedValue.length);
            target.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
        }
      } else if (e.keyCode === 46 && cursorPos < currentValue.length) { // Delete
        // Remove character at cursor, but if it's a formatting char, remove the digit after it
        let newValue = currentValue;
        let posToRemove = cursorPos;

        // If we're about to delete a formatting character, find the next digit
        while (posToRemove < newValue.length && !/\d/.test(newValue[posToRemove])) {
          posToRemove++;
        }

        if (posToRemove < newValue.length) {
          newValue = newValue.slice(0, posToRemove) + newValue.slice(posToRemove + 1);
          handlePhoneChange(field, newValue, true);

          // Set cursor position after formatting
          setTimeout(() => {
            const digits = newValue.replace(/\D/g, '');
            const formattedValue = formatPhoneNumber(digits);
            let newCursorPos = Math.min(cursorPos, formattedValue.length);
            target.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
        }
      }
      return;
    }

    // Allow navigation and special keys
    if ([9, 27, 13, 37, 38, 39, 40].includes(e.keyCode) ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey) ||
        (e.keyCode === 67 && e.ctrlKey) ||
        (e.keyCode === 86 && e.ctrlKey) ||
        (e.keyCode === 88 && e.ctrlKey)) {
      return;
    }

    // Ensure that it's a number and stop the keypress if not
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };

  // Function to extract only digits for database storage
  const getPhoneDigits = (formattedPhone: string): string => {
    return formattedPhone.replace(/\D/g, '');
  };

  // Enhanced email validation
  const validateEmailFormat = (email: string): { valid: boolean; message?: string } => {
    if (!email) return { valid: true }; // Empty is handled elsewhere

    // Basic format check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: 'Invalid email format. Please use a valid email address.' };
    }

    // Check for consecutive dots
    if (email.includes('..')) {
      return { valid: false, message: 'Email cannot contain consecutive dots.' };
    }

    // Check for dots at start or end of local part
    const [localPart] = email.split('@');
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { valid: false, message: 'Email cannot start or end with a dot.' };
    }

    // Check for invalid characters
    const invalidChars = email.match(/[^a-zA-Z0-9._%+-@]/g);
    if (invalidChars) {
      return { valid: false, message: `Email contains invalid characters: ${invalidChars.join(', ')}` };
    }

    return { valid: true };
  };

  // Handle email domain validation
  const handleEmailDomainValidation = async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailDomainValid(true);
      setEmailDomainError('');
      setEmailDomainValidating(false);
      return;
    }

    // First validate email format
    const formatCheck = validateEmailFormat(email);
    if (!formatCheck.valid) {
      setEmailDomainValid(false);
      setEmailDomainError(formatCheck.message || 'Invalid email format');
      setEmailDomainValidating(false);
      return;
    }

    setEmailDomainValidating(true);
    setEmailDomainError('');

    try {
      const result = await validateEmailDomain(email, { checkDNS: true, timeout: 5000 });

      if (result.isValid) {
        setEmailDomainValid(true);
        setEmailDomainError('');
      } else {
        setEmailDomainValid(false);
        setEmailDomainError(result.error || 'Email domain does not exist');
      }
    } catch (error) {
      console.error('Email domain validation error:', error);
      // On validation error, allow the email (don't block user)
      setEmailDomainValid(true);
      setEmailDomainError('');
    } finally {
      setEmailDomainValidating(false);
    }
  };

  // Fetch password requirements on component mount
  useEffect(() => {
    const fetchPasswordRequirements = async () => {
      try {
        const data = await apiService.get<{
          success: boolean;
          requirements?: PasswordRequirements;
          error?: string;
        }>('/auth/client-password-requirements');

        if (data.success && data.requirements) {
          setPasswordRequirements(data.requirements);
        } else {
          console.error('Failed to fetch password requirements:', data.error);
        }
      } catch (error) {
        console.error('Error fetching password requirements:', error);
      }
    };

    fetchPasswordRequirements();
  }, []);

  // Validate password in real-time
  const validatePassword = (password: string) => {
    if (!passwordRequirements) return;

    const validation = {
      minLength: password.length >= passwordRequirements.minLength,
      hasLowercase: passwordRequirements.requireLowercase ? /[a-z]/.test(password) : true,
      hasNumbers: passwordRequirements.requireNumbers ? /\d/.test(password) : true,
      hasUppercase: passwordRequirements.requireUppercase ? /[A-Z]/.test(password) : true,
      hasSpecialChars: passwordRequirements.requireSpecialCharacters ?
        new RegExp(`[${passwordRequirements.specialCharacterSet.replace(/[[\]\\]/g, '\\$&')}]`).test(password) : true
    };

    // Add overall validation check
    const isValid = Object.values(validation).every(Boolean);
    const validationWithStatus = { ...validation, isValid };

    setPasswordValidation(validationWithStatus);
    return validationWithStatus;
  };

  const validateZipCode = async (zipCode: string) => {
    // Reset validation state
    setZipCodeValidation(null);
    setZipValidated(false);
    setZipValidating(true);

    if (zipCode.length !== 5 || !/^\d{5}$/.test(zipCode)) {
      setZipCodeValidation({
        valid: false,
        message: t('registration.business.zipValidFormat')
      });
      setZipValidating(false);
      return;
    }

    try {
      const data = await apiService.post<{
        success: boolean;
        data: {
          isServiced: boolean;
          city?: string;
          state?: string;
          zipCode?: string;
        };
      }>('/service-areas/validate-zip', { zipCode });

      if (data.success && data.data.isServiced) {
        // Auto-fill city and state
        updateFormData('city', data.data.city || '');
        updateFormData('state', data.data.state || '');

        setZipCodeValidation({
          valid: true,
          message: t('registration.business.zipServiceAvailable').replace('{city}', data.data.city || '').replace('{state}', data.data.state || ''),
          city: data.data.city,
          state: data.data.state
        });
        setZipValidated(true);
      } else {
        setZipCodeValidation({
          valid: false,
          message: t('registration.business.zipServiceUnavailable').replace('{zipCode}', zipCode)
        });
      }
    } catch (error) {
      // Fallback validation for development
      const supportedZipCodes = ['92101', '92102', '92103', '92104', '92105', '92115', '92116'];
      const isSupported = supportedZipCodes.includes(zipCode);

      if (isSupported) {
        // Auto-fill with default values for supported ZIP codes
        updateFormData('city', 'San Diego');
        updateFormData('state', 'CA');
        setZipValidated(true);
      }

      setZipCodeValidation({
        valid: isSupported,
        message: isSupported
          ? t('registration.business.zipServiceAvailable').replace('{city}', 'San Diego').replace('{state}', 'CA')
          : t('registration.business.zipServiceUnavailable').replace('{zipCode}', zipCode)
      });
    } finally {
      setZipValidating(false);
    }
  };

  const sendVerificationCode = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiService.post<{
        success: boolean;
        code?: string;
        data?: any;
        error?: string;
      }>('/auth/send-verification', {
        email: formData.email,
        businessName: formData.businessName,
        language: language
      });

      if (data.success) {
        setVerificationCodeSent(true);
        setCurrentStep('verification');
      } else if (data.code === 'EMAIL_ALREADY_EXISTS') {
        // Handle existing email case
        setExistingEmailData(data.data);
        setShowExistingEmailModal(true);
      } else {
        setError(data.error || t('registration.errors.sendVerificationFailed'));
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      setError(t('registration.errors.sendVerificationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async () => {
    if (!verificationCode.trim()) {
      setError(t('registration.errors.verificationCodeRequired'));
      return;
    }

    // Simply move to password step - verification will happen during account creation
    setCurrentStep('password');
  };

  const verifyEmailAndCreateAccount = async () => {
    setLoading(true);
    setError('');

    try {
      const registrationData = {
        email: formData.email,
        verificationCode,
        password: formData.password,
        contactName: `${formData.firstName} ${formData.lastName}`.trim(),
        title: formData.title,
        phone: getPhoneDigits(formData.phone),
        cellPhone: getPhoneDigits(formData.cellPhone),
        businessName: formData.businessName,
        // Business address (will be stored as service location)
        streetAddress1: formData.streetAddress1,
        streetAddress2: formData.streetAddress2,
        city: formData.city,
        state: formData.state,
        zipCode: formData.businessZipCode,
        country: 'United States'
      };

      const data = await apiService.post<{
        success: boolean;
        error?: string;
      }>('/auth/register-client', registrationData);

      if (data.success) {
        setCurrentStep('success');
      } else {
        setError(data.error || t('registration.errors.createAccountFailed'));
      }
    } catch (error) {
      console.error('Error creating account:', error);
      setError(t('registration.errors.createAccountFailed'));
    } finally {
      setLoading(false);
    }
  };

  const validateCurrentStep = (): boolean => {
    setError('');

    switch (currentStep) {
      case 'business':
        if (!formData.businessName.trim()) {
          setError(t('registration.errors.businessNameRequired'));
          return false;
        }
        if (!formData.streetAddress1.trim()) {
          setError('Street address is required');
          return false;
        }
        if (!formData.city.trim()) {
          setError('City is required');
          return false;
        }
        if (!formData.state.trim()) {
          setError('State is required');
          return false;
        }
        if (!formData.businessZipCode.trim()) {
          setError(t('registration.errors.zipCodeRequired'));
          return false;
        }
        if (!zipCodeValidation?.valid) {
          setError(t('registration.errors.zipCodeInvalid'));
          return false;
        }
        break;

      case 'contact':
        if (!formData.firstName.trim()) {
          setError(t('registration.errors.firstNameRequired'));
          return false;
        }
        if (!formData.lastName.trim()) {
          setError(t('registration.errors.lastNameRequired'));
          return false;
        }
        if (!formData.email.trim()) {
          setError(t('registration.errors.emailRequired'));
          return false;
        }
        if (!formData.email.includes('@') || !formData.email.includes('.')) {
          setError(t('registration.errors.emailInvalid'));
          return false;
        }
        if (!emailDomainValid) {
          setError(emailDomainError || 'Email domain is invalid');
          return false;
        }
        break;

      case 'password':
        if (!formData.password) {
          setError(t('registration.errors.passwordRequired'));
          return false;
        }
        if (formData.password.length < 8) {
          setError(t('registration.errors.passwordTooShort'));
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          setError(t('registration.errors.passwordsNoMatch'));
          return false;
        }
        break;

      case 'verification':
        if (!verificationCode.trim()) {
          setError(t('registration.errors.verificationCodeRequired'));
          return false;
        }
        if (verificationCode.length !== 6) {
          setError(t('registration.errors.verificationCodeIncomplete'));
          return false;
        }
        break;
    }

    return true;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) return;

    const stepOrder: Step[] = ['business', 'contact', 'verification', 'password', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);

    if (currentIndex < stepOrder.length - 1) {
      if (currentStep === 'contact') {
        // Send verification code after contact step before moving to verification step
        sendVerificationCode();
      } else {
        setCurrentStep(stepOrder[currentIndex + 1]);
      }
    }
  };

  const prevStep = () => {
    const stepOrder: Step[] = ['business', 'contact', 'verification', 'password', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);

    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleZipCodeChange = (value: string) => {
    // Only allow numeric characters
    const numericValue = value.replace(/\D/g, '');
    updateFormData('businessZipCode', numericValue);
    setZipValidated(false);

    // Reset validation when user types
    if (zipCodeValidation) {
      setZipCodeValidation(null);
    }

    // Validate ZIP code when 5 digits are entered
    if (numericValue.length === 5) {
      validateZipCode(numericValue);
    }
  };

  const handleZipBlur = () => {
    if (formData.businessZipCode.length === 5 && /^\d{5}$/.test(formData.businessZipCode)) {
      validateZipCode(formData.businessZipCode);
    }
  };

  const renderBusinessStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Building2 className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">{t('registration.business.title')}</h3>
        <p className="text-blue-200 mt-2">{t('registration.business.subtitle')}</p>
      </div>

      <div className="space-y-4">
        {/* Business Name - Tab Index 1 */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            {t('registration.business.nameLabel')}
          </label>
          <input
            type="text"
            value={formData.businessName}
            onChange={(e) => updateFormData('businessName', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={t('registration.business.namePlaceholder')}
            tabIndex={1}
            required
          />
        </div>

        {/* Street Address - Tab Index 3 */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Street Address *
          </label>
          <input
            type="text"
            value={formData.streetAddress1}
            onChange={(e) => updateFormData('streetAddress1', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="123 Main Street"
            tabIndex={3}
            required
          />
        </div>

        {/* Address Line 2 - Tab Index 4 */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Address Line 2
          </label>
          <input
            type="text"
            value={formData.streetAddress2}
            onChange={(e) => updateFormData('streetAddress2', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Suite 100 (optional)"
            tabIndex={4}
          />
        </div>

        {/* City and State Grid - Disabled after ZIP validation */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              City *
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => {
                if (!zipValidated) {
                  updateFormData('city', e.target.value);
                }
              }}
              className={`w-full px-3 py-3 backdrop-blur-sm border text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 ${
                zipValidated
                  ? 'bg-white/5 border-white/10 text-white/70 cursor-not-allowed'
                  : 'bg-white/10 border-white/20 focus:ring-blue-400'
              }`}
              placeholder="Escondido"
              tabIndex={-1}
              disabled={zipValidated}
              required
            />
            {zipValidated && (
              <p className="text-xs text-blue-300 mt-1">Auto-filled from ZIP code</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              State *
            </label>
            <input
              type="text"
              value={formData.state}
              onChange={(e) => {
                if (!zipValidated) {
                  // Only allow alphabetic characters and spaces
                  const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  updateFormData('state', value);
                }
              }}
              className={`w-full px-3 py-3 backdrop-blur-sm border text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 ${
                zipValidated
                  ? 'bg-white/5 border-white/10 text-white/70 cursor-not-allowed'
                  : 'bg-white/10 border-white/20 focus:ring-blue-400'
              }`}
              placeholder="CA"
              tabIndex={-1}
              disabled={zipValidated}
              required
            />
            {zipValidated && (
              <p className="text-xs text-blue-300 mt-1">Auto-filled from ZIP code</p>
            )}
          </div>
        </div>

        {/* ZIP Code - Tab Index 2 (normal position but custom tab order) */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            {t('registration.business.zipLabel')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.businessZipCode}
              onChange={(e) => handleZipCodeChange(e.target.value)}
              onBlur={handleZipBlur}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
              placeholder={t('registration.business.zipPlaceholder')}
              maxLength={5}
              tabIndex={2}
              required
            />
            {zipValidating && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-200"></div>
              </div>
            )}
            {zipValidated && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <CheckCircle className="h-4 w-4 text-green-400" />
              </div>
            )}
          </div>
          {zipCodeValidation && (
            <div className={`mt-2 p-3 rounded-lg text-sm ${
              zipCodeValidation.valid
                ? 'bg-green-500/20 border border-green-300/30 text-green-200'
                : 'bg-red-500/20 border border-red-300/30 text-red-200'
            }`}>
              <div className="flex items-start space-x-2">
                {zipCodeValidation.valid ? (
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <span>{zipCodeValidation.message}</span>
              </div>
            </div>
          )}
          <p className="text-sm text-blue-200 mt-1">
            {t('registration.business.zipHelper')}
          </p>
        </div>
      </div>
    </div>
  );

  const renderContactStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <User className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">{t('registration.contact.title')}</h3>
        <p className="text-blue-200 mt-2">{t('registration.contact.subtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              {t('registration.contact.firstNameLabel')}
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => updateFormData('firstName', e.target.value)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={t('registration.contact.firstNamePlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              {t('registration.contact.lastNameLabel')}
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => updateFormData('lastName', e.target.value)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={t('registration.contact.lastNamePlaceholder')}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            {t('registration.contact.titleLabel')}
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateFormData('title', e.target.value)}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={t('registration.contact.titlePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            {t('registration.contact.emailLabel')}
          </label>
          <div className="relative">
            <input
              type="email"
              value={formData.email}
              onChange={(e) => updateFormData('email', e.target.value)}
              onBlur={(e) => handleEmailDomainValidation(e.target.value)}
              className={`w-full px-3 py-3 bg-white/10 backdrop-blur-sm border text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 ${
                emailDomainValidating
                  ? 'border-yellow-400 focus:ring-yellow-400'
                  : !emailDomainValid && formData.email.includes('@')
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-white/20 focus:ring-blue-400'
              }`}
              placeholder={t('registration.contact.emailPlaceholder')}
              required
            />
            {emailDomainValidating && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
              </div>
            )}
            {!emailDomainValid && !emailDomainValidating && formData.email.includes('@') && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
            )}
            {emailDomainValid && !emailDomainValidating && formData.email.includes('@') && formData.email.length > 5 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <CheckCircle className="h-4 w-4 text-green-400" />
              </div>
            )}
          </div>
          {emailDomainError && (
            <p className="text-sm text-red-400 mt-1 flex items-center space-x-1">
              <AlertCircle className="h-3 w-3" />
              <span>{emailDomainError}</span>
            </p>
          )}
          {!emailDomainError && (
            <p className="text-sm text-blue-200 mt-1">
              {t('registration.contact.emailHelper')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              {t('registration.contact.phoneLabel')}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handlePhoneChange('phone', e.target.value)}
              onKeyDown={(e) => handlePhoneKeyDown('phone', e)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="(555) 123-4567"
              maxLength={14}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              {t('registration.contact.cellPhoneLabel')}
            </label>
            <input
              type="tel"
              value={formData.cellPhone}
              onChange={(e) => handlePhoneChange('cellPhone', e.target.value)}
              onKeyDown={(e) => handlePhoneKeyDown('cellPhone', e)}
              className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="(555) 123-4567"
              maxLength={14}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderPasswordStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Create Password</h3>
        <p className="text-blue-200 mt-2">Set up a secure password for your account</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Password *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => {
                updateFormData('password', e.target.value);
                validatePassword(e.target.value);
              }}
              className={`w-full px-3 py-3 pr-10 bg-white/10 backdrop-blur-sm border text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 ${
                formData.password && passwordValidation && passwordValidation.isValid
                  ? 'border-green-400 focus:ring-green-400'
                  : formData.password && passwordValidation && !passwordValidation.isValid
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-white/20 focus:ring-blue-400'
              }`}
              placeholder="Enter secure password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-blue-300 hover:text-white" />
              ) : (
                <Eye className="h-5 w-5 text-blue-300 hover:text-white" />
              )}
            </button>
          </div>

          {/* Password Requirements Checklist */}
          {passwordRequirements && (
            <div className="mt-3 p-3 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10">
              <p className="text-sm font-medium text-white mb-2">Password Requirements:</p>
              <div className="space-y-1">
                <div className={`flex items-center text-xs ${
                  formData.password && formData.password.length >= passwordRequirements.minLength
                    ? 'text-green-400'
                    : 'text-blue-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    formData.password && formData.password.length >= passwordRequirements.minLength
                      ? 'bg-green-400'
                      : 'bg-blue-200/50'
                  }`} />
                  At least {passwordRequirements.minLength} characters
                </div>

                {passwordRequirements.requireUppercase && (
                  <div className={`flex items-center text-xs ${
                    formData.password && /[A-Z]/.test(formData.password)
                      ? 'text-green-400'
                      : 'text-blue-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      formData.password && /[A-Z]/.test(formData.password)
                        ? 'bg-green-400'
                        : 'bg-blue-200/50'
                    }`} />
                    One uppercase letter
                  </div>
                )}

                {passwordRequirements.requireLowercase && (
                  <div className={`flex items-center text-xs ${
                    formData.password && /[a-z]/.test(formData.password)
                      ? 'text-green-400'
                      : 'text-blue-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      formData.password && /[a-z]/.test(formData.password)
                        ? 'bg-green-400'
                        : 'bg-blue-200/50'
                    }`} />
                    One lowercase letter
                  </div>
                )}

                {passwordRequirements.requireNumbers && (
                  <div className={`flex items-center text-xs ${
                    formData.password && /\d/.test(formData.password)
                      ? 'text-green-400'
                      : 'text-blue-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      formData.password && /\d/.test(formData.password)
                        ? 'bg-green-400'
                        : 'bg-blue-200/50'
                    }`} />
                    One number
                  </div>
                )}

                {passwordRequirements.requireSpecialCharacters && (
                  <div className={`flex items-center text-xs ${
                    formData.password && new RegExp(`[${passwordRequirements.specialCharacterSet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(formData.password)
                      ? 'text-green-400'
                      : 'text-blue-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      formData.password && new RegExp(`[${passwordRequirements.specialCharacterSet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(formData.password)
                        ? 'bg-green-400'
                        : 'bg-blue-200/50'
                    }`} />
                    One special character ({passwordRequirements.specialCharacterSet})
                  </div>
                )}
              </div>

              {passwordValidation && !passwordValidation.isValid && passwordValidation.feedback && passwordValidation.feedback.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <p className="text-xs text-red-300 font-medium">Issues:</p>
                  {passwordValidation.feedback.map((issue, index) => (
                    <p key={index} className="text-xs text-red-300 mt-1">• {issue}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Confirm Password *
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => updateFormData('confirmPassword', e.target.value)}
              className={`w-full px-3 py-3 pr-10 bg-white/10 backdrop-blur-sm border text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 ${
                formData.confirmPassword && formData.password && formData.confirmPassword !== formData.password
                  ? 'border-red-400 focus:ring-red-400'
                  : formData.confirmPassword && formData.password && formData.confirmPassword === formData.password
                  ? 'border-green-400 focus:ring-green-400'
                  : 'border-white/20 focus:ring-blue-400'
              }`}
              placeholder="Confirm your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5 text-blue-300 hover:text-white" />
              ) : (
                <Eye className="h-5 w-5 text-blue-300 hover:text-white" />
              )}
            </button>
          </div>
          {formData.confirmPassword && formData.password && (
            <p className={`text-sm mt-1 ${
              formData.confirmPassword === formData.password
                ? 'text-green-400'
                : 'text-red-400'
            }`}>
              {formData.confirmPassword === formData.password
                ? '✓ Passwords match'
                : '✗ Passwords do not match'
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderVerificationStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Mail className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold text-white">Verify Your Email</h3>
        <p className="text-blue-200 mt-2">
          We've sent a 6-digit code to <strong>{formData.email}</strong>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Verification Code *
          </label>
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center text-lg tracking-wider"
            placeholder="123456"
            maxLength={6}
            required
          />
          <p className="text-sm text-blue-200 mt-1">
            Check your email (including spam folder) for the verification code
          </p>
        </div>

        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-300/30 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-300 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Didn't receive the code?</p>
              <p>
                Check your spam folder or{' '}
                <button
                  onClick={sendVerificationCode}
                  disabled={loading || (isBlocked && Date.now() < blockUntil)}
                  className="underline hover:text-white disabled:opacity-50"
                >
                  resend the verification code
                </button>
              </p>
              {resendCount > 0 && (
                <p className="mt-2 text-xs text-blue-300">
                  Resent {resendCount}/3 times in the last minute
                  {resendCount >= 3 && ' - wait 10 minutes for more attempts'}
                </p>
              )}
              {isBlocked && Date.now() < blockUntil && (
                <p className="mt-2 text-xs text-red-300">
                  Too many attempts. Wait {Math.ceil((blockUntil - Date.now()) / 1000 / 60)} minutes.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <div>
        <h3 className="text-2xl font-bold text-white mb-4">Welcome to Romero Tech Solutions!</h3>
        <p className="text-blue-200 mb-6">
          Your account has been successfully created for <strong>{formData.businessName}</strong>
        </p>

        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-300/30 rounded-lg p-6 text-left">
          <h4 className="font-medium text-white mb-3">What's Next?</h4>
          <ul className="list-disc list-inside space-y-2 text-blue-200 text-sm">
            <li>You'll be redirected to your client dashboard</li>
            <li>Multi-factor authentication is disabled by default (you can enable it in settings)</li>
            <li>Complete your service location setup</li>
            <li>Submit your first service request</li>
          </ul>
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={() => onSuccess({ email: formData.email, password: formData.password })}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
        >
          <span>Go to Dashboard</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'business':
        return renderBusinessStep();
      case 'contact':
        return renderContactStep();
      case 'password':
        return renderPasswordStep();
      case 'verification':
        return renderVerificationStep();
      case 'success':
        return renderSuccessStep();
      default:
        return renderBusinessStep();
    }
  };

  const getStepNumber = () => {
    const stepOrder: Step[] = ['business', 'contact', 'verification', 'password', 'success'];
    return stepOrder.indexOf(currentStep) + 1;
  };

  const isSuccessStep = currentStep === 'success';
  const isVerificationStep = currentStep === 'verification';
  const isPasswordStep = currentStep === 'password';

  return (
    <div className="min-h-screen">
      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen flex items-center justify-center overflow-hidden"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const particleEvent = new CustomEvent('generateParticles', {
            detail: { x: clickX, y: clickY }
          });
          window.dispatchEvent(particleEvent);
        }}
      >
        {/* Background elements */}
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80")'
          }}
        />

        <div className="relative z-10 max-w-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
            {/* Progress indicator */}
            {!isSuccessStep && (
              <div className="mb-8">
                <div className="flex items-center justify-center text-sm text-blue-200 mb-2">
                  <span>Step {getStepNumber()} of 4</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-cyan-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(getStepNumber() / 4) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-6 bg-red-500/20 backdrop-blur-sm border border-red-300/30 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Step content */}
            {renderCurrentStep()}

            {/* Navigation buttons */}
            {!isSuccessStep && (
              <div className="flex justify-between items-center mt-8 pt-6 border-t border-white/20">
                <div className="flex space-x-3">
                  {currentStep !== 'business' && (
                    <button
                      onClick={prevStep}
                      className="flex items-center space-x-2 px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-colors duration-200"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </button>
                  )}
                  <button
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors duration-200 border border-gray-400/30 hover:border-white/30"
                  >
                    Cancel
                  </button>
                </div>

                <button
                  onClick={isVerificationStep ? verifyEmailCode : isPasswordStep ? verifyEmailAndCreateAccount : nextStep}
                  disabled={loading}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />
                      <span>
                        {isVerificationStep ? 'Verifying...' : isPasswordStep ? 'Creating Account...' : 'Processing...'}
                      </span>
                    </>
                  ) : isVerificationStep ? (
                    <>
                      <span>Verify Email</span>
                      <CheckCircle className="h-4 w-4" />
                    </>
                  ) : isPasswordStep ? (
                    <>
                      <span>Create Account</span>
                      <CheckCircle className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Existing Email Modal */}
      {showExistingEmailModal && existingEmailData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Email Already Registered</h3>
            </div>

            <p className="text-gray-600 mb-4">
              {existingEmailData.message}
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                <strong>Email:</strong> {existingEmailData.email}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setShowExistingEmailModal(false);
                  setExistingEmailData(null);
                }}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                Try Different Email
              </button>

              <button
                onClick={() => {
                  // Redirect to password recovery
                  window.location.href = '/forgot-password';
                }}
                className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimplifiedClientRegistration;