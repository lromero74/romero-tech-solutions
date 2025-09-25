import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, AlertCircle } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
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

interface Client {
  id: string;
  email: string;
  name: string;
  businessId?: string;
  businessName?: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  role: string;
  phone?: string;
  photo?: string;
  photoPositionX?: number;
  photoPositionY?: number;
  photoScale?: number;
  photoBackgroundColor?: string;
}

interface EditClientModalProps {
  showModal: boolean;
  client: Client | null;
  onClose: () => void;
  onSubmit: (clientId: string, updates: Partial<{
    name: string;
    email: string;
    phone?: string;
    businessId?: string;
    businessName?: string;
    isActive: boolean;
    photo?: string;
    photoPositionX?: number;
    photoPositionY?: number;
    photoScale?: number;
    photoBackgroundColor?: string;
  }>) => void;
}

const EditClientModal: React.FC<EditClientModalProps> = ({
  showModal,
  client,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    businessId: '',
    businessName: '',
    isActive: true,
    photo: '',
    photoPositionX: 50,
    photoPositionY: 50,
    photoScale: 100,
    photoBackgroundColor: ''
  });
  const [originalClient, setOriginalClient] = useState<Client | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [availableBusinesses, setAvailableBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [businessError, setBusinessError] = useState('');
  const [enablePhoto, setEnablePhoto] = useState(false);
  const [originalEnablePhoto, setOriginalEnablePhoto] = useState(false);
  const [enableBackgroundColor, setEnableBackgroundColor] = useState(false);
  const [originalEnableBackgroundColor, setOriginalEnableBackgroundColor] = useState(false);

  useEffect(() => {
    if (client) {
      const hasPhoto = !!client.photo;
      const hasBackgroundColor = !!client.photoBackgroundColor;
      setEnablePhoto(hasPhoto);
      setOriginalEnablePhoto(hasPhoto);
      setEnableBackgroundColor(hasBackgroundColor);
      setOriginalEnableBackgroundColor(hasBackgroundColor);

      const clientData = {
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        businessId: client.businessId || '',
        businessName: client.businessName || '',
        isActive: client.isActive,
        photo: client.photo || '',
        photoPositionX: client.photoPositionX || 50,
        photoPositionY: client.photoPositionY || 50,
        photoScale: client.photoScale || 100,
        photoBackgroundColor: client.photoBackgroundColor || ''
      };
      setFormData(clientData);
      setOriginalClient({
        ...client,
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        businessId: client.businessId || '',
        businessName: client.businessName || '',
        photo: client.photo || '',
        photoPositionX: client.photoPositionX || 50,
        photoPositionY: client.photoPositionY || 50,
        photoScale: client.photoScale || 100
      });
    }
  }, [client]);

  // Fetch businesses when email changes
  useEffect(() => {
    const fetchBusinesses = async () => {
      // Only proceed if we have a complete email address
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!formData.email || !emailPattern.test(formData.email)) {
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
          setBusinessError('No businesses found for this email domain.');
        } else {
          // Auto-select if only one business available and no current business association
          if (data.businesses.length === 1 && !formData.businessId) {
            setFormData(prev => ({
              ...prev,
              businessId: data.businesses[0].id,
              businessName: data.businesses[0].business_name
            }));
          }
          // Note: When multiple businesses are available, keep the current selection
          // and allow user to manually change if needed
        }
      } catch (error) {
        console.error('Error fetching businesses:', error);
        setBusinessError('Error fetching businesses for this email domain.');
        setAvailableBusinesses([]);
      } finally {
        setLoadingBusinesses(false);
      }
    };

    const timeoutId = setTimeout(fetchBusinesses, 1000);
    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showModal) {
        // Check for changes inline to avoid function dependency issues
        if (!originalClient) {
          onClose();
          return;
        }

        const currentData = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          businessId: formData.businessId,
          businessName: formData.businessName,
          isActive: formData.isActive,
          photo: formData.photo,
          photoPositionX: formData.photoPositionX,
          photoPositionY: formData.photoPositionY,
          photoScale: formData.photoScale,
          photoBackgroundColor: formData.photoBackgroundColor
        };

        const originalData = {
          name: originalClient.name || '',
          email: originalClient.email || '',
          phone: originalClient.phone || '',
          businessId: originalClient.businessId || '',
          businessName: originalClient.businessName || '',
          isActive: originalClient.isActive,
          photo: originalClient.photo || '',
          photoPositionX: originalClient.photoPositionX || 50,
          photoPositionY: originalClient.photoPositionY || 50,
          photoScale: originalClient.photoScale || 100,
          photoBackgroundColor: originalClient.photoBackgroundColor || ''
        };

        const dataChanged = JSON.stringify(currentData) !== JSON.stringify(originalData);
        const photoToggleChanged = enablePhoto !== originalEnablePhoto;
        const backgroundColorToggleChanged = enableBackgroundColor !== originalEnableBackgroundColor;
        const hasChanges = dataChanged || photoToggleChanged || backgroundColorToggleChanged;

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
  }, [showModal, formData, originalClient, enablePhoto, originalEnablePhoto, setShowConfirmModal, onClose]);


  const hasChanges = (): boolean => {
    if (!originalClient) return false;

    const currentData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      businessId: formData.businessId,
      businessName: formData.businessName,
      isActive: formData.isActive,
      photo: formData.photo,
      photoPositionX: formData.photoPositionX,
      photoPositionY: formData.photoPositionY,
      photoScale: formData.photoScale,
      photoBackgroundColor: formData.photoBackgroundColor
    };

    const originalData = {
      name: originalClient.name || '',
      email: originalClient.email || '',
      phone: originalClient.phone || '',
      businessId: originalClient.businessId || '',
      businessName: originalClient.businessName || '',
      isActive: originalClient.isActive,
      photo: originalClient.photo || '',
      photoPositionX: originalClient.photoPositionX || 50,
      photoPositionY: originalClient.photoPositionY || 50,
      photoScale: originalClient.photoScale || 100,
      photoBackgroundColor: originalClient.photoBackgroundColor || ''
    };

    const dataChanged = JSON.stringify(currentData) !== JSON.stringify(originalData);
    const photoToggleChanged = enablePhoto !== originalEnablePhoto;
    const backgroundColorToggleChanged = enableBackgroundColor !== originalEnableBackgroundColor;

    return dataChanged || photoToggleChanged || backgroundColorToggleChanged;
  };

  if (!showModal || !client) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    // Calculate only the changed fields
    const changes: Partial<{
      name: string;
      email: string;
      phone?: string;
      businessId?: string;
      businessName?: string;
      isActive: boolean;
      photo?: string;
      photoPositionX?: number;
      photoPositionY?: number;
      photoScale?: number;
    }> = {};

    if (!originalClient) {
      console.error('No original client data for comparison');
      return;
    }

    // Compare each field and only include changed ones
    if (formData.name !== (originalClient.name || '')) {
      changes.name = formData.name;
    }
    if (formData.email !== (originalClient.email || '')) {
      changes.email = formData.email;
    }
    if (formData.phone !== (originalClient.phone || '')) {
      changes.phone = formData.phone || undefined;
    }
    if (formData.businessId !== (originalClient.businessId || '')) {
      changes.businessId = formData.businessId || undefined;
    }
    if (formData.businessName !== (originalClient.businessName || '')) {
      changes.businessName = formData.businessName || undefined;
    }
    if (formData.isActive !== originalClient.isActive) {
      changes.isActive = formData.isActive;
    }
    // Handle photo based on toggle state
    if (enablePhoto) {
      if (formData.photo !== (originalClient.photo || '')) {
        changes.photo = formData.photo || undefined;
      }
      if (formData.photoPositionX !== (originalClient.photoPositionX || 50)) {
        changes.photoPositionX = formData.photoPositionX;
      }
      if (formData.photoPositionY !== (originalClient.photoPositionY || 50)) {
        changes.photoPositionY = formData.photoPositionY;
      }
      if (formData.photoScale !== (originalClient.photoScale || 100)) {
        changes.photoScale = formData.photoScale;
      }
    } else {
      // If photo is disabled, clear it if it was previously set
      if (originalClient.photo) {
        changes.photo = undefined;
        changes.photoPositionX = undefined;
        changes.photoPositionY = undefined;
        changes.photoScale = undefined;
      }
    }

    // Handle photo background color based on background color toggle state
    if (enableBackgroundColor) {
      if (formData.photoBackgroundColor !== (originalClient.photoBackgroundColor || '')) {
        changes.photoBackgroundColor = formData.photoBackgroundColor || undefined;
      }
    } else {
      // If background color is disabled, clear it if it was previously set
      if (originalClient.photoBackgroundColor) {
        changes.photoBackgroundColor = undefined;
      }
    }

    console.log('=== EDIT CLIENT MODAL SUBMIT ===');
    console.log('Original client data:', {
      name: originalClient.name,
      email: originalClient.email,
      phone: originalClient.phone,
      businessName: originalClient.businessName,
      isActive: originalClient.isActive,
      photo: originalClient.photo,
      photoPositionX: originalClient.photoPositionX,
      photoPositionY: originalClient.photoPositionY,
      photoScale: originalClient.photoScale
    });
    console.log('Current form data:', formData);
    console.log('Changes to send (partial update):', changes);
    console.log('Number of fields changed:', Object.keys(changes).length);

    // Only submit if there are actual changes
    if (Object.keys(changes).length === 0) {
      console.log('No changes detected, closing modal without API call');
      resetAndClose();
      return;
    }

    onSubmit(client.id, changes);
  };

  const handleClose = () => {
    if (hasChanges()) {
      setShowConfirmModal(true);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      businessName: '',
      isActive: true,
      photo: '',
      photoPositionX: 50,
      photoPositionY: 50,
      photoScale: 100
    });
    setOriginalClient(null);
    setShowConfirmModal(false);
    onClose();
  };


  return (
    <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
      <div className={`relative w-full max-w-2xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Edit Client</h3>
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

            {/* Business Association */}
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
              ) : formData.email && formData.email.includes('@') ? (
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
                          photoScale: 100
                        }));
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

            {/* Status */}
            <div className="md:col-span-2">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Status
              </label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={() => setFormData(prev => ({ ...prev, isActive: true }))}
                    className="mr-2 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${themeClasses.text.primary}`}>Active</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="isActive"
                    checked={!formData.isActive}
                    onChange={() => setFormData(prev => ({ ...prev, isActive: false }))}
                    className="mr-2 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${themeClasses.text.primary}`}>Inactive</span>
                </label>
              </div>
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
              Save Changes
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
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
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

export default EditClientModal;