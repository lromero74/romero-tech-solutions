import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, AlertTriangle, AlertCircle } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { adminService } from '../../../services/adminService';
import ServiceAreaValidator from '../../shared/ServiceAreaValidator';
import AddressFormWithAutoComplete from '../../shared/AddressFormWithAutoComplete';
import LocationTypeSelector from '../../shared/LocationTypeSelector';
import { validateServiceAreaField } from '../../../utils/serviceAreaValidation';
import AlertModal from '../../shared/AlertModal';

interface Business {
  id: string;
  businessName: string;
  is_active: boolean;
  soft_delete: boolean;
}

interface ServiceLocation {
  id: string;
  business_id: string;
  address_label: string;
  location_name?: string;
  location_type: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  is_active: boolean;
  is_headquarters: boolean;
  soft_delete: boolean;
  created_at: string;
  updated_at: string;
  business_name: string;
}

interface EditServiceLocationModalProps {
  showModal: boolean;
  serviceLocation: ServiceLocation | null;
  onClose: () => void;
  onSubmit: (serviceLocationId: string, updates: Partial<{
    business_id: string;
    address_label: string;
    location_name?: string;
    location_type: string;
    street: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    contact_person?: string;
    contact_phone?: string;
    notes?: string;
    is_active: boolean;
    is_headquarters: boolean;
  }>) => void;
}

const EditServiceLocationModal: React.FC<EditServiceLocationModalProps> = ({
  showModal,
  serviceLocation,
  onClose,
  onSubmit
}) => {
  const { theme } = useTheme();
  const [formData, setFormData] = useState({
    business_id: '',
    address_label: '',
    location_name: '',
    location_type: 'office',
    contact_person: '',
    contact_phone: '',
    notes: '',
    is_active: true,
    is_headquarters: false
  });

  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA'
  });
  const [originalServiceLocation, setOriginalServiceLocation] = useState<ServiceLocation | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [availableBusinesses, setAvailableBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [businessError, setBusinessError] = useState('');
  // Service area validation state
  const [serviceAreaValid, setServiceAreaValid] = useState(true); // Start as true for edit mode
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);
  const [showZipValidationError, setShowZipValidationError] = useState(false);

  // Field-level validation modal state
  const [showFieldValidationModal, setShowFieldValidationModal] = useState(false);
  const [fieldValidationData, setFieldValidationData] = useState<{
    reason?: string;
    suggestedAreas?: string[];
  }>({});

  useEffect(() => {
    if (serviceLocation) {
      const locationData = {
        business_id: serviceLocation.business_id || '',
        address_label: serviceLocation.address_label || '',
        location_name: serviceLocation.location_name || '',
        location_type: serviceLocation.location_type || 'office',
        contact_person: serviceLocation.contact_person || '',
        contact_phone: serviceLocation.contact_phone || '',
        notes: serviceLocation.notes || '',
        is_active: serviceLocation.is_active,
        is_headquarters: serviceLocation.is_headquarters
      };

      const addressData = {
        street: serviceLocation.street || '',
        city: serviceLocation.city || '',
        state: serviceLocation.state || '',
        zipCode: serviceLocation.zip_code || '',
        country: serviceLocation.country || 'USA'
      };

      setFormData(locationData);
      setAddress(addressData);
      setOriginalServiceLocation({
        ...serviceLocation,
        address_label: serviceLocation.address_label || '',
        location_name: serviceLocation.location_name || '',
        location_type: serviceLocation.location_type || 'office',
        street: serviceLocation.street || '',
        city: serviceLocation.city || '',
        state: serviceLocation.state || '',
        zip_code: serviceLocation.zip_code || '',
        country: serviceLocation.country || 'USA',
        contact_person: serviceLocation.contact_person || '',
        contact_phone: serviceLocation.contact_phone || '',
        notes: serviceLocation.notes || ''
      });
    }
  }, [serviceLocation]);

  useEffect(() => {
    if (showModal) {
      fetchBusinesses();
    }
  }, [showModal]);

  // Re-fetch businesses when service location data changes to ensure proper filtering
  useEffect(() => {
    if (serviceLocation && availableBusinesses.length === 0) {
      fetchBusinesses();
    }
  }, [serviceLocation, availableBusinesses.length]);

  const fetchBusinesses = async () => {
    try {
      setLoadingBusinesses(true);
      setBusinessError('');
      const businessData = await adminService.getBusinesses();

      // For edit mode, show all non-soft-deleted businesses to allow editing existing service locations
      // even if the business is currently inactive
      const availableBusinesses = businessData.businesses.filter(b => !b.soft_delete);


      setAvailableBusinesses(availableBusinesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      setBusinessError('Failed to load businesses');
    } finally {
      setLoadingBusinesses(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const hasChanges = useCallback(() => {
    if (!originalServiceLocation) return false;

    return (
      formData.business_id !== originalServiceLocation.business_id ||
      formData.address_label !== originalServiceLocation.address_label ||
      formData.location_name !== (originalServiceLocation.location_name || '') ||
      formData.location_type !== originalServiceLocation.location_type ||
      address.street !== originalServiceLocation.street ||
      address.city !== originalServiceLocation.city ||
      address.state !== originalServiceLocation.state ||
      address.zipCode !== originalServiceLocation.zip_code ||
      address.country !== originalServiceLocation.country ||
      formData.contact_person !== (originalServiceLocation.contact_person || '') ||
      formData.contact_phone !== (originalServiceLocation.contact_phone || '') ||
      formData.notes !== (originalServiceLocation.notes || '') ||
      formData.is_active !== originalServiceLocation.is_active ||
      formData.is_headquarters !== originalServiceLocation.is_headquarters
    );
  }, [formData, address, originalServiceLocation]);

  // Handle field-level blur validation
  const handleFieldBlur = async (field: 'city' | 'state', value: string) => {
    try {
      const result = await validateServiceAreaField(field, value, {
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country
      });

      if (result && !result.isValid) {
        setFieldValidationData({
          reason: result.reason,
          suggestedAreas: result.suggestedAreas
        });
        setShowFieldValidationModal(true);
      }
    } catch (error) {
      console.error('Field blur validation error:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceLocation) return;

    // Check ZIP code format - must be exactly 5 digits
    if (!/^\d{5}$/.test(address.zipCode.trim())) {
      setShowZipValidationError(true);
      return;
    }

    // Check service area validation
    if (!serviceAreaValid) {
      setShowServiceAreaError(true);
      return;
    }

    if (hasChanges()) {
      handleConfirmUpdate();
    } else {
      onClose();
    }
  };

  const handleConfirmUpdate = () => {
    if (!serviceLocation) return;

    const updates: Record<string, unknown> = {};

    if (formData.business_id !== originalServiceLocation?.business_id) {
      updates.business_id = formData.business_id;
    }
    if (formData.address_label !== originalServiceLocation?.address_label) {
      updates.address_label = formData.address_label;
    }
    if (formData.location_name !== (originalServiceLocation?.location_name || '')) {
      updates.location_name = formData.location_name;
    }
    if (formData.location_type !== originalServiceLocation?.location_type) {
      updates.location_type = formData.location_type;
    }
    if (address.street !== originalServiceLocation?.street) {
      updates.street = address.street;
    }
    if (address.city !== originalServiceLocation?.city) {
      updates.city = address.city;
    }
    if (address.state !== originalServiceLocation?.state) {
      updates.state = address.state;
    }
    if (address.zipCode !== originalServiceLocation?.zip_code) {
      updates.zip_code = address.zipCode;
    }
    if (address.country !== originalServiceLocation?.country) {
      updates.country = address.country;
    }
    if (formData.contact_person !== (originalServiceLocation?.contact_person || '')) {
      updates.contact_person = formData.contact_person;
    }
    if (formData.contact_phone !== (originalServiceLocation?.contact_phone || '')) {
      updates.contact_phone = formData.contact_phone;
    }
    if (formData.notes !== (originalServiceLocation?.notes || '')) {
      updates.notes = formData.notes;
    }
    if (formData.is_active !== originalServiceLocation?.is_active) {
      updates.is_active = formData.is_active;
    }
    if (formData.is_headquarters !== originalServiceLocation?.is_headquarters) {
      updates.is_headquarters = formData.is_headquarters;
    }

    console.log('=== EDIT SERVICE LOCATION MODAL SUBMIT ===');
    console.log('Service Location ID:', serviceLocation.id);
    console.log('Updates being sent:', updates);

    onSubmit(serviceLocation.id, updates);
    setShowConfirmModal(false);
  };

  const resetAndClose = useCallback(() => {
    setFormData({
      business_id: '',
      address_label: '',
      location_name: '',
      location_type: 'office',
      contact_person: '',
      contact_phone: '',
      notes: '',
      is_active: true,
      is_headquarters: false
    });
    setAddress({
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA'
    });
    setOriginalServiceLocation(null);
    setShowConfirmModal(false);
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (hasChanges()) {
      setShowConfirmModal(true);
    } else {
      resetAndClose();
    }
  }, [hasChanges, resetAndClose]);

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


  if (!showModal) return null;

  return (
    <>
      <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
        <div className={`relative w-full max-w-2xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
            <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Edit Service Location</h3>
            <button
              onClick={handleClose}
              className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6">
                {/* Business Selection */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Business *
                  </label>
                  {loadingBusinesses ? (
                    <div className={`p-3 rounded-md ${themeClasses.bg.secondary} ${themeClasses.text.muted}`}>
                      Loading businesses...
                    </div>
                  ) : businessError ? (
                    <div className={`p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center`}>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {businessError}
                    </div>
                  ) : availableBusinesses.length === 0 && serviceLocation ? (
                    <div className={`p-3 rounded-md ${themeClasses.bg.secondary} ${themeClasses.text.primary}`}>
                      Current Business: {serviceLocation.business_name}
                      <div className={`text-xs ${themeClasses.text.muted} mt-1`}>
                        (Business list failed to load)
                      </div>
                    </div>
                  ) : (
                    <select
                      name="business_id"
                      value={formData.business_id}
                      onChange={handleInputChange}
                      required
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      style={{
                        colorScheme: theme === 'dark' ? 'dark' : 'light'
                      }}
                    >
                      <option value="" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Select a business</option>
                      {availableBusinesses.length === 0 ? (
                        <option disabled className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">No businesses available</option>
                      ) : (
                        availableBusinesses.map((business) => (
                          <option
                            key={business.id}
                            value={business.id}
                            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            {business.businessName || business.business_name || business.name || 'Unnamed Business'}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                {/* Location Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Address Label *
                    </label>
                    <input
                      type="text"
                      name="address_label"
                      value={formData.address_label}
                      onChange={handleInputChange}
                      required
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="e.g., Main Office, Warehouse A"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Location Name
                    </label>
                    <input
                      type="text"
                      name="location_name"
                      value={formData.location_name}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="Optional display name"
                    />
                  </div>
                </div>

                {/* Location Type Selector */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Location Type *
                  </label>
                  <LocationTypeSelector
                    value={formData.location_type}
                    onChange={(value) => setFormData(prev => ({ ...prev, location_type: value }))}
                    disabled={false}
                    required={true}
                    placeholder="Select location type..."
                    showSearch={true}
                  />
                </div>

                {/* Address with Auto-completion */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Service Location Address *
                  </label>
                  <AddressFormWithAutoComplete
                    address={address}
                    onAddressChange={setAddress}
                    disabled={false}
                    showLabels={false}
                    required={true}
                    onFieldBlur={handleFieldBlur}
                  />
                </div>

                {/* Service Area Validation */}
                <div>
                  <ServiceAreaValidator
                    address={{
                      city: address.city,
                      state: address.state,
                      zipCode: address.zipCode
                    }}
                    onValidationChange={(isValid, errors) => {
                      console.log('🌍 EditServiceLocationModal validation change:', { isValid, errors });
                      setServiceAreaValid(isValid);
                    }}
                  />
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Contact Person
                    </label>
                    <input
                      type="text"
                      name="contact_person"
                      value={formData.contact_person}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      name="contact_phone"
                      value={formData.contact_phone}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className={`w-full px-3 py-2 rounded-md ${themeClasses.input} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Additional notes about this location..."
                  />
                </div>

                {/* Status Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleInputChange}
                      className={`mr-2 h-4 w-4 text-blue-600 ${themeClasses.border.primary} rounded focus:ring-blue-500`}
                    />
                    <label htmlFor="is_active" className={`text-sm ${themeClasses.text.secondary}`}>
                      Active Location
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_headquarters"
                      name="is_headquarters"
                      checked={formData.is_headquarters}
                      onChange={handleInputChange}
                      className={`mr-2 h-4 w-4 text-blue-600 ${themeClasses.border.primary} rounded focus:ring-blue-500`}
                    />
                    <label htmlFor="is_headquarters" className={`text-sm ${themeClasses.text.secondary}`}>
                      Headquarters Location
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${themeClasses.border.primary} ${themeClasses.bg.primary}`}>
              <button
                type="button"
                onClick={handleClose}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} hover:${themeClasses.bg.hover}`}
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

      {/* Field Validation Modal */}
      <AlertModal
        isOpen={showFieldValidationModal}
        onClose={() => setShowFieldValidationModal(false)}
        type="error"
        title="Service Area Not Available"
        message={fieldValidationData.reason || 'This location is outside our current service area.'}
        suggestedAreas={fieldValidationData.suggestedAreas}
      />

      {/* ZIP Code Validation Modal */}
      <AlertModal
        isOpen={showZipValidationError}
        onClose={() => setShowZipValidationError(false)}
        type="error"
        title="Invalid ZIP Code"
        message="ZIP code must be exactly 5 digits. Please enter a complete ZIP code (e.g., 92026)."
      />
    </>
  );
};

export default EditServiceLocationModal;