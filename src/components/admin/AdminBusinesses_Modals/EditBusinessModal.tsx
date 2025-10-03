import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Building, Plus, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { adminService } from '../../../services/adminService';
import { PhotoUploadInterface } from '../../shared/PhotoUploadInterface';
import ServiceAreaValidator from '../../shared/ServiceAreaValidator';
import AddressFormWithAutoComplete from '../../shared/AddressFormWithAutoComplete';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { usePermission } from '../../../hooks/usePermission';
import apiService from '../../../services/apiService';
// Removed unused imports: validateServiceAreaField, AlertModal

interface AuthorizedDomain {
  id?: string;
  domain: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
}

interface RateCategory {
  id: string;
  categoryName: string;
  baseHourlyRate: number;
  description: string;
  isDefault: boolean;
}

interface Business {
  id: string;
  businessName: string;
  domainEmail: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  userCount: number;
  isActive: boolean;
  createdAt: string;
  logo?: string;
  logoPositionX?: number;
  logoPositionY?: number;
  logoScale?: number;
  logoBackgroundColor?: string;
  rateCategoryId?: string;
}

interface EditBusinessModalProps {
  showModal: boolean;
  business: Business | null;
  onClose: () => void;
  onSubmit: (businessId: string, updates: {
    businessName: string;
    authorizedDomains: AuthorizedDomain[];
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    isActive: boolean;
    logo?: string;
    logoPositionX?: number;
    logoPositionY?: number;
    logoScale?: number;
    logoBackgroundColor?: string;
    rateCategoryId?: string;
  }) => Promise<void>;
  businesses?: Business[];
}

const EditBusinessModal: React.FC<EditBusinessModalProps> = ({
  showModal,
  business,
  onClose,
  onSubmit,
  businesses = []
}) => {
  const { user } = useEnhancedAuth();
  const { checkPermission } = usePermission();
  const canViewRateCategories = checkPermission('view.business_rate_categories.enable');

  const [formData, setFormData] = useState({
    businessName: '',
    isActive: true,
    logo: '',
    logoPositionX: 50,
    logoPositionY: 50,
    logoScale: 100,
    logoBackgroundColor: ''
  });

  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA'
  });

  const [authorizedDomains, setAuthorizedDomains] = useState<AuthorizedDomain[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originalBusiness, setOriginalBusiness] = useState<Business | null>(null);
  const [originalDomains, setOriginalDomains] = useState<AuthorizedDomain[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [enableLogo, setEnableLogo] = useState(false);
  const [originalEnableLogo, setOriginalEnableLogo] = useState(false);
  const [enableBackgroundColor, setEnableBackgroundColor] = useState(false);
  const [originalEnableBackgroundColor, setOriginalEnableBackgroundColor] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  // Service area validation state
  const [serviceAreaValid, setServiceAreaValid] = useState(true); // Start as true for edit mode
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);
  const [showZipValidationError, setShowZipValidationError] = useState(false);

  // Rate category state
  const [rateCategories, setRateCategories] = useState<RateCategory[]>([]);
  const [selectedRateCategoryId, setSelectedRateCategoryId] = useState<string>('');

  // Check for duplicate business name in real-time
  const checkDuplicateName = (name: string) => {
    if (!name.trim()) {
      return false;
    }

    if (businesses && businesses.length > 0 && business) {
      const existingBusiness = businesses.find(
        b => b.businessName.toLowerCase() === name.trim().toLowerCase() && b.id !== business.id
      );
      if (existingBusiness) {
        setShowErrorDialog(true);
        return true;
      }
    }
    return false;
  };

  // Fetch authorized domains function
  const fetchAuthorizedDomains = useCallback(async () => {
    if (!business?.id) return;

    setLoadingDomains(true);
    setError(''); // Clear any previous errors
    try {
      console.log(`🔄 Fetching authorized domains for business ${business.id}`);
      const data = await adminService.getAuthorizedDomains(business.id);

      console.log(`✅ Fetched ${data.authorizedDomains.length} authorized domains`);
      const domains = data.authorizedDomains.map((domain: AuthorizedDomain) => ({
        id: domain.id,
        domain: domain.domain,
        description: domain.description,
        is_active: domain.is_active
      }));
      setAuthorizedDomains(domains);
      setOriginalDomains(domains);
    } catch (error) {
      console.error('Error fetching authorized domains:', error);
      setError('Failed to load authorized domains: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoadingDomains(false);
    }
  }, [business?.id]);

  // Load rate categories
  useEffect(() => {
    const loadRateCategories = async () => {
      try {
        const response = await apiService.get<{ success: boolean; data: RateCategory[] }>('/admin/hourly-rate-categories');
        if (response.success && response.data) {
          setRateCategories(response.data);
        }
      } catch (error) {
        console.error('Failed to load rate categories:', error);
      }
    };

    if (showModal) {
      loadRateCategories();
    }
  }, [showModal]);

  // Fetch authorized domains when business changes
  useEffect(() => {
    if (business?.id && showModal) {
      fetchAuthorizedDomains();
    }
  }, [business?.id, showModal, fetchAuthorizedDomains]);

  // Re-fetch when modal opens (in case data changed)
  useEffect(() => {
    if (showModal && business?.id) {
      fetchAuthorizedDomains();
    }
  }, [showModal, business?.id, fetchAuthorizedDomains]);

  // Clear state when modal closes
  useEffect(() => {
    if (!showModal) {
      setAuthorizedDomains([]);
      setError('');
      setLoadingDomains(false);
    }
  }, [showModal]);

  // Update form data when business changes
  useEffect(() => {
    if (business) {
      const hasLogo = !!business.logo;
      const hasBackgroundColor = !!business.logoBackgroundColor;
      setEnableLogo(hasLogo);
      setOriginalEnableLogo(hasLogo);
      setEnableBackgroundColor(hasBackgroundColor);
      setOriginalEnableBackgroundColor(hasBackgroundColor);

      setFormData({
        businessName: business.businessName,
        isActive: business.isActive,
        logo: business.logo || '',
        logoPositionX: business.logoPositionX || 50,
        logoPositionY: business.logoPositionY || 50,
        logoScale: business.logoScale || 100,
        logoBackgroundColor: business.logoBackgroundColor || ''
      });

      setAddress({
        street: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
        country: 'USA'
      });
      setSelectedRateCategoryId(business.rateCategoryId || '');
      setOriginalBusiness(business);
    }
  }, [business]);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showModal) {
        // Check for changes inline to avoid function dependency issues
        if (!originalBusiness) {
          onClose();
          return;
        }

        const currentData = {
          businessName: formData.businessName,
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          isActive: formData.isActive,
          logo: formData.logo,
          logoPositionX: formData.logoPositionX,
          logoPositionY: formData.logoPositionY,
          logoScale: formData.logoScale,
          logoBackgroundColor: formData.logoBackgroundColor
        };

        const originalData = {
          businessName: originalBusiness.businessName,
          street: originalBusiness.address.street,
          city: originalBusiness.address.city,
          state: originalBusiness.address.state,
          zipCode: originalBusiness.address.zipCode,
          isActive: originalBusiness.isActive,
          logo: originalBusiness.logo || '',
          logoPositionX: originalBusiness.logoPositionX || 50,
          logoPositionY: originalBusiness.logoPositionY || 50,
          logoScale: originalBusiness.logoScale || 100,
          logoBackgroundColor: originalBusiness.logoBackgroundColor || ''
        };

        const dataChanged = JSON.stringify(currentData) !== JSON.stringify(originalData);
        const domainsChanged = JSON.stringify(authorizedDomains) !== JSON.stringify(originalDomains);
        const logoToggleChanged = enableLogo !== originalEnableLogo;
        const backgroundColorToggleChanged = enableBackgroundColor !== originalEnableBackgroundColor;
        const hasChanges = dataChanged || domainsChanged || logoToggleChanged || backgroundColorToggleChanged;

        if (hasChanges) {
          setShowConfirmModal(true);
        } else {
          onClose();
        }
      }
    };

    if (showModal) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showModal, formData, originalBusiness, authorizedDomains, originalDomains, enableBackgroundColor, originalEnableBackgroundColor, enableLogo, originalEnableLogo, setShowConfirmModal, onClose]);

  if (!showModal || !business) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.businessName) {
      setError('Business name is required');
      setLoading(false);
      return;
    }

    if (checkDuplicateName(formData.businessName)) {
      setLoading(false);
      return;
    }

    // Check ZIP code format - must be exactly 5 digits
    if (!/^\d{5}$/.test(address.zipCode.trim())) {
      setShowZipValidationError(true);
      setLoading(false);
      return;
    }

    // Check service area validation
    if (!serviceAreaValid) {
      setShowServiceAreaError(true);
      setLoading(false);
      return;
    }

    if (authorizedDomains.length === 0) {
      setError('At least one authorized domain is required');
      setLoading(false);
      return;
    }

    // Validate domains
    for (const domain of authorizedDomains) {
      if (!domain.domain.trim()) {
        setError('All domains must be filled out');
        setLoading(false);
        return;
      }
    }

    try {
      await onSubmit(business.id, {
        businessName: formData.businessName,
        authorizedDomains: authorizedDomains,
        address: {
          street: address.street,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode
        },
        isActive: formData.isActive,
        logo: enableLogo ? formData.logo : null,
        logoPositionX: enableLogo ? formData.logoPositionX : null,
        logoPositionY: enableLogo ? formData.logoPositionY : null,
        logoScale: enableLogo ? formData.logoScale : null,
        logoBackgroundColor: enableBackgroundColor ? formData.logoBackgroundColor : null,
        rateCategoryId: selectedRateCategoryId || undefined
      });

      // Close modal after successful save
      resetAndClose();
    } catch (error) {
      console.error('Error updating business:', error);
      setError('Failed to update business. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = (): boolean => {
    if (!originalBusiness) return false;

    const currentData = {
      businessName: formData.businessName,
      street: formData.street,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode,
      isActive: formData.isActive
    };

    const originalData = {
      businessName: originalBusiness.businessName,
      street: originalBusiness.address.street,
      city: originalBusiness.address.city,
      state: originalBusiness.address.state,
      zipCode: originalBusiness.address.zipCode,
      isActive: originalBusiness.isActive
    };

    const dataChanged = JSON.stringify(currentData) !== JSON.stringify(originalData);
    const domainsChanged = JSON.stringify(authorizedDomains) !== JSON.stringify(originalDomains);

    return dataChanged || domainsChanged;
  };

  const handleClose = () => {
    if (hasChanges()) {
      setShowConfirmModal(true);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setError('');
    setAuthorizedDomains([]);
    setOriginalBusiness(null);
    setOriginalDomains([]);
    setShowConfirmModal(false);
    onClose();
  };

  const addAuthorizedDomain = () => {
    if (authorizedDomains.length < 5) {
      setAuthorizedDomains([...authorizedDomains, { domain: '', description: '', is_active: true }]);
    }
  };

  const removeAuthorizedDomain = (index: number) => {
    setAuthorizedDomains(authorizedDomains.filter((_, i) => i !== index));
  };

  const updateAuthorizedDomain = (index: number, field: keyof AuthorizedDomain, value: string | boolean) => {
    const updated = [...authorizedDomains];
    updated[index] = { ...updated[index], [field]: value };
    setAuthorizedDomains(updated);
  };

  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-4xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary} flex items-center`}>
            <Building className="w-5 h-5 mr-2" />
            Edit Business
          </h3>
          <button
            onClick={handleClose}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business Name */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, businessName: e.target.value }));
                    // Use setTimeout to debounce the validation slightly to avoid showing dialog while actively typing
                    setTimeout(() => checkDuplicateName(e.target.value), 100);
                  }}
                  onBlur={(e) => checkDuplicateName(e.target.value)}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="Enter business name"
                />
              </div>

              {/* Status */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Status
                </label>
                <select
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Rate Category Selection */}
              {canViewRateCategories && rateCategories.length > 0 && (
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Hourly Rate Category
                  </label>
                  <select
                    value={selectedRateCategoryId}
                    onChange={(e) => setSelectedRateCategoryId(e.target.value)}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Use Default Category</option>
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
              <div className="md:col-span-2 mt-6">
                <div className="flex items-center mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={enableLogo}
                      onChange={(e) => {
                        setEnableLogo(e.target.checked);
                        if (!e.target.checked) {
                          // Clear logo data when disabled
                          setFormData(prev => ({
                            ...prev,
                            logo: '',
                            logoPositionX: 50,
                            logoPositionY: 50,
                            logoScale: 100
                          }));
                        }
                      }}
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      Enable Company Logo
                    </span>
                  </label>
                </div>

                {enableLogo && (
                  <PhotoUploadInterface
                    photo={formData.logo}
                    photoPositionX={formData.logoPositionX}
                    photoPositionY={formData.logoPositionY}
                    photoScale={formData.logoScale}
                    photoBackgroundColor={formData.logoBackgroundColor}
                    enableBackgroundColor={enableBackgroundColor}
                    onPhotoChange={(photo) => setFormData(prev => ({ ...prev, logo: photo }))}
                    onPositionChange={(x, y) => setFormData(prev => ({ ...prev, logoPositionX: x, logoPositionY: y }))}
                    onScaleChange={(scale) => setFormData(prev => ({ ...prev, logoScale: scale }))}
                    onBackgroundColorChange={(color) => setFormData(prev => ({ ...prev, logoBackgroundColor: color || '' }))}
                    onBackgroundColorToggle={(enabled) => {
                      setEnableBackgroundColor(enabled);
                      if (!enabled) {
                        setFormData(prev => ({ ...prev, logoBackgroundColor: '' }));
                      }
                    }}
                  />
                )}
              </div>

              {/* Address with Auto-Completion */}
              <div className="md:col-span-2">
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Business Address
                </label>
                <AddressFormWithAutoComplete
                  address={address}
                  onAddressChange={setAddress}
                  disabled={false}
                  showLabels={false}
                  required={false}
                />
              </div>

              {/* Service Area Validation */}
              <div className="md:col-span-2">
                <ServiceAreaValidator
                  address={{
                    city: address.city,
                    state: address.state,
                    zipCode: address.zipCode,
                    country: address.country
                  }}
                  onValidationChange={(isValid, errors) => {
                    console.log('🌍 EditBusinessModal validation change:', { isValid, errors });
                    setServiceAreaValid(isValid);
                  }}
                />
              </div>

              {/* Authorized Email Domains */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>
                    Authorized Email Domains * (up to 5)
                  </label>
                  <button
                    type="button"
                    onClick={addAuthorizedDomain}
                    disabled={authorizedDomains.length >= 5}
                    className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Domain
                  </button>
                </div>

                {loadingDomains ? (
                  <div className={`p-4 text-center ${themeClasses.text.muted}`}>
                    Loading authorized domains...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {authorizedDomains.map((domain, index) => (
                      <div key={index} className={`p-3 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.secondary}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>
                              Domain *
                            </label>
                            <input
                              type="text"
                              value={domain.domain}
                              onChange={(e) => updateAuthorizedDomain(index, 'domain', e.target.value)}
                              className={`w-full px-2 py-1 text-sm border ${themeClasses.border.primary} rounded ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
                              placeholder="example.com"
                            />
                          </div>
                          <div>
                            <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>
                              Description
                            </label>
                            <input
                              type="text"
                              value={domain.description || ''}
                              onChange={(e) => updateAuthorizedDomain(index, 'description', e.target.value)}
                              className={`w-full px-2 py-1 text-sm border ${themeClasses.border.primary} rounded ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
                              placeholder="Optional description"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={domain.is_active !== false}
                              onChange={(e) => updateAuthorizedDomain(index, 'is_active', e.target.checked)}
                              className="mr-2"
                            />
                            <span className={`text-xs ${themeClasses.text.secondary}`}>Active</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeAuthorizedDomain(index)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Remove domain"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {authorizedDomains.length === 0 && (
                      <div className={`p-4 text-center ${themeClasses.text.muted} border ${themeClasses.border.primary} rounded-md`}>
                        No authorized domains. Click "Add Domain" to get started.
                      </div>
                    )}

                    {authorizedDomains.length >= 5 && (
                      <div className={`text-xs ${themeClasses.text.muted} text-center`}>
                        Maximum of 5 domains reached
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Business Info Display */}
              <div className={`mt-6 p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary} md:col-span-2`}>
                <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>Business Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className={`${themeClasses.text.muted}`}>ID:</span>
                    <span className={`ml-2 ${themeClasses.text.secondary}`}>{business.id}</span>
                  </div>
                  <div>
                    <span className={`${themeClasses.text.muted}`}>Created:</span>
                    <span className={`ml-2 ${themeClasses.text.secondary}`}>
                      {new Date(business.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className={`${themeClasses.text.muted}`}>Users:</span>
                    <span className={`ml-2 ${themeClasses.text.secondary}`}>{business.userCount}</span>
                  </div>
                  <div>
                    <span className={`${themeClasses.text.muted}`}>Domains:</span>
                    <span className={`ml-2 ${themeClasses.text.secondary}`}>{authorizedDomains.length}/5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl border ${themeClasses.border.primary} p-6 max-w-md w-full`}>
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Unsaved Changes</h3>
            </div>
            <p className={`${themeClasses.text.secondary} mb-6`}>
              You have unsaved changes. Are you sure you want to close without saving?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} hover:${themeClasses.bg.hover}`}
              >
                Continue Editing
              </button>
              <button
                onClick={resetAndClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Area Error Dialog */}
      {showServiceAreaError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Address Outside Service Area
                </h3>
              </div>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                The address you entered is outside our current service area. Please enter an address within our service area or contact us to discuss expanding services to your area.
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

      {/* ZIP Code Validation Error Modal */}
      {showZipValidationError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Invalid ZIP Code
                </h3>
              </div>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                ZIP code must be exactly 5 digits. Please enter a complete ZIP code (e.g., 92026).
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowZipValidationError(false)}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditBusinessModal;