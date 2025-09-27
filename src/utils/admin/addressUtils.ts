import { Client, Business, ServiceLocation } from '../../contexts/AdminDataContext';

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

/**
 * Helper function to enhance clients with service location addresses
 * Finds the headquarters location for each client's business and adds the address
 */
export const enhanceClientsWithAddresses = (
  rawClients: Client[],
  businesses: Business[],
  serviceLocations: ServiceLocation[]
): Client[] => {
  return rawClients.map(client => {
    // Find the business for this client by matching business name
    const business = businesses.find(b => b.businessName === client.businessName);
    if (business) {
      // Find the headquarters service location for this business
      const headquartersLocation = serviceLocations.find(sl =>
        sl.business_id === business.id && sl.is_headquarters
      );
      if (headquartersLocation) {
        return {
          ...client,
          serviceLocationAddress: {
            street: headquartersLocation.street,
            city: headquartersLocation.city,
            state: headquartersLocation.state,
            zipCode: headquartersLocation.zip_code,
            country: headquartersLocation.country
          }
        };
      }
    }
    return client;
  });
};

/**
 * Helper function to open address in default maps application
 */
export const openInMaps = (address: Address): void => {
  const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}${address.country ? ', ' + address.country : ''}`;
  const encodedAddress = encodeURIComponent(fullAddress);
  const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
  window.open(mapsUrl, '_blank', 'noopener,noreferrer');
};

/**
 * Format address for display
 */
export const formatAddress = (address: Address, includeCountry: boolean = false): string => {
  const parts = [
    address.street,
    `${address.city}, ${address.state} ${address.zipCode}`
  ];

  if (includeCountry && address.country) {
    parts.push(address.country);
  }

  return parts.join(', ');
};

/**
 * Validate address fields
 */
export const validateAddress = (address: Partial<Address>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!address.street?.trim()) {
    errors.push('Street address is required');
  }

  if (!address.city?.trim()) {
    errors.push('City is required');
  }

  if (!address.state?.trim()) {
    errors.push('State is required');
  }

  if (!address.zipCode?.trim()) {
    errors.push('ZIP code is required');
  } else if (!/^\d{5}(-\d{4})?$/.test(address.zipCode.trim())) {
    errors.push('ZIP code must be in format 12345 or 12345-6789');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};