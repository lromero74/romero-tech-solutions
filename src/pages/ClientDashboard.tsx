import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../contexts/ClientThemeContext';
import { useClientLanguage } from '../contexts/ClientLanguageContext';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { RoleBasedStorage } from '../utils/roleBasedStorage';
import ServiceScheduler from '../components/client/ServiceScheduler';
import ServiceRequests from '../components/client/ServiceRequests';
import ClientSettings from '../components/client/ClientSettings';
import { InvoicesList } from '../components/client/InvoicesList';
import FileManager from '../components/client/FileManager';
import LanguageSelector from '../components/client/LanguageSelector';
import AddServiceLocationForm from '../components/client/AddServiceLocationForm';
import EditServiceLocationForm from '../components/client/EditServiceLocationForm';
import SessionCountdownTimer from '../components/client/SessionCountdownTimer';
import TrialDevicesManager from '../components/client/TrialDevicesManager';
import DeviceSettingsModal from '../components/client/DeviceSettingsModal';
import AgentDetails from '../components/admin/AgentDetails';
import AgentSelector from '../components/trial/AgentSelector';
import { agentService, AgentDevice } from '../services/agentService';
import {
  Building2,
  MapPin,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Bell,
  Upload,
  Clock,
  AlertCircle,
  Users,
  User,
  HardDrive,
  Building,
  Plus,
  Menu,
  X,
  Edit,
  Trash2,
  DollarSign,
  ArrowLeft
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;  // Fallback when firstName/lastName not available
  phone: string;
  role: string;
  createdAt?: string;
  business: {
    id: string;
    name: string;
    isIndividual: boolean;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    logo?: string;
    logoPositionX?: number;
    logoPositionY?: number;
    logoScale?: number;
    logoBackgroundColor?: string;
  };
  accessibleLocations: Array<{
    id: string;
    name: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
    contact: {
      person: string;
      phone: string;
      email: string;
    };
  }>;
}

interface SessionData {
  token: string;
  expiresAt: string;
}

interface ClientData {
  user: User;
  session: SessionData;
}

interface ClientDashboardProps {
  onNavigate?: (page: string) => void;
}

const ClientDashboard: React.FC<ClientDashboardProps> = ({ onNavigate }) => {
  const { isDarkMode, toggleTheme } = useClientTheme();
  const { t } = useClientLanguage();
  const { signOut, sessionConfig, authUser } = useEnhancedAuth();
  const { hasNotifications, unseenServiceRequestChanges, unseenInvoiceChanges, startViewTimer, clearViewTimer } = useNotifications();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  // Initialize activeTab from localStorage or default to 'dashboard'
  const [activeTab, setActiveTabState] = useState(() => {
    const savedTab = RoleBasedStorage.getItem('clientActiveTab');
    return savedTab || 'dashboard';
  });

  // Custom setActiveTab that also persists to localStorage
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    RoleBasedStorage.setItem('clientActiveTab', tab);
  };

  // State for AddServiceLocationForm modal
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);

  // State for EditServiceLocationForm modal
  const [showEditLocationForm, setShowEditLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);

  // State for delete confirmation modal
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for mobile menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // State for navigating to specific service request
  const [serviceRequestIdToOpen, setServiceRequestIdToOpen] = useState<string | null>(null);

  // State for viewing agent details (from magic link)
  const [viewingAgentId, setViewingAgentId] = useState<string | null>(null);

  // State for agent/device selection and metrics
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
    // Try to restore last selected agent from localStorage
    const savedAgentId = localStorage.getItem('client_selectedAgentId');
    return savedAgentId || '';
  });

  // State for viewing device details from Monitored Devices tab
  const [viewingDeviceFromList, setViewingDeviceFromList] = useState<string | null>(null);

  // State for device settings modal
  const [deviceSettingsModalOpen, setDeviceSettingsModalOpen] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');
  const [editingDeviceType, setEditingDeviceType] = useState('');

  // Function to handle successful service location addition
  const handleServiceLocationAdded = (newLocation: any) => {
    // Update the client data with the new location
    if (clientData?.user?.accessibleLocations) {
      setClientData(prev => ({
        ...prev!,
        user: {
          ...prev!.user,
          accessibleLocations: [...prev!.user.accessibleLocations!, newLocation]
        }
      }));
    }
    setShowAddLocationForm(false);
  };

  // Function to handle edit location
  const handleEditLocation = (location: any) => {
    setEditingLocation(location);
    setShowEditLocationForm(true);
  };

  // Function to handle successful service location update
  const handleServiceLocationUpdated = (updatedLocation: any) => {
    if (clientData?.user?.accessibleLocations) {
      setClientData(prev => ({
        ...prev!,
        user: {
          ...prev!.user,
          accessibleLocations: prev!.user.accessibleLocations.map(loc =>
            loc.id === updatedLocation.id ? updatedLocation : loc
          )
        }
      }));
    }
    setShowEditLocationForm(false);
    setEditingLocation(null);
  };

  // Function to handle delete location
  const handleDeleteLocation = (location: any) => {
    setDeletingLocation(location);
    setShowDeleteConfirmation(true);
  };

  // Function to confirm delete
  const confirmDeleteLocation = async () => {
    if (!deletingLocation) return;

    setIsDeleting(true);
    try {
      const result = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/profile/delete-service-location/${deletingLocation.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${RoleBasedStorage.getItem('sessionToken')}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        }
      );

      const data = await result.json();

      if (data.success) {
        // Remove location from state
        if (clientData?.user?.accessibleLocations) {
          setClientData(prev => ({
            ...prev!,
            user: {
              ...prev!.user,
              accessibleLocations: prev!.user.accessibleLocations.filter(
                loc => loc.id !== deletingLocation.id
              )
            }
          }));
        }
        setShowDeleteConfirmation(false);
        setDeletingLocation(null);
      } else {
        alert(data.message || 'Failed to delete service location');
      }
    } catch (error) {
      console.error('Error deleting service location:', error);
      alert('An error occurred while deleting the service location');
    } finally {
      setIsDeleting(false);
    }
  };

  // Function to cancel delete
  const cancelDeleteLocation = () => {
    setShowDeleteConfirmation(false);
    setDeletingLocation(null);
  };

  // Function to handle agent selection
  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    localStorage.setItem('client_selectedAgentId', agentId);
  };

  // Check for pending agent ID from magic link login
  useEffect(() => {
    const pendingAgentId = sessionStorage.getItem('pendingAgentId');
    if (pendingAgentId) {
      console.log('🎯 Found pending agent ID from magic link:', pendingAgentId);
      setViewingAgentId(pendingAgentId);
      setActiveTab('devices'); // Also switch to devices tab
      // Clear it so it doesn't persist across page reloads
      sessionStorage.removeItem('pendingAgentId');
    }
  }, []);

  // Load client data from existing auth system or sessionStorage
  useEffect(() => {
    const loadClientData = async () => {
      try {
        // First try to get from existing auth system
        console.log('🔍 [ClientDashboard] Attempting to load auth data from storage...');
        const authUserData = RoleBasedStorage.getItem('authUser');
        const sessionToken = RoleBasedStorage.getItem('sessionToken');
        console.log('🔍 [ClientDashboard] Auth data found:', { hasAuthUser: !!authUserData, hasSessionToken: !!sessionToken });

        if (authUserData && sessionToken) {
          const authUser = JSON.parse(authUserData);
          if (authUser.role === 'client') {
            try {
              // Fetch real business data from API with timeout and retry
              const businessResponse = await Promise.race([
                fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/profile/business`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include'
                }),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Request timeout')), 10000)
                )
              ]) as Response;

              if (businessResponse.ok) {
                const businessData = await businessResponse.json();

                // Get profile data with timeout
                const profileResponse = await Promise.race([
                  fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/profile`, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${sessionToken}`,
                      'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                  }),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Profile request timeout')), 5000)
                  )
                ]) as Response;

                let profileData = {
                  firstName: authUser.name?.split(' ')[0] || 'Client',
                  lastName: authUser.name?.split(' ')[1] || 'User',
                  email: authUser.email,
                  phone: ''
                };

                if (profileResponse.ok) {
                  const profile = await profileResponse.json();
                  if (profile.success) {
                    profileData = profile.data;
                  }
                }

                const clientData = {
                  user: {
                    id: authUser.id,
                    email: profileData.email,
                    firstName: profileData.firstName,
                    lastName: profileData.lastName,
                    phone: profileData.phone,
                    role: authUser.role,
                    createdAt: profileData.createdAt,
                    business: businessData.data.business,
                    accessibleLocations: businessData.data.accessibleLocations
                  },
                  session: {
                    token: sessionToken,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                  }
                };

                setClientData(clientData);
                setLoading(false);
                return;
              } else if (businessResponse.status === 401) {
                // Authentication expired, clear tokens and redirect
                console.log('Session expired, clearing auth data');
                RoleBasedStorage.removeItem('authUser');
                RoleBasedStorage.removeItem('sessionToken');
                sessionStorage.removeItem('clientData');
                if (onNavigate) onNavigate('clogin');
                return;
              } else {
                console.error('Failed to fetch business data:', businessResponse.statusText);
              }
            } catch (apiError) {
              console.error('API request failed:', apiError);
              // Continue to fallback instead of immediate redirect
            }
          }
        }

        // Fallback to sessionStorage clientData
        const savedClientData = sessionStorage.getItem('clientData');
        if (savedClientData) {
          try {
            const data = JSON.parse(savedClientData);
            setClientData(data);
            setLoading(false);
            return;
          } catch (error) {
            console.error('Failed to parse client data:', error);
          }
        }

        // Give additional time for auth context to load before redirecting
        setTimeout(() => {
          // Re-check storage one more time before redirecting
          const authUserCheck = RoleBasedStorage.getItem('authUser');
          const sessionTokenCheck = RoleBasedStorage.getItem('sessionToken');
          const savedClientCheck = sessionStorage.getItem('clientData');

          if (!authUserCheck || !sessionTokenCheck || (!savedClientCheck && !clientData)) {
            console.log('No client data found after extended wait, redirecting to login');
            setLoading(false);
            if (onNavigate) onNavigate('clogin');
          }
        }, 2000);

      } catch (error) {
        console.error('Error loading client data:', error);
        // Don't immediately redirect on general errors, let auth context handle it
        setTimeout(() => {
          const authUserCheck = RoleBasedStorage.getItem('authUser');
          const sessionTokenCheck = RoleBasedStorage.getItem('sessionToken');

          if (!authUserCheck || !sessionTokenCheck) {
            console.log('Error in client data loading, redirecting to login');
            setLoading(false);
            if (onNavigate) onNavigate('clogin');
          }
        }, 2000);
      }
    };

    loadClientData();
  }, [onNavigate]);

  const handleLogout = async () => {
    console.log('🚪 Logout button clicked');
    try {
      // Use the EnhancedAuthContext signOut function to properly clear authentication state
      await signOut();

      console.log('Logout completed, redirecting to login');

      // Navigate back to client login
      if (onNavigate) {
        onNavigate('clogin');
      } else {
        // Fallback: force page reload to login
        window.location.href = '/clogin';
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Even if signOut fails, still navigate to login as fallback
      if (onNavigate) {
        onNavigate('clogin');
      } else {
        window.location.href = '/clogin';
      }
    }
  };

  // Handle session expiration
  const handleSessionExpired = () => {
    console.log('Session expired, redirecting to login');
    handleLogout();
  };

  // Handle session warning (optional - could show a toast notification)
  const handleSessionWarning = () => {
    console.log('Session warning: 2 minutes remaining');
    // Could add a toast notification here in the future
  };

  // Handle notification timer for Service Requests page
  useEffect(() => {
    if (activeTab === 'requests') {
      // Start the 4-second timer when entering Service Requests page
      startViewTimer();
    } else {
      // Clear timer if user navigates away
      clearViewTimer();
    }

    // Cleanup timer on unmount or tab change
    return () => {
      clearViewTimer();
    };
  }, [activeTab, startViewTimer, clearViewTimer]);

  // Close mobile menu on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch user's agents when auth data is available
  useEffect(() => {
    const fetchAgents = async () => {
      if (!authUser) return;

      try {
        const response = await agentService.listAgents();
        if (response.success && response.data?.agents) {
          setAgents(response.data.agents);

          // If no agent is selected but we have agents, select the first one
          if (!selectedAgentId && response.data.agents.length > 0) {
            const firstAgentId = response.data.agents[0].id;
            setSelectedAgentId(firstAgentId);
            localStorage.setItem('client_selectedAgentId', firstAgentId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    };

    fetchAgents();
  }, [authUser, selectedAgentId]);

  // Handle navigation from FileManager to specific service request
  const handleNavigateToServiceRequest = (serviceRequestId: string) => {
    setServiceRequestIdToOpen(serviceRequestId);
    setActiveTab('requests');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!clientData) {
    return null;
  }

  const { user } = clientData;

  // Determine access level display
  const getAccessLevel = () => {
    if (user.business.isIndividual) {
      return t('dashboard.stats.individual');
    }
    return user.accessibleLocations.length > 1
      ? t('dashboard.stats.business')
      : t('dashboard.stats.site');
  };

  // If viewing specific agent details (from magic link), show AgentDetails component
  if (viewingAgentId) {
    return (
      <div className={`h-screen flex flex-col transition-colors duration-200 ${
        isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
      }`}>
        {/* Header with back button */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setViewingAgentId(null)}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back to Dashboard</span>
                </button>
                <h1 className="text-xl font-semibold text-gray-800 dark:text-white">
                  Device Details
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle theme"
                >
                  {isDarkMode ? (
                    <Sun className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  ) : (
                    <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Agent Details Content */}
        <div className="flex-1 overflow-auto">
          <ThemeProvider>
            <AgentDetails
              agentId={viewingAgentId}
              onBack={() => setViewingAgentId(null)}
            />
          </ThemeProvider>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Sticky Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side: Mobile Menu Button + Logo and Title */}
            <div className="flex items-center space-x-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                ) : (
                  <Menu className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                )}
              </button>

              {/* Logo and Title */}
              <div className="flex items-center">
              <div className="flex-shrink-0 h-8 w-8 relative">
                {user.business.logo ? (
                  <div
                    className="relative h-8 w-8 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600"
                    style={{ backgroundColor: user.business.logoBackgroundColor || 'transparent' }}
                  >
                    <img
                      src={user.business.logo}
                      alt={`${user.business.isIndividual ? (user.name || `${user.firstName} ${user.lastName}`) : user.business.name} logo`}
                      className="w-full h-full object-cover"
                      style={{
                        transform: `scale(${(user.business.logoScale || 100) / 100})`,
                        transformOrigin: `${user.business.logoPositionX || 50}% ${user.business.logoPositionY || 50}%`
                      }}
                      onError={(e) => {
                        // Fall back to building icon if image fails to load
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <div className="hidden h-8 w-8 rounded-lg bg-blue-600 dark:bg-blue-500 items-center justify-center">
                      {user.business.isIndividual ? (
                        <User className="h-5 w-5 text-white" />
                      ) : (
                        <Building className="h-5 w-5 text-white" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                    {user.business.isIndividual ? (
                      <User className="h-5 w-5 text-white" />
                    ) : (
                      <Building className="h-5 w-5 text-white" />
                    )}
                  </div>
                )}
              </div>
              <div className="ml-3">
                <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-none">
                  {user.business.isIndividual ? (user.name || `${user.firstName} ${user.lastName}`) : user.business.name}
                </h1>
                <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">{t('client.portal', 'Client Portal')}</p>
              </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Session Countdown Timer - Hidden on mobile */}
              {sessionConfig && (
                <div className="hidden md:block">
                  <SessionCountdownTimer
                    sessionTimeoutMs={sessionConfig.timeout * 60 * 1000}
                    warningThresholdMs={sessionConfig.warningTime * 60 * 1000}
                    onSessionExpired={handleSessionExpired}
                    onWarningReached={handleSessionWarning}
                  />
                </div>
              )}

              {/* Language Selector - Hidden on mobile */}
              <div className="hidden sm:block">
                <LanguageSelector toggle={true} />
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={isDarkMode ? t('client.toggleTheme.light') : t('client.toggleTheme.dark')}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 text-yellow-500" />
                ) : (
                  <Moon className="h-5 w-5 text-gray-600" />
                )}
              </button>

              {/* Notifications */}
              <button
                className={`p-2 rounded-lg transition-colors relative ${
                  hasNotifications
                    ? 'bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/50'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                title={t('client.notifications')}
              >
                <Bell className={`h-5 w-5 ${
                  hasNotifications
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-600 dark:text-gray-400'
                }`} />
                {hasNotifications && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {/* User Menu - Simplified on mobile */}
              <div className="flex items-center space-x-2 sm:space-x-3">
                {!user.business.isIndividual && (
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title={t('auth.logout')}
                >
                  <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Navigation Menu */}
      <div
        className={`fixed top-16 left-0 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="p-4 overflow-y-auto h-full">
          {/* Mobile User Info */}
          {!user.business.isIndividual && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>

            {/* Mobile-only controls */}
            <div className="mt-3 flex items-center gap-2">
              <div className="sm:hidden">
                <LanguageSelector toggle={true} />
              </div>
              {sessionConfig && (
                <div className="md:hidden">
                  <SessionCountdownTimer
                    sessionTimeoutMs={sessionConfig.timeout * 60 * 1000}
                    warningThresholdMs={sessionConfig.warningTime * 60 * 1000}
                    onSessionExpired={handleSessionExpired}
                    onWarningReached={handleSessionWarning}
                  />
                </div>
              )}
            </div>
          </div>
          )}

          <ul className="space-y-2">
            {[
              { id: 'dashboard', label: t('dashboard.nav.dashboard', 'Dashboard'), icon: Building2 },
              // Show "Monitored Devices" tab for all users with subscription tier (free, subscribed, enterprise)
              ...(authUser?.subscriptionTier ? [{ id: 'devices', label: 'Monitored Devices', icon: HardDrive }] : []),
              { id: 'locations', label: t('dashboard.nav.locations', 'Service Locations'), icon: MapPin },
              { id: 'schedule', label: t('dashboard.nav.schedule', 'Schedule Service'), icon: Calendar },
              { id: 'requests', label: t('dashboard.nav.requests', 'View Requests'), icon: Clock },
              { id: 'invoices', label: t('dashboard.nav.invoices', 'Invoices'), icon: DollarSign },
              { id: 'files', label: t('dashboard.nav.files', 'File Storage'), icon: FileText },
              { id: 'settings', label: t('dashboard.nav.settings', 'Settings'), icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className={`h-5 w-5 mr-3 ${
                        isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                      }`} />
                      {item.label}
                    </div>
                    {item.id === 'requests' && unseenServiceRequestChanges > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
                        {unseenServiceRequestChanges > 99 ? '99+' : unseenServiceRequestChanges}
                      </span>
                    )}
                    {item.id === 'invoices' && unseenInvoiceChanges > 0 && (
                      <span className="bg-yellow-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
                        {unseenInvoiceChanges > 99 ? '99+' : unseenInvoiceChanges}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Main Container - fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 h-full">
          <div className="flex gap-6 h-full">
            {/* Desktop Sidebar Navigation - Hidden on mobile */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <nav className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sticky top-6">
              <ul className="space-y-2">
                {[
                  { id: 'dashboard', label: t('dashboard.nav.dashboard', 'Dashboard'), icon: Building2 },
                  // Show "Monitored Devices" tab for all users with subscription tier (free, subscribed, enterprise)
                  ...(authUser?.subscriptionTier ? [{ id: 'devices', label: 'Monitored Devices', icon: HardDrive }] : []),
                  { id: 'locations', label: t('dashboard.nav.locations', 'Service Locations'), icon: MapPin },
                  { id: 'schedule', label: t('dashboard.nav.schedule', 'Schedule Service'), icon: Calendar },
                  { id: 'requests', label: t('dashboard.nav.requests', 'View Requests'), icon: Clock },
                  { id: 'invoices', label: t('dashboard.nav.invoices', 'Invoices'), icon: DollarSign },
                  { id: 'files', label: t('dashboard.nav.files', 'File Storage'), icon: FileText },
                  { id: 'settings', label: t('dashboard.nav.settings', 'Settings'), icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center">
                          <Icon className={`h-5 w-5 mr-3 ${
                            isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                          }`} />
                          {item.label}
                        </div>
                        {item.id === 'requests' && unseenServiceRequestChanges > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
                            {unseenServiceRequestChanges > 99 ? '99+' : unseenServiceRequestChanges}
                          </span>
                        )}
                        {item.id === 'invoices' && unseenInvoiceChanges > 0 && (
                          <span className="bg-yellow-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
                            {unseenInvoiceChanges > 99 ? '99+' : unseenInvoiceChanges}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Scrollable Main Content */}
          <main className="flex-1 overflow-y-auto lg:pr-2">
            {activeTab === 'dashboard' && (
              <div className="space-y-4 sm:space-y-6">
                {/* Subscription Status Banner */}
                {authUser?.subscriptionTier === 'free' && (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg shadow-sm border-2 border-blue-300 dark:border-blue-600 p-4 sm:p-6">
                    <div className="flex items-start space-x-3">
                      <HardDrive className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-1">
                          Free Plan - {authUser.devicesAllowed || 2} Devices Included
                        </h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                          You have full monitoring and alerting for up to {authUser.devicesAllowed || 2} devices.
                          Want to monitor more devices? Upgrade starting at $9.99/month per additional device.
                        </p>
                        <button
                          onClick={() => setActiveTab('devices')}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <HardDrive className="h-4 w-4 mr-2" />
                          Manage Devices & Upgrade
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subscribed/Enterprise Plan Banner */}
                {(authUser?.subscriptionTier === 'subscribed' || authUser?.subscriptionTier === 'enterprise') && (
                  <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-lg shadow-sm border-2 border-green-300 dark:border-green-600 p-4 sm:p-6">
                    <div className="flex items-start space-x-3">
                      <HardDrive className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-1">
                          {authUser.subscriptionTier === 'enterprise' ? 'Enterprise' : 'Pro'} Plan - {authUser.devicesAllowed || 2} Devices
                        </h3>
                        <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                          Full monitoring, alerting, and remote management for all your devices.
                        </p>
                        <button
                          onClick={() => setActiveTab('devices')}
                          className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <HardDrive className="h-4 w-4 mr-2" />
                          Manage Devices
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Device Selector - Show if user has devices */}
                {agents.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <AgentSelector
                      agents={agents}
                      selectedAgentId={selectedAgentId}
                      onSelectAgent={handleSelectAgent}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                )}

                {/* Welcome Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {(() => {
                      // Check if account was created within last 10 minutes (first-time user)
                      const isNewUser = user.createdAt &&
                        (new Date().getTime() - new Date(user.createdAt).getTime()) < 10 * 60 * 1000;

                      return isNewUser
                        ? `${t('dashboard.welcomeNew')}, ${user.firstName}!`
                        : `${t('dashboard.welcome')}, ${user.firstName}!`;
                    })()}
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                    {t('dashboard.description')}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  {/* Access Level Card */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Users className="h-7 w-7 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.accessLevel')}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                          {getAccessLevel()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Accessible Locations */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <MapPin className="h-7 w-7 sm:h-8 sm:w-8 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.locations')}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                          {user.accessibleLocations.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Service Requests - Placeholder */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Clock className="h-7 w-7 sm:h-8 sm:w-8 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.activeRequests')}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                          0
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Storage Usage - Placeholder */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <HardDrive className="h-7 w-7 sm:h-8 sm:w-8 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.storageUsed')}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                          0%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('dashboard.quickActions.title')}</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                    <button
                      onClick={() => setActiveTab('schedule')}
                      className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <Calendar className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
                      <span className="text-green-700 dark:text-green-300 font-medium">{t('dashboard.nav.schedule')}</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('files')}
                      className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
                      <span className="text-blue-700 dark:text-blue-300 font-medium">{t('files.uploadFiles')}</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('requests')}
                      className="flex items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                    >
                      <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400 mr-3" />
                      <span className="text-purple-700 dark:text-purple-300 font-medium">{t('dashboard.quickActions.viewRequests')}</span>
                    </button>
                  </div>
                </div>

                {/* Device Metrics - Show if a device is selected */}
                {selectedAgentId && (
                  <div className="mt-6">
                    <ThemeProvider>
                      <AgentDetails
                        agentId={selectedAgentId}
                        hideHeader={true}
                      />
                    </ThemeProvider>
                  </div>
                )}
              </div>
            )}

            {/* Monitored Devices Tab - Available for all subscription users */}
            {activeTab === 'devices' && authUser?.subscriptionTier && (
              viewingDeviceFromList ? (
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    onClick={() => setViewingDeviceFromList(null)}
                    className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Monitored Devices
                  </button>
                  {/* Device Details */}
                  <ThemeProvider>
                    <AgentDetails
                      agentId={viewingDeviceFromList}
                      hideHeader={true}
                    />
                  </ThemeProvider>
                </div>
              ) : (
                <TrialDevicesManager
                  authUser={authUser}
                  onDeviceRemoved={() => {
                    // Refresh agents list
                    console.log('Device removed successfully');
                    // Optionally trigger agent list refresh in dashboard
                  }}
                  onViewMetrics={(agentId) => {
                    setViewingDeviceFromList(agentId);
                  }}
                  onEditSettings={async (agentId) => {
                    // Fetch agent details to get current device_name and device_type
                    try {
                      const response = await agentService.getAgent(agentId);
                      if (response.success && response.data) {
                        setEditingDeviceId(agentId);
                        setEditingDeviceName(response.data.device_name);
                        setEditingDeviceType(response.data.device_type);
                        setDeviceSettingsModalOpen(true);
                      }
                    } catch (err) {
                      console.error('Failed to load device details:', err);
                    }
                  }}
                />
              )
            )}

            {activeTab === 'locations' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                    {t('locations.title')}
                  </h2>
                  <button
                    onClick={() => setShowAddLocationForm(true)}
                    className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('locations.addLocation')}
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {user.accessibleLocations.map((location) => {
                    const formatPhoneNumber = (phone: string) => {
                      const cleaned = phone.replace(/\D/g, '');
                      if (cleaned.length === 10) {
                        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
                      }
                      return phone;
                    };

                    const getMapUrl = (address: any) => {
                      const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
                      return `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`;
                    };

                    return (
                      <div
                        key={location.id}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {location.name}
                            </h3>
                            <a
                              href={getMapUrl(location.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline cursor-pointer mt-1 block"
                            >
                              {location.address.street}
                            </a>
                            <a
                              href={getMapUrl(location.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline cursor-pointer block"
                            >
                              {location.address.city}, {location.address.state} {location.address.zipCode}
                            </a>
                            {location.contact.person && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  <strong>{t('locations.contact')}:</strong> {location.contact.person}
                                </p>
                                {location.contact.phone && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <strong>{t('locations.phone')}:</strong>{' '}
                                    <a
                                      href={`tel:${location.contact.phone}`}
                                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                                    >
                                      {formatPhoneNumber(location.contact.phone)}
                                    </a>
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 ml-2">
                            <a
                              href={getMapUrl(location.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                              title={t('locations.openInMaps')}
                            >
                              <MapPin className="h-5 w-5 flex-shrink-0" />
                            </a>
                            <button
                              onClick={() => handleEditLocation(location)}
                              className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                              title={t('locations.editLocation')}
                            >
                              <Edit className="h-5 w-5 flex-shrink-0" />
                            </button>
                            <button
                              onClick={() => handleDeleteLocation(location)}
                              className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                              title={t('locations.deleteLocation')}
                            >
                              <Trash2 className="h-5 w-5 flex-shrink-0" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {user.accessibleLocations.length === 0 && (
                  <div className="text-center py-8">
                    <MapPin className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">{t('locations.noLocations')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Service Tab */}
            {activeTab === 'schedule' && (
              <ServiceScheduler />
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <ClientSettings />
            )}

            {/* Service Requests Tab */}
            {activeTab === 'requests' && (
              <ServiceRequests
                initialServiceRequestId={serviceRequestIdToOpen}
                onServiceRequestOpened={() => setServiceRequestIdToOpen(null)}
              />
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <InvoicesList />
              </div>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <FileManager onNavigateToServiceRequest={handleNavigateToServiceRequest} />
              </div>
            )}

            {/* Placeholder for other tabs */}
            {activeTab !== 'dashboard' && activeTab !== 'locations' && activeTab !== 'schedule' && activeTab !== 'settings' && activeTab !== 'requests' && activeTab !== 'invoices' && activeTab !== 'files' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4 capitalize">
                  {activeTab.replace(/([A-Z])/g, ' $1').trim()}
                </h2>
                <div className="text-center py-8 sm:py-12">
                  <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                    {t('general.comingSoon')}
                  </p>
                </div>
              </div>
            )}
          </main>
          </div>
        </div>
      </div>

      {/* Add Service Location Form Modal */}
      <AddServiceLocationForm
        isOpen={showAddLocationForm}
        onClose={() => setShowAddLocationForm(false)}
        onSuccess={handleServiceLocationAdded}
      />

      {/* Edit Service Location Form Modal */}
      {editingLocation && (
        <EditServiceLocationForm
          isOpen={showEditLocationForm}
          onClose={() => {
            setShowEditLocationForm(false);
            setEditingLocation(null);
          }}
          onSuccess={handleServiceLocationUpdated}
          location={editingLocation}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && deletingLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('locations.deleteConfirmation.title')}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('locations.deleteConfirmation.message', { locationName: deletingLocation.name })}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteLocation}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50"
              >
                {t('general.cancel')}
              </button>
              <button
                onClick={confirmDeleteLocation}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isDeleting ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    {t('locations.deleteConfirmation.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('locations.deleteConfirmation.confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Settings Modal */}
      {editingDeviceId && (
        <DeviceSettingsModal
          isOpen={deviceSettingsModalOpen}
          onClose={() => {
            setDeviceSettingsModalOpen(false);
            setEditingDeviceId(null);
            setEditingDeviceName('');
            setEditingDeviceType('');
          }}
          agentId={editingDeviceId}
          currentDeviceName={editingDeviceName}
          currentDeviceType={editingDeviceType}
          onUpdate={() => {
            // Refresh agents list
            if (authUser) {
              agentService.listAgents().then((response) => {
                if (response.success && response.data?.agents) {
                  setAgents(response.data.agents);
                }
              });
            }
          }}
        />
      )}
    </div>
  );
};

export default ClientDashboard;