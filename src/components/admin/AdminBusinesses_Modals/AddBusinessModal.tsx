import React, { useState } from 'react';
import { X, Save, Building, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { PhotoUploadInterface } from '../../shared/PhotoUploadInterface';

interface AuthorizedDomain {
  domain: string;
  description?: string;
}

interface Business {
  id: string;
  businessName: string;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

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

  // Logo-related state
  const [enableLogo, setEnableLogo] = useState(false);
  const [logo, setLogo] = useState('');
  const [logoPositionX, setLogoPositionX] = useState(50);
  const [logoPositionY, setLogoPositionY] = useState(50);
  const [logoScale, setLogoScale] = useState(100);
  const [enableBackgroundColor, setEnableBackgroundColor] = useState(false);
  const [logoBackgroundColor, setLogoBackgroundColor] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      alert('Business name is required');
      return;
    }

    if (checkDuplicateName(businessName)) {
      return;
    }

    // Filter out empty domains
    const validDomains = authorizedDomains.filter(d => d.domain.trim() !== '');

    if (validDomains.length === 0) {
      alert('At least one authorized domain is required');
      return;
    }

    if (!address.street.trim() || !address.city.trim() || !address.state.trim() || !address.zipCode.trim()) {
      alert('All address fields are required');
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
        logoBackgroundColor: enableBackgroundColor ? logoBackgroundColor : undefined
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

      // Reset logo fields
      setEnableLogo(false);
      setLogo('');
      setLogoPositionX(50);
      setLogoPositionY(50);
      setLogoScale(100);
      setEnableBackgroundColor(false);
      setLogoBackgroundColor('');

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
    setAuthorizedDomains(updated);
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
                // Use setTimeout to debounce the validation slightly to avoid showing dialog while actively typing
                setTimeout(() => checkDuplicateName(e.target.value), 100);
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
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={domain.domain}
                      onChange={(e) => updateDomainField(index, 'domain', e.target.value)}
                      className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="example.com"
                    />
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
              ))}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Business Address *
            </label>
            <div className="space-y-3">
              <input
                type="text"
                value={address.street}
                onChange={(e) => setAddress({...address, street: e.target.value})}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Street Address"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress({...address, city: e.target.value})}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="City"
                  required
                />
                <input
                  type="text"
                  value={address.state}
                  onChange={(e) => setAddress({...address, state: e.target.value})}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="State"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={address.zipCode}
                  onChange={(e) => setAddress({...address, zipCode: e.target.value})}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="ZIP Code"
                  required
                />
                <input
                  type="text"
                  value={address.country}
                  onChange={(e) => setAddress({...address, country: e.target.value})}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="Country"
                />
              </div>
            </div>
          </div>

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
    </div>
  );
};

export default AddBusinessModal;