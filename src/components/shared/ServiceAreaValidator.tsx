import React, { useState, useEffect } from 'react';
import { AlertTriangle, MapPin, CheckCircle, Info } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { validateServiceArea, formatServiceAreasDisplay, getActiveServiceAreas } from '../../utils/serviceAreaValidation';
import AlertModal from './AlertModal';

interface ServiceAreaValidatorProps {
  address: {
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  onValidationChange: (isValid: boolean, errors: { [key: string]: string }) => void;
  showSuggestions?: boolean;
  disabled?: boolean;
}

const ServiceAreaValidator: React.FC<ServiceAreaValidatorProps> = ({
  address,
  onValidationChange,
  showSuggestions = true,
  disabled = false
}) => {
  const [validationState, setValidationState] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    reason?: string;
    suggestedAreas?: string[];
  }>({
    isValidating: false,
    isValid: null
  });

  const [serviceAreas, setServiceAreas] = useState<{
    cities: string[];
    zipCodes: string[];
    states: string[];
  }>({
    cities: [],
    zipCodes: [],
    states: []
  });

  const [showErrorModal, setShowErrorModal] = useState(false);

  // Load service areas on mount
  useEffect(() => {
    const loadServiceAreas = async () => {
      try {
        const areas = await getActiveServiceAreas();
        const formatted = formatServiceAreasDisplay(areas);
        setServiceAreas(formatted);
      } catch (error) {
        console.error('Failed to load service areas:', error);
      }
    };

    loadServiceAreas();
  }, []);

  // Validate address when it changes
  useEffect(() => {
    if (disabled) {
      return;
    }

    const validateAddress = async () => {
      // Don't validate if required fields are empty - block submission until all fields complete
      if (!address.city?.trim() || !address.state?.trim() || !address.zipCode?.trim()) {
        setValidationState({
          isValidating: false,
          isValid: false
        });
        onValidationChange(false, {
          serviceArea: 'Please complete all address fields (City, State, ZIP Code) before validation can proceed.'
        });
        return;
      }

      setValidationState(prev => ({ ...prev, isValidating: true }));

      try {
        console.log('🌍 Starting service area validation for:', address);
        const result = await validateServiceArea(address);
        console.log('🌍 Service area validation result:', result);

        const newState = {
          isValidating: false,
          isValid: result.isValid,
          reason: result.reason,
          suggestedAreas: result.suggestedAreas
        };

        setValidationState(newState);

        // Notify parent component
        const errors: { [key: string]: string } = {};
        if (!result.isValid && result.reason) {
          errors.serviceArea = result.reason;
          if (result.suggestedAreas && result.suggestedAreas.length > 0) {
            errors.suggestedAreas = `We currently service: ${result.suggestedAreas.join(', ')}`;
          }
          // Show error modal instead of inline error
          setShowErrorModal(true);
        }

        console.log('🌍 Notifying parent of validation result:', { isValid: result.isValid, errors });
        onValidationChange(result.isValid, errors);

      } catch (error) {
        console.error('Service area validation error:', error);
        // For testing purposes, let's be more strict when validation fails
        setValidationState({
          isValidating: false,
          isValid: false,
          reason: `Service area validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        onValidationChange(false, {
          serviceArea: 'Unable to verify service area. Please contact support.'
        });
        // Show error modal for validation failure
        setShowErrorModal(true);
      }
    };

    // Debounce validation - increased to prevent excessive validation calls during typing
    const timeoutId = setTimeout(validateAddress, 2000); // 2 second debounce to reduce validation spam
    return () => clearTimeout(timeoutId);

  }, [address.city, address.state, address.zipCode, address.country, disabled, onValidationChange]);

  if (disabled) {
    return null;
  }

  // Always show something when validation is in progress or has completed
  if (validationState.isValid === null) {
    // Return placeholder while waiting for validation
    return (
      <div className="mt-4 space-y-3">
        <div className={`flex items-center p-3 rounded-md ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
          <span className={`text-sm ${themeClasses.text.muted}`}>
            Service area validation will start once address is complete...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Validation Status */}
      {validationState.isValidating && (
        <div className={`flex items-center p-3 rounded-md ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
          <span className={`text-sm ${themeClasses.text.secondary}`}>
            Verifying service area...
          </span>
        </div>
      )}

      {!validationState.isValidating && validationState.isValid === true && (
        <div className={`flex items-center p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800`}>
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mr-3 flex-shrink-0" />
          <span className="text-sm text-green-800 dark:text-green-200">
            ✅ This location is within our service area
          </span>
        </div>
      )}

      {/* Error Modal */}
      <AlertModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        type="error"
        title="Service Area Not Available"
        message={validationState.reason || 'This location is outside our current service area.'}
        suggestedAreas={validationState.suggestedAreas}
        serviceStates={serviceAreas.states}
      />
    </div>
  );
};

export default ServiceAreaValidator;