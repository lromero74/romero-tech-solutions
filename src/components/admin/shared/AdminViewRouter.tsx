import React, { useState } from 'react';
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
  AdminServiceHourRates,
  AdminReports,
  AdminPasswordComplexity
} from '..';
import AdminQuotaManagement from '../AdminQuotaManagement';
import AdminClientFileBrowser from '../AdminClientFileBrowser';
import AdminInvoices from '../AdminInvoices';
import WorkflowConfiguration from '../WorkflowConfiguration';
import AdminPricingSettings from '../AdminPricingSettings';
import AdminPermissionAuditLog from '../AdminPermissionAuditLog';
import AdminRoleHierarchy from '../AdminRoleHierarchy';
import FilterPresetManager from '../FilterPresetManager';
import AdminTestimonials from '../AdminTestimonials';
import AdminRatingQuestions from '../AdminRatingQuestions';
import AgentDashboard from '../AgentDashboard';
import AgentDetails from '../AgentDetails';
import AgentRegistrationModal from '../AgentRegistrationModal';
import TrialAgentsDashboard from '../TrialAgentsDashboard';
import TrialConversionModal from '../TrialConversionModal';
import AlertConfigurationManager from '../AlertConfigurationManager';
import AlertHistoryDashboard from '../AlertHistoryDashboard';
import AlertSubscriptionManager from '../AlertSubscriptionManager';
import AlertNotificationLogs from '../AlertNotificationLogs';
import EscalationPolicyManager from '../EscalationPolicyManager';
import PolicyAutomationDashboard from '../PolicyAutomationDashboard';
import SoftwareDeploymentDashboard from '../SoftwareDeploymentDashboard';
import SubscriptionPricing from '../../../pages/admin/SubscriptionPricing';
import EditBusinessModal from '../AdminBusinesses_Modals/EditBusinessModal';
import AddBusinessModal from '../AdminBusinesses_Modals/AddBusinessModal';
import EditClientModal from '../AdminClients_Modals/EditClientModal';
import AddClientModal from '../AdminClients_Modals/AddClientModal';
import EditServiceLocationModal from '../AdminServiceLocations_Modals/EditServiceLocationModal';
import AddServiceLocationModal from '../AdminServiceLocations_Modals/AddServiceLocationModal';
import { useAdminData, Business, Client } from '../../../contexts/AdminDataContext';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { agentService, type AgentDevice } from '../../../services/agentService';
import { useEmployeeFilters } from '../../../hooks/admin/useEmployeeFilters';
import { useClientFilters } from '../../../hooks/admin/useClientFilters';
import { useBusinessFilters } from '../../../hooks/admin/useBusinessFilters';
import { useServiceLocationFilters } from '../../../hooks/admin/useServiceLocationFilters';
import { useEntityCRUD } from '../../../hooks/admin/useEntityCRUD';
import { adminService } from '../../../services/adminService';
import ConfirmationDialog from '../../common/ConfirmationDialog';
import { useBusinessHandlers } from './handlers/useBusinessHandlers';
import { useClientHandlers } from './handlers/useClientHandlers';
import { useServiceLocationHandlers } from './handlers/useServiceLocationHandlers';
import { useEmployeeHandlers } from './handlers/useEmployeeHandlers';
import { AdminViewRouterProps, ConfirmationDialogState, NewUserData } from './AdminViewRouter.types';

export type { AdminView } from './AdminViewRouter.types';

export const AdminViewRouter: React.FC<AdminViewRouterProps> = ({
  currentView,
  onViewChange,
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
  externalShowInactiveEmployees,
  externalShowSoftDeletedEmployees,
  setShowInactiveClients: externalSetShowInactiveClients,
  setShowSoftDeletedClients: externalSetShowSoftDeletedClients,
  // setShowInactiveBusinesses: externalSetShowInactiveBusinesses,
  // setShowSoftDeletedBusinesses: externalSetShowSoftDeletedBusinesses,
  setShowInactiveServiceLocations: externalSetShowInactiveServiceLocations,
  setShowSoftDeletedServiceLocations: externalSetShowSoftDeletedServiceLocations,
  setShowInactiveEmployees: externalSetShowInactiveEmployees,
  setShowSoftDeletedEmployees: externalSetShowSoftDeletedEmployees,
  highlightUnacknowledged = false,
  agentNavigationContext,
  onNavigateToAgentFromAlert,
  onClearAgentNavigationContext
}) => {
  const {
    dashboardData,
    employees,
    clients,
    businesses,
    services,
    serviceRequests,
    serviceLocations,
    roles,
    permissions,
    serviceTypes,
    closureReasons,
    passwordPolicy,
    technicians,
    serviceRequestStatuses,
    invoices,
    rateCategories,
    workflowRules,
    workflowStats,
    globalQuota,
    quotaSummary,
    clientFilesData,
    loading,
    error,
    refreshAllData,
    refreshEmployees,
    refreshClients,
    refreshBusinesses,
    refreshOnlineStatus,
    refreshRoles,
    refreshPermissions,
    refreshServiceTypes,
    refreshClosureReasons,
    refreshPasswordPolicy,
    refreshTechnicians,
    refreshServiceRequestStatuses,
    refreshInvoices,
    refreshRateCategories,
    refreshWorkflowData,
    refreshQuotaData,
    refreshClientFilesData,
    setEmployees,
    // availableRoles
  } = useAdminData();

  // Get current user for authorization checks
  const { user, isAuthenticated } = useEnhancedAuth();

  // NOTE: We no longer poll refreshOnlineStatus() on view changes because we have WebSocket
  // for real-time employee status updates. The WebSocket connection is managed in AdminDataContext
  // and provides instant updates without needing to repeatedly call the API.

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

  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Initialize handler hooks
  const businessHandlers = useBusinessHandlers({
    businessCRUD,
    refreshBusinesses,
    refreshAllData,
    serviceLocations,
    clients,
    setConfirmationDialog,
  });

  const clientHandlers = useClientHandlers({
    clientCRUD,
  });

  const serviceLocationHandlers = useServiceLocationHandlers({
    serviceLocationCRUD,
    refreshAllData,
  });

  const employeeHandlers = useEmployeeHandlers({
    employeeCRUD,
    setConfirmationDialog,
    user,
  });

  // Employee modal state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserData, setNewUserData] = useState<NewUserData>({
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

  // Client filter toggles state
  const [showInactiveClients, setShowInactiveClients] = useState(true);
  const [showSoftDeletedClients, setShowSoftDeletedClients] = useState(false);

  // Service Location filter toggles state
  const [showInactiveServiceLocations, setShowInactiveServiceLocations] = useState(true);
  const [showSoftDeletedServiceLocations, setShowSoftDeletedServiceLocations] = useState(false);

  // Agent state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentRegistrationModal, setShowAgentRegistrationModal] = useState(false);

  // Trial conversion modal state
  const [showTrialConversionModal, setShowTrialConversionModal] = useState(false);
  const [selectedTrialAgent, setSelectedTrialAgent] = useState<AgentDevice | null>(null);

  // Use external state/setters if provided, otherwise use internal state
  const currentShowInactiveClients = externalShowInactiveClients !== undefined ? externalShowInactiveClients : showInactiveClients;
  const currentShowSoftDeletedClients = externalShowSoftDeletedClients !== undefined ? externalShowSoftDeletedClients : showSoftDeletedClients;
  const currentShowInactiveServiceLocations = externalShowInactiveServiceLocations !== undefined ? externalShowInactiveServiceLocations : showInactiveServiceLocations;
  const currentShowSoftDeletedServiceLocations = externalShowSoftDeletedServiceLocations !== undefined ? externalShowSoftDeletedServiceLocations : showSoftDeletedServiceLocations;

  const setShowInactiveClientsFunc = externalSetShowInactiveClients || setShowInactiveClients;
  const setShowSoftDeletedClientsFunc = externalSetShowSoftDeletedClients || setShowSoftDeletedClients;
  const setShowInactiveServiceLocationsFunc = externalSetShowInactiveServiceLocations || setShowInactiveServiceLocations;
  const setShowSoftDeletedServiceLocationsFunc = externalSetShowSoftDeletedServiceLocations || setShowSoftDeletedServiceLocations;

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
            getFilteredAndSortedEmployees={() => {
              // First apply the hook's filtering logic
              const hookFiltered = employeeFilters.getFilteredAndSortedEmployees(employees);

              // Then apply the toggle filters
              const finalFiltered = hookFiltered.filter(employee => {
                // Filter by show inactive toggle
                if (!externalShowInactiveEmployees && !employee.isActive) {
                  return false;
                }

                // Filter by show soft deleted toggle
                // Always filter soft-deleted if toggle is off
                if (!externalShowSoftDeletedEmployees && employee.softDelete) {
                  return false;
                }

                return true;
              });

              return finalFiltered;
            }}
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
            updateEmployee={employeeHandlers.handleUpdateEmployee}
            currentUser={user}
            onSoftDeleteEmployee={employeeHandlers.handleSoftDeleteEmployee}
            onHardDeleteEmployee={employeeHandlers.handleHardDeleteEmployee}
            onTerminateEmployee={employeeHandlers.handleTerminateEmployee}
            onRehireEmployee={employeeHandlers.handleRehireEmployee}
            loadingEmployeeOperations={employeeHandlers.loadingEmployeeOperations}
            showInactiveEmployees={externalShowInactiveEmployees}
            toggleShowInactiveEmployees={() => externalSetShowInactiveEmployees?.(!externalShowInactiveEmployees)}
            showSoftDeletedEmployees={externalShowSoftDeletedEmployees}
            toggleShowSoftDeletedEmployees={() => externalSetShowSoftDeletedEmployees?.(!externalShowSoftDeletedEmployees)}
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
            onAddClient={clientHandlers.handleAddClient}
            onEditClient={clientHandlers.handleEditClient}
            onDeleteClient={async (client) => {
              try {
                // Set loading state for this specific client
                clientHandlers.setLoadingClientOperations(prev => ({ ...prev, [client.id]: true }));
                await clientCRUD.deleteEntity(client.id);
                // Clear loading state BEFORE refreshing to avoid race condition
                clientHandlers.setLoadingClientOperations(prev => {
                  const newState = { ...prev };
                  delete newState[client.id];
                  return newState;
                });
                await refreshClients();
              } catch (error) {
                console.error('Failed to delete client:', error);
                // Clear loading state on error
                clientHandlers.setLoadingClientOperations(prev => {
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
                clientHandlers.setLoadingClientOperations(prev => ({ ...prev, [client.id]: true }));

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
                clientHandlers.setLoadingClientOperations(prev => {
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
            loadingClientOperations={clientHandlers.loadingClientOperations}
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
                // Always filter soft-deleted if toggle is off
                if (!showSoftDeletedBusinesses && business.softDelete) {
                  return false;
                }

                return true;
              });

              return finalFiltered;
            }}
            // CRUD handlers
            onAddBusiness={businessHandlers.handleAddBusiness}
            onEditBusiness={businessHandlers.handleEditBusiness}
            onDeleteBusiness={(business) => businessHandlers.handleDeleteBusiness(business)}
            onSoftDeleteBusiness={async (business) => {
              try {
                // Set loading state for this specific business
                businessHandlers.setLoadingBusinessOperations(prev => ({ ...prev, [business.id]: true }));

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
                businessHandlers.setLoadingBusinessOperations(prev => {
                  const newState = { ...prev };
                  delete newState[business.id];
                  return newState;
                });
              }
            }}
            toggleBusinessStatus={async (businessId: string, statusType: 'active' | 'inactive') => {
              try {
                // Set loading state for this specific business
                businessHandlers.setLoadingBusinessOperations(prev => ({ ...prev, [businessId]: true }));

                // Find the business to get the required businessName and check if soft deleted
                const business = businesses.find(b => b.id === businessId);
                if (!business) {
                  throw new Error('Business not found');
                }

                // Prevent activating soft-deleted businesses
                if (statusType === 'active' && business.softDelete) {
                  console.warn('Cannot activate soft-deleted business');
                  // Clear loading state before returning
                  businessHandlers.setLoadingBusinessOperations(prev => {
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
                // WebSocket will handle the refresh automatically
              } catch (error) {
                console.error('Failed to toggle business status:', error);
                throw error;
              } finally {
                // Clear loading state for this specific business
                businessHandlers.setLoadingBusinessOperations(prev => {
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
            loadingBusinessOperations={businessHandlers.loadingBusinessOperations}
          />
        );
      }

      case 'services':
        return <AdminServices />;

      case 'service-requests':
        return (
          <AdminServiceRequests
            serviceRequests={serviceRequests}
            clients={clients}
            services={services}
            employees={employees}
            technicians={technicians}
            serviceRequestStatuses={serviceRequestStatuses}
            closureReasons={closureReasons}
            loading={loading}
            error={error}
            selectedServiceRequest={serviceRequestCRUD.selectedEntity}
            onSelectServiceRequest={serviceRequestCRUD.setSelectedEntity}
            onRefresh={refreshAllData}
            refreshTechnicians={refreshTechnicians}
            refreshServiceRequestStatuses={refreshServiceRequestStatuses}
            highlightUnacknowledged={highlightUnacknowledged}
          />
        );

      case 'invoices':
        return (
          <AdminInvoices
            invoices={invoices}
            loading={loading}
            error={error}
            refreshInvoices={refreshInvoices}
          />
        );

      case 'closure-reasons':
        return (
          <AdminClosureReasons
            closureReasons={closureReasons}
            loading={loading}
            error={error}
            refreshClosureReasons={refreshClosureReasons}
          />
        );

      case 'service-locations':
        return (
          <AdminServiceLocations
            serviceLocations={serviceLocations}
            businesses={businesses}
            onEditServiceLocation={serviceLocationHandlers.handleEditServiceLocation}
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
                    // Use adminService directly to pass business_id for last record protection
                    await adminService.deleteServiceLocation(location.id, location.business_id);
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
                serviceLocationHandlers.setLoadingServiceLocationOperations(prev => ({ ...prev, [location.id]: true }));

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
                    serviceLocationHandlers.setLoadingServiceLocationOperations(prev => {
                      const newState = { ...prev };
                      delete newState[location.id];
                      return newState;
                    });
                    return;
                  }
                }

                // Use the dedicated soft delete method instead of general update
                await adminService.softDeleteServiceLocation(location.id, shouldRestore, location.business_id);

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
                serviceLocationHandlers.setLoadingServiceLocationOperations(prev => {
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
                serviceLocationHandlers.setLoadingServiceLocationOperations(prev => ({ ...prev, [locationId]: true }));

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
                  serviceLocationHandlers.setLoadingServiceLocationOperations(prev => {
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
                    serviceLocationHandlers.setLoadingServiceLocationOperations(prev => {
                      const newState = { ...prev };
                      delete newState[locationId];
                      return newState;
                    });
                    return;
                  }
                }

                const isActive = statusType === 'active';
                await serviceLocationCRUD.updateEntity(locationId, { is_active: isActive });
                // WebSocket will handle the refresh automatically
              } catch (error) {
                console.error('Failed to toggle service location status:', error);
                throw error;
              } finally {
                // Clear loading state for this specific service location
                serviceLocationHandlers.setLoadingServiceLocationOperations(prev => {
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
            toggleShowSoftDeletedServiceLocationsFunc={() => setShowSoftDeletedServiceLocationsFunc(!currentShowSoftDeletedServiceLocations)}
            onBusinessNameClick={onBusinessNameClick}
            loadingServiceLocationOperations={serviceLocationHandlers.loadingServiceLocationOperations}
          />
        );

      case 'roles':
        return (
          <AdminRoles
            employees={employees}
            roles={roles}
            loading={loading}
            error={error}
            onRefresh={refreshRoles}
          />
        );

      case 'permissions':
        return (
          <AdminPermissionManager
            roles={roles}
            permissions={permissions}
            onRefresh={refreshPermissions}
          />
        );

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

      case 'service-hour-rates':
        return <AdminServiceHourRates />;

      case 'pricing-settings':
        return (
          <AdminPricingSettings
            rateCategories={rateCategories}
            loading={loading}
            error={error}
            refreshRateCategories={refreshRateCategories}
          />
        );

      case 'subscription-pricing':
        return <SubscriptionPricing />;

      case 'password-complexity':
        return (
          <AdminPasswordComplexity
            passwordPolicy={passwordPolicy}
            loading={loading}
            error={error}
            onRefresh={refreshPasswordPolicy}
          />
        );

      case 'workflow-configuration':
        return (
          <WorkflowConfiguration
            workflowRules={workflowRules}
            workflowStats={workflowStats}
            loading={loading}
            error={error}
            refreshWorkflowData={refreshWorkflowData}
          />
        );

      case 'filter-presets':
        return <FilterPresetManager />;

      case 'quota-management':
        return (
          <AdminQuotaManagement
            globalQuota={globalQuota}
            quotaSummary={quotaSummary}
            loading={loading}
            error={error}
            refreshQuotaData={refreshQuotaData}
          />
        );

      case 'client-files':
        return (
          <AdminClientFileBrowser
            clientFilesData={clientFilesData}
            loading={loading}
            error={error}
            refreshClientFilesData={refreshClientFilesData}
          />
        );

      case 'testimonials':
        return (
          <AdminTestimonials
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'rating-questions':
        return (
          <AdminRatingQuestions
            loading={loading}
            error={error}
            onRefresh={refreshAllData}
          />
        );

      case 'agents':
        return (
          <AgentDashboard
            onViewAgentDetails={(agentId) => {
              setSelectedAgentId(agentId);
              onViewChange?.('agent-details');
            }}
            onCreateRegistrationToken={() => setShowAgentRegistrationModal(true)}
            onViewBusiness={(businessId) => {
              // Find the business by ID to get its name
              const business = businesses.find(b => b.id === businessId);
              if (business) {
                // Set the business name filter
                businessFilters.setBusinessNameFilter(business.businessName);
                // Navigate to businesses view
                onViewChange?.('businesses');
              }
            }}
          />
        );

      case 'trial-agents':
        return (
          <TrialAgentsDashboard
            onViewAgentDetails={(agentId) => {
              setSelectedAgentId(agentId);
              onViewChange?.('agent-details');
            }}
            onConvertTrial={async (trialId) => {
              // Fetch the trial agent details
              try {
                const response = await agentService.listTrialAgents();
                if (response.success && response.data) {
                  const trialAgent = response.data.agents.find(
                    agent => agent.trial_original_id === trialId || agent.id === trialId
                  );
                  if (trialAgent) {
                    setSelectedTrialAgent(trialAgent);
                    setShowTrialConversionModal(true);
                  } else {
                    console.error('Trial agent not found:', trialId);
                  }
                }
              } catch (error) {
                console.error('Failed to fetch trial agent:', error);
              }
            }}
          />
        );

      case 'agent-details':
        return (agentNavigationContext?.agentId || selectedAgentId) ? (
          <AgentDetails
            agentId={agentNavigationContext?.agentId || selectedAgentId!}
            navigationContext={agentNavigationContext}
            onClearNavigationContext={onClearAgentNavigationContext}
            onBack={() => {
              setSelectedAgentId(null);
              onClearAgentNavigationContext?.();
              onViewChange?.('agents');
            }}
            onSendCommand={(agentId) => {
              // Handle command modal - could be implemented as separate modal
              console.log('Send command to agent:', agentId);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">
              No agent selected
            </div>
          </div>
        );

      case 'alert-configurations':
        return <AlertConfigurationManager />;

      case 'alert-history':
        return <AlertHistoryDashboard onNavigateToAgent={onNavigateToAgentFromAlert} />;

      case 'alert-subscriptions':
        return <AlertSubscriptionManager />;

      case 'alert-notification-logs':
        return <AlertNotificationLogs />;

      case 'alert-escalation-policies':
        return <EscalationPolicyManager />;

      case 'policy-automation':
        return (
          <PolicyAutomationDashboard
            onViewScriptDetails={(scriptId) => {
              console.log('View script details:', scriptId);
              // TODO: Implement script details modal/view
            }}
            onViewPolicyDetails={(policyId) => {
              console.log('View policy details:', policyId);
              // TODO: Implement policy details modal/view
            }}
          />
        );

      case 'software-deployment':
        return (
          <SoftwareDeploymentDashboard
            onViewPackageDetails={(packageId) => {
              console.log('View package details:', packageId);
              // TODO: Implement package details modal/view
            }}
            onViewScheduleDetails={(scheduleId) => {
              console.log('View schedule details:', scheduleId);
              // TODO: Implement schedule details modal/view
            }}
            onViewDeploymentDetails={(deploymentId) => {
              console.log('View deployment details:', deploymentId);
              // TODO: Implement deployment details modal/view
            }}
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
        showModal={businessHandlers.showEditBusinessModal}
        business={businessHandlers.selectedBusiness}
        onClose={businessHandlers.handleCloseBusinessModal}
        onSubmit={businessHandlers.handleUpdateBusiness}
      />

      {/* Add Business Modal */}
      <AddBusinessModal
        showModal={businessHandlers.showAddBusinessModal}
        onClose={businessHandlers.handleCloseAddBusinessModal}
        onSubmit={businessHandlers.handleCreateBusiness}
        businesses={businesses}
        onOpenServiceLocationModal={serviceLocationHandlers.handleOpenServiceLocationModalFromBusiness}
      />

      {/* Client Edit Modal */}
      <EditClientModal
        showModal={clientHandlers.showEditClientModal}
        client={clientHandlers.selectedClient}
        onClose={clientHandlers.handleCloseClientModal}
        onSubmit={clientHandlers.handleUpdateClient}
      />

      {/* Add Client Modal */}
      <AddClientModal
        showModal={clientHandlers.showAddClientModal}
        onClose={clientHandlers.handleCloseAddClientModal}
        onSubmit={clientHandlers.handleCreateClient}
      />

      {/* Service Location Edit Modal */}
      <EditServiceLocationModal
        showModal={serviceLocationHandlers.showEditServiceLocationModal}
        serviceLocation={serviceLocationHandlers.selectedServiceLocation}
        onClose={serviceLocationHandlers.handleCloseServiceLocationModal}
        onSubmit={serviceLocationHandlers.handleUpdateServiceLocation}
      />

      {/* Add Service Location Modal */}
      <AddServiceLocationModal
        showModal={serviceLocationHandlers.showAddServiceLocationModal}
        onClose={serviceLocationHandlers.handleCloseAddServiceLocationModal}
        onSubmit={serviceLocationHandlers.handleCreateServiceLocation}
        businesses={businesses}
        prefillBusinessName={serviceLocationHandlers.serviceLocationPrefillData?.businessName}
        prefillAddress={serviceLocationHandlers.serviceLocationPrefillData?.address}
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

      {/* Agent Registration Modal */}
      <AgentRegistrationModal
        isOpen={showAgentRegistrationModal}
        onClose={() => setShowAgentRegistrationModal(false)}
        businesses={businesses}
        serviceLocations={serviceLocations}
      />

      {/* Trial Conversion Modal */}
      <TrialConversionModal
        isOpen={showTrialConversionModal}
        onClose={() => {
          setShowTrialConversionModal(false);
          setSelectedTrialAgent(null);
        }}
        trialAgent={selectedTrialAgent}
        onConversionSuccess={(newAgentId) => {
          console.log('Trial converted successfully! New agent ID:', newAgentId);
          setShowTrialConversionModal(false);
          setSelectedTrialAgent(null);
          // Navigate to the new agent details or refresh trial agents list
          setSelectedAgentId(newAgentId);
          onViewChange?.('agent-details');
        }}
      />
    </>
  );
};