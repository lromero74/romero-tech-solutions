import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { CheckCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { validateServiceArea, formatServiceAreasDisplay, getActiveServiceAreas } from '../../utils/serviceAreaValidation';
import { ClientLanguageContext } from '../../contexts/ClientLanguageContext';
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
  triggerValidation?: number; // Timestamp to trigger immediate validation
}

const ServiceAreaValidator: React.FC<ServiceAreaValidatorProps> = ({
  address,
  onValidationChange,
  // showSuggestions = true,
  disabled = false,
  triggerValidation
}) => {
  // Safely use client language context with fallback for admin context
  const clientLanguageContext = useContext(ClientLanguageContext);
  const t = clientLanguageContext?.t || ((_key: string, _variables?: { [key: string]: string }, fallback?: string) => fallback || '');

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

  // Track processed trigger values to prevent infinite loops
  const processedTriggerRef = useRef<number>(0);

  // Track last validated address to prevent redundant validations
  const lastValidatedAddressRef = useRef<string>('');

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

  // Monitor ZIP code changes and invalidate state immediately if ZIP becomes incomplete
  useEffect(() => {
    if (disabled) {
      return;
    }

    // This useEffect only runs once on mount to set initial state
    // ZIP validation will be handled by triggerValidation mechanism
  }, [disabled]);

  // Validation function
  const validateAddress = useCallback(async () => {
    if (disabled) {
      return;
    }

    // Only require ZIP code - it will auto-populate city and state
    if (!address.zipCode?.trim()) {
      setValidationState({
        isValidating: false,
        isValid: false
      });
      setShowErrorModal(false); // Clear any existing error modal
      onValidationChange(false, {
        serviceArea: t('serviceArea.pleaseEnterZip', undefined, 'Please enter a ZIP code to validate service area.')
      });
      return;
    }

    // Check if ZIP code is valid length - if not, mark as invalid service area
    if (address.zipCode.trim().length < 5) {
      setValidationState({
        isValidating: false,
        isValid: false,
        reason: t('serviceArea.invalidZipCode', { zipCode: address.zipCode }, `ZIP code "${address.zipCode}" is not in our service area. Please enter a complete 5-digit ZIP code.`)
      });
      setShowErrorModal(false); // Clear any existing error modal
      onValidationChange(false, {
        serviceArea: t('serviceArea.invalidZipCode', { zipCode: address.zipCode }, `ZIP code "${address.zipCode}" is not in our service area. Please enter a complete 5-digit ZIP code.`)
      });
      return;
    }

    // Create address string for comparison
    const currentAddressString = `${address.city?.trim()}-${address.state?.trim()}-${address.zipCode?.trim()}-${address.country?.trim() || 'USA'}`;

    // Skip validation if address hasn't changed
    if (lastValidatedAddressRef.current === currentAddressString) {
      console.log('🌍 Skipping validation - address unchanged:', currentAddressString);
      return;
    }

    // Clear all previous states when starting validation
    setValidationState(prev => ({ ...prev, isValidating: true }));
    setShowErrorModal(false); // Clear any existing error modal

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
          errors.suggestedAreas = t('serviceArea.weCurrentlyService', { areas: result.suggestedAreas.join(', ') }, `We currently service: ${result.suggestedAreas.join(', ')}`);
        }
        // Show error modal for invalid results only
        setShowErrorModal(true);
      } else {
        // Ensure error modal is closed for valid results
        setShowErrorModal(false);
      }

      console.log('🌍 Notifying parent of validation result:', { isValid: result.isValid, errors });
      onValidationChange(result.isValid, errors);

      // Save this address as validated to prevent redundant validations
      lastValidatedAddressRef.current = currentAddressString;

    } catch (error) {
      console.error('Service area validation error:', error);
      // For testing purposes, let's be more strict when validation fails
      setValidationState({
        isValidating: false,
        isValid: false,
        reason: `Service area validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      onValidationChange(false, {
        serviceArea: t('serviceArea.unableToVerify', undefined, 'Unable to verify service area. Please contact support.')
      });
      // Show error modal for validation failure
      setShowErrorModal(true);
    }
  }, [address, disabled, onValidationChange]);


  // Immediate validation trigger (for ZIP auto-complete)
  useEffect(() => {
    if (triggerValidation && triggerValidation > 0 && !disabled) {
      // Prevent processing the same trigger value multiple times
      if (processedTriggerRef.current >= triggerValidation) {
        return;
      }

      processedTriggerRef.current = triggerValidation;
      console.log('🚀 Immediate validation triggered by triggerValidation prop:', triggerValidation);

      if (!address.zipCode?.trim() || address.zipCode.trim().length < 5) {
        console.log('🚀 Immediate validation skipped - incomplete ZIP code');
        return;
      }

      // Reset validation state to ensure fresh validation
      setValidationState({
        isValidating: false,
        isValid: null
      });
      lastValidatedAddressRef.current = '';

      console.log('🚀 Running fresh validation for ZIP code:', address.zipCode);
      validateAddress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerValidation, disabled, validateAddress]);

  if (disabled) {
    return null;
  }

  // Show placeholder when validation is null OR if ZIP is incomplete
  const showPlaceholder = validationState.isValid === null ||
    (!address.zipCode?.trim() || address.zipCode.trim().length < 5);

  if (showPlaceholder) {
    // Return placeholder while waiting for validation
    return (
      <div className="mt-4 space-y-3">
        <div className={`flex items-center p-3 rounded-md ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
          <span className={`text-sm ${themeClasses.text.muted}`}>
            {t('serviceArea.validationWillStart', undefined, 'Service area validation will start once ZIP code is complete...')}
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
            {t('serviceArea.verifying', undefined, 'Verifying service area...')}
          </span>
        </div>
      )}

      {!validationState.isValidating && validationState.isValid === true && (
        <div className={`flex items-center p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800`}>
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mr-3 flex-shrink-0" />
          <span className="text-sm text-green-800 dark:text-green-200">
            {t('serviceArea.locationWithinArea', undefined, '✅ This location is within our service area')}
          </span>
        </div>
      )}

      {/* Error Modal */}
      <AlertModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        type="error"
        title={t('serviceArea.notAvailableTitle', undefined, 'Service Area Not Available')}
        message={validationState.reason || t('serviceArea.outsideArea', undefined, 'This location is outside our current service area.')}
        suggestedAreas={validationState.suggestedAreas}
        serviceStates={serviceAreas.states}
      />
    </div>
  );
};

export default ServiceAreaValidator;