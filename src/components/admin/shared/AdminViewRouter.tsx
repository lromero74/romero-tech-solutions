import React, { useState, useEffect } from 'react';
import {
  AdminOverview,
  AdminEmployees,
  AdminEmployeeCalendar,
  AdminClients,
  AdminBusinesses,
  AdminServices,
  AdminServiceRequests,
  AdminServiceLocations,
  AdminClosureReasons,
  AdminRoles,
  AdminPermissionManager,
  AdminSettings,
  AdminReports,
  AdminPasswordComplexity
} from '..';
import AdminPermissionAuditLog from '../AdminPermissionAuditLog';
import AdminRoleHierarchy from '../AdminRoleHierarchy';
import EditBusinessModal from '../AdminBusinesses_Modals/EditBusinessModal';
import AddBusinessModal from '../AdminBusinesses_Modals/AddBusinessModal';
import EditClientModal from '../AdminClients_Modals/EditClientModal';
import AddClientModal from '../AdminClients_Modals/AddClientModal';
// import EditEmployeeModal from '../AdminEmployees_Modals/EditEmployeeModal';
import EditServiceLocationModal from '../AdminServiceLocations_Modals/EditServiceLocationModal';
import AddServiceLocationModal from '../AdminServiceLocations_Modals/AddServiceLocationModal';
import { useAdminData, Business, Client, Employee, ServiceLocation } from '../../../contexts/AdminDataContext';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { useEmployeeFilters } from '../../../hooks/admin/useEmployeeFilters';
import { useClientFilters } from '../../../hooks/admin/useClientFilters';
import { useBusinessFilters } from '../../../hooks/admin/useBusinessFilters';
import { useServiceLocationFilters } from '../../../hooks/admin/useServiceLocationFilters';
import { useEntityCRUD } from '../../../hooks/admin/useEntityCRUD';
// import { openInMaps } from '../../../utils/admin/addressUtils';
import { adminService } from '../../../services/adminService';
import ConfirmationDialog from '../../common/ConfirmationDialog';
// import { AdminModalManager } from './AdminModalManager';
// import { useModalManager } from '../../../hooks/admin/useModalManager';

export type AdminView = 'overview' | 'employees' | 'employee-calendar' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'service-locations' | 'closure-reasons' | 'roles' | 'permissions' | 'permission-audit-log' | 'role-hierarchy' | 'reports' | 'settings' | 'password-complexity';

interface AdminViewRouterProps {
  currentView: AdminView;
  onLocationCountClick?: (businessName: string) => void;
  onClientCountClick?: (businessName: string) => void;
  onBusinessNameClick?: (businessName: string) => void;
  onShowAddServiceLocation?: () => void;
  // serviceLocationPrefillBusinessName?: string;
  serviceLocationFilters?: unknown;
  clientFilters?: unknown;
  businessFilters?: unknown;
  // External toggle state values
  externalShowInactiveClients?: boolean;
  externalShowSoftDeletedClients?: boolean;
  externalShowInactiveBusinesses?: boolean;
  externalShowSoftDeletedBusinesses?: boolean;
  externalShowInactiveServiceLocations?: boolean;
  externalShowSoftDeletedServiceLocations?: boolean;
  // Toggle setter functions from parent (optional - falls back to internal state)
  setShowInactiveClients?: (show: boolean) => void;
  setShowSoftDeletedClients?: (show: boolean) => void;
  setShowInactiveBusinesses?: (show: boolean) => void;
  setShowSoftDeletedBusinesses?: (show: boolean) => void;
  setShowInactiveServiceLocations?: (show: boolean) => void;
  setShowSoftDeletedServiceLocations?: (show: boolean) => void;
  // Modal handlers
  onOpenModal?: (modalName: string, entity?: unknown) => void;
}

export const AdminViewRouter: React.FC<AdminViewRouterProps> = ({
  currentView,
  onLocationCountClick,
  onClientCountClick,
  onBusinessNameClick,
  onShowAddServiceLocation,
  // serviceLocationPrefillBusinessName,
  serviceLocationFilters: serviceLocationFiltersProp,
  clientFilters: clientFiltersProp,
  businessFilters: businessFiltersProp,
  externalShowInactiveClients,
  externalShowSoftDeletedClients,
  // externalShowInactiveBusinesses,
  // externalShowSoftDeletedBusinesses,
  externalShowInactiveServiceLocations,
  externalShowSoftDeletedServiceLocations,
  setShowInactiveClients: externalSetShowInactiveClients,
  setShowSoftDeletedClients: externalSetShowSoftDeletedClients,
  // setShowInactiveBusinesses: externalSetShowInactiveBusinesses,
  // setShowSoftDeletedBusinesses: externalSetShowSoftDeletedBusinesses,
  setShowInactiveServiceLocations: externalSetShowInactiveServiceLocations,
  setShowSoftDeletedServiceLocations: externalSetShowSoftDeletedServiceLocations
}) => {
  const {
    dashboardData,
    employees,
    clients,
    businesses,
    services,
    serviceRequests,
    serviceLocations,
    loading,
    error,
    refreshAllData,
    refreshEmployees,
    refreshClients,
    refreshBusinesses,
    refreshOnlineStatus,
    setEmployees,
    // availableRoles
  } = useAdminData();

  // Get current user for authorization checks
  const { user, isAuthenticated } = useEnhancedAuth();

  // Refresh online status whenever the view changes (navigation) - only if authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      refreshOnlineStatus();
    }
  }, [currentView, refreshOnlineStatus, isAuthenticated, user]);

  // Initialize filter hooks - always call hooks to maintain hook order
  const employeeFilters = useEmployeeFilters();
  const defaultClientFilters = useClientFilters();
  const defaultBusinessFilters = useBusinessFilters();
  const defaultServiceLocationFilters = useServiceLocationFilters();

  // Use provided filters or fall back to defaults
  const clientFilters = clientFiltersProp || defaultClientFilters;
  const businessFilters = businessFiltersProp || defaultBusinessFilters;
  const serviceLocationFilters = serviceLocationFiltersProp || defaultServiceLocationFilters;

  // Initialize CRUD hooks
  const employeeCRUD = useEntityCRUD('employees');
  const clientCRUD = useEntityCRUD('clients');
  const businessCRUD = useEntityCRUD('businesses');
  const serviceCRUD = useEntityCRUD('services');
  const serviceRequestCRUD = useEntityCRUD('serviceRequests');
  const serviceLocationCRUD = useEntityCRUD('serviceLocations');

  // Get filtered data
  // const filteredEmployees = employeeFilters.getFilteredAndSortedEmployees(employees);
  // const filteredClients = clientFilters.getFilteredAndSortedClients(clients);
  // const filteredBusinesses = businessFilters.getFilteredAndSortedBusinesses(businesses, clients);
  // const filteredServiceLocations = serviceLocationFilters.getFilteredAndSortedServiceLocations(serviceLocations);

  // Business modal state
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);

  // Client modal state
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showAddClientModal, setShowAddClientModal] = useState(false);

  // Service Location modal state
  const [showEditServiceLocationModal, setShowEditServiceLocationModal] = useState(false);
  const [selectedServiceLocation, setSelectedServiceLocation] = useState(null);
  const [showAddServiceLocationModal, setShowAddServiceLocationModal] = useState(false);
  const [serviceLocationPrefillData, setServiceLocationPrefillData] = useState(null);

  // Employee modal state
  // const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  // const [selectedEmployee, setSelectedEmployee] = useState(null);

  // State to track service location context for user creation
  const [userCreationContext, setUserCreationContext] = useState<{
    businessId: string;
    serviceLocationId: string;
  } | null>(null);

  // Loading states for operations
  const [loadingClientOperations, setLoadingClientOperations] = useState<Record<string, boolean>>({});

  // Employee modal state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserData, setNewUserData] = useState({
    firstName: '',
    lastName: '',
    middleInitial: '',
    preferredName: '',
    pronouns: '',
    email: '',
    roles: [],
    photo: '',
    phone: '',
    address: {
      street: '',
      street2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA'
    },
    department: undefined,
    jobTitle: '',
    hireDate: '',
    employeeStatus: undefined,
    emergencyContact: {
      firstName: '',
      lastName: '',
      relationship: '',
      phone: '',
      email: ''
    }
  });

  // Business filter toggles state
  const [showInactiveBusinesses, setShowInactiveBusinesses] = useState(true);
  const [showSoftDeletedBusinesses, setShowSoftDeletedBusinesses] = useState(false);

  // Loading state for business operations
  const [loadingBusinessOperations, setLoadingBusinessOperations] = useState<Record<string, boolean>>({});
  // Loading state for employee operations
  const [loadingEmployeeOperations, setLoadingEmployeeOperations] = useState<Record<string, boolean>>({});
  // Loading state for service location operations
  const [loadingServiceLocationOperations, setLoadingServiceLocationOperations] = useState<Record<string, boolean>>({});

  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmButtonText?: string;
    confirmButtonColor?: 'red' | 'blue' | 'green';
    iconType?: 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Client filter toggles state
  const [showInactiveClients, setShowInactiveClients] = useState(true);
  const [showSoftDeletedClients, setShowSoftDeletedClients] = useState(false);

  // Service Location filter toggles state
  const [showInactiveServiceLocations, setShowInactiveServiceLocations] = useState(true);
  const [showSoftDeletedServiceLocations, setShowSoftDeletedServiceLocations] = useState(false);

  // Use external state/setters if provided, otherwise use internal state
  const currentShowInactiveClients = externalShowInactiveClients !== undefined ? externalShowInactiveClients : showInactiveClients;
  const currentShowSoftDeletedClients = externalShowSoftDeletedClients !== undefined ? externalShowSoftDeletedClients : showSoftDeletedClients;
  const currentShowInactiveServiceLocations = externalShowInactiveServiceLocations !== undefined ? externalShowInactiveServiceLocations : showInactiveServiceLocations;
  const currentShowSoftDeletedServiceLocations = externalShowSoftDeletedServiceLocations !== undefined ? externalShowSoftDeletedServiceLocations : showSoftDeletedServiceLocations;

  const setShowInactiveClientsFunc = externalSetShowInactiveClients || setShowInactiveClients;
  const setShowSoftDeletedClientsFunc = externalSetShowSoftDeletedClients || setShowSoftDeletedClients;
  const setShowInactiveServiceLocationsFunc = externalSetShowInactiveServiceLocations || setShowInactiveServiceLocations;
  const setShowSoftDeletedServiceLocationsFunc = externalSetShowSoftDeletedServiceLocations || setShowSoftDeletedServiceLocations;

  // Business modal handlers
  const handleEditBusiness = (business: unknown) => {
    setSelectedBusiness(business);
    setShowEditBusinessModal(true);
  };

  const handleCloseBusinessModal = () => {
    setShowEditBusinessModal(false);
    setSelectedBusiness(null);
  };

  const handleAddBusiness = () => {
    setShowAddBusinessModal(true);
  };

  const handleCloseAddBusinessModal = () => {
    setShowAddBusinessModal(false);
  };

  const handleCreateBusiness = async (businessData: unknown) => {
    try {
      await businessCRUD.createEntity(businessData);
      await refreshBusinesses();
      setShowAddBusinessModal(false);
    } catch (error) {
      console.error('Failed to create business:', error);
      throw error;
    }
  };

  const handleDeleteBusiness = (business: unknown) => {
    // Count related records that will be deleted
    const businessData = business as Business;
    const relatedServiceLocations = serviceLocations.filter(sl => sl.business_name === businessData.businessName);
    const relatedClients = clients.filter(client => client.businessName === businessData.businessName);

    const serviceLocationCount = relatedServiceLocations.length;
    const clientCount = relatedClients.length;

    // Create a detailed warning message
    let message = `⚠️ WARNING: This action cannot be undone!\n\nDeleting "${businessData.businessName}" will permanently remove:\n\n• The business record`;

    if (serviceLocationCount > 0) {
      message += `\n• ${serviceLocationCount} service location${serviceLocationCount !== 1 ? 's' : ''}`;
    }

    if (clientCount > 0) {
      message += `\n• ${clientCount} client${clientCount !== 1 ? 's' : ''}`;
    }

    message += '\n\nAll associated data will be permanently lost. Are you sure you want to continue?';

    setConfirmationDialog({
      isOpen: true,
      title: 'Permanently Delete Business',
      message,
      onConfirm: async () => {
        // Close the dialog immediately when user confirms
        setConfirmationDialog(prev => ({ ...prev, isOpen: false }));

        try {
          // Set loading state for this specific business to show spinner
          setLoadingBusinessOperations(prev => ({ ...prev, [businessData.id]: true }));

          console.log('🔴 Starting cascade delete for business:', businessData.businessName);

          // Delete related service locations first
          for (const serviceLocation of relatedServiceLocations) {
            try {
              await adminService.deleteServiceLocation(serviceLocation.id);
              console.log('Deleted service location:', serviceLocation.location_name);
            } catch (error) {
              console.error('Failed to delete service location:', serviceLocation.location_name, error);
            }
          }

          // Delete related clients
          for (const client of relatedClients) {
            try {
              await adminService.deleteUser(client.id, true); // hardDelete = true
              console.log('Deleted client:', client.firstName, client.lastName);
            } catch (error) {
              console.error('Failed to delete client:', client.firstName, client.lastName, error);
            }
          }

          // Finally delete the business
          await businessCRUD.deleteEntity(businessData.id);
          console.log('🔴 Deleted business:', businessData.businessName);

          // Refresh all data
          await refreshAllData();

        } catch (error) {
          console.error('Failed to delete business:', error);
          setConfirmationDialog({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete business. Please try again or contact support.',
            confirmButtonText: 'OK',
            onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
          });
        } finally {
          // Clear loading state for this specific business
          setLoadingBusinessOperations(prev => {
            const newState = { ...prev };
            delete newState[businessData.id];
            return newState;
          });
        }
      }
    });
  };

  const handleUpdateBusiness = async (businessId: string, updates: unknown) => {
    try {
      await businessCRUD.updateEntity(businessId, updates);
      setShowEditBusinessModal(false);
      setSelectedBusiness(null);
      await refreshAllData();
    } catch (error) {
      console.error('Failed to update business:', error);
      throw error;
    }
  };

  // Client modal handlers
  const handleEditClient = (client: unknown) => {
    setSelectedClient(client as Client);
    setShowEditClientModal(true);
  };

  const handleCloseClientModal = () => {
    setShowEditClientModal(false);
    setSelectedClient(null);
  };

  const handleAddClient = () => {
    setShowAddClientModal(true);
  };

  const handleCloseAddClientModal = () => {
    setShowAddClientModal(false);
  };

  const handleCreateClient = async (clientData: unknown) => {
    try {
      const result = await clientCRUD.createEntity(clientData);

      // If this client was created from service location modal, create location contact
      if (userCreationContext && result?.id) {
        try {
          await adminService.createLocationContact({
            service_location_id: userCreationContext.serviceLocationId,
            user_id: result.id,
            contact_role: 'contact',
            is_primary_contact: true, // First contact is primary
            notes: 'Added as first contact for this location'
          });
          console.log('Location contact relationship created successfully');
        } catch (contactError) {
          console.error('Failed to create location contact relationship:', contactError);
          // Don't throw here - user was created successfully, just log the contact relationship error
        }
      }

      setShowAddClientModal(false);
      setUserCreationContext(null); // Clear the context
      // Refresh client data if needed
    } catch (error) {
      console.error('Failed to create client:', error);
      throw error;
    }
  };

  const handleUpdateClient = async (clientId: string, updates: unknown) => {
    try {
      await clientCRUD.updateEntity(clientId, updates);
      setShowEditClientModal(false);
      setSelectedClient(null);
      // Refresh client data if needed
    } catch (error) {
      console.error('Failed to update client:', error);
      throw error;
    }
  };

  // Service Location modal handlers
  const handleEditServiceLocation = (location: unknown) => {
    setSelectedServiceLocation(location as ServiceLocation);
    setShowEditServiceLocationModal(true);
  };

  const handleCloseServiceLocationModal = () => {
    setShowEditServiceLocationModal(false);
    setSelectedServiceLocation(null);
  };

  // const handleAddServiceLocation = () => {
  //   setShowAddServiceLocationModal(true);
  // };

  const handleCloseAddServiceLocationModal = () => {
    setShowAddServiceLocationModal(false);
    setServiceLocationPrefillData(null);
  };

  const handleOpenServiceLocationModalFromBusiness = (businessName: string, address: { street: string; city: string; state: string; zipCode: string; country?: string; }) => {
    setServiceLocationPrefillData({ businessName, address });
    setShowAddServiceLocationModal(true);
  };

  // const handleOpenAddUserModalFromServiceLocation = (businessId: string, serviceLocationId?: string) => {
  //   if (serviceLocationId) {
  //     setUserCreationContext({ businessId, serviceLocationId });
  //   }
  //   setShowAddClientModal(true);
  // };

  const handleCreateServiceLocation = async (locationData: unknown) => {
    try {
      const result = await serviceLocationCRUD.createEntity(locationData);
      setShowAddServiceLocationModal(false);
      // Refresh service location data
      await refreshAllData();
      return result;
    } catch (error) {
      console.error('Failed to create service location:', error);
      throw error;
    }
  };

  const handleUpdateServiceLocation = async (locationId: string, updates: unknown) => {
    try {
      await serviceLocationCRUD.updateEntity(locationId, updates);
      setShowEditServiceLocationModal(false);
      setSelectedServiceLocation(null);
      // Refresh service location data
      await refreshAllData();
    } catch (error) {
      console.error('Failed to update service location:', error);
      throw error;
    }
  };

  // Employee modal handlers - commented out as they are not currently used
  // const handleEditEmployee = (employee: unknown) => {
  //   setSelectedEmployee(employee as Employee);
  //   setShowEditEmployeeModal(true);
  // };

  // const handleCloseEditEmployeeModal = () => {
  //   setShowEditEmployeeModal(false);
  //   setSelectedEmployee(null);
  // };

  // const handleSubmitEditEmployee = async (employeeData: unknown) => {
  //   try {
  //     const empData = employeeData as Employee;
  //     await handleUpdateEmployee(empData.id, employeeData);
  //     setShowEditEmployeeModal(false);
  //     setSelectedEmployee(null);
  //   } catch (error) {
  //     console.error('Failed to update employee:', error);
  //     throw error;
  //   }
  // };

  // const handleEmployeeChange = (employee: unknown) => {
  //   setSelectedEmployee(employee as Employee);
  // };

  // Wrapper function to update employee (WebSocket will handle real-time updates)
  const handleUpdateEmployee = async (employeeId: string, updates: unknown) => {
    try {
      await employeeCRUD.updateEntity(employeeId, updates);
      // No need to refresh - WebSocket will broadcast the update to all admins
      console.log('✅ Employee updated, waiting for WebSocket broadcast...');
    } catch (error) {
      console.error('Failed to update employee:', error);
      throw error;
    }
  };

  // Employee delete handlers
  const handleSoftDeleteEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const shouldRestore = empData.softDelete; // If currently deleted, restore it
      // const actionType = shouldRestore ? 'restore' : 'soft delete'; // Unused variable
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: shouldRestore ? 'Confirm Employee Restore' : 'Confirm Employee Soft Delete',
        message: shouldRestore
          ? `Are you sure you want to restore "${entityName}"? They will be able to access the system again.`
          : `Are you sure you want to soft delete "${entityName}"? They will be moved to inactive status but data will be preserved.`,
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));
            console.log(`🔄 Soft ${shouldRestore ? 'restoring' : 'deleting'} employee:`, empData.employeeNumber, empData.firstName, empData.lastName);
            console.log('Current softDelete status:', empData.softDelete);

            await adminService.softDeleteUser(empData.id, shouldRestore);
            console.log('✅ Soft delete API call completed, waiting for WebSocket broadcast...');

            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to soft delete employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee soft delete:', error);
    }
  };

  const handleHardDeleteEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Permanent Employee Deletion',
        message: `Are you sure you want to permanently delete "${entityName}"? This action cannot be undone and will remove all employee data including records, assignments, and history.`,
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));
            await adminService.deleteUser(empData.id);
            console.log('✅ Hard delete API call completed, waiting for WebSocket broadcast...');
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to hard delete employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee hard delete:', error);
    }
  };

  const handleTerminateEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;

      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Employee Termination',
        message: `Are you sure you want to terminate "${entityName}"? This will set their employment status to terminated and they will no longer be able to access the system.`,
        onConfirm: async () => {
          try {
            // Prevent self-termination
            if (user && empData.id === user.id) {
              console.warn('Cannot terminate your own account');
              return;
            }

            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));

            const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

            // Update employment status to terminated, set inactive, and record termination date
            await employeeCRUD.updateEntity(empData.id, {
              employeeStatus: 'terminated',
              isActive: false,
              terminationDate: today
            });
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to terminate employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee termination:', error);
    }
  };

  const handleRehireEmployee = async (employee: unknown) => {
    try {
      const empData = employee as Employee;
      const entityName = `${empData.firstName} ${empData.lastName}`;
      setConfirmationDialog({
        isOpen: true,
        title: 'Confirm Employee Rehire',
        message: `Are you sure you want to rehire "${entityName}"? This will update their employment status to active, set their hire date to today, and clear any termination date.`,
        confirmButtonText: 'Rehire Employee',
        confirmButtonColor: 'green',
        iconType: 'success',
        onConfirm: async () => {
          try {
            // Set loading state for this specific employee
            setLoadingEmployeeOperations(prev => ({ ...prev, [empData.id]: true }));

            const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

            // Update employment status to active, set new hire date, clear termination date
            await employeeCRUD.updateEntity(empData.id, {
              employeeStatus: 'active',
              hireDate: today,
              terminationDate: null,
              isActive: true
            });
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Failed to rehire employee:', error);
          } finally {
            // Clear loading state for this specific employee
            setLoadingEmployeeOperations(prev => {
              const newState = { ...prev };
              delete newState[empData.id];
              return newState;
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to prepare employee rehire:', error);
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'overview':
        return (
          <AdminOverview
            dashboardData={dashboardData}
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'employees':
        return (
          <AdminEmployees
            employees={employees}
            // Filter props (matching old interface)
            employeeRoleFilter={employeeFilters.filters.roleFilter}
            setEmployeeRoleFilter={employeeFilters.setRoleFilter}
            employeeStatusFilter={employeeFilters.filters.statusFilter}
            setEmployeeStatusFilter={employeeFilters.setStatusFilter}
            employeeSortBy={employeeFilters.filters.sortBy}
            setEmployeeSortBy={employeeFilters.setSortBy}
            employeeSortOrder={employeeFilters.filters.sortOrder}
            setEmployeeSortOrder={employeeFilters.setSortOrder}
            employeeSearchTerm={employeeFilters.filters.searchTerm}
            setEmployeeSearchTerm={employeeFilters.setSearchTerm}
            getFilteredAndSortedEmployees={() => employeeFilters.getFilteredAndSortedEmployees(employees)}
            clearEmployeeFilters={employeeFilters.clearFilters}
            // Form state
            showAddUserForm={showAddUserForm}
            setShowAddUserForm={setShowAddUserForm}
            newUserData={newUserData}
            setNewUserData={setNewUserData}
            // Handlers
            toggleUserStatus={async (userId: string, statusType: 'active' | 'vacation' | 'sick' | 'other') => {
              try {
                // Find the employee to get current status
                const employee = employees.find(emp => emp.id === userId);
                if (!employee) {
                  throw new Error('Employee not found');
                }

                let updates: {
                  isActive?: boolean;
                  isOnVacation?: boolean;
                  isOutSick?: boolean;
                  isOnOtherLeave?: boolean;
                } = {};

                switch (statusType) {
                  case 'active':
                    // Toggle isActive and clear all leave statuses when activating
                    updates = {
                      isActive: !employee.isActive,
                      isOnVacation: false,
                      isOutSick: false,
                      isOnOtherLeave: false
                    };
                    break;
                  case 'vacation':
                    // Toggle vacation status and clear other leave types
                    updates = {
                      isOnVacation: !employee.isOnVacation,
                      isOutSick: false,
                      isOnOtherLeave: false
                    };
                    break;
                  case 'sick':
                    // Toggle sick status and clear other leave types
                    updates = {
                      isOutSick: !employee.isOutSick,
                      isOnVacation: false,
                      isOnOtherLeave: false
                    };
                    break;
                  case 'other':
                    // Toggle other leave status and clear other leave types
                    updates = {
                      isOnOtherLeave: !employee.isOnOtherLeave,
                      isOnVacation: false,
                      isOutSick: false
                    };
                    break;
                }

                // Optimistic update - update local state immediately for instant UI feedback
                setEmployees(prevEmployees =>
                  prevEmployees.map(emp =>
                    emp.id === userId ? { ...emp, ...updates } : emp
                  )
                );

                // Send to backend (WebSocket will confirm/correct if needed)
                await employeeCRUD.updateEntity(userId, updates);
              } catch (error) {
                console.error('Failed to toggle user status:', error);
                // Rollback optimistic update on error
                await refreshEmployees();
                throw error;
              }
            }}
            handleAddUser={async (e) => {
              e.preventDefault();
              try {
                // Transform the data to match the API expectations
                const userData = {
                  ...newUserData,
                  name: `${newUserData.firstName} ${newUserData.lastName}`.trim(),
                  userType: 'employee'
                };
                await employeeCRUD.createEntity(userData);
                setShowAddUserForm(false);
                // Reset form data
                setNewUserData({
                  firstName: '',
                  lastName: '',
                  middleInitial: '',
                  preferredName: '',
                  pronouns: '',
                  email: '',
                  roles: [],
                  photo: '',
                  phone: '',
                  address: {
                    street: '',
                    street2: '',
                    city: '',
                    state: '',
                    zipCode: '',
                    country: 'USA'
                  },
                  department: undefined,
                  jobTitle: '',
                  hireDate: '',
                  employeeStatus: undefined,
                  emergencyContact: {
                    firstName: '',
                    lastName: '',
                    relationship: '',
                    phone: '',
                    email: ''
                  }
                });
              } catch (error) {
                console.error('Failed to add employee:', error);
                throw error;
              }
            }}
            updateEmployee={handleUpdateEmployee}
            currentUser={user}
            onSoftDeleteEmployee={handleSoftDeleteEmployee}
            onHardDeleteEmployee={handleHardDeleteEmployee}
            onTerminateEmployee={handleTerminateEmployee}
            onRehireEmployee={handleRehireEmployee}
            loadingEmployeeOperations={loadingEmployeeOperations}
          />
        );

      case 'employee-calendar':
        return (
          <AdminEmployeeCalendar
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'clients':
        return (
          <AdminClients
            clients={clients}
            businesses={businesses}
            // Filter props (matching old interface)
            clientStatusFilter={clientFilters.filters.statusFilter}
            setClientStatusFilter={clientFilters.setStatusFilter}
            clientBusinessFilter={clientFilters.filters.businessFilter}
            setClientBusinessFilter={clientFilters.setBusinessFilter}
            clientSearchTerm={clientFilters.filters.searchTerm}
            setClientSearchTerm={clientFilters.setSearchTerm}
            clientSortBy={clientFilters.filters.sortBy}
            setClientSortBy={clientFilters.setSortBy}
            clientSortOrder={clientFilters.filters.sortOrder}
            setClientSortOrder={clientFilters.setSortOrder}
            clearClientFilters={clientFilters.clearFilters}
            toggleUserStatus={async (userId: string, statusType: 'active' | 'vacation' | 'sick') => {
              try {
                // Set loading state for this specific client
                setLoadingClientOperations(prev => ({ ...prev, [userId]: true }));

                // Find the client to check if it's soft deleted
                const client = clients.find(c => c.id === userId);
                if (!client) {
                  throw new Error('Client not found');
                }

                // Prevent activating soft-deleted clients
                if (statusType === 'active' && client.softDelete) {
                  console.warn('Cannot activate soft-deleted client');
                  setConfirmationDialog({
                    isOpen: true,
                    title: 'Cannot Activate Client',
                    message: 'Cannot activate soft-deleted client. Please restore the client first.',
                    onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                  });
                  return;
                }

                // Prevent activating clients whose parent business is soft deleted
                if (statusType === 'active') {
                  const parentBusiness = businesses.find(b => b.businessName === client.businessName);
                  if (parentBusiness?.softDelete) {
                    console.warn('Cannot activate client: parent business is soft deleted');
                    setConfirmationDialog({
                      isOpen: true,
                      title: 'Cannot Activate Client',
                      message: 'Cannot activate client: parent business is soft deleted. Please restore the business first.',
                      onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                    });
                    return;
                  }
                }

                const isActive = statusType === 'active';
                await clientCRUD.updateEntity(userId, { isActive });
                await refreshClients();
              } catch (error) {
                console.error('Failed to toggle client status:', error);
                throw error;
              } finally {
                // Clear loading state for this specific client
                setLoadingClientOperations(prev => {
                  const newState = { ...prev };
                  delete newState[userId];
                  return newState;
                });
              }
            }}
            getFilteredAndSortedClients={() => {
              // First apply the hook's filtering logic
              const hookFiltered = clientFilters.getFilteredAndSortedClients(clients);
              // Then apply the toggle filters
              const finalFiltered = hookFiltered.filter(client => {
                // Filter by show inactive toggle
                if (!currentShowInactiveClients && !client.isActive) {
                  return false;
                }
                // Filter by show soft deleted toggle
                if (!currentShowSoftDeletedClients && client.softDelete) {
                  return false;
                }
                return true;
              });
              return finalFiltered;
            }}
            // CRUD handlers
            onAddClient={handleAddClient}
            onEditClient={handleEditClient}
            onDeleteClient={async (client) => {
              try {
                // Set loading state for this specific client
                setLoadingClientOperations(prev => ({ ...prev, [client.id]: true }));
                await clientCRUD.deleteEntity(client.id);
                // Clear loading state BEFORE refreshing to avoid race condition
                setLoadingClientOperations(prev => {
                  const newState = { ...prev };
                  delete newState[client.id];
                  return newState;
                });
                await refreshClients();
              } catch (error) {
                console.error('Failed to delete client:', error);
                // Clear loading state on error
                setLoadingClientOperations(prev => {
                  const newState = { ...prev };
                  delete newState[client.id];
                  return newState;
                });
                throw error;
              }
            }}
            onSoftDeleteClient={async (client) => {
              try {
                // Set loading state for this specific client
                setLoadingClientOperations(prev => ({ ...prev, [client.id]: true }));

                const shouldRestore = client.softDelete; // If currently deleted, restore it

                // If trying to restore, check if parent business is soft deleted
                if (shouldRestore) {
                  const parentBusiness = businesses.find(b => b.businessName === client.businessName);
                  if (parentBusiness?.softDelete) {
                    console.warn('Cannot restore client: parent business is soft deleted');
                    setConfirmationDialog({
                      isOpen: true,
                      title: 'Cannot Restore Client',
                      message: 'Cannot restore client: parent business is soft deleted. Please restore the business first.',
                      onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                    });
                    return;
                  }
                }

                // Use the dedicated soft delete method (now handles both soft_delete and is_active fields)
                await adminService.softDeleteUser(client.id, shouldRestore);

                // If we just soft deleted (not restoring), automatically show soft deleted items so user can see the result
                if (!shouldRestore) {
                  setShowSoftDeletedClientsFunc(true);
                }

                await refreshClients();
              } catch (error) {
                console.error('Failed to soft delete client:', error);
                throw error;
              } finally {
                // Clear loading state for this specific client
                setLoadingClientOperations(prev => {
                  const newState = { ...prev };
                  delete newState[client.id];
                  return newState;
                });
              }
            }}
            // Show/hide filters
            showInactiveClients={currentShowInactiveClients}
            toggleShowInactiveClients={() => setShowInactiveClientsFunc(!currentShowInactiveClients)}
            showSoftDeletedClients={currentShowSoftDeletedClients}
            toggleShowSoftDeletedClients={() => setShowSoftDeletedClientsFunc(!currentShowSoftDeletedClients)}
            onBusinessNameClick={onBusinessNameClick}
            loadingClientOperations={loadingClientOperations}
          />
        );

      case 'businesses': {
        // Remove duplicates first, then enhance businesses with correct location counts
        const uniqueBusinesses = businesses.filter((business, index, array) => {
          return array.findIndex(b => b.id === business.id) === index;
        });

        const enhancedBusinesses = uniqueBusinesses.map(business => {
          const locationCount = serviceLocations.filter(location =>
            location.business_name === business.businessName
          ).length;

          // Enhanced location count calculation working!

          // For soft deleted businesses, also preserve their original address if the new one has null values
          const enhancedBusiness = {
            ...business,
            locationCount
          };

          // Fix null address values for soft deleted businesses
          if (business.softDelete && business.address) {
            const hasNullAddressFields = Object.values(business.address).some(value => value === null);
            if (hasNullAddressFields) {
              // Get address from service locations
              const businessLocations = serviceLocations.filter(location =>
                location.business_name === business.businessName
              );
              if (businessLocations.length > 0) {
                const firstLocation = businessLocations[0];
                enhancedBusiness.address = {
                  street: firstLocation.street || business.address.street,
                  city: firstLocation.city || business.address.city,
                  state: firstLocation.state || business.address.state,
                  zipCode: firstLocation.zip_code || business.address.zipCode,
                  country: firstLocation.country || business.address.country
                };
              }
            }
          }

          return enhancedBusiness;
        });

        return (
          <AdminBusinesses
            businesses={enhancedBusinesses}
            clients={clients}
            // Filter props (matching old interface)
            businessStatusFilter={businessFilters.filters.statusFilter}
            setBusinessStatusFilter={businessFilters.setStatusFilter}
            businessSearchTerm={businessFilters.filters.searchTerm}
            setBusinessSearchTerm={businessFilters.setSearchTerm}
            businessSortBy={businessFilters.filters.sortBy}
            setBusinessSortBy={businessFilters.setSortBy}
            businessSortOrder={businessFilters.filters.sortOrder}
            setBusinessSortOrder={businessFilters.setSortOrder}
            businessNameFilter={businessFilters.filters.businessNameFilter}
            setBusinessNameFilter={businessFilters.setBusinessNameFilter}
            businessClientCountFilter={businessFilters.filters.clientCountFilter}
            setBusinessClientCountFilter={businessFilters.setClientCountFilter}
            clearBusinessFilters={businessFilters.clearFilters}
            // Loading state
            loadingBusinessOperations={loadingBusinessOperations}
            getFilteredAndSortedBusinesses={() => {
              // IMPORTANT: Use enhancedBusinesses instead of original businesses
              // First apply the hook's filtering logic to ENHANCED data
              const hookFiltered = businessFilters.getFilteredAndSortedBusinesses(enhancedBusinesses, clients);


              // Then apply the toggle filters
              const finalFiltered = hookFiltered.filter(business => {
                // Filter by show inactive toggle
                if (!showInactiveBusinesses && !business.isActive) {
                  return false;
                }

                // Filter by show soft deleted toggle
                if (!showSoftDeletedBusinesses && business.softDelete) {
                  return false;
                }

                return true;
              });

              return finalFiltered;
            }}
            // CRUD handlers
            onAddBusiness={handleAddBusiness}
            onEditBusiness={handleEditBusiness}
            onDeleteBusiness={(business) => handleDeleteBusiness(business)}
            onSoftDeleteBusiness={async (business) => {
              try {
                // Set loading state for this specific business
                setLoadingBusinessOperations(prev => ({ ...prev, [business.id]: true }));

                // Use the dedicated soft delete method instead of general update
                const shouldRestore = business.softDelete; // If currently deleted, restore it
                await adminService.softDeleteBusiness(business.id, shouldRestore);

                // Also update the active status: inactive when soft deleting, active when restoring
                const newActiveStatus = shouldRestore; // If restoring, set to active; if deleting, set to inactive
                await businessCRUD.updateEntity(business.id, {
                  businessName: business.businessName,
                  isActive: newActiveStatus
                });

                // Cascade active status changes to related clients and service locations
                const relatedClients = clients.filter(client => client.businessName === business.businessName);
                const relatedServiceLocations = serviceLocations.filter(location => location.business_name === business.businessName);

                // Update all related clients' active status
                const clientUpdates = relatedClients.map(client =>
                  clientCRUD.updateEntity(client.id, { isActive: newActiveStatus })
                );

                // Update all related service locations' active status
                const serviceLocationUpdates = relatedServiceLocations.map(location =>
                  serviceLocationCRUD.updateEntity(location.id, { is_active: newActiveStatus })
                );

                // Wait for all related entity updates to complete
                await Promise.all([...clientUpdates, ...serviceLocationUpdates]);

                // If we just soft deleted (not restoring), automatically show soft deleted items so user can see the result
                if (!shouldRestore) {
                  setShowSoftDeletedBusinesses(true);
                }

                await refreshAllData();
              } catch (error) {
                console.error('Failed to soft delete business:', error);
                throw error;
              } finally {
                // Clear loading state for this specific business
                setLoadingBusinessOperations(prev => {
                  const newState = { ...prev };
                  delete newState[business.id];
                  return newState;
                });
              }
            }}
            toggleBusinessStatus={async (businessId: string, statusType: 'active' | 'inactive') => {
              try {
                // Set loading state for this specific business
                setLoadingBusinessOperations(prev => ({ ...prev, [businessId]: true }));

                // Find the business to get the required businessName and check if soft deleted
                const business = businesses.find(b => b.id === businessId);
                if (!business) {
                  throw new Error('Business not found');
                }

                // Prevent activating soft-deleted businesses
                if (statusType === 'active' && business.softDelete) {
                  console.warn('Cannot activate soft-deleted business');
                  // Clear loading state before returning
                  setLoadingBusinessOperations(prev => {
                    const newState = { ...prev };
                    delete newState[businessId];
                    return newState;
                  });
                  return;
                }

                const isActive = statusType === 'active';
                await businessCRUD.updateEntity(businessId, {
                  businessName: business.businessName,
                  isActive
                });
                await refreshAllData();
              } catch (error) {
                console.error('Failed to toggle business status:', error);
                throw error;
              } finally {
                // Clear loading state for this specific business
                setLoadingBusinessOperations(prev => {
                  const newState = { ...prev };
                  delete newState[businessId];
                  return newState;
                });
              }
            }}
            // Click handlers
            onClientCountClick={onClientCountClick ? (businessId, businessName) => {
              onClientCountClick(businessName);
            } : undefined}
            onLocationCountClick={onLocationCountClick}
            // Show/hide filters
            showInactiveBusinesses={showInactiveBusinesses}
            toggleShowInactiveBusinesses={() => setShowInactiveBusinesses(!showInactiveBusinesses)}
            showSoftDeletedBusinesses={showSoftDeletedBusinesses}
            toggleShowSoftDeletedBusinesses={() => setShowSoftDeletedBusinesses(!showSoftDeletedBusinesses)}
          />
        );
      }

      case 'services':
        return (
          <AdminServices
            services={services}
            loading={loading}
            error={error}
            selectedService={serviceCRUD.selectedEntity}
            onSelectService={serviceCRUD.setSelectedEntity}
            onRefresh={refreshAllData}
          />
        );

      case 'service-requests':
        return (
          <AdminServiceRequests
            serviceRequests={serviceRequests}
            clients={clients}
            services={services}
            employees={employees}
            loading={loading}
            error={error}
            selectedServiceRequest={serviceRequestCRUD.selectedEntity}
            onSelectServiceRequest={serviceRequestCRUD.setSelectedEntity}
            onRefresh={refreshAllData}
          />
        );

      case 'closure-reasons':
        return <AdminClosureReasons />;

      case 'service-locations':
        return (
          <AdminServiceLocations
            serviceLocations={serviceLocations}
            businesses={businesses}
            onEditServiceLocation={handleEditServiceLocation}
            onDeleteServiceLocation={(location) => {
              setConfirmationDialog({
                isOpen: true,
                title: 'Permanently Delete Service Location',
                message: `⚠️ WARNING: This action cannot be undone!\n\nDeleting service location "${location.location_name || location.address_label}" will permanently remove all associated data.\n\nAre you sure you want to continue?`,
                confirmButtonText: 'Continue',
                cancelButtonText: 'Cancel',
                confirmButtonColor: 'red' as const,
                onConfirm: async () => {
                  try {
                    await serviceLocationCRUD.deleteEntity(location.id);
                    await refreshAllData();
                    setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
                  } catch (error) {
                    console.error('Failed to delete service location:', error);
                    setConfirmationDialog({
                      isOpen: true,
                      title: 'Delete Failed',
                      message: 'Failed to delete service location. Please try again or contact support.',
                      confirmButtonText: 'OK',
                      onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                    });
                  }
                }
              });
            }}
            onSoftDeleteServiceLocation={async (location) => {
              try {
                // Set loading state for this specific service location
                setLoadingServiceLocationOperations(prev => ({ ...prev, [location.id]: true }));

                const shouldRestore = location.soft_delete; // If currently deleted, restore it

                // If trying to restore, check if parent business is soft deleted
                if (shouldRestore) {
                  const parentBusiness = businesses.find(b => b.businessName === location.business_name);
                  if (parentBusiness?.softDelete) {
                    console.warn('Cannot restore service location: parent business is soft deleted');
                    setConfirmationDialog({
                      isOpen: true,
                      title: 'Cannot Restore Service Location',
                      message: 'Cannot restore service location: parent business is soft deleted. Please restore the business first.',
                      onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                    });
                    // Clear loading state before returning
                    setLoadingServiceLocationOperations(prev => {
                      const newState = { ...prev };
                      delete newState[location.id];
                      return newState;
                    });
                    return;
                  }
                }

                // Use the dedicated soft delete method instead of general update
                await adminService.softDeleteServiceLocation(location.id, shouldRestore);

                // Also update the active status: inactive when soft deleting, active when restoring
                const newActiveStatus = shouldRestore; // If restoring, set to active; if deleting, set to inactive
                await serviceLocationCRUD.updateEntity(location.id, { is_active: newActiveStatus });

                // If we just soft deleted (not restoring), automatically show soft deleted items so user can see the result
                if (!shouldRestore) {
                  setShowSoftDeletedServiceLocationsFunc(true);
                }

                await refreshAllData();
              } catch (error) {
                console.error('Failed to soft delete service location:', error);
                throw error;
              } finally {
                // Clear loading state for this specific service location
                setLoadingServiceLocationOperations(prev => {
                  const newState = { ...prev };
                  delete newState[location.id];
                  return newState;
                });
              }
            }}
            onAddServiceLocation={onShowAddServiceLocation}
            toggleServiceLocationStatus={async (locationId: string, statusType: 'active' | 'inactive') => {
              try {
                // Set loading state for this specific service location
                setLoadingServiceLocationOperations(prev => ({ ...prev, [locationId]: true }));

                // Find the service location to check if it's soft deleted
                const location = serviceLocations.find(l => l.id === locationId);
                if (!location) {
                  throw new Error('Service location not found');
                }

                // Prevent activating soft-deleted service locations
                if (statusType === 'active' && location.soft_delete) {
                  console.warn('Cannot activate soft-deleted service location');
                  setConfirmationDialog({
                    isOpen: true,
                    title: 'Cannot Activate Service Location',
                    message: 'Cannot activate soft-deleted service location. Please restore the service location first.',
                    onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                  });
                  // Clear loading state before returning
                  setLoadingServiceLocationOperations(prev => {
                    const newState = { ...prev };
                    delete newState[locationId];
                    return newState;
                  });
                  return;
                }

                // Prevent activating service locations whose parent business is soft deleted
                if (statusType === 'active') {
                  const parentBusiness = businesses.find(b => b.businessName === location.business_name);
                  if (parentBusiness?.softDelete) {
                    console.warn('Cannot activate service location: parent business is soft deleted');
                    setConfirmationDialog({
                      isOpen: true,
                      title: 'Cannot Activate Service Location',
                      message: 'Cannot activate service location: parent business is soft deleted. Please restore the business first.',
                      onConfirm: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))
                    });
                    // Clear loading state before returning
                    setLoadingServiceLocationOperations(prev => {
                      const newState = { ...prev };
                      delete newState[locationId];
                      return newState;
                    });
                    return;
                  }
                }

                const isActive = statusType === 'active';
                await serviceLocationCRUD.updateEntity(locationId, { is_active: isActive });
                await refreshAllData();
              } catch (error) {
                console.error('Failed to toggle service location status:', error);
                throw error;
              } finally {
                // Clear loading state for this specific service location
                setLoadingServiceLocationOperations(prev => {
                  const newState = { ...prev };
                  delete newState[locationId];
                  return newState;
                });
              }
            }}
            // Filter props (matching old interface)
            serviceLocationBusinessFilter={serviceLocationFilters.filters.businessFilter}
            setServiceLocationBusinessFilter={serviceLocationFilters.setBusinessFilter}
            serviceLocationStatusFilter={serviceLocationFilters.filters.statusFilter}
            setServiceLocationStatusFilter={serviceLocationFilters.setStatusFilter}
            serviceLocationSearchTerm={serviceLocationFilters.filters.searchTerm}
            setServiceLocationSearchTerm={serviceLocationFilters.setSearchTerm}
            serviceLocationLocationTypeFilter={serviceLocationFilters.filters.locationTypeFilter}
            setServiceLocationLocationTypeFilter={serviceLocationFilters.setLocationTypeFilter}
            serviceLocationSortBy={serviceLocationFilters.filters.sortBy}
            setServiceLocationSortBy={serviceLocationFilters.setSortBy}
            serviceLocationSortOrder={serviceLocationFilters.filters.sortOrder}
            setServiceLocationSortOrder={serviceLocationFilters.setSortOrder}
            clearServiceLocationFilters={serviceLocationFilters.clearFilters}
            getFilteredAndSortedServiceLocations={() => {
              // First apply the hook's filtering logic
              const hookFiltered = serviceLocationFilters.getFilteredAndSortedServiceLocations(serviceLocations);
              // Then apply the toggle filters
              const finalFiltered = hookFiltered.filter(location => {
                // Filter by show inactive toggle
                if (!currentShowInactiveServiceLocations && !location.is_active) {
                  return false;
                }
                // Filter by show soft deleted toggle
                if (!currentShowSoftDeletedServiceLocations && location.soft_delete) {
                  return false;
                }
                return true;
              });
              return finalFiltered;
            }}
            // Show/hide filters
            showInactiveServiceLocations={currentShowInactiveServiceLocations}
            toggleShowInactiveServiceLocations={() => setShowInactiveServiceLocationsFunc(!currentShowInactiveServiceLocations)}
            showSoftDeletedServiceLocations={currentShowSoftDeletedServiceLocations}
            toggleShowSoftDeletedServiceLocations={() => setShowSoftDeletedServiceLocationsFunc(!currentShowSoftDeletedServiceLocations)}
            onBusinessNameClick={onBusinessNameClick}
            loadingServiceLocationOperations={loadingServiceLocationOperations}
          />
        );

      case 'roles':
        return (
          <AdminRoles
            employees={employees}
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'permissions':
        return <AdminPermissionManager />;

      case 'permission-audit-log':
        return <AdminPermissionAuditLog />;

      case 'role-hierarchy':
        return <AdminRoleHierarchy />;

      case 'reports':
        return (
          <AdminReports
            dashboardData={dashboardData}
            employees={employees}
            clients={clients}
            businesses={businesses}
            services={services}
            serviceRequests={serviceRequests}
            serviceLocations={serviceLocations}
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'settings':
        return (
          <AdminSettings
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'password-complexity':
        return (
          <AdminPasswordComplexity
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      default:
        return (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">
              Unknown view: {currentView}
            </div>
          </div>
        );
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 dark:text-red-400 text-center">
          <p className="text-lg font-medium">Error Loading Data</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={refreshAllData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderCurrentView()}

      {/* Business Edit Modal */}
      <EditBusinessModal
        showModal={showEditBusinessModal}
        business={selectedBusiness}
        onClose={handleCloseBusinessModal}
        onSubmit={handleUpdateBusiness}
      />

      {/* Add Business Modal */}
      <AddBusinessModal
        showModal={showAddBusinessModal}
        onClose={handleCloseAddBusinessModal}
        onSubmit={handleCreateBusiness}
        businesses={businesses}
        onOpenServiceLocationModal={handleOpenServiceLocationModalFromBusiness}
      />

      {/* Client Edit Modal */}
      <EditClientModal
        showModal={showEditClientModal}
        client={selectedClient}
        onClose={handleCloseClientModal}
        onSubmit={handleUpdateClient}
      />

      {/* Add Client Modal */}
      <AddClientModal
        showModal={showAddClientModal}
        onClose={handleCloseAddClientModal}
        onSubmit={handleCreateClient}
      />

      {/* Service Location Edit Modal */}
      <EditServiceLocationModal
        showModal={showEditServiceLocationModal}
        serviceLocation={selectedServiceLocation}
        onClose={handleCloseServiceLocationModal}
        onSubmit={handleUpdateServiceLocation}
      />

      {/* Add Service Location Modal */}
      <AddServiceLocationModal
        showModal={showAddServiceLocationModal}
        onClose={handleCloseAddServiceLocationModal}
        onSubmit={handleCreateServiceLocation}
        businesses={businesses}
        prefillBusinessName={serviceLocationPrefillData?.businessName}
        prefillAddress={serviceLocationPrefillData?.address}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        onClose={() => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationDialog.onConfirm}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
        confirmButtonText={confirmationDialog.confirmButtonText || "Continue"}
        cancelButtonText="Cancel"
        confirmButtonColor={confirmationDialog.confirmButtonColor || "red"}
        iconType={confirmationDialog.iconType || "warning"}
      />
    </>
  );
};