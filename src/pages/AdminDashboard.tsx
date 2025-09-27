import React, { useState } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AdminDataProvider, useAdminData } from '../contexts/AdminDataContext';
import SessionWarning from '../components/common/SessionWarning';
import { AdminSidebar } from '../components/admin';
import { AdminViewRouter } from '../components/admin/shared/AdminViewRouter';
import { AdminModalManager } from '../components/admin/shared/AdminModalManager';
import { useModalManager, useServiceLocationFilters, useClientFilters, useBusinessFilters } from '../hooks/admin';

type AdminView = 'overview' | 'employees' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'service-locations' | 'roles' | 'reports' | 'settings' | 'password-complexity';

const AdminDashboardContent: React.FC = () => {
  const { user, signOut, sessionWarning, extendSession } = useEnhancedAuth();
  const { refreshAllData, serviceLocations } = useAdminData();

  // View state
  const [currentView, setCurrentView] = useState<AdminView>(() => {
    const saved = localStorage.getItem('adminDashboardView');
    return (saved as AdminView) || 'overview';
  });

  // Modal management
  const modalManager = useModalManager();

  // Service location filters for business name pre-population
  const serviceLocationFilters = useServiceLocationFilters();
  const [serviceLocationPrefillBusinessName, setServiceLocationPrefillBusinessName] = useState<string>('');

  // Client filters for business filtering
  const clientFilters = useClientFilters();

  // Business filters for business name filtering
  const businessFilters = useBusinessFilters();

  // Toggle states for controlling visibility from click handlers
  const [showInactiveClients, setShowInactiveClients] = useState(true);
  const [showSoftDeletedClients, setShowSoftDeletedClients] = useState(false);
  const [showInactiveServiceLocations, setShowInactiveServiceLocations] = useState(true);
  const [showSoftDeletedServiceLocations, setShowSoftDeletedServiceLocations] = useState(false);
  const [showInactiveBusinesses, setShowInactiveBusinesses] = useState(true);
  const [showSoftDeletedBusinesses, setShowSoftDeletedBusinesses] = useState(false);

  // Selected entities for modals
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [selectedServiceLocation, setSelectedServiceLocation] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedServiceRequest, setSelectedServiceRequest] = useState(null);

  // Handle view changes
  const handleViewChange = (view: AdminView) => {
    setCurrentView(view);
    localStorage.setItem('adminDashboardView', view);
  };

  // Handle business location count click (navigate to service locations filtered by business)
  const handleLocationCountClick = (businessName: string) => {

    // Navigate to service locations first
    setCurrentView('service-locations');
    localStorage.setItem('adminDashboardView', 'service-locations');

    // Enable show inactive and show soft deleted to see all related locations
    setShowInactiveServiceLocations(true);
    setShowSoftDeletedServiceLocations(true);

    // Use setTimeout to ensure the view has switched before setting filters
    setTimeout(() => {
      serviceLocationFilters.setBusinessFilter(businessName);

      // Clear other filters
      serviceLocationFilters.setStatusFilter('all');
      serviceLocationFilters.setLocationTypeFilter('all');
      serviceLocationFilters.setSearchTerm('');
      serviceLocationFilters.setIsHeadquartersFilter('all');
      serviceLocationFilters.setSortBy('business_name');
      serviceLocationFilters.setSortOrder('asc');
    }, 100);
  };

  // Handle business client count click (navigate to clients filtered by business)
  const handleClientCountClick = (businessName: string) => {

    // Navigate to clients first
    setCurrentView('clients');
    localStorage.setItem('adminDashboardView', 'clients');

    // Enable show inactive and show soft deleted to see all related clients
    setShowInactiveClients(true);
    setShowSoftDeletedClients(true);

    // Use setTimeout to ensure the view has switched before setting filters
    setTimeout(() => {
      clientFilters.setBusinessFilter(businessName);

      // Clear other filters
      clientFilters.setStatusFilter('all');
      clientFilters.setSearchTerm('');
      clientFilters.setDateFromFilter('');
      clientFilters.setDateToFilter('');
      clientFilters.setHasAddressFilter('all');
      clientFilters.setSortBy('name');
      clientFilters.setSortOrder('asc');
    }, 100);
  };

  // Handle show add service location modal with business pre-population
  const handleShowAddServiceLocation = () => {
    // Only pre-populate business if we have an active business filter (not 'all')
    const currentBusinessFilter = serviceLocationFilters.filters.businessFilter;

    if (currentBusinessFilter && currentBusinessFilter !== 'all') {
      // Pre-populate with the filtered business name
      setServiceLocationPrefillBusinessName(currentBusinessFilter);
    } else {
      // Also check if all displayed entries in the table have the same business_name
      const filteredServiceLocations = serviceLocationFilters.getFilteredAndSortedServiceLocations(serviceLocations);
      const uniqueBusinessNames = [...new Set(filteredServiceLocations.map(sl => sl.business_name))];

      if (uniqueBusinessNames.length === 1 && filteredServiceLocations.length > 0) {
        // Pre-populate with the single business name from displayed entries
        setServiceLocationPrefillBusinessName(uniqueBusinessNames[0]);
      } else {
        // Don't pre-populate if multiple businesses or no entries
        setServiceLocationPrefillBusinessName('');
      }
    }

    modalManager.openModal('addServiceLocation');
  };

  // Handle modal close with cleanup
  const handleCloseModal = (modalName: string) => {
    modalManager.closeModal(modalName);

    // Clear selected entities when closing modals
    switch (modalName) {
      case 'editClient':
        setSelectedClient(null);
        break;
      case 'editBusiness':
        setSelectedBusiness(null);
        break;
      case 'editServiceLocation':
        setSelectedServiceLocation(null);
        break;
      case 'editEmployee':
        setSelectedEmployee(null);
        break;
      case 'editService':
        setSelectedService(null);
        break;
      case 'editServiceRequest':
        setSelectedServiceRequest(null);
        break;
      case 'addServiceLocation':
        setServiceLocationPrefillBusinessName('');
        break;
    }
  };

  // Handle business name click (navigate to businesses filtered by business name)
  const handleBusinessNameClick = (businessName: string) => {

    // Navigate to businesses first
    setCurrentView('businesses');
    localStorage.setItem('adminDashboardView', 'businesses');

    // Enable show inactive and show soft deleted to see all related businesses
    setShowInactiveBusinesses(true);
    setShowSoftDeletedBusinesses(true);

    // Use setTimeout to ensure the view has switched before setting filters
    setTimeout(() => {
      businessFilters.setBusinessNameFilter(businessName);

      // Clear other filters for a focused view
      businessFilters.setStatusFilter('all');
      businessFilters.setIndustryFilter('all');
      businessFilters.setLocationCountFilter('all');
      businessFilters.setSearchTerm('');
      businessFilters.setSortBy('businessName');
      businessFilters.setSortOrder('asc');
    }, 100);
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        {/* Session Warning - Only render when user is authenticated */}
        {user && (
          <SessionWarning
            isVisible={sessionWarning.isVisible}
            timeLeft={sessionWarning.timeLeft}
            onExtend={extendSession}
            onLogout={signOut}
          />
        )}

        {/* Sidebar */}
        <AdminSidebar
          currentView={currentView}
          setCurrentView={handleViewChange}
          signOut={signOut}
          user={user}
          onOpenChangePasswordModal={() => modalManager.openModal('changePassword')}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-x-hidden overflow-y-auto pr-6 mt-2">
            <AdminViewRouter
              currentView={currentView}
              onLocationCountClick={handleLocationCountClick}
              onClientCountClick={handleClientCountClick}
              onBusinessNameClick={handleBusinessNameClick}
              onShowAddServiceLocation={handleShowAddServiceLocation}
              serviceLocationPrefillBusinessName={serviceLocationPrefillBusinessName}
              serviceLocationFilters={serviceLocationFilters}
              clientFilters={clientFilters}
              businessFilters={businessFilters}
              externalShowInactiveClients={showInactiveClients}
              externalShowSoftDeletedClients={showSoftDeletedClients}
              externalShowInactiveBusinesses={showInactiveBusinesses}
              externalShowSoftDeletedBusinesses={showSoftDeletedBusinesses}
              externalShowInactiveServiceLocations={showInactiveServiceLocations}
              externalShowSoftDeletedServiceLocations={showSoftDeletedServiceLocations}
              setShowInactiveClients={setShowInactiveClients}
              setShowSoftDeletedClients={setShowSoftDeletedClients}
              setShowInactiveBusinesses={setShowInactiveBusinesses}
              setShowSoftDeletedBusinesses={setShowSoftDeletedBusinesses}
              setShowInactiveServiceLocations={setShowInactiveServiceLocations}
              setShowSoftDeletedServiceLocations={setShowSoftDeletedServiceLocations}
            />
          </main>
        </div>

        {/* Modal Manager */}
        <AdminModalManager
          modals={modalManager.modals}
          onCloseModal={handleCloseModal}
          selectedEntities={{
            client: selectedClient,
            business: selectedBusiness,
            serviceLocation: selectedServiceLocation,
            employee: selectedEmployee,
            service: selectedService,
            serviceRequest: selectedServiceRequest
          }}
          serviceLocationPrefillBusinessName={serviceLocationPrefillBusinessName}
          onRefresh={refreshAllData}
        />
      </div>
    </ThemeProvider>
  );
};

const AdminDashboard: React.FC = () => {
  return (
    <AdminDataProvider>
      <AdminDashboardContent />
    </AdminDataProvider>
  );
};

export default AdminDashboard;