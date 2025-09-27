import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
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

interface AddServiceLocationModalProps {
  showModal: boolean;
  onClose: () => void;
  onSubmit: (serviceLocationData: {
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
  }) => Promise<{ id: string }> | void;
  prefillBusinessName?: string;
  prefillAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  onOpenAddUserModal?: (businessId: string, serviceLocationId?: string) => void;
}

const AddServiceLocationModal: React.FC<AddServiceLocationModalProps> = ({
  showModal,
  onClose,
  onSubmit,
  prefillBusinessName,
  prefillAddress,
  onOpenAddUserModal
}) => {
  // Component render logging removed for performance

  const [formData, setFormData] = useState({
    business_id: '',
    address_label: '',
    location_name: '',
    location_type: 'office',
    contact_person: '',
    contact_phone: '',
    notes: ''
  });

  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA'
  });

  const [businesses, setBusinesses] = useState<Business[]>([]);

  // Businesses state effect removed for performance
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);
  const [showZipValidationError, setShowZipValidationError] = useState(false);

  // Field-level validation modal state
  const [showFieldValidationModal, setShowFieldValidationModal] = useState(false);
  const [fieldValidationData, setFieldValidationData] = useState<{
    reason?: string;
    suggestedAreas?: string[];
  }>({});

  // Track if this is the first render to avoid marking as changed during initial load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Toggle for adding first user
  const [addFirstUser, setAddFirstUser] = useState(true);

  // Service area validation state - start as false until validation passes
  const [serviceAreaValid, setServiceAreaValid] = useState(false);

  // Fetch businesses on component mount
  useEffect(() => {
    if (showModal) {
      fetchBusinesses();
    }
  }, [showModal]);

  // Handle prefill data (business name and address)
  useEffect(() => {
    if (!showModal) return;

    // Handle prefill business name
    if (prefillBusinessName && businesses.length > 0) {
      const matchedBusiness = businesses.find(b =>
        b.businessName.toLowerCase() === prefillBusinessName.toLowerCase()
      );
      if (matchedBusiness) {
        setFormData(prev => ({
          ...prev,
          business_id: matchedBusiness.id
        }));
      }
    }

    // Handle prefill address data
    if (prefillAddress) {
      setAddress({
        street: prefillAddress.street,
        city: prefillAddress.city,
        state: prefillAddress.state,
        zipCode: prefillAddress.zipCode,
        country: prefillAddress.country || 'USA'
      });
      setFormData(prev => ({
        ...prev,
        address_label: 'Main Office' // Default label
      }));
    }
  }, [showModal, prefillBusinessName, prefillAddress, businesses]);

  // Reset form when modal closes
  useEffect(() => {
    if (!showModal) {
      setFormData({
        business_id: '',
        address_label: '',
        location_name: '',
        location_type: 'office',
        contact_person: '',
        contact_phone: '',
        notes: ''
      });
      setAddress({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA'
      });
      setHasUnsavedChanges(false);
      setShowConfirmClose(false);
      setIsInitialLoad(true);
      // Reset service area validation
      setServiceAreaValid(false);
    }
  }, [showModal]);

  // Track changes after initial load
  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }
    setHasUnsavedChanges(true);
  }, [formData, isInitialLoad]);

  const fetchBusinesses = async () => {
    try {
      setLoadingBusinesses(true);
      const data = await adminService.getBusinesses();
      // Filter out soft deleted businesses
      const activeBusinesses = (data.businesses || []).filter(business => !business.soft_delete);
      setBusinesses(activeBusinesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoadingBusinesses(false);
    }
  };

  // Handle ESC key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showModal) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showModal, hasUnsavedChanges]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleConfirmClose = useCallback(() => {
    setShowConfirmClose(false);
    onClose();
  }, [onClose]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.business_id || !formData.address_label || !address.street || !address.city || !address.state || !address.zipCode) {
      return;
    }

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

    try {
      const result = await onSubmit({
        business_id: formData.business_id,
        address_label: formData.address_label,
        location_name: formData.location_name || undefined,
        location_type: formData.location_type,
        street: address.street,
        city: address.city,
        state: address.state,
        zip_code: address.zipCode,
        country: address.country,
        contact_person: formData.contact_person || undefined,
        contact_phone: formData.contact_phone || undefined,
        notes: formData.notes || undefined
      });

      // If toggle is enabled and callback is provided, open add user modal
      if (addFirstUser && onOpenAddUserModal && result?.data?.serviceLocation?.id) {
        onOpenAddUserModal(formData.business_id, result.data.serviceLocation.id);
      }
    } catch (error) {
      console.error('Error creating service location:', error);
      // Handle error (could show error message to user)
    }
  };

  if (!showModal) return null;

  return (
    <>
      <div className={`fixed inset-0 ${themeClasses.bg.overlay} flex items-center justify-center z-50 p-4`}>
        <div className={`relative w-full max-w-4xl max-h-full ${themeClasses.bg.modal} rounded-lg shadow-2xl border ${themeClasses.border.primary} overflow-hidden flex flex-col`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
            <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Add New Service Location</h3>
            <button
              onClick={handleClose}
              className={`${themeClasses.text.muted} hover:${themeClasses.text.secondary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.hover} rounded-full p-2 transition-colors border ${themeClasses.border.primary}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Business Selection */}
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Business *
                  </label>
                  {loadingBusinesses ? (
                    <div className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} text-center`}>
                      Loading businesses...
                    </div>
                  ) : (
                    <select
                      required
                      value={formData.business_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_id: e.target.value }))}
                      className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    >
                      <option value="">Select a business...</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.businessName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Address Label */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Address Label *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address_label}
                    onChange={(e) => setFormData(prev => ({ ...prev, address_label: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="e.g., Main Office, Warehouse A"
                  />
                </div>

                {/* Location Name */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Location Name
                  </label>
                  <input
                    type="text"
                    value={formData.location_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, location_name: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Optional descriptive name"
                  />
                </div>

                {/* Location Type */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Location Type *
                  </label>
                  <LocationTypeSelector
                    value={formData.location_type}
                    onChange={(value) => setFormData(prev => ({ ...prev, location_type: value }))}
                    required={true}
                    placeholder="Select location type..."
                    showSearch={true}
                  />
                </div>


                {/* Address with Auto-Completion */}
                <div className="md:col-span-2">
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

                {/* Contact Person */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Contact person name"
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="Additional notes about this location..."
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
                    onValidationChange={(isValid) => {
                      setServiceAreaValid(isValid);
                    }}
                    showSuggestions={true}
                  />
                </div>

                {/* Add First User Toggle */}
                {onOpenAddUserModal && (
                  <div className="md:col-span-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="addFirstUser"
                        checked={addFirstUser}
                        onChange={(e) => setAddFirstUser(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="addFirstUser" className={`ml-3 text-sm font-medium ${themeClasses.text.secondary}`}>
                        Also add first contact for this location
                      </label>
                    </div>
                    <p className={`ml-7 text-xs ${themeClasses.text.muted} mt-1`}>
                      After creating the location, automatically open the user form to add a contact
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
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
                Add Service Location
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmClose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl border ${themeClasses.border.primary} p-6 max-w-md w-full`}>
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Unsaved Changes</h3>
            </div>
            <p className={`${themeClasses.text.secondary} mb-6`}>
              You have unsaved changes. Are you sure you want to close without saving?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmClose(false)}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
              >
                Continue Editing
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Area Validation Error Dialog */}
      {showServiceAreaError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl border ${themeClasses.border.primary} p-6 max-w-md w-full`}>
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Service Area Validation Required</h3>
            </div>
            <div className="mb-6">
              <p className={`text-sm ${themeClasses.text.secondary} mb-2`}>
                Please review and address the service area validation issues shown above before submitting the form.
              </p>
              <p className={`text-xs ${themeClasses.text.muted}`}>
                We can only provide services in our designated coverage areas.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowServiceAreaError(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
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

export default AddServiceLocationModal;