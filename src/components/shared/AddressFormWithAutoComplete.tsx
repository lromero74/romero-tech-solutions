import React, { useState, useEffect } from 'react';
import { Search, Lock, Unlock, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { adminService } from '../../services/adminService';

interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface AddressFormWithAutoCompleteProps {
  address: AddressData;
  onAddressChange: (address: AddressData) => void;
  disabled?: boolean;
  showLabels?: boolean;
  required?: boolean;
  onFieldBlur?: (field: keyof AddressData, value: string) => void;
}

const AddressFormWithAutoComplete: React.FC<AddressFormWithAutoCompleteProps> = ({
  address,
  onAddressChange,
  disabled = false,
  showLabels = true,
  required = false,
  onFieldBlur
}) => {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [fieldsLocked, setFieldsLocked] = useState(false);
  const [zipLookupMessage, setZipLookupMessage] = useState<string | null>(null);
  const [lastAutoCompleteZip, setLastAutoCompleteZip] = useState<string | null>(null);

  // Handle ZIP code changes with auto-completion
  const handleZipCodeChange = async (newZipCode: string) => {
    console.log('🔍 AddressFormWithAutoComplete: ZIP code changed to:', newZipCode);

    // Update the ZIP code immediately
    const updatedAddress = { ...address, zipCode: newZipCode };
    onAddressChange(updatedAddress);

    // Clear previous messages
    setZipLookupMessage(null);

    // If ZIP code is less than 5 digits or user is typing, unlock fields
    if (newZipCode.length < 5) {
      console.log('🔍 ZIP code too short, unlocking fields');
      setFieldsLocked(false);
      setLastAutoCompleteZip(null);
      return;
    }

    // If this is the same ZIP we already auto-completed, don't lookup again
    if (newZipCode === lastAutoCompleteZip) {
      console.log('🔍 ZIP code already looked up, skipping');
      return;
    }

    // Perform ZIP code lookup
    console.log('🔍 Starting ZIP lookup for:', newZipCode);
    setIsLookingUp(true);
    try {
      console.log('🔍 Calling adminService.lookupZipCode...');
      const result = await adminService.lookupZipCode(newZipCode);
      console.log('🔍 ZIP lookup response received:', result);

      if (result.found && result.data) {
        console.log('✅ ZIP lookup successful, auto-populating fields:', result.data);

        // Auto-populate fields from ZIP lookup
        const autoCompleteAddress = {
          ...address,
          zipCode: newZipCode,
          city: result.data.city,
          state: result.data.state,
          country: result.data.country
        };

        console.log('🔍 Current address before update:', address);
        console.log('🔍 Auto-complete address being set:', autoCompleteAddress);
        console.log('🔍 Calling onAddressChange with:', autoCompleteAddress);
        onAddressChange(autoCompleteAddress);
        console.log('🔍 onAddressChange call completed');
        setFieldsLocked(true);
        setLastAutoCompleteZip(newZipCode);
        setZipLookupMessage(`✅ Auto-completed from ZIP code (${result.data.city}, ${result.data.state})`);
      } else {
        console.log('❌ ZIP not found in service areas:', result.message);
        setFieldsLocked(false);
        setLastAutoCompleteZip(null);
        setZipLookupMessage(`⚠️ ${result.message || 'ZIP code not found in our service areas'}`);
      }
    } catch (error) {
      console.error('❌ Error looking up ZIP code:', error);
      setFieldsLocked(false);
      setLastAutoCompleteZip(null);
      setZipLookupMessage('❌ Unable to lookup ZIP code');
    } finally {
      console.log('🔍 ZIP lookup completed, setting isLookingUp to false');
      setIsLookingUp(false);
    }
  };

  // Handle other field changes - unlock if fields are locked and user tries to edit
  const handleFieldChange = (field: keyof AddressData, value: string) => {
    if (fieldsLocked && field !== 'zipCode' && field !== 'street') {
      // User is trying to edit a locked field, unlock everything
      setFieldsLocked(false);
      setLastAutoCompleteZip(null);
      setZipLookupMessage('🔓 Fields unlocked for manual editing');
    }

    const updatedAddress = { ...address, [field]: value };
    onAddressChange(updatedAddress);
  };

  return (
    <div className="space-y-4">
      {/* Street Address */}
      <div>
        {showLabels && (
          <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
            Street Address {required && '*'}
          </label>
        )}
        <input
          type="text"
          value={address.street}
          onChange={(e) => handleFieldChange('street', e.target.value)}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="Enter street address"
        />
      </div>


      {/* City, State, ZIP Row - Envelope Format */}
      <div className="grid grid-cols-12 gap-3">
        {/* City - Takes most space */}
        <div className="col-span-6">
          {showLabels && (
            <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
              City {required && '*'}
            </label>
          )}
          <div className="relative">
            <input
              type="text"
              value={address.city}
              onChange={(e) => handleFieldChange('city', e.target.value)}
              onBlur={(e) => onFieldBlur && onFieldBlur('city', e.target.value)}
              disabled={disabled || fieldsLocked}
              className={`w-full px-3 py-2 border rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                disabled || fieldsLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              placeholder="Enter city"
            />
            {fieldsLocked && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Lock className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* State - Short field */}
        <div className="col-span-3">
          {showLabels && (
            <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
              State {required && '*'}
            </label>
          )}
          <div className="relative">
            <input
              type="text"
              value={address.state}
              onChange={(e) => handleFieldChange('state', e.target.value.toUpperCase())}
              onBlur={(e) => onFieldBlur && onFieldBlur('state', e.target.value)}
              disabled={disabled || fieldsLocked}
              className={`w-full px-3 py-2 border rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                disabled || fieldsLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              placeholder="CA"
              maxLength={2}
            />
            {fieldsLocked && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Lock className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* ZIP - Compact field */}
        <div className="col-span-3">
          {showLabels && (
            <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
              ZIP {required && '*'}
            </label>
          )}
          <div className="relative">
            <input
              type="text"
              value={address.zipCode}
              onChange={(e) => {
                console.log('🔍 ZIP input onChange triggered with value:', e.target.value);
                handleZipCodeChange(e.target.value);
              }}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="12345"
              maxLength={10}
            />
            {isLookingUp && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ZIP lookup message */}
      {zipLookupMessage && (
        <div className={`mt-2 p-2 rounded-md text-sm ${
          zipLookupMessage.startsWith('✅')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
            : zipLookupMessage.startsWith('🔓')
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
            : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
        }`}>
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {zipLookupMessage}
          </div>
        </div>
      )}

      {/* Country */}
      <div>
        {showLabels && (
          <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
            Country {required && '*'}
          </label>
        )}
        <div className="relative">
          <input
            type="text"
            value={address.country}
            onChange={(e) => handleFieldChange('country', e.target.value)}
            disabled={disabled || fieldsLocked}
            className={`w-full px-3 py-2 border rounded-md ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              disabled || fieldsLocked ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            placeholder="Enter country"
          />
          {fieldsLocked && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Lock className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {/* Unlock fields instruction */}
      {fieldsLocked && (
        <div className={`p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800`}>
          <div className="flex items-center text-sm text-blue-800 dark:text-blue-200">
            <Unlock className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>
              Fields are locked based on ZIP code. Modify the ZIP code or click on any locked field to edit manually.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressFormWithAutoComplete;