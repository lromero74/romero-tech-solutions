import { useState, useCallback, useMemo } from 'react';
import { Employee } from '../../contexts/AdminDataContext';

export interface EmployeeFilters {
  roleFilter: string;
  statusFilter: string;
  sortBy: string;
  sortOrder: string;
  searchTerm: string;
}

export interface UseEmployeeFiltersReturn {
  filters: EmployeeFilters;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setSortBy: (value: string) => void;
  setSortOrder: (value: string) => void;
  setSearchTerm: (value: string) => void;
  clearFilters: () => void;
  getFilteredAndSortedEmployees: (employees: Employee[]) => Employee[];
}

const initialFilters: EmployeeFilters = {
  roleFilter: 'all',
  statusFilter: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
  searchTerm: '',
};

export const useEmployeeFilters = (): UseEmployeeFiltersReturn => {
  const [roleFilter, setRoleFilter] = useState<string>(initialFilters.roleFilter);
  const [statusFilter, setStatusFilter] = useState<string>(initialFilters.statusFilter);
  const [sortBy, setSortBy] = useState<string>(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<string>(initialFilters.sortOrder);
  const [searchTerm, setSearchTerm] = useState<string>(initialFilters.searchTerm);

  const clearFilters = useCallback(() => {
    setRoleFilter(initialFilters.roleFilter);
    setStatusFilter(initialFilters.statusFilter);
    setSortBy(initialFilters.sortBy);
    setSortOrder(initialFilters.sortOrder);
    setSearchTerm(initialFilters.searchTerm);
  }, []);

  const getFilteredAndSortedEmployees = useCallback((employees: Employee[]): Employee[] => {
    const filteredEmployees = employees.filter(employee => {
      // Filter by role
      if (roleFilter !== 'all' && employee.role !== roleFilter) {
        return false;
      }

      // Filter by status
      if (statusFilter === 'active' && !employee.isActive) {
        return false;
      }
      if (statusFilter === 'inactive' && employee.isActive) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
        const email = employee.email.toLowerCase();
        const employeeNumber = employee.employeeNumber.toLowerCase();
        const department = employee.department.toLowerCase();

        if (
          !fullName.includes(searchLower) &&
          !email.includes(searchLower) &&
          !employeeNumber.includes(searchLower) &&
          !department.includes(searchLower)
        ) {
          return false;
        }
      }

      return true;
    });

    // Sort employees
    filteredEmployees.sort((a, b) => {
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
        case 'role':
          aValue = a.role.toLowerCase();
          bValue = b.role.toLowerCase();
          break;
        case 'department':
          aValue = a.department.toLowerCase();
          bValue = b.department.toLowerCase();
          break;
        case 'employeeNumber':
          aValue = a.employeeNumber.toLowerCase();
          bValue = b.employeeNumber.toLowerCase();
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

    return filteredEmployees;
  }, [roleFilter, statusFilter, sortBy, sortOrder, searchTerm]);

  const filters = useMemo(() => ({
    roleFilter,
    statusFilter,
    sortBy,
    sortOrder,
    searchTerm,
  }), [roleFilter, statusFilter, sortBy, sortOrder, searchTerm]);

  return {
    filters,
    setRoleFilter,
    setStatusFilter,
    setSortBy,
    setSortOrder,
    setSearchTerm,
    clearFilters,
    getFilteredAndSortedEmployees,
  };
};