import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, MapPin, Phone, Mail, Building2, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { validateEmailDomain } from '../../utils/domainValidation';
import apiService from '../../services/apiService';

interface AddServiceLocationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newLocation: any) => void;
}

interface FormData {
  locationName: string;
  streetAddress: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
}

const AddServiceLocationForm: React.FC<AddServiceLocationFormProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { t } = useClientLanguage();

  const [formData, setFormData] = useState<FormData>({
    locationName: '',
    streetAddress: '',
    streetAddress2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    contactPerson: '',
    contactPhone: '',
    contactEmail: ''
  });

  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Email domain validation states
  const [emailDomainValid, setEmailDomainValid] = useState(true);
  const [emailDomainError, setEmailDomainError] = useState('');
  const [emailDomainValidating, setEmailDomainValidating] = useState(false);

  // ZIP code validation states
  const [zipCodeValidation, setZipCodeValidation] = useState<{
    valid: boolean;
    message: string;
    city?: string;
    state?: string;
  } | null>(null);
  const [zipValidating, setZipValidating] = useState(false);

  // Refs for form fields (tab order)
  const locationNameRef = useRef<HTMLInputElement>(null);
  const streetAddressRef = useRef<HTMLInputElement>(null);
  const streetAddress2Ref = useRef<HTMLInputElement>(null);
  const zipCodeRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const contactPersonRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);
  const contactEmailRef = useRef<HTMLInputElement>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all form data
      setFormData({
        locationName: '',
        streetAddress: '',
        streetAddress2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States',
        contactPerson: '',
        contactPhone: '',
        contactEmail: ''
      });
      // Reset validation states
      setErrors({});
      setZipCodeValidation(null);
      setEmailDomainValid(true);
      setEmailDomainError('');
      setEmailDomainValidating(false);
      setZipValidating(false);
      setIsSubmitting(false);
      setShowAlert(false);
      setAlertMessage('');
    }
  }, [isOpen]);

  // Phone number formatting utilities (same as SimplifiedClientRegistration)
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

  const handlePhoneChange = (field: keyof FormData, value: string, isBackspace = false) => {
    // Only allow digits and formatting characters
    const digits = value.replace(/\D/g, '');

    // Special handling for backspace - allow deletion through formatting
    if (isBackspace) {
      const formattedValue = formatPhoneNumber(digits);
      setFormData(prev => ({ ...prev, [field]: formattedValue }));
      return;
    }

    // Limit to 10 digits for regular typing
    if (digits.length <= 10) {
      const formattedValue = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, [field]: formattedValue }));
    }
  };

  // Handle backspace/delete key specifically
  const handlePhoneKeyDown = (field: keyof FormData, e: React.KeyboardEvent<HTMLInputElement>) => {
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
            const newCursorPos = Math.min(posToRemove, formattedValue.length);
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
            const newCursorPos = Math.min(cursorPos, formattedValue.length);
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

  // Email validation functions (same as SimplifiedClientRegistration)
  const validateEmailFormat = (email: string): { valid: boolean; message?: string } => {
    if (!email) return { valid: true };

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: 'Invalid email format. Please use a valid email address.' };
    }

    if (email.includes('..')) {
      return { valid: false, message: 'Email cannot contain consecutive dots.' };
    }

    const [localPart] = email.split('@');
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { valid: false, message: 'Email cannot start or end with a dot.' };
    }

    const invalidChars = email.match(/[^a-zA-Z0-9._%+-@]/g);
    if (invalidChars) {
      return { valid: false, message: `Email contains invalid characters: ${invalidChars.join(', ')}` };
    }

    return { valid: true };
  };

  const handleEmailDomainValidation = async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailDomainValid(true);
      setEmailDomainError('');
      setEmailDomainValidating(false);
      return;
    }

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
      setEmailDomainValid(true);
      setEmailDomainError('');
    } finally {
      setEmailDomainValidating(false);
    }
  };

  // ZIP code validation and autofill
  const validateZipCode = async (zipCode: string) => {
    if (!zipCode) {
      setZipCodeValidation(null);
      setFormData(prev => ({ ...prev, city: '', state: '' }));
      return;
    }

    // Basic format validation
    const zipRegex = /^\d{5}$/;
    if (!zipRegex.test(zipCode)) {
      setZipCodeValidation({
        valid: false,
        message: t('locations.errors.zipCodeInvalid')
      });
      setFormData(prev => ({ ...prev, city: '', state: '' }));
      return;
    }

    setZipValidating(true);
    setZipCodeValidation(null);

    try {
      const data = await apiService.post('/service-areas/validate-zip', { zipCode });

      if (data.success && data.data.isServiced) {
        // Auto-fill city and state
        setFormData(prev => ({
          ...prev,
          city: data.data.city || '',
          state: data.data.state || ''
        }));

        setZipCodeValidation({
          valid: true,
          message: t('locations.zipServiceAvailable', { city: data.data.city, state: data.data.state }),
          city: data.data.city,
          state: data.data.state
        });
      } else {
        setZipCodeValidation({
          valid: false,
          message: t('locations.errors.notInServiceArea')
        });
        setFormData(prev => ({ ...prev, city: '', state: '' }));
      }
    } catch (error) {
      console.error('ZIP validation error:', error);
      setZipCodeValidation({
        valid: false,
        message: t('locations.errors.zipValidationFailed')
      });
      setFormData(prev => ({ ...prev, city: '', state: '' }));
    } finally {
      setZipValidating(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Special handling for phone numbers
    if (field === 'contactPhone') {
      handlePhoneChange(field, value);
      return;
    }

    // Regular field update
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof FormData) => {
    const value = formData[field];

    if (field === 'zipCode' && value) {
      validateZipCode(value);
    }

    if (field === 'contactEmail' && value) {
      handleEmailDomainValidation(value);
    }
  };


  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.locationName.trim()) {
      newErrors.locationName = t('locations.errors.locationNameRequired');
    }

    if (!formData.streetAddress.trim()) {
      newErrors.streetAddress = t('locations.errors.streetAddressRequired');
    }

    if (!formData.zipCode.trim()) {
      newErrors.zipCode = t('locations.errors.zipCodeRequired');
    } else if (!/^\d{5}$/.test(formData.zipCode)) {
      newErrors.zipCode = t('locations.errors.zipCodeInvalid');
    }

    if (!formData.city.trim()) {
      newErrors.city = t('locations.errors.cityRequired');
    }

    if (!formData.state.trim()) {
      newErrors.state = t('locations.errors.stateRequired');
    }

    if (formData.contactEmail && !emailDomainValid) {
      newErrors.contactEmail = emailDomainError || t('locations.errors.invalidEmailAddress');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      setShowAlert(true);
      setAlertMessage(t('locations.errors.correctErrors'));
      return;
    }

    if (!zipCodeValidation || !zipCodeValidation.valid) {
      setShowAlert(true);
      setAlertMessage(zipCodeValidation?.message || t('locations.errors.notInServiceArea'));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiService.post('/client/profile/add-service-location', {
        locationName: formData.locationName.trim(),
        streetAddress: formData.streetAddress.trim(),
        streetAddress2: formData.streetAddress2.trim() || null,
        city: formData.city.trim(),
        state: formData.state.trim(),
        zipCode: formData.zipCode.trim(),
        country: formData.country,
        contactPerson: formData.contactPerson.trim() || null,
        contactPhone: formData.contactPhone.replace(/\D/g, '') || null,
        contactEmail: formData.contactEmail.trim() || null
      });

      if (result.success) {
        onSuccess(result.data);
        onClose();
        // Reset form
        setFormData({
          locationName: '',
          streetAddress: '',
          streetAddress2: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
          contactPerson: '',
          contactPhone: '',
          contactEmail: ''
        });
        setErrors({});
      } else {
        setShowAlert(true);
        setAlertMessage(result.message || t('locations.errors.failedToAdd'));
      }
    } catch (error) {
      console.error('Error adding service location:', error);
      setShowAlert(true);
      setAlertMessage(t('locations.errors.genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAlert = () => {
    setShowAlert(false);
    setAlertMessage('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Alert Modal */}
      {showAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('locations.ui.error')}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{alertMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={closeAlert}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                {t('locations.ui.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                <Plus className="h-5 w-5 mr-2" />
                {t('locations.addLocation')}
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Location Name - Tab Index 1 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Building2 className="h-4 w-4 inline mr-1" />
                  {t('locations.locationName')} *
                </label>
                <input
                  ref={locationNameRef}
                  type="text"
                  value={formData.locationName}
                  onChange={(e) => handleInputChange('locationName', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                    errors.locationName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={t('locations.placeholders.locationName')}
                  tabIndex={1}
                />
                {errors.locationName && (
                  <p className="text-red-500 text-sm mt-1">{errors.locationName}</p>
                )}
              </div>

              {/* Street Address - Tab Index 3 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  {t('locations.streetAddress')} *
                </label>
                <input
                  ref={streetAddressRef}
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                    errors.streetAddress ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={t('locations.placeholders.streetAddress')}
                  tabIndex={3}
                />
                {errors.streetAddress && (
                  <p className="text-red-500 text-sm mt-1">{errors.streetAddress}</p>
                )}
              </div>

              {/* Street Address 2 - Tab Index 4 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('locations.streetAddress2')}
                </label>
                <input
                  ref={streetAddress2Ref}
                  type="text"
                  value={formData.streetAddress2}
                  onChange={(e) => handleInputChange('streetAddress2', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t('locations.placeholders.streetAddress2')}
                  tabIndex={4}
                />
              </div>

              {/* City and State Grid - Disabled after ZIP validation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('locations.city')} *
                  </label>
                  <input
                    ref={cityRef}
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.city ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder={t('locations.placeholders.city')}
                    readOnly={!!zipCodeValidation?.city}
                    tabIndex={-1}
                  />
                  {errors.city && (
                    <p className="text-red-500 text-sm mt-1">{errors.city}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('locations.state')} *
                  </label>
                  <input
                    ref={stateRef}
                    type="text"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                      errors.state ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder={t('locations.placeholders.state')}
                    readOnly={!!zipCodeValidation?.state}
                    tabIndex={-1}
                  />
                  {errors.state && (
                    <p className="text-red-500 text-sm mt-1">{errors.state}</p>
                  )}
                </div>
              </div>

              {/* ZIP Code - Tab Index 2 (normal position but custom tab order) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('locations.zipCode')} *
                </label>
                <input
                  ref={zipCodeRef}
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                    handleInputChange('zipCode', value);
                  }}
                  onBlur={() => handleBlur('zipCode')}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                    errors.zipCode || (zipCodeValidation && !zipCodeValidation.valid) ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={t('locations.placeholders.zipCode')}
                  maxLength={5}
                  tabIndex={2}
                />
                {errors.zipCode && (
                  <p className="text-red-500 text-sm mt-1">{errors.zipCode}</p>
                )}
                {/* ZIP Validation Feedback */}
                {zipValidating && (
                  <div className="flex items-center mt-2 text-blue-600 dark:text-blue-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Validating ZIP code...
                  </div>
                )}
                {zipCodeValidation && zipCodeValidation.valid && (
                  <div className="flex items-center mt-2 text-green-600 dark:text-green-400 text-sm">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {zipCodeValidation.message}
                  </div>
                )}
                {zipCodeValidation && !zipCodeValidation.valid && (
                  <p className="text-red-500 text-sm mt-1">{zipCodeValidation.message}</p>
                )}
              </div>

              {/* Contact Information */}
              <div className="border-t pt-4 mt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {t('locations.contactInformation')}
                </h3>

                <div className="space-y-4">
                  {/* Contact Person - Tab Index 5 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('locations.contactPerson')}
                    </label>
                    <input
                      ref={contactPersonRef}
                      type="text"
                      value={formData.contactPerson}
                      onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder={t('locations.placeholders.contactPerson')}
                      tabIndex={5}
                    />
                  </div>

                  {/* Contact Phone - Tab Index 6 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Phone className="h-4 w-4 inline mr-1" />
                      {t('schedule.contact.phone')}
                    </label>
                    <input
                      ref={contactPhoneRef}
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => handlePhoneChange('contactPhone', e.target.value)}
                      onKeyDown={(e) => handlePhoneKeyDown('contactPhone', e)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder={t('locations.placeholders.contactPhone')}
                      tabIndex={6}
                    />
                  </div>

                  {/* Contact Email - Tab Index 7 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Mail className="h-4 w-4 inline mr-1" />
                      {t('locations.contactEmail')}
                    </label>
                    <input
                      ref={contactEmailRef}
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => handleInputChange('contactEmail', e.target.value)}
                      onBlur={() => handleBlur('contactEmail')}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                        errors.contactEmail ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder={t('locations.placeholders.contactEmail')}
                      tabIndex={7}
                    />
                    {emailDomainValidating && (
                      <p className="text-blue-500 text-sm mt-1">Validating email domain...</p>
                    )}
                    {emailDomainError && (
                      <p className="text-red-500 text-sm mt-1">{emailDomainError}</p>
                    )}
                    {errors.contactEmail && (
                      <p className="text-red-500 text-sm mt-1">{errors.contactEmail}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !zipCodeValidation?.valid}
                  className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                    isSubmitting || !zipCodeValidation?.valid
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isSubmitting ? t('locations.ui.adding') : t('locations.addLocation')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddServiceLocationForm;