import React, { useState, useRef, useEffect } from 'react';
import { Shield, ChevronDown, User, Lock, Globe, Bell, Moon, Sun, Smartphone, LogOut, Menu, X } from 'lucide-react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AdminDataProvider, useAdminData } from '../contexts/AdminDataContext';
import SessionWarning from '../components/common/SessionWarning';
import SessionCountdownTimer from '../components/admin/SessionCountdownTimer';
import { systemSettingsService } from '../services/systemSettingsService';
// import EmergencyAlerts from '../components/admin/EmergencyAlerts'; // Removed - mock data moved to .plans/templates/
import { AdminSidebar } from '../components/admin';
import { AdminViewRouter } from '../components/admin/shared/AdminViewRouter';
import { AdminModalManager } from '../components/admin/shared/AdminModalManager';
import { useModalManager, useServiceLocationFilters, useClientFilters, useBusinessFilters } from '../hooks/admin';

type AdminView = 'overview' | 'employees' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'invoices' | 'service-locations' | 'roles' | 'reports' | 'settings' | 'password-complexity';

const AdminDashboardContent: React.FC = () => {
  const { user, signOut, sessionWarning, extendSession, sessionConfig, updateSessionConfig, updateSessionWarningTime } = useEnhancedAuth();
  const { refreshAllData, serviceLocations, employees, serviceRequests } = useAdminData();
  const { toggleTheme, isDark } = useTheme();

  // Helper function to get role display name
  const getRoleDisplayName = (role: string | undefined): string => {
    if (!role) return 'User';

    const roleMap: Record<string, string> = {
      'executive': 'Executive',
      'admin': 'Administrator',
      'manager': 'Manager',
      'sales': 'Sales',
      'technician': 'Technician',
      'client': 'Client'
    };

    return roleMap[role.toLowerCase()] || role;
  };

  // Get dashboard title based on role
  const getDashboardTitle = (role: string | undefined): string => {
    if (!role) return 'Dashboard';

    const roleLower = role.toLowerCase();
    if (roleLower === 'executive') {
      return 'Executive Dashboard';
    } else if (roleLower === 'manager') {
      return 'Manager Dashboard';
    } else if (roleLower === 'technician') {
      return 'Technician Dashboard';
    } else if (roleLower === 'sales') {
      return 'Sales Dashboard';
    }

    return 'Admin Dashboard';
  };

  // Get shield background color based on role
  const getShieldColor = (role: string | undefined): string => {
    if (!role) return 'bg-blue-600';

    const roleColorMap: Record<string, string> = {
      'executive': 'bg-black',
      'admin': 'bg-red-600',
      'manager': 'bg-purple-600',
      'sales': 'bg-green-600',
      'technician': 'bg-blue-600'
    };

    return roleColorMap[role.toLowerCase()] || 'bg-blue-600';
  };

  // Load session config when dashboard mounts (same time as other dashboard data)
  // Always load from database to ensure fresh values, regardless of cached config
  useEffect(() => {
    const loadSessionConfig = async () => {
      if (user) {
        console.log('📊 [AdminDashboard] Loading session config from database...');
        try {
          const config = await systemSettingsService.getSessionConfig();
          if (config) {
            console.log('✅ [AdminDashboard] Loaded session config:', config);
            // Update the context with the loaded config (use the full config, not partial)
            await updateSessionConfig(config);
          }
        } catch (error: any) {
          // If permission denied (403), silently skip loading (use defaults)
          if (error.message?.includes('Insufficient permissions') || error.message?.includes('403')) {
            console.log('ℹ️ Cannot load session config (insufficient permissions), using defaults');
          } else {
            console.error('❌ [AdminDashboard] Failed to load session config:', error);
          }
        }
      }
    };

    loadSessionConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only depend on user, not sessionConfig or updateSessionConfig (stable context function)

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  // User dropdown state
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isUserMenuOpen]);

  // Close mobile sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileSidebarRef.current && !mobileSidebarRef.current.contains(event.target as Node)) {
        // Check if click is on hamburger button (contains 'Menu' class or is a menu icon)
        const target = event.target as HTMLElement;
        if (!target.closest('[data-mobile-menu-button]')) {
          setIsMobileSidebarOpen(false);
        }
      }
    };

    if (isMobileSidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isMobileSidebarOpen]);

  // Handle account dropdown actions
  const handleAccountAction = async (action: string) => {
    setIsUserMenuOpen(false);

    switch (action) {
      case 'profile':
        // Profile settings
        break;
      case 'password':
        modalManager.openModal('changePassword');
        break;
      case 'trusted-devices':
        modalManager.openModal('trustedDevices');
        break;
      case 'preferences':
        // User preferences
        break;
      case 'notifications':
        // Notification settings
        break;
      case 'theme':
        toggleTheme();
        break;
      case 'signout':
        console.log('🚪 Logout button clicked - calling signOut()...');
        try {
          await signOut();
          console.log('✅ signOut() completed successfully');
        } catch (error) {
          console.error('❌ Error during signOut():', error);
        }
        break;
    }
  };

  // Session countdown handlers
  // Note: Actual session expiration is handled by EnhancedAuthContext via API 401 responses
  // This timer is just for visual countdown - it doesn't enforce expiration
  const handleSessionExpired = () => {
    console.log('⏰ Local timer expired - actual session state managed by backend');
    // Don't sign out here - let the backend/EnhancedAuthContext handle it
  };

  const handleSessionWarning = (remainingSeconds: number) => {
    updateSessionWarningTime(remainingSeconds);
  };

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
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(true);
  const [showSoftDeletedEmployees, setShowSoftDeletedEmployees] = useState(false);

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
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
        {/* Session Warning - Only render when user is authenticated */}
        {user && (
          <SessionWarning
            isVisible={sessionWarning.isVisible}
            timeLeft={sessionWarning.timeLeft}
            onExtend={extendSession}
            onLogout={signOut}
          />
        )}

        {/* Emergency Alerts - Disabled: mock data moved to .plans/templates/ */}
        {/* {user && <EmergencyAlerts />} */}

        {/* Sticky Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Mobile Menu Button & Logo */}
              <div className="flex items-center space-x-3">
                {/* Mobile hamburger menu */}
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                  className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  data-mobile-menu-button
                  aria-label="Toggle menu"
                >
                  {isMobileSidebarOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>

                {/* Logo and Title */}
                <div className="flex items-center">
                  <div className={`flex-shrink-0 h-8 w-8 ${getShieldColor(user?.role)} rounded-lg flex items-center justify-center`}>
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div className="ml-3 hidden sm:block">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Romero Tech Solutions
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{getDashboardTitle(user?.role)}</p>
                  </div>
                </div>
              </div>

              {/* Session Countdown Timer - Only show on desktop after config is loaded */}
              {sessionConfig && (
                <div className="hidden lg:flex items-center space-x-4">
                  <SessionCountdownTimer
                    sessionTimeoutMs={sessionConfig.timeout * 60 * 1000}
                    warningThresholdMs={sessionConfig.warningTime * 60 * 1000}
                    onSessionExpired={handleSessionExpired}
                    onWarningReached={handleSessionWarning}
                  />
                </div>
              )}

              {/* User Info & Dropdown */}
              {user && (() => {
                // Find the current employee in the employees array to get photo data
                const currentEmployee = employees.find(emp => emp.email === user.email);

                return (
                  <div className="flex items-center space-x-3">
                    {/* Notification Bell Icon with Badge */}
                    <button
                      type="button"
                      onClick={() => setCurrentView('service-requests')}
                      className="relative p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      aria-label="View notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {/* Notification badge - shows count of unacknowledged requests */}
                      {(() => {
                        // Count service requests that need acknowledgment
                        // Check for pending status and no acknowledgment
                        const unackCount = serviceRequests.filter(sr =>
                          !sr.softDelete &&
                          (sr.status?.toLowerCase() === 'pending' || sr.status?.toLowerCase() === 'submitted') &&
                          !sr.acknowledgedByEmployeeId
                        ).length;

                        if (unackCount > 0) {
                          return (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                              {unackCount > 9 ? '9+' : unackCount}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </button>

                    <div className="relative" ref={userMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center space-x-2 lg:space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-2 lg:px-3 py-2 transition-colors"
                      >
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{getRoleDisplayName(user.role)}</p>
                        </div>
                        {currentEmployee?.photo ? (
                          <div
                            className="relative h-8 w-8 rounded-full overflow-hidden border-2 border-blue-600"
                            style={{ backgroundColor: currentEmployee.photoBackgroundColor || 'transparent' }}
                          >
                            <img
                              src={currentEmployee.photo}
                              alt={user.name}
                              className="w-full h-full object-cover"
                              style={{
                                transform: `scale(${(currentEmployee.photoScale || 100) / 100})`,
                                transformOrigin: `${currentEmployee.photoPositionX || 50}% ${currentEmployee.photoPositionY || 50}%`
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {user.name?.charAt(0).toUpperCase() || 'A'}
                            </span>
                          </div>
                        )}
                        <ChevronDown
                          className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform hidden sm:block ${
                            isUserMenuOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                    {/* Dropdown Menu */}
                    {isUserMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                        {/* Mobile Session Timer - Only show on mobile if config is loaded */}
                        {sessionConfig && (
                          <div className="lg:hidden px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <SessionCountdownTimer
                              sessionTimeoutMs={sessionConfig.timeout * 60 * 1000}
                              warningThresholdMs={sessionConfig.warningTime * 60 * 1000}
                              onSessionExpired={handleSessionExpired}
                              onWarningReached={handleSessionWarning}
                            />
                          </div>
                        )}

                        <button
                          onClick={() => handleAccountAction('profile')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <User className="h-4 w-4" />
                          <span>Profile Settings</span>
                        </button>

                        <button
                          onClick={() => handleAccountAction('password')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <Lock className="h-4 w-4" />
                          <span>Change Password</span>
                        </button>

                        <button
                          onClick={() => handleAccountAction('trusted-devices')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <Smartphone className="h-4 w-4" />
                          <span>Trusted Devices</span>
                        </button>

                        <button
                          onClick={() => handleAccountAction('preferences')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <Globe className="h-4 w-4" />
                          <span>Preferences</span>
                        </button>

                        <button
                          onClick={() => handleAccountAction('notifications')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <Bell className="h-4 w-4" />
                          <span>Notifications</span>
                        </button>

                        <button
                          onClick={() => handleAccountAction('theme')}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>

                        <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

                        <button
                          type="button"
                          onMouseDown={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsUserMenuOpen(false);
                            try {
                              await signOut();
                            } catch (error) {
                              console.error('Error during signOut:', error);
                            }
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </header>

        {/* Main Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop Sidebar - hidden on mobile */}
          <div className="hidden lg:block">
            <AdminSidebar
              currentView={currentView}
              setCurrentView={handleViewChange}
              user={user}
            />
          </div>

          {/* Mobile Sidebar - overlay on mobile */}
          {isMobileSidebarOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" />

              {/* Sidebar */}
              <div
                ref={mobileSidebarRef}
                className="fixed inset-y-0 left-0 z-50 lg:hidden"
              >
                <AdminSidebar
                  currentView={currentView}
                  setCurrentView={(view) => {
                    handleViewChange(view);
                    setIsMobileSidebarOpen(false);
                  }}
                  user={user}
                />
              </div>
            </>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 sm:pr-6 mt-2">
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
              externalShowInactiveEmployees={showInactiveEmployees}
              externalShowSoftDeletedEmployees={showSoftDeletedEmployees}
              setShowInactiveEmployees={setShowInactiveEmployees}
              setShowSoftDeletedEmployees={setShowSoftDeletedEmployees}
            />
          </main>
          </div>
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
  );
};

const AdminDashboard: React.FC = () => {
  return (
    <ThemeProvider>
      <AdminDataProvider>
        <AdminDashboardContent />
      </AdminDataProvider>
    </ThemeProvider>
  );
};

export default AdminDashboard;