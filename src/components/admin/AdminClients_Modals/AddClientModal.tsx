import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, AlertCircle, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { adminService } from '../../../services/adminService';
import { PhotoUploadInterface } from '../../shared/PhotoUploadInterface';

interface Business {
  id: string;
  business_name: string;
  logo_url?: string;
  is_active: boolean;
  soft_delete: boolean;
  business_street: string;
  business_city: string;
  business_state: string;
  business_zip_code: string;
  business_country: string;
}

interface AddClientModalProps {
  showModal: boolean;
  onClose: () => void;
  onSubmit: (clientData: {
    name: string;
    email: string;
    phone: string;
    businessId?: string;
    businessName?: string;
    photo?: string;
    photoPositionX?: number;
    photoPositionY?: number;
    photoScale?: number;
    photoBackgroundColor?: string;
  }) => void;
  prefillDomain?: string;
  prefillBusinessId?: string;
  prefillBusinessName?: string;
}

const AddClientModal: React.FC<AddClientModalProps> = ({
  showModal,
  onClose,
  onSubmit,
  prefillDomain,
  prefillBusinessId,
  prefillBusinessName
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    businessId: '',
    businessName: '',
    photo: '',
    photoPositionX: 50,
    photoPositionY: 50,
    photoScale: 100,
    photoBackgroundColor: ''
  });

  const [availableBusinesses, setAvailableBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [businessError, setBusinessError] = useState('');
  const [enablePhoto, setEnablePhoto] = useState(false);
  const [enableBackgroundColor, setEnableBackgroundColor] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!showModal) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        businessId: '',
        businessName: '',
        photo: '',
        photoPositionX: 50,
        photoPositionY: 50,
        photoScale: 100,
        photoBackgroundColor: ''
      });
      setAvailableBusinesses([]);
      setBusinessError('');
      setEnablePhoto(false);
      setEnableBackgroundColor(false);
    }
  }, [showModal]);

  // Prefill email with domain and business when modal opens
  useEffect(() => {
    if (showModal && prefillDomain) {
      setFormData(prev => ({
        ...prev,
        email: prefillDomain,
        businessId: prefillBusinessId || '',
        businessName: prefillBusinessName || ''
      }));

      // If we have prefill business info, create a mock business entry to show in dropdown
      if (prefillBusinessId && prefillBusinessName) {
        setAvailableBusinesses([{
          id: prefillBusinessId,
          business_name: prefillBusinessName,
          is_active: true,
          soft_delete: false,
          business_street: '',
          business_city: '',
          business_state: '',
          business_zip_code: '',
          business_country: ''
        }]);
      }
    }
  }, [showModal, prefillDomain, prefillBusinessId, prefillBusinessName]);

  // Fetch businesses when email changes
  useEffect(() => {
    const fetchBusinesses = async () => {
      // Check if we have either a complete email or just a domain (for prefill case)
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const domainPattern = /^@[^\s@]+\.[^\s@]+$/;

      if (!formData.email || (!emailPattern.test(formData.email) && !domainPattern.test(formData.email))) {
        setAvailableBusinesses([]);
        setBusinessError('');
        return;
      }

      setLoadingBusinesses(true);
      setBusinessError('');

      try {
        const data = await adminService.getBusinessesByEmailDomain(formData.email);

        setAvailableBusinesses(data.businesses);
        if (data.businesses.length === 0) {
          setBusinessError('No businesses found for this email domain. Client will not be associated with any business.');
        } else {
          // Auto-select if only one business available
          if (data.businesses.length === 1) {
            setFormData(prev => ({
              ...prev,
              businessId: data.businesses[0].id,
              businessName: data.businesses[0].business_name
            }));
          } else {
            // Clear any previous auto-selection when multiple businesses are available
            setFormData(prev => ({
              ...prev,
              businessId: '',
              businessName: ''
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching businesses:', error);
        setBusinessError('Error fetching businesses for this email domain.');
        setAvailableBusinesses([]);
      } finally {
        setLoadingBusinesses(false);
      }
    };

    const timeoutId = setTimeout(fetchBusinesses, 1000); // Increased debounce time
    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  // Define resetAndClose and handleClose with useCallback before they're used in useEffect
  const resetAndClose = useCallback(() => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      businessId: '',
      businessName: '',
      photo: '',
      photoPositionX: 50,
      photoPositionY: 50,
      photoScale: 100,
      photoBackgroundColor: ''
    });
    setAvailableBusinesses([]);
    setBusinessError('');
    setEnablePhoto(false);
    setEnableBackgroundColor(false);
    setShowConfirmModal(false);
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (hasChanges()) {
      setShowConfirmModal(true);
    } else {
      resetAndClose();
    }
  }, [resetAndClose]);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showModal) {
        handleClose();
      }
    };

    if (showModal) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showModal, handleClose]);

  // Check if form has any changes from initial state
  const hasChanges = () => {
    return (
      formData.name !== '' ||
      formData.email !== (prefillDomain || '') ||
      formData.phone !== '' ||
      formData.businessId !== (prefillBusinessId || '') ||
      formData.photo !== '' ||
      formData.photoPositionX !== 50 ||
      formData.photoPositionY !== 50 ||
      formData.photoScale !== 100 ||
      formData.photoBackgroundColor !== '' ||
      enablePhoto !== false ||
      enableBackgroundColor !== false
    );
  };

  if (!showModal) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    onSubmit({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      businessId: formData.businessId || undefined,
      businessName: formData.businessName || undefined,
      photo: enablePhoto ? (formData.photo || undefined) : undefined,
      photoPositionX: enablePhoto ? formData.photoPositionX : undefined,
      photoPositionY: enablePhoto ? formData.photoPositionY : undefined,
      photoScale: enablePhoto ? formData.photoScale : undefined,
      photoBackgroundColor: enablePhoto && enableBackgroundColor ? (formData.photoBackgroundColor || undefined) : undefined
    });
  };


  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-2xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Add New Client</h3>
          <button
            onClick={handleClose}
            className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter client's full name"
              />
            </div>

            {/* Email */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Email Address *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter email address"
              />
            </div>

            {/* Phone */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter phone number"
              />
            </div>

            {/* Business Selection */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Business Association
              </label>
              {loadingBusinesses ? (
                <div className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} text-center`}>
                  Loading businesses...
                </div>
              ) : availableBusinesses.length > 0 ? (
                <select
                  value={formData.businessId}
                  onChange={(e) => {
                    const selectedBusiness = availableBusinesses.find(b => b.id === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      businessId: e.target.value,
                      businessName: selectedBusiness?.business_name || ''
                    }));
                  }}
                  className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                >
                  <option value="">Select a business...</option>
                  {availableBusinesses.map((business) => {
                    const statusText = [];
                    if (!business.is_active) statusText.push('Inactive');
                    if (business.soft_delete) statusText.push('Soft Deleted');
                    const statusSuffix = statusText.length > 0 ? ` (${statusText.join(', ')})` : '';

                    return (
                      <option key={business.id} value={business.id}>
                        {business.business_name}{statusSuffix}
                      </option>
                    );
                  })}
                </select>
              ) : formData.email && formData.email.includes('@') && (!loadingBusinesses) ? (
                <div className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 ${themeClasses.text.muted} text-center`}>
                  {businessError || 'No businesses available for this email domain'}
                </div>
              ) : (
                <div className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.muted} text-center`}>
                  Enter email address to see available businesses
                </div>
              )}
              {businessError && (
                <div className="flex items-center mt-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  <span className="text-sm">{businessError}</span>
                </div>
              )}
              {availableBusinesses.length > 1 && (
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  Multiple businesses found for this email domain. Select the appropriate one.
                </p>
              )}
            </div>

            {/* Photo */}
            <div className="md:col-span-2">
              <div className="flex items-center mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={enablePhoto}
                    onChange={(e) => {
                      setEnablePhoto(e.target.checked);
                      if (!e.target.checked) {
                        // Clear photo data when disabled
                        setFormData(prev => ({
                          ...prev,
                          photo: '',
                          photoPositionX: 50,
                          photoPositionY: 50,
                          photoScale: 100,
                          photoBackgroundColor: ''
                        }));
                        setEnableBackgroundColor(false);
                      }
                    }}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                    Enable Client Photo
                  </span>
                </label>
              </div>

              {enablePhoto && (
                <PhotoUploadInterface
                  photo={formData.photo}
                  photoPositionX={formData.photoPositionX}
                  photoPositionY={formData.photoPositionY}
                  photoScale={formData.photoScale}
                  photoBackgroundColor={formData.photoBackgroundColor}
                  enableBackgroundColor={enableBackgroundColor}
                  onPhotoChange={(photo) => setFormData(prev => ({ ...prev, photo }))}
                  onPositionChange={(x, y) => setFormData(prev => ({ ...prev, photoPositionX: x, photoPositionY: y }))}
                  onScaleChange={(scale) => setFormData(prev => ({ ...prev, photoScale: scale }))}
                  onBackgroundColorChange={(color) => setFormData(prev => ({ ...prev, photoBackgroundColor: color || '' }))}
                  onBackgroundColorToggle={(enabled) => {
                    setEnableBackgroundColor(enabled);
                    if (!enabled) {
                      setFormData(prev => ({ ...prev, photoBackgroundColor: '' }));
                    }
                  }}
                />
              )}
            </div>
          </div>
          </div>

          <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={handleClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              <Save className="w-4 h-4 mr-2" />
              Add Client
            </button>
          </div>
        </form>
      </div>

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
                Cancel
              </button>
              <button
                onClick={resetAndClose}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddClientModal;
