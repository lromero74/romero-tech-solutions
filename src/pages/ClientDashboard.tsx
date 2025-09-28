import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../contexts/ClientThemeContext';
import { useClientLanguage } from '../contexts/ClientLanguageContext';
import ServiceScheduler from '../components/client/ServiceScheduler';
import ClientSettings from '../components/client/ClientSettings';
import LanguageSelector from '../components/client/LanguageSelector';
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
  Building
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
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
    address_label: string;
    street: string;
    city: string;
    state: string;
    contact_role?: string;
    is_primary_contact?: boolean;
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
  const { t, loading: languageLoading } = useClientLanguage();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  // Initialize activeTab from localStorage or default to 'dashboard'
  const [activeTab, setActiveTabState] = useState(() => {
    const savedTab = localStorage.getItem('clientActiveTab');
    return savedTab || 'dashboard';
  });

  // Custom setActiveTab that also persists to localStorage
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem('clientActiveTab', tab);
  };

  // Load client data from existing auth system or sessionStorage
  useEffect(() => {
    const loadClientData = () => {
      // First try to get from existing auth system
      const authUserData = localStorage.getItem('authUser');
      if (authUserData) {
        try {
          const authUser = JSON.parse(authUserData);
          if (authUser.role === 'client') {
            // Create mock client data structure from auth user
            const mockClientData = {
              user: {
                id: authUser.id,
                email: authUser.email,
                firstName: authUser.name?.split(' ')[0] || 'Client',
                lastName: authUser.name?.split(' ')[1] || 'User',
                phone: '',
                role: authUser.role,
                business: {
                  id: 'business-1',
                  name: 'The Salvation Army - San Diego',
                  address: {
                    street: '1350 Hotel Circle N',
                    city: 'San Diego',
                    state: 'CA',
                    zipCode: '92108'
                  }
                },
                accessibleLocations: [
                  {
                    id: 'loc-1',
                    address_label: 'Main Office',
                    street: '1350 Hotel Circle N',
                    city: 'San Diego',
                    state: 'CA',
                    contact_role: 'Primary Contact',
                    is_primary_contact: true
                  }
                ]
              },
              session: {
                token: 'mock-token',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
              }
            };
            setClientData(mockClientData);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.error('Failed to parse auth user data:', error);
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

      // No valid client data found
      console.log('No client data found, redirecting to login');
      if (onNavigate) onNavigate('clogin');
    };

    loadClientData();
  }, [onNavigate]);

  const handleLogout = () => {
    // Clear all client authentication data
    sessionStorage.removeItem('clientData');
    localStorage.removeItem('authUser');
    localStorage.removeItem('clientData');

    // Navigate back to client login
    if (onNavigate) onNavigate('clogin');
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
  const isBusinessLevelClient = user.accessibleLocations.length > 1;

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Sticky Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
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
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {user.business.name}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('client.portal', 'Client Portal')}</p>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-4">
              {/* Language Selector */}
              <LanguageSelector compact={true} />

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={isDarkMode ? t('client.toggleTheme.light', 'Switch to light mode') : t('client.toggleTheme.dark', 'Switch to dark mode')}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 text-yellow-500" />
                ) : (
                  <Moon className="h-5 w-5 text-gray-600" />
                )}
              </button>

              {/* Notifications */}
              <button
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={t('client.notifications', 'Notifications')}
              >
                <Bell className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </button>

              {/* User Menu */}
              <div className="flex items-center space-x-3">
                <div className="text-right">
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
                  <LogOut className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container - fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-full">
          <div className="flex gap-6 h-full">
            {/* Sticky Sidebar Navigation */}
            <aside className="w-64 flex-shrink-0">
              <nav className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sticky top-6">
              <ul className="space-y-2">
                {[
                  { id: 'dashboard', label: t('dashboard.nav.dashboard', 'Dashboard'), icon: Building2 },
                  { id: 'locations', label: t('dashboard.nav.locations', 'Service Locations'), icon: MapPin },
                  { id: 'schedule', label: t('dashboard.nav.schedule', 'Schedule Service'), icon: Calendar },
                  { id: 'requests', label: t('dashboard.nav.requests', 'Service Requests'), icon: Clock },
                  { id: 'files', label: t('dashboard.nav.files', 'File Storage'), icon: FileText },
                  { id: 'settings', label: t('dashboard.nav.settings', 'Settings'), icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className={`h-5 w-5 mr-3 ${
                          isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                        }`} />
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Scrollable Main Content */}
          <main className="flex-1 overflow-y-auto pr-2">
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Welcome Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {t('dashboard.welcome')}, {user.firstName}!
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('dashboard.description') || 'Manage your service requests and view your account information.'}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Access Level Card */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.accessLevel') || 'Access Level'}</p>
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                          {isBusinessLevelClient ? t('dashboard.stats.business') || 'Business' : t('dashboard.stats.site') || 'Site'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Accessible Locations */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <MapPin className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.locations')}</p>
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                          {user.accessibleLocations.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Service Requests - Placeholder */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.activeRequests')}</p>
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                          0
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Storage Usage - Placeholder */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <HardDrive className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.stats.storageUsed')}</p>
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                          0%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('dashboard.quickActions.title')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <button
                      onClick={() => setActiveTab('schedule')}
                      className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
                      <span className="text-blue-700 dark:text-blue-300 font-medium">{t('dashboard.nav.schedule')}</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('files')}
                      className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
                      <span className="text-green-700 dark:text-green-300 font-medium">{t('files.uploadFiles')}</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('requests')}
                      className="flex items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                    >
                      <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400 mr-3" />
                      <span className="text-purple-700 dark:text-purple-300 font-medium">{t('dashboard.quickActions.viewRequests') || 'View Requests'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'locations' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  {t('locations.title')}
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {user.accessibleLocations.map((location) => (
                    <div
                      key={location.id}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {location.address_label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {location.street}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {location.city}, {location.state}
                          </p>
                          {location.contact_role && (
                            <div className="mt-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                location.is_primary_contact
                                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                              }`}>
                                {location.contact_role}
                                {location.is_primary_contact && ` (${t('locations.primary')})`}
                              </span>
                            </div>
                          )}
                        </div>
                        <MapPin className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2" />
                      </div>
                    </div>
                  ))}
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

            {/* Placeholder for other tabs */}
            {activeTab !== 'dashboard' && activeTab !== 'locations' && activeTab !== 'schedule' && activeTab !== 'settings' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 capitalize">
                  {activeTab.replace(/([A-Z])/g, ' $1').trim()}
                </h2>
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {t('general.comingSoon') || 'This section is coming soon. We\'re working on implementing this feature.'}
                  </p>
                </div>
              </div>
            )}
          </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;