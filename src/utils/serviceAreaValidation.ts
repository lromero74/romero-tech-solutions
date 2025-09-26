// Service Area Validation Utilities
// Validates addresses against the service areas defined in the database

interface ServiceArea {
  id: number;
  location_type: 'city' | 'zipcode';
  location_id: number;
  is_active: boolean;
  location_name: string;
  state_code: string;
}

interface ValidationResult {
  isValid: boolean;
  reason?: string;
  suggestedAreas?: string[];
  geographicallyRelevant?: boolean;
}

interface AddressData {
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

/**
 * Validates if an address is within our service area
 */
export const validateServiceArea = async (address: AddressData): Promise<ValidationResult> => {
  try {
    const { adminService } = await import('../services/adminService');
    const result = await adminService.validateServiceArea(address);
    return result;
  } catch (error) {
    console.error('Error validating service area:', error);
    // Don't block form submission if validation service is down
    return {
      isValid: true,
      reason: 'Unable to verify service area at this time. Please proceed and we will contact you if needed.'
    };
  }
};

/**
 * Validates a specific field immediately (for blur validation)
 * Only validates if we have enough information to make a determination
 */
export const validateServiceAreaField = async (
  field: 'city' | 'state',
  value: string,
  partialAddress: Partial<AddressData>
): Promise<ValidationResult | null> => {
  try {
    console.log('🔍 Field blur validation called:', { field, value, partialAddress });

    // Validate city field immediately when user leaves it
    if (field === 'city' && value.trim()) {
      console.log('🏙️ Validating city field:', value.trim());
      // If we have both city and state, do full validation
      if (partialAddress.state?.trim()) {
        const address: AddressData = {
          city: value.trim(),
          state: partialAddress.state.trim(),
          zipCode: partialAddress.zipCode || '', // ZIP not required for city validation
          country: partialAddress.country || 'USA'
        };
        return await validateServiceArea(address);
      } else {
        // If we only have city, check if this city exists in any of our service areas
        const serviceAreas = await getActiveServiceAreas();
        const cityExists = serviceAreas.some(area =>
          area.location_type === 'city' &&
          area.location_name.toLowerCase() === value.trim().toLowerCase()
        );

        if (!cityExists) {
          let suggestedCities: string[] = [];
          let geographicallyRelevant = false;
          let reason = `We don't currently service ${value.trim()}.`;

          // If we have a state, only show cities in that state
          if (partialAddress.state?.trim()) {
            const stateCode = partialAddress.state.trim().toUpperCase();
            suggestedCities = serviceAreas
              .filter(area => area.location_type === 'city' && area.state_code === stateCode)
              .map(area => `${area.location_name}, ${area.state_code}`)
              .sort()
              .slice(0, 5);

            if (suggestedCities.length > 0) {
              geographicallyRelevant = true;
              reason = `We don't currently service ${value.trim()}. Please select a city from our service areas in ${stateCode}.`;
            } else {
              reason = `We don't currently service any cities in ${stateCode}. We may not provide services in this state.`;
            }
          } else {
            // If no state provided, show a few examples from all states
            suggestedCities = serviceAreas
              .filter(area => area.location_type === 'city')
              .map(area => `${area.location_name}, ${area.state_code}`)
              .sort()
              .slice(0, 5);
            geographicallyRelevant = false;
            reason = `We don't currently service ${value.trim()}. Please select a city from our service areas.`;
          }

          return {
            isValid: false,
            reason,
            suggestedAreas: suggestedCities,
            geographicallyRelevant
          };
        }
      }
    }

    // For state field, we can check if the state itself is in our service areas
    if (field === 'state' && value.trim()) {
      const serviceAreas = await getActiveServiceAreas();
      const stateExists = serviceAreas.some(area => area.state_code === value.trim().toUpperCase());

      if (!stateExists) {
        const availableStates = [...new Set(serviceAreas.map(area => area.state_code))];
        return {
          isValid: false,
          reason: `We don't currently service ${value.toUpperCase()}. We provide services in: ${availableStates.join(', ')}`,
          suggestedAreas: availableStates.map(state => `Areas in ${state}`)
        };
      }
    }

    return null; // Not enough info to validate yet
  } catch (error) {
    console.error('Error validating service area field:', error);
    return null; // Don't show errors for field-level validation failures
  }
};

/**
 * Get suggested service areas for the given state
 */
export const getSuggestedAreas = (serviceAreas: ServiceArea[], state: string): string[] => {
  const stateAreas = serviceAreas.filter(area => area.state_code === state);

  if (stateAreas.length === 0) {
    // No areas in this state, show any areas we service
    const uniqueStates = [...new Set(serviceAreas.map(area => area.state_code))];
    return uniqueStates.map(stateCode => `Areas in ${stateCode}`);
  }

  // Show specific cities/areas in this state
  const cities = stateAreas
    .filter(area => area.location_type === 'city')
    .map(area => `${area.location_name}, ${area.state_code}`)
    .sort();

  return cities.slice(0, 5); // Limit to 5 suggestions
};

/**
 * Validates form data with service area check
 */
export const validateFormWithServiceArea = async (formData: {
  address: AddressData;
  [key: string]: unknown;
}): Promise<{
  isValid: boolean;
  errors: { [key: string]: string };
}> => {
  const errors: { [key: string]: string } = {};

  // Basic address validation
  if (!formData.address.city?.trim()) {
    errors.city = 'City is required';
  }
  if (!formData.address.state?.trim()) {
    errors.state = 'State is required';
  }
  if (!formData.address.zipCode?.trim()) {
    errors.zipCode = 'ZIP code is required';
  }

  // If basic validation fails, don't check service area
  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  // Check service area
  const serviceAreaResult = await validateServiceArea(formData.address);
  if (!serviceAreaResult.isValid && serviceAreaResult.reason) {
    errors.serviceArea = serviceAreaResult.reason;
    if (serviceAreaResult.suggestedAreas && serviceAreaResult.suggestedAreas.length > 0) {
      errors.suggestedAreas = `We currently service: ${serviceAreaResult.suggestedAreas.join(', ')}`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Get all active service areas for display in UI
 */
export const getActiveServiceAreas = async (): Promise<ServiceArea[]> => {
  try {
    const { adminService } = await import('../services/adminService');
    const serviceAreas: ServiceArea[] = await adminService.getServiceAreas();
    return serviceAreas.filter(area => area.is_active);
  } catch (error) {
    console.error('Error fetching service areas:', error);
    return [];
  }
};

/**
 * Format service areas for display
 */
export const formatServiceAreasDisplay = (serviceAreas: ServiceArea[]): {
  cities: string[];
  zipCodes: string[];
  states: string[];
} => {
  const cities = serviceAreas
    .filter(area => area.location_type === 'city')
    .map(area => `${area.location_name}, ${area.state_code}`)
    .sort();

  const zipCodes = serviceAreas
    .filter(area => area.location_type === 'zipcode')
    .map(area => area.location_name)
    .sort();

  const states = [...new Set(serviceAreas.map(area => area.state_code))].sort();

  return { cities, zipCodes, states };
};