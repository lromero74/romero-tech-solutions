import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { apiService } from '../services/apiService';

interface OnboardingFormData {
  businessName: string;
  isIndividual: boolean;
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
  firstName: string;
  lastName: string;
  phone: string;
}

const TrialUserOnboarding: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next') || '/dashboard';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zipCodeValidation, setZipCodeValidation] = useState<{
    valid: boolean;
    message: string;
    city?: string;
    state?: string;
  } | null>(null);
  const [zipValidated, setZipValidated] = useState(false);
  const [zipValidating, setZipValidating] = useState(false);

  const [formData, setFormData] = useState<OnboardingFormData>({
    businessName: '',
    isIndividual: false,
    streetAddress1: '',
    streetAddress2: '',
    city: '',
    state: '',
    zipCode: '',
    firstName: '',
    lastName: '',
    phone: ''
  });

  const updateFormData = <K extends keyof OnboardingFormData>(
    key: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Phone number formatting
  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');

    if (digits.length === 0) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 10) {
      const formattedValue = formatPhoneNumber(value);
      updateFormData('phone', formattedValue);
    }
  };

  const getPhoneDigits = (formattedPhone: string): string => {
    return formattedPhone.replace(/\D/g, '');
  };

  const validateZipCode = async (zipCode: string) => {
    setZipCodeValidation(null);
    setZipValidated(false);
    setZipValidating(true);

    if (zipCode.length !== 5 || !/^\d{5}$/.test(zipCode)) {
      setZipCodeValidation({
        valid: false,
        message: 'Please enter a valid 5-digit ZIP code'
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
        updateFormData('city', data.data.city || '');
        updateFormData('state', data.data.state || '');

        setZipCodeValidation({
          valid: true,
          message: `Service available in ${data.data.city}, ${data.data.state}`,
          city: data.data.city,
          state: data.data.state
        });
        setZipValidated(true);
      } else {
        setZipCodeValidation({
          valid: false,
          message: `Service not available in ZIP code ${zipCode}`
        });
      }
    } catch (error) {
      // Fallback for development
      const supportedZipCodes = ['92101', '92102', '92103', '92104', '92105', '92115', '92116'];
      const isSupported = supportedZipCodes.includes(zipCode);

      if (isSupported) {
        updateFormData('city', 'San Diego');
        updateFormData('state', 'CA');
        setZipValidated(true);
      }

      setZipCodeValidation({
        valid: isSupported,
        message: isSupported
          ? 'Service available in San Diego, CA'
          : `Service not available in ZIP code ${zipCode}`
      });
    } finally {
      setZipValidating(false);
    }
  };

  const handleZipCodeChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    updateFormData('zipCode', numericValue);
    setZipValidated(false);

    if (zipCodeValidation) {
      setZipCodeValidation(null);
    }

    if (numericValue.length === 5) {
      validateZipCode(numericValue);
    }
  };

  const validateForm = (): boolean => {
    setError('');

    if (!formData.isIndividual && !formData.businessName.trim()) {
      setError('Business name is required');
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

    if (!formData.zipCode.trim()) {
      setError('ZIP code is required');
      return false;
    }

    if (!zipCodeValidation?.valid) {
      setError('Please enter a valid ZIP code in our service area');
      return false;
    }

    if (!formData.firstName.trim()) {
      setError('First name is required');
      return false;
    }

    if (!formData.lastName.trim()) {
      setError('Last name is required');
      return false;
    }

    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return false;
    }

    const phoneDigits = getPhoneDigits(formData.phone);
    if (phoneDigits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const finalBusinessName = formData.isIndividual
        ? null
        : formData.businessName;

      const response = await apiService.post('/client/profile/complete-onboarding', {
        businessName: finalBusinessName,
        isIndividual: formData.isIndividual,
        streetAddress1: formData.streetAddress1,
        streetAddress2: formData.streetAddress2,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: getPhoneDigits(formData.phone)
      });

      if (response.success) {
        // Navigate to the intended destination (e.g., /dashboard?tab=schedule-service)
        if (nextPath.includes('schedule-service')) {
          navigate('/dashboard?tab=schedule-service');
        } else {
          navigate(nextPath);
        }
      } else {
        setError(response.message || 'Failed to complete onboarding');
      }
    } catch (error: any) {
      console.error('Error completing onboarding:', error);
      setError(error.message || 'Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              {formData.isIndividual ? (
                <User className="h-8 w-8 text-blue-600" />
              ) : (
                <Building2 className="h-8 w-8 text-blue-600" />
              )}
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Complete Your Profile
            </h2>
            <p className="text-blue-200">
              We need a few details to help you schedule service requests
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-500/20 backdrop-blur-sm border border-red-300/30 text-red-200 px-4 py-3 rounded-lg text-sm flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business/Individual Toggle */}
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-center space-x-4">
                <span
                  className={`text-sm font-medium transition-colors ${
                    !formData.isIndividual ? 'text-white' : 'text-blue-300'
                  }`}
                >
                  Business
                </span>
                <button
                  type="button"
                  onClick={() => {
                    updateFormData('isIndividual', !formData.isIndividual);
                    if (!formData.isIndividual) {
                      updateFormData('businessName', '');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    formData.isIndividual ? 'bg-blue-600' : 'bg-white/20'
                  }`}
                  role="switch"
                  aria-checked={formData.isIndividual}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.isIndividual ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span
                  className={`text-sm font-medium transition-colors ${
                    formData.isIndividual ? 'text-white' : 'text-blue-300'
                  }`}
                >
                  Individual
                </span>
              </div>
            </div>

            {/* Business Name (only if not individual) */}
            {!formData.isIndividual && (
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => updateFormData('businessName', e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Acme Corporation"
                  required={!formData.isIndividual}
                />
              </div>
            )}

            {/* Street Address */}
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
                required
              />
            </div>

            {/* Address Line 2 */}
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
              />
            </div>

            {/* ZIP Code */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                ZIP Code *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => handleZipCodeChange(e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
                  placeholder="92101"
                  maxLength={5}
                  required
                />
                {zipValidating && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-4 w-4 text-blue-200 animate-spin" />
                  </div>
                )}
                {zipValidated && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                )}
              </div>
              {zipCodeValidation && (
                <div
                  className={`mt-2 p-3 rounded-lg text-sm ${
                    zipCodeValidation.valid
                      ? 'bg-green-500/20 border border-green-300/30 text-green-200'
                      : 'bg-red-500/20 border border-red-300/30 text-red-200'
                  }`}
                >
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
            </div>

            {/* City and State Grid */}
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
                  placeholder="San Diego"
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
                  disabled={zipValidated}
                  required
                />
                {zipValidated && (
                  <p className="text-xs text-blue-300 mt-1">Auto-filled from ZIP code</p>
                )}
              </div>
            </div>

            {/* Contact Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateFormData('firstName', e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="John"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateFormData('lastName', e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full px-3 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="(555) 123-4567"
                maxLength={14}
                required
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    <span>Completing Setup...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Setup</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TrialUserOnboarding;
