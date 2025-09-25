import { useState, useCallback, useMemo } from 'react';
import { ServiceLocation } from '../../contexts/AdminDataContext';

export interface ServiceLocationFilters {
  businessFilter: string;
  statusFilter: string;
  locationTypeFilter: string;
  sortBy: string;
  sortOrder: string;
  searchTerm: string;
  isHeadquartersFilter: string;
}

export interface UseServiceLocationFiltersReturn {
  filters: ServiceLocationFilters;
  setBusinessFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setLocationTypeFilter: (value: string) => void;
  setSortBy: (value: string) => void;
  setSortOrder: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setIsHeadquartersFilter: (value: string) => void;
  clearFilters: () => void;
  getFilteredAndSortedServiceLocations: (serviceLocations: ServiceLocation[]) => ServiceLocation[];
}

const initialFilters: ServiceLocationFilters = {
  businessFilter: 'all',
  statusFilter: 'all',
  locationTypeFilter: 'all',
  sortBy: 'business_name',
  sortOrder: 'asc',
  searchTerm: '',
  isHeadquartersFilter: 'all',
};

export const useServiceLocationFilters = (): UseServiceLocationFiltersReturn => {
  const [businessFilter, setBusinessFilterState] = useState<string>(initialFilters.businessFilter);
  const [statusFilter, setStatusFilter] = useState<string>(initialFilters.statusFilter);
  const [locationTypeFilter, setLocationTypeFilter] = useState<string>(initialFilters.locationTypeFilter);
  const [sortBy, setSortBy] = useState<string>(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<string>(initialFilters.sortOrder);
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.searchTerm);
  const [isHeadquartersFilter, setIsHeadquartersFilter] = useState<string>(initialFilters.isHeadquartersFilter);

  const setBusinessFilter = useCallback((value: string) => {
    console.log('🔧 useServiceLocationFilters setBusinessFilter called with:', value);
    setBusinessFilterState(prev => {
      console.log('🔧 Previous businessFilter state:', prev);
      console.log('🔧 Setting businessFilter to:', value);
      return value;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setBusinessFilterState(initialFilters.businessFilter);
    setStatusFilter(initialFilters.statusFilter);
    setLocationTypeFilter(initialFilters.locationTypeFilter);
    setSortBy(initialFilters.sortBy);
    setSortOrder(initialFilters.sortOrder);
    setSearchTerm(initialFilters.searchTerm);
    setIsHeadquartersFilter(initialFilters.isHeadquartersFilter);
  }, []);

  const getFilteredAndSortedServiceLocations = useCallback((serviceLocations: ServiceLocation[]): ServiceLocation[] => {
    const filteredServiceLocations = serviceLocations.filter(location => {
      // Filter by business
      if (businessFilter !== 'all' && location.business_name !== businessFilter) {
        return false;
      }

      // Filter by status
      if (statusFilter === 'active' && !location.is_active) {
        return false;
      }
      if (statusFilter === 'inactive' && location.is_active) {
        return false;
      }

      // Filter by location type
      if (locationTypeFilter !== 'all' && location.location_type !== locationTypeFilter) {
        return false;
      }

      // Filter by headquarters status
      if (isHeadquartersFilter === 'headquarters' && !location.is_headquarters) {
        return false;
      }
      if (isHeadquartersFilter === 'not_headquarters' && location.is_headquarters) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const businessName = location.business_name.toLowerCase();
        const addressLabel = location.address_label.toLowerCase();
        const locationName = location.location_name?.toLowerCase() || '';
        const street = location.street.toLowerCase();
        const city = location.city.toLowerCase();
        const state = location.state.toLowerCase();
        const zipCode = location.zip_code.toLowerCase();
        const contactPerson = location.contact_person?.toLowerCase() || '';
        const contactPhone = location.contact_phone?.toLowerCase() || '';

        if (
          !businessName.includes(searchLower) &&
          !addressLabel.includes(searchLower) &&
          !locationName.includes(searchLower) &&
          !street.includes(searchLower) &&
          !city.includes(searchLower) &&
          !state.includes(searchLower) &&
          !zipCode.includes(searchLower) &&
          !contactPerson.includes(searchLower) &&
          !contactPhone.includes(searchLower)
        ) {
          return false;
        }
      }

      return true;
    });

    // Sort service locations
    filteredServiceLocations.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'business_name':
          aValue = a.business_name.toLowerCase();
          bValue = b.business_name.toLowerCase();
          break;
        case 'address_label':
          aValue = a.address_label.toLowerCase();
          bValue = b.address_label.toLowerCase();
          break;
        case 'location_name':
          aValue = a.location_name?.toLowerCase() || '';
          bValue = b.location_name?.toLowerCase() || '';
          break;
        case 'location_type':
          aValue = a.location_type.toLowerCase();
          bValue = b.location_type.toLowerCase();
          break;
        case 'street':
          aValue = a.street.toLowerCase();
          bValue = b.street.toLowerCase();
          break;
        case 'city':
          aValue = a.city.toLowerCase();
          bValue = b.city.toLowerCase();
          break;
        case 'state':
          aValue = a.state.toLowerCase();
          bValue = b.state.toLowerCase();
          break;
        case 'zip_code':
          aValue = a.zip_code.toLowerCase();
          bValue = b.zip_code.toLowerCase();
          break;
        case 'contact_person':
          aValue = a.contact_person?.toLowerCase() || '';
          bValue = b.contact_person?.toLowerCase() || '';
          break;
        case 'contact_phone':
          aValue = a.contact_phone?.toLowerCase() || '';
          bValue = b.contact_phone?.toLowerCase() || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          aValue = new Date(a.updated_at).getTime();
          bValue = new Date(b.updated_at).getTime();
          break;
        default:
          aValue = a.business_name.toLowerCase();
          bValue = b.business_name.toLowerCase();
      }

      if (aValue < bValue) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filteredServiceLocations;
  }, [businessFilter, statusFilter, locationTypeFilter, sortBy, sortOrder, searchTerm, isHeadquartersFilter]);

  const filters = useMemo(() => ({
    businessFilter,
    statusFilter,
    locationTypeFilter,
    sortBy,
    sortOrder,
    searchTerm,
    isHeadquartersFilter,
  }), [businessFilter, statusFilter, locationTypeFilter, sortBy, sortOrder, searchTerm, isHeadquartersFilter]);

  return {
    filters,
    setBusinessFilter,
    setStatusFilter,
    setLocationTypeFilter,
    setSortBy,
    setSortOrder,
    setSearchTerm,
    setIsHeadquartersFilter,
    clearFilters,
    getFilteredAndSortedServiceLocations,
  };
};