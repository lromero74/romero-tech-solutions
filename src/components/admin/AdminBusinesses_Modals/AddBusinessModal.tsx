import React, { useState, useEffect } from 'react';
import { X, Save, Building, Plus, Trash2, AlertTriangle, Globe, CheckCircle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { PhotoUploadInterface } from '../../shared/PhotoUploadInterface';
import ServiceAreaValidator from '../../shared/ServiceAreaValidator';
import AddressFormWithAutoComplete from '../../shared/AddressFormWithAutoComplete';
// Removed unused import: validateServiceAreaField
import { validateDomain } from '../../../utils/domainValidation';
import AlertModal from '../../shared/AlertModal';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import apiService from '../../../services/apiService';

interface AuthorizedDomain {
  domain: string;
  description?: string;
  isValid?: boolean;
  validationError?: string;
  isValidating?: boolean;
}

interface Business {
  id: string;
  businessName: string;
}

interface RateCategory {
  id: string;
  categoryName: string;
  baseHourlyRate: number;
  description: string;
  isDefault: boolean;
}

interface AddBusinessModalProps {
  showModal: boolean;
  onClose: () => void;
  onSubmit: (businessData: {
    businessName: string;
    authorizedDomains: AuthorizedDomain[];
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country?: string;
    };
    logo?: string;
    logoPositionX?: number;
    logoPositionY?: number;
    logoScale?: number;
    logoBackgroundColor?: string;
    rateCategoryId?: string;
  }) => Promise<void>;
  businesses?: Business[];
  onOpenServiceLocationModal?: (businessName: string, address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  }) => void;
}

const AddBusinessModal: React.FC<AddBusinessModalProps> = ({
  showModal,
  onClose,
  onSubmit,
  businesses = [],
  onOpenServiceLocationModal
}) => {
  const { user } = useEnhancedAuth();
  const isExecutiveOrAdmin = user?.role === 'executive' || user?.role === 'admin';

  // State declarations first
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);
  const [showZipValidationError, setShowZipValidationError] = useState(false);

  // Rate category state
  const [rateCategories, setRateCategories] = useState<RateCategory[]>([]);
  const [selectedRateCategoryId, setSelectedRateCategoryId] = useState<string>('');

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [authorizedDomains, setAuthorizedDomains] = useState<AuthorizedDomain[]>([
    { domain: '', description: '' }
  ]);
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA'
  });
  const [openServiceLocationModal, setOpenServiceLocationModal] = useState(true);

  // Service area validation state - start as false until validation passes
  const [serviceAreaValid, setServiceAreaValid] = useState(false);
  // Trigger for immediate validation (timestamp)
  const [triggerValidation, setTriggerValidation] = useState<number>(0);
  // Debounce timer for business name validation
  const [nameValidationTimer, setNameValidationTimer] = useState<NodeJS.Timeout | null>(null);

  // Field-level validation modal state
  const [showFieldValidationModal, setShowFieldValidationModal] = useState(false);
  const fieldValidationData = {
    reason: 'This location is outside our current service area.',
    suggestedAreas: undefined,
    geographicallyRelevant: undefined
  };


  // Check for duplicate business name in real-time
  const checkDuplicateName = (name: string) => {
    if (!name.trim()) {
      return false;
    }

    if (businesses && businesses.length > 0) {
      const existingBusiness = businesses.find(
        business => business.businessName.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingBusiness) {
        setShowErrorDialog(true);
        return true;
      }
    }
    return false;
  };

  // Debounced business name validation
  const debouncedNameValidation = (name: string) => {
    // Clear existing timer
    if (nameValidationTimer) {
      clearTimeout(nameValidationTimer);
    }

    // Only validate if name has substantial content (3+ characters)
    if (name.trim().length < 3) {
      return;
    }

    // Set new timer with longer delay for better UX
    const timer = setTimeout(() => {
      checkDuplicateName(name);
    }, 1000); // 1 second delay - much more reasonable

    setNameValidationTimer(timer);
  };

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (nameValidationTimer) {
        clearTimeout(nameValidationTimer);
      }
    };
  }, [nameValidationTimer]);

  // Load rate categories
  useEffect(() => {
    const loadRateCategories = async () => {
      try {
        const response = await apiService.get<{ success: boolean; data: RateCategory[] }>('/admin/hourly-rate-categories');
        if (response.success && response.data) {
          setRateCategories(response.data);
          // Set default category as selected
          const defaultCategory = response.data.find(cat => cat.isDefault);
          if (defaultCategory) {
            setSelectedRateCategoryId(defaultCategory.id);
          }
        }
      } catch (error) {
        console.error('Failed to load rate categories:', error);
      }
    };

    if (showModal) {
      loadRateCategories();
    }
  }, [showModal]);


  // Logo-related state
  const [enableLogo, setEnableLogo] = useState(false);
  const [logo, setLogo] = useState('');
  const [logoPositionX, setLogoPositionX] = useState(50);
  const [logoPositionY, setLogoPositionY] = useState(50);
  const [logoScale, setLogoScale] = useState(100);
  const [enableBackgroundColor, setEnableBackgroundColor] = useState(false);
  const [logoBackgroundColor, setLogoBackgroundColor] = useState('');

  // Handle field-level blur validation
  const handleFieldBlur = async (field: 'city' | 'state' | 'zipCode', value: string) => {
    console.log('🔄 AddBusinessModal handleFieldBlur called:', { field, value });

    // For ZIP code field, always trigger full service area validation
    if (field === 'zipCode') {
      console.log('🔄 ZIP field blurred, triggering service area validation for:', value);
      setTriggerValidation(Date.now());
      return;
    }

    // Don't validate individual city/state fields - only validate complete addresses
    console.log('🔄 Skipping individual field validation for', field, '- will validate complete address on ZIP blur');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      alert('Business name is required');
      return;
    }

    if (checkDuplicateName(businessName)) {
      return;
    }

    // Filter out empty domains and validate domain requirements
    const validDomains = authorizedDomains.filter(d => d.domain.trim() !== '');

    if (validDomains.length === 0) {
      alert('At least one authorized domain is required');
      return;
    }

    // Check for domain validation errors
    const invalidDomains = validDomains.filter(d => d.isValid === false);
    if (invalidDomains.length > 0) {
      const firstInvalid = invalidDomains[0];
      alert(`Domain validation error: ${firstInvalid.validationError || 'Invalid domain format'}`);
      return;
    }

    // Check for domains still being validated (only for non-empty domains)
    const validatingDomains = validDomains.filter(d => d.domain.trim() && d.isValidating);
    if (validatingDomains.length > 0) {
      alert('Please wait for domain validation to complete before submitting.');
      return;
    }

    // Check that all non-empty domains have completed validation successfully
    // Allow submission if domains are still validating but warn the user
    const unvalidatedDomains = validDomains.filter(d => d.domain.trim() && d.isValid !== true && !d.isValidating);
    if (unvalidatedDomains.length > 0) {
      const proceed = window.confirm('Some domains could not be validated. Do you want to proceed anyway?');
      if (!proceed) {
        return;
      }
    }

    if (!address.street.trim() || !address.city.trim() || !address.state.trim() || !address.zipCode.trim()) {
      alert('All address fields are required');
      return;
    }

    // Check ZIP code format - must be exactly 5 digits
    if (!/^\d{5}$/.test(address.zipCode.trim())) {
      setShowZipValidationError(true);
      return;
    }

    // Check service area validation
    console.log('🔍 Form submission: serviceAreaValid =', serviceAreaValid);
    if (!serviceAreaValid) {
      setShowServiceAreaError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('🟦 AddBusinessModal: About to call onSubmit with:', {
        businessName: businessName.trim(),
        authorizedDomains: validDomains,
        address,
        logo: enableLogo ? logo : undefined,
        logoPositionX: enableLogo ? logoPositionX : undefined,
        logoPositionY: enableLogo ? logoPositionY : undefined,
        logoScale: enableLogo ? logoScale : undefined,
        logoBackgroundColor: enableBackgroundColor ? logoBackgroundColor : undefined
      });
      await onSubmit({
        businessName: businessName.trim(),
        authorizedDomains: validDomains,
        address,
        logo: enableLogo ? logo : undefined,
        logoPositionX: enableLogo ? logoPositionX : undefined,
        logoPositionY: enableLogo ? logoPositionY : undefined,
        logoScale: enableLogo ? logoScale : undefined,
        logoBackgroundColor: enableBackgroundColor ? logoBackgroundColor : undefined,
        rateCategoryId: selectedRateCategoryId || undefined
      });
      console.log('🟦 AddBusinessModal: onSubmit completed successfully');

      // Reset form only after successful submission
      setBusinessName('');
      setAuthorizedDomains([{ domain: '', description: '' }]);
      setAddress({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA'
      });
      setOpenServiceLocationModal(true);

      // Reset service area validation
      setServiceAreaValid(false);

      // Reset logo fields
      setEnableLogo(false);
      setLogo('');
      setLogoPositionX(50);
      setLogoPositionY(50);
      setLogoScale(100);
      setEnableBackgroundColor(false);
      setLogoBackgroundColor('');

      // Reset rate category to default
      const defaultCategory = rateCategories.find(cat => cat.isDefault);
      if (defaultCategory) {
        setSelectedRateCategoryId(defaultCategory.id);
      }

      // If the toggle is enabled and callback is provided, open service location modal
      if (openServiceLocationModal && onOpenServiceLocationModal) {
        onOpenServiceLocationModal(businessName.trim(), address);
      }

      // Note: onClose() is called by AdminModalManager after refresh
    } catch (error) {
      console.error('Error adding business:', error);
      alert('Failed to add business. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addDomainField = () => {
    if (authorizedDomains.length < 5) {
      setAuthorizedDomains([...authorizedDomains, { domain: '', description: '' }]);
    }
  };

  const removeDomainField = (index: number) => {
    if (authorizedDomains.length > 1) {
      setAuthorizedDomains(authorizedDomains.filter((_, i) => i !== index));
    }
  };

  const updateDomainField = (index: number, field: keyof AuthorizedDomain, value: string) => {
    const updated = [...authorizedDomains];
    updated[index] = { ...updated[index], [field]: value };

    // If updating domain field, just clear any previous validation state
    if (field === 'domain') {
      // Clear validation state - we'll validate on blur
      updated[index].isValidating = false;
      updated[index].isValid = undefined;
      updated[index].validationError = undefined;
    }

    setAuthorizedDomains(updated);
  };

  const validateDomainField = async (index: number, domain: string) => {
    if (!domain || !domain.trim()) {
      const updated = [...authorizedDomains];
      updated[index].isValidating = false;
      updated[index].isValid = undefined;
      updated[index].validationError = undefined;
      setAuthorizedDomains(updated);
      return;
    }

    try {
      console.log(`🌐 DOMAIN VALIDATION: Validating domain at index ${index}:`, domain);

      // NOW set the validating state when validation actually starts
      const updatedStart = [...authorizedDomains];
      updatedStart[index].isValidating = true;
      updatedStart[index].isValid = undefined;
      updatedStart[index].validationError = undefined;
      setAuthorizedDomains(updatedStart);

      // Add a race condition with a maximum timeout to prevent hanging
      const validationPromise = validateDomain(domain, { checkDNS: true, timeout: 2000 });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), 3000)
      );

      const result = await Promise.race([validationPromise, timeoutPromise]);

      const updated = [...authorizedDomains];
      updated[index].isValidating = false;
      updated[index].isValid = result.isValid;
      updated[index].validationError = result.error;

      setAuthorizedDomains(updated);
      console.log(`🌐 DOMAIN VALIDATION: Result for ${domain}:`, result);
    } catch (error) {
      console.error('Domain validation error:', error);
      const updated = [...authorizedDomains];
      updated[index].isValidating = false;
      updated[index].isValid = false;
      updated[index].validationError = error.message === 'Validation timeout' ? 'Validation timed out' : 'Validation failed';
      setAuthorizedDomains(updated);
    }
  };

  if (!showModal) return null;

  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-2xl max-h-[90vh] ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-y-auto`}>
        <div className={`px-6 py-4 border-b ${themeClasses.border.primary} flex justify-between items-center`}>
          <div className="flex items-center">
            <Building className={`w-5 h-5 ${themeClasses.text.primary} mr-2`} />
            <h2 className={`text-xl font-semibold ${themeClasses.text.primary}`}>Add New Business</h2>
          </div>
          <button
            onClick={onClose}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Business Name */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Business Name *
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                // Use debounced validation - only checks after user stops typing
                debouncedNameValidation(e.target.value);
              }}
              onBlur={(e) => checkDuplicateName(e.target.value)}
              className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              placeholder="Enter business name"
              required
            />
          </div>

          {/* Authorized Email Domains */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                Authorized Email Domains *
              </label>
              {authorizedDomains.length < 5 && (
                <button
                  type="button"
                  onClick={addDomainField}
                  className={`inline-flex items-center px-2 py-1 text-xs font-medium text-purple-600 bg-purple-100 dark:bg-purple-900 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Domain
                </button>
              )}
            </div>
            <div className="space-y-3">
              {authorizedDomains.map((domain, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={domain.domain}
                        onChange={(e) => updateDomainField(index, 'domain', e.target.value)}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value) {
                            validateDomainField(index, value);
                          }
                        }}
                        className={`w-full px-3 py-2 pr-10 border ${
                          domain.isValid === false
                            ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                            : domain.isValid === true
                            ? 'border-green-500 focus:ring-green-500 focus:border-green-500'
                            : themeClasses.border.primary + ' focus:ring-blue-500 focus:border-blue-500'
                        } rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2`}
                        placeholder="example.com"
                      />
                      {/* Validation Status Icon */}
                      {domain.isValidating && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        </div>
                      )}
                      {domain.isValid === true && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                      )}
                      {domain.isValid === false && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={domain.description || ''}
                        onChange={(e) => updateDomainField(index, 'description', e.target.value)}
                        className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                        placeholder="Description (optional)"
                      />
                    </div>
                    {authorizedDomains.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDomainField(index)}
                        className={`px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-md border ${themeClasses.border.primary} transition-colors`}
                        title="Remove domain"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Validation Error Message */}
                  {domain.isValid === false && domain.validationError && (
                    <div className="flex items-center text-sm text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span>{domain.validationError}</span>
                    </div>
                  )}
                  {/* Success Message */}
                  {domain.isValid === true && (
                    <div className="flex items-center text-sm text-green-600 dark:text-green-400">
                      <Globe className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span>Domain verified and reachable</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Address with Auto-Completion */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Business Address *
            </label>
            <AddressFormWithAutoComplete
              address={address}
              onAddressChange={setAddress}
              disabled={false}
              showLabels={false}
              required={true}
              onFieldBlur={handleFieldBlur}
              onZipLookupSuccess={() => {
                console.log('🚀 ZIP lookup succeeded, triggering immediate validation');
                setTriggerValidation(Date.now());
              }}
            />
          </div>

          {/* Service Area Validation */}
          <ServiceAreaValidator
            address={{
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              country: address.country
            }}
            onValidationChange={(isValid, errors) => {
              console.log('🔍 ServiceAreaValidator callback:', { isValid, errors });
              setServiceAreaValid(isValid);
            }}
            showSuggestions={true}
            triggerValidation={triggerValidation}
          />

          {/* Rate Category Selection */}
          {isExecutiveOrAdmin && rateCategories.length > 0 && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Hourly Rate Category
              </label>
              <select
                value={selectedRateCategoryId}
                onChange={(e) => setSelectedRateCategoryId(e.target.value)}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              >
                {rateCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.categoryName} (${category.baseHourlyRate}/hr)
                    {category.isDefault ? ' - Default' : ''}
                  </option>
                ))}
              </select>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Base hourly rate used for calculating service costs for this business
              </p>
            </div>
          )}

          {/* Logo Upload Section */}
          <div className="mt-6">
            <div className="flex items-center mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={enableLogo}
                  onChange={(e) => {
                    setEnableLogo(e.target.checked);
                    if (!e.target.checked) {
                      setLogo('');
                      setLogoPositionX(50);
                      setLogoPositionY(50);
                      setLogoScale(100);
                      setEnableBackgroundColor(false);
                      setLogoBackgroundColor('');
                    }
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className={`ml-2 text-sm font-medium ${themeClasses.text.secondary}`}>
                  Add Business Logo
                </span>
              </label>
            </div>

            {enableLogo && (
              <PhotoUploadInterface
                photo={logo}
                photoPositionX={logoPositionX}
                photoPositionY={logoPositionY}
                photoScale={logoScale}
                photoBackgroundColor={logoBackgroundColor}
                enableBackgroundColor={enableBackgroundColor}
                onPhotoChange={(photo) => setLogo(photo)}
                onPositionChange={(x, y) => {
                  setLogoPositionX(x);
                  setLogoPositionY(y);
                }}
                onScaleChange={(scale) => setLogoScale(scale)}
                onBackgroundColorChange={(color) => setLogoBackgroundColor(color || '')}
                onBackgroundColorToggle={(enabled) => {
                  setEnableBackgroundColor(enabled);
                  if (!enabled) {
                    setLogoBackgroundColor('');
                  }
                }}
              />
            )}
          </div>

          {/* Add Service Location Toggle */}
          {onOpenServiceLocationModal && (
            <div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="openServiceLocationModal"
                  checked={openServiceLocationModal}
                  onChange={(e) => setOpenServiceLocationModal(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="openServiceLocationModal" className={`ml-3 text-sm font-medium ${themeClasses.text.secondary}`}>
                  Also add service location for this business
                </label>
              </div>
              <p className={`ml-7 text-xs ${themeClasses.text.muted} mt-1`}>
                After creating the business, automatically open the service location form with this address pre-filled
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.secondary} ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Adding...' : 'Add Business'}
            </button>
          </div>
        </form>
      </div>

      {/* Duplicate Business Name Error Dialog */}
      {showErrorDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-orange-400" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Business Name Already Exists
                </h3>
              </div>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                A business with this name already exists. Please choose a different name.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowErrorDialog(false)}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Area Validation Error Dialog */}
      {showServiceAreaError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Service Area Validation Required
                </h3>
              </div>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Please review and address the service area validation issues shown above before submitting the form.
              </p>
              <p className={`text-xs ${themeClasses.text.muted} mt-2`}>
                We can only provide services in our designated coverage areas.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowServiceAreaError(false)}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Validation Modal */}
      <AlertModal
        isOpen={showFieldValidationModal}
        onClose={() => setShowFieldValidationModal(false)}
        type="error"
        title="Service Area Not Available"
        message={fieldValidationData?.reason || 'This location is outside our current service area.'}
        suggestedAreas={fieldValidationData?.suggestedAreas}
        geographicallyRelevant={fieldValidationData?.geographicallyRelevant}
      />

      {/* ZIP Code Validation Modal */}
      <AlertModal
        isOpen={showZipValidationError}
        onClose={() => setShowZipValidationError(false)}
        type="error"
        title="Invalid ZIP Code"
        message="ZIP code must be exactly 5 digits. Please enter a complete ZIP code (e.g., 92026)."
      />
    </div>
  );
};

export default AddBusinessModal;