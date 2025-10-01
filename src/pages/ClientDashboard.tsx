import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../contexts/ClientThemeContext';
import { useClientLanguage } from '../contexts/ClientLanguageContext';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { RoleBasedStorage } from '../utils/roleBasedStorage';
import ServiceScheduler from '../components/client/ServiceScheduler';
import ServiceRequests from '../components/client/ServiceRequests';
import ClientSettings from '../components/client/ClientSettings';
import LanguageSelector from '../components/client/LanguageSelector';
import AddServiceLocationForm from '../components/client/AddServiceLocationForm';
import SessionCountdownTimer from '../components/client/SessionCountdownTimer';
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
  HardDrive,
  Building,
  Plus,
  Menu,
  X
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  createdAt?: string;
  business: {
    id: string;
    name: string;
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
  const { signOut } = useEnhancedAuth();
  const { hasNotifications, unseenServiceRequestChanges, startViewTimer, clearViewTimer } = useNotifications();
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

  // State for mobile menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
  const isBusinessLevelClient = user.accessibleLocations.length > 1;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Sticky Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
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
                      alt={`${user.business.name} logo`}
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
                      <Building className="h-5 w-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                    <Building className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
              <div className="ml-3">
                <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-none">
                  {user.business.name}
                </h1>
                <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">{t('client.portal', 'Client Portal')}</p>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Session Countdown Timer - Hidden on mobile */}
              <div className="hidden md:block">
                <SessionCountdownTimer
                  sessionTimeoutMs={15 * 60 * 1000} // 15 minutes
                  warningThresholdMs={2 * 60 * 1000} // 2 minutes warning
                  onSessionExpired={handleSessionExpired}
                  onWarningReached={handleSessionWarning}
                />
              </div>

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
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>
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
              <div className="md:hidden">
                <SessionCountdownTimer
                  sessionTimeoutMs={15 * 60 * 1000}
                  warningThresholdMs={2 * 60 * 1000}
                  onSessionExpired={handleSessionExpired}
                  onWarningReached={handleSessionWarning}
                />
              </div>
            </div>
          </div>

          <ul className="space-y-2">
            {[
              { id: 'dashboard', label: t('dashboard.nav.dashboard', 'Dashboard'), icon: Building2 },
              { id: 'locations', label: t('dashboard.nav.locations', 'Service Locations'), icon: MapPin },
              { id: 'schedule', label: t('dashboard.nav.schedule', 'Schedule Service'), icon: Calendar },
              { id: 'requests', label: t('dashboard.nav.requests', 'View Requests'), icon: Clock },
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
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Main Container - fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 h-full">
          <div className="flex gap-6 h-full">
            {/* Desktop Sidebar Navigation - Hidden on mobile */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <nav className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sticky top-6">
              <ul className="space-y-2">
                {[
                  { id: 'dashboard', label: t('dashboard.nav.dashboard', 'Dashboard'), icon: Building2 },
                  { id: 'locations', label: t('dashboard.nav.locations', 'Service Locations'), icon: MapPin },
                  { id: 'schedule', label: t('dashboard.nav.schedule', 'Schedule Service'), icon: Calendar },
                  { id: 'requests', label: t('dashboard.nav.requests', 'View Requests'), icon: Clock },
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
                          {isBusinessLevelClient ? t('dashboard.stats.business') : t('dashboard.stats.site')}
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
              </div>
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
                          <a
                            href={getMapUrl(location.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                            title="Open in Maps"
                          >
                            <MapPin className="h-5 w-5 flex-shrink-0 ml-2" />
                          </a>
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
              <ServiceRequests />
            )}

            {/* Placeholder for other tabs */}
            {activeTab !== 'dashboard' && activeTab !== 'locations' && activeTab !== 'schedule' && activeTab !== 'settings' && activeTab !== 'requests' && (
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
    </div>
  );
};

export default ClientDashboard;