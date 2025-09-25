import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, AlertCircle } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { adminService } from '../../../services/adminService';

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
    is_headquarters: boolean;
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
  const { theme } = useTheme();

  const [formData, setFormData] = useState({
    business_id: '',
    address_label: '',
    location_name: '',
    location_type: 'office',
    street: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'USA',
    contact_person: '',
    contact_phone: '',
    notes: '',
    is_headquarters: false
  });

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Track if this is the first render to avoid marking as changed during initial load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Toggle for adding first user
  const [addFirstUser, setAddFirstUser] = useState(true);

  // Fetch businesses on component mount
  useEffect(() => {
    if (showModal) {
      fetchBusinesses();
    }
  }, [showModal]);

  // Handle prefill business name
  useEffect(() => {
    if (showModal && prefillBusinessName && businesses.length > 0) {
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
  }, [showModal, prefillBusinessName, businesses]);

  // Handle prefill address data
  useEffect(() => {
    if (showModal && prefillAddress) {
      setFormData(prev => ({
        ...prev,
        street: prefillAddress.street,
        city: prefillAddress.city,
        state: prefillAddress.state,
        zip_code: prefillAddress.zipCode,
        country: prefillAddress.country || 'USA',
        address_label: 'Main Office' // Default label
      }));
    }
  }, [showModal, prefillAddress]);

  // Reset form when modal closes
  useEffect(() => {
    if (!showModal) {
      setFormData({
        business_id: '',
        address_label: '',
        location_name: '',
        location_type: 'office',
        street: '',
        city: '',
        state: '',
        zip_code: '',
        country: 'USA',
        contact_person: '',
        contact_phone: '',
        notes: '',
        is_headquarters: false
      });
      setHasUnsavedChanges(false);
      setShowConfirmClose(false);
      setIsInitialLoad(true);
    }
  }, [showModal]);

  // Track changes after initial load
  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }
    setHasUnsavedChanges(true);
  }, [formData]);

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

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const handleConfirmClose = () => {
    setShowConfirmClose(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.business_id || !formData.address_label || !formData.street || !formData.city || !formData.state || !formData.zip_code) {
      return;
    }

    try {
      const result = await onSubmit({
        business_id: formData.business_id,
        address_label: formData.address_label,
        location_name: formData.location_name || undefined,
        location_type: formData.location_type,
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        country: formData.country,
        contact_person: formData.contact_person || undefined,
        contact_phone: formData.contact_phone || undefined,
        notes: formData.notes || undefined,
        is_headquarters: formData.is_headquarters
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
                  <select
                    required
                    value={formData.location_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, location_type: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="office">Office</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="retail">Retail</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Is Headquarters */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Headquarters
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_headquarters}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_headquarters: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className={`ml-2 text-sm ${themeClasses.text.secondary}`}>
                      This is the headquarters location
                    </span>
                  </div>
                </div>

                {/* Street Address */}
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.street}
                    onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="123 Main Street"
                  />
                </div>

                {/* City */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="City"
                  />
                </div>

                {/* State */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="State"
                  />
                </div>

                {/* ZIP Code */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.zip_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, zip_code: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="12345"
                  />
                </div>

                {/* Country */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Country *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    placeholder="USA"
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
    </>
  );
};

export default AddServiceLocationModal;