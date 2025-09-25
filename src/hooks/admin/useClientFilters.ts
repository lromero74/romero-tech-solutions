import { useState, useCallback, useMemo } from 'react';
import { Client } from '../../contexts/AdminDataContext';

export interface ClientFilters {
  statusFilter: string;
  businessFilter: string;
  sortBy: string;
  sortOrder: string;
  searchTerm: string;
  dateFromFilter: string;
  dateToFilter: string;
  hasAddressFilter: string;
}

export interface UseClientFiltersReturn {
  filters: ClientFilters;
  setStatusFilter: (value: string) => void;
  setBusinessFilter: (value: string) => void;
  setSortBy: (value: string) => void;
  setSortOrder: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setDateFromFilter: (value: string) => void;
  setDateToFilter: (value: string) => void;
  setHasAddressFilter: (value: string) => void;
  clearFilters: () => void;
  getFilteredAndSortedClients: (clients: Client[]) => Client[];
}

const initialFilters: ClientFilters = {
  statusFilter: 'all',
  businessFilter: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
  searchTerm: '',
  dateFromFilter: '',
  dateToFilter: '',
  hasAddressFilter: 'all',
};

export const useClientFilters = (): UseClientFiltersReturn => {
  const [statusFilter, setStatusFilter] = useState<string>(initialFilters.statusFilter);
  const [businessFilter, setBusinessFilter] = useState<string>(initialFilters.businessFilter);
  const [sortBy, setSortBy] = useState<string>(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<string>(initialFilters.sortOrder);
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.searchTerm);
  const [dateFromFilter, setDateFromFilter] = useState<string>(initialFilters.dateFromFilter);
  const [dateToFilter, setDateToFilter] = useState<string>(initialFilters.dateToFilter);
  const [hasAddressFilter, setHasAddressFilter] = useState<string>(initialFilters.hasAddressFilter);

  const clearFilters = useCallback(() => {
    setStatusFilter(initialFilters.statusFilter);
    setBusinessFilter(initialFilters.businessFilter);
    setSortBy(initialFilters.sortBy);
    setSortOrder(initialFilters.sortOrder);
    setSearchTerm(initialFilters.searchTerm);
    setDateFromFilter(initialFilters.dateFromFilter);
    setDateToFilter(initialFilters.dateToFilter);
    setHasAddressFilter(initialFilters.hasAddressFilter);
  }, []);

  const getFilteredAndSortedClients = useCallback((clients: Client[]): Client[] => {
    const filteredClients = clients.filter(client => {
      // Filter by status
      if (statusFilter === 'active' && !client.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && client.isActive) {
        return false;
      }

      // Filter by business
      if (businessFilter !== 'all' && client.businessName !== businessFilter) {
        return false;
      }

      // Filter by address availability
      if (hasAddressFilter === 'with_address' && !client.serviceLocationAddress) {
        return false;
      }
      if (hasAddressFilter === 'without_address' && client.serviceLocationAddress) {
        return false;
      }

      // Filter by date range
      if (dateFromFilter) {
        const clientDate = new Date(client.createdAt);
        const fromDate = new Date(dateFromFilter);
        if (clientDate < fromDate) {
          return false;
        }
      }
      if (dateToFilter) {
        const clientDate = new Date(client.createdAt);
        const toDate = new Date(dateToFilter);
        toDate.setHours(23, 59, 59, 999); // End of day
        if (clientDate > toDate) {
          return false;
        }
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const fullName = `${client.firstName} ${client.lastName}`.toLowerCase();
        const email = client.email.toLowerCase();
        const businessName = client.businessName.toLowerCase();
        const phone = client.phone?.toLowerCase() || '';

        if (
          !fullName.includes(searchLower) &&
          !email.includes(searchLower) &&
          !businessName.includes(searchLower) &&
          !phone.includes(searchLower)
        ) {
          return false;
        }
      }

      return true;
    });

    // Sort clients
    filteredClients.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'name':
          aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
          bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
          break;
        case 'email':
          aValue = a.email.toLowerCase();
          bValue = b.email.toLowerCase();
          break;
        case 'businessName':
          aValue = a.businessName.toLowerCase();
          bValue = b.businessName.toLowerCase();
          break;
        case 'phone':
          aValue = a.phone?.toLowerCase() || '';
          bValue = b.phone?.toLowerCase() || '';
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
          aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
          bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
      }

      if (aValue < bValue) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filteredClients;
  }, [statusFilter, businessFilter, sortBy, sortOrder, searchTerm, dateFromFilter, dateToFilter, hasAddressFilter]);

  const filters = useMemo(() => ({
    statusFilter,
    businessFilter,
    sortBy,
    sortOrder,
    searchTerm,
    dateFromFilter,
    dateToFilter,
    hasAddressFilter,
  }), [statusFilter, businessFilter, sortBy, sortOrder, searchTerm, dateFromFilter, dateToFilter, hasAddressFilter]);

  return {
    filters,
    setStatusFilter,
    setBusinessFilter,
    setSortBy,
    setSortOrder,
    setSearchTerm,
    setDateFromFilter,
    setDateToFilter,
    setHasAddressFilter,
    clearFilters,
    getFilteredAndSortedClients,
  };
};