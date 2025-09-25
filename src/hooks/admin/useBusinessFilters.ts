import { useState, useCallback, useMemo } from 'react';
import { Business } from '../../contexts/AdminDataContext';

export interface BusinessFilters {
  statusFilter: string;
  industryFilter: string;
  sortBy: string;
  sortOrder: string;
  searchTerm: string;
  locationCountFilter: string;
  clientCountFilter: string;
  businessNameFilter: string;
}

export interface UseBusinessFiltersReturn {
  filters: BusinessFilters;
  setStatusFilter: (value: string) => void;
  setIndustryFilter: (value: string) => void;
  setSortBy: (value: string) => void;
  setSortOrder: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setLocationCountFilter: (value: string) => void;
  setClientCountFilter: (value: string) => void;
  setBusinessNameFilter: (value: string) => void;
  clearFilters: () => void;
  getFilteredAndSortedBusinesses: (businesses: Business[], clients: any[]) => Business[];
}

const initialFilters: BusinessFilters = {
  statusFilter: 'all',
  industryFilter: 'all',
  sortBy: 'businessName',
  sortOrder: 'asc',
  searchTerm: '',
  locationCountFilter: 'all',
  clientCountFilter: 'all',
  businessNameFilter: 'all',
};

export const useBusinessFilters = (): UseBusinessFiltersReturn => {
  const [statusFilter, setStatusFilter] = useState<string>(initialFilters.statusFilter);
  const [industryFilter, setIndustryFilter] = useState<string>(initialFilters.industryFilter);
  const [sortBy, setSortBy] = useState<string>(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<string>(initialFilters.sortOrder);
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.searchTerm);
  const [locationCountFilter, setLocationCountFilter] = useState<string>(initialFilters.locationCountFilter);
  const [clientCountFilter, setClientCountFilter] = useState<string>(initialFilters.clientCountFilter);
  const [businessNameFilter, setBusinessNameFilter] = useState<string>(initialFilters.businessNameFilter);

  const clearFilters = useCallback(() => {
    setStatusFilter(initialFilters.statusFilter);
    setIndustryFilter(initialFilters.industryFilter);
    setSortBy(initialFilters.sortBy);
    setSortOrder(initialFilters.sortOrder);
    setSearchTerm(initialFilters.searchTerm);
    setLocationCountFilter(initialFilters.locationCountFilter);
    setClientCountFilter(initialFilters.clientCountFilter);
    setBusinessNameFilter(initialFilters.businessNameFilter);
  }, []);

  const getFilteredAndSortedBusinesses = useCallback((businesses: Business[], clients: any[] = []): Business[] => {
    const filteredBusinesses = businesses.filter(business => {
      // Filter by status
      if (statusFilter === 'active' && !business.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && business.isActive) {
        return false;
      }

      // Filter by industry
      if (industryFilter !== 'all' && business.industry !== industryFilter) {
        return false;
      }

      // Filter by location count
      if (locationCountFilter === 'none' && business.locationCount > 0) {
        return false;
      }
      if (locationCountFilter === 'single' && business.locationCount !== 1) {
        return false;
      }
      if (locationCountFilter === 'multiple' && business.locationCount <= 1) {
        return false;
      }

      // Filter by client count
      if (clientCountFilter !== 'all') {
        const businessClients = clients.filter(client => client.businessName === business.businessName);
        const clientCount = businessClients.length;

        if (clientCountFilter === '0' && clientCount !== 0) {
          return false;
        }
        if (clientCountFilter === '1-5' && (clientCount < 1 || clientCount > 5)) {
          return false;
        }
        if (clientCountFilter === '5-10' && (clientCount < 5 || clientCount > 10)) {
          return false;
        }
        if (clientCountFilter === '>10' && clientCount <= 10) {
          return false;
        }
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const businessName = business.businessName.toLowerCase();
        const contactEmail = business.contactEmail?.toLowerCase() || '';
        const contactPhone = business.contactPhone?.toLowerCase() || '';
        const industry = business.industry?.toLowerCase() || '';

        if (
          !businessName.includes(searchLower) &&
          !contactEmail.includes(searchLower) &&
          !contactPhone.includes(searchLower) &&
          !industry.includes(searchLower)
        ) {
          return false;
        }
      }

      // Filter by exact business name
      if (businessNameFilter !== 'all' && business.businessName !== businessNameFilter) {
        return false;
      }

      return true;
    });

    // Sort businesses
    filteredBusinesses.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'businessName':
          aValue = a.businessName.toLowerCase();
          bValue = b.businessName.toLowerCase();
          break;
        case 'contactEmail':
          aValue = a.contactEmail?.toLowerCase() || '';
          bValue = b.contactEmail?.toLowerCase() || '';
          break;
        case 'contactPhone':
          aValue = a.contactPhone?.toLowerCase() || '';
          bValue = b.contactPhone?.toLowerCase() || '';
          break;
        case 'industry':
          aValue = a.industry?.toLowerCase() || '';
          bValue = b.industry?.toLowerCase() || '';
          break;
        case 'locationCount':
          aValue = a.locationCount;
          bValue = b.locationCount;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          aValue = a.businessName.toLowerCase();
          bValue = b.businessName.toLowerCase();
      }

      if (aValue < bValue) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filteredBusinesses;
  }, [statusFilter, industryFilter, sortBy, sortOrder, searchTerm, locationCountFilter, clientCountFilter, businessNameFilter]);

  const filters = useMemo(() => ({
    statusFilter,
    industryFilter,
    sortBy,
    sortOrder,
    searchTerm,
    locationCountFilter,
    clientCountFilter,
    businessNameFilter,
  }), [statusFilter, industryFilter, sortBy, sortOrder, searchTerm, locationCountFilter, clientCountFilter, businessNameFilter]);

  return {
    filters,
    setStatusFilter,
    setIndustryFilter,
    setSortBy,
    setSortOrder,
    setSearchTerm,
    setLocationCountFilter,
    setClientCountFilter,
    setBusinessNameFilter,
    clearFilters,
    getFilteredAndSortedBusinesses,
  };
};