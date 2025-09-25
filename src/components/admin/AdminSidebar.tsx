import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Settings,
  UserPlus,
  FileText,
  BarChart3,
  Shield,
  LogOut,
  ClipboardList,
  Building,
  ChevronDown,
  User,
  Lock,
  Globe,
  Bell,
  UserCog,
  Moon,
  Sun,
  MapPin
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';

type AdminView = 'overview' | 'employees' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'service-locations' | 'roles' | 'reports' | 'settings' | 'password-complexity';

interface AdminSidebarProps {
  currentView: AdminView;
  setCurrentView: (view: AdminView) => void;
  user: any;
  signOut: () => void;
  onOpenChangePasswordModal?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView,
  setCurrentView,
  user,
  signOut,
  onOpenChangePasswordModal
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const { theme, toggleTheme, isDark } = useTheme();

  const handleAccountAction = (action: string) => {
    if (action === 'theme') {
      toggleTheme();
      return;
    }

    setIsUserMenuOpen(false);

    switch (action) {
      case 'profile':
        // TODO: Open profile settings modal/page
        console.log('Open profile settings');
        break;
      case 'password':
        if (onOpenChangePasswordModal) {
          onOpenChangePasswordModal();
        }
        break;
      case 'preferences':
        // TODO: Open language/preferences modal/page
        console.log('Open preferences');
        break;
      case 'notifications':
        // TODO: Open notification settings modal/page
        console.log('Open notification settings');
        break;
      case 'signout':
        signOut();
        break;
      default:
        break;
    }
  };
  const navigationGroups = [
    {
      title: '',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart3 }
      ]
    },
    {
      title: 'People Management',
      items: [
        { id: 'employees', label: 'Employees', icon: Users }
      ]
    },
    {
      title: 'Business Management',
      items: [
        { id: 'businesses', label: 'Businesses', icon: Building },
        { id: 'service-locations', label: 'Service Locations', icon: MapPin },
        { id: 'clients', label: 'Clients', icon: UserPlus }
      ]
    },
    {
      title: 'Service Management',
      items: [
        { id: 'services', label: 'Services', icon: Settings },
        { id: 'service-requests', label: 'Service Requests', icon: ClipboardList }
      ]
    },
    {
      title: 'System Management',
      items: [
        { id: 'roles', label: 'Roles', icon: UserCog },
        { id: 'password-complexity', label: 'Password Policy', icon: Lock },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'settings', label: 'Settings', icon: Settings }
      ]
    }
  ] as const;

  return (
    <div className={`w-64 ${themeClasses.bg.sidebar} ${themeClasses.shadow.md} h-screen flex flex-col`}>
      {/* User Info with Dropdown */}
      <div className={`p-6 ${themeClasses.border.primary} border-b relative`} ref={userMenuRef}>
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-full flex items-center justify-between ${themeClasses.bg.hover} rounded-lg p-2 transition-colors`}
        >
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${themeClasses.text.primary}`}>{user?.name}</p>
              <p className={`text-xs ${themeClasses.text.tertiary}`}>Administrator</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 ${themeClasses.text.muted} transition-transform ${
            isUserMenuOpen ? 'rotate-180' : ''
          }`} />
        </button>

        {/* User Dropdown Menu */}
        {isUserMenuOpen && (
          <div className={`absolute top-full left-6 right-6 mt-2 ${themeClasses.bg.modal} ${themeClasses.border.primary} border rounded-lg ${themeClasses.shadow.lg} z-50`}>
            <div className="py-2">
              <button
                onClick={() => handleAccountAction('profile')}
                className={`w-full flex items-center px-4 py-2 text-sm ${themeClasses.text.secondary} ${themeClasses.bg.hover} transition-colors`}
              >
                <User className="w-4 h-4 mr-3" />
                Profile Settings
              </button>
              <button
                onClick={() => handleAccountAction('password')}
                className={`w-full flex items-center px-4 py-2 text-sm ${themeClasses.text.secondary} ${themeClasses.bg.hover} transition-colors`}
              >
                <Lock className="w-4 h-4 mr-3" />
                Change Password
              </button>
              <button
                onClick={() => handleAccountAction('preferences')}
                className={`w-full flex items-center px-4 py-2 text-sm ${themeClasses.text.secondary} ${themeClasses.bg.hover} transition-colors`}
              >
                <Globe className="w-4 h-4 mr-3" />
                Language & Preferences
              </button>
              <button
                onClick={() => handleAccountAction('notifications')}
                className={`w-full flex items-center px-4 py-2 text-sm ${themeClasses.text.secondary} ${themeClasses.bg.hover} transition-colors`}
              >
                <Bell className="w-4 h-4 mr-3" />
                Notification Settings
              </button>
              <div className={`border-t ${themeClasses.border.primary} my-1`}></div>
              <button
                onClick={() => handleAccountAction('theme')}
                className={`w-full flex items-center px-4 py-2 text-sm ${themeClasses.text.secondary} ${themeClasses.bg.hover} transition-colors`}
              >
                {isDark ? (
                  <Sun className="w-4 h-4 mr-3" />
                ) : (
                  <Moon className="w-4 h-4 mr-3" />
                )}
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </button>
              <div className={`border-t ${themeClasses.border.primary} my-1`}></div>
              <button
                onClick={() => handleAccountAction('signout')}
                className={`w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 ${themeClasses.bg.hover} transition-colors`}
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-1">
          {navigationGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Group Title */}
              {group.title && (
                <div className="px-3 py-2">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${themeClasses.text.tertiary}`}>
                    {group.title}
                  </h3>
                </div>
              )}

              {/* Group Items */}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id as AdminView)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      currentView === item.id
                        ? `${themeClasses.bg.active} ${themeClasses.text.accent}`
                        : `${themeClasses.text.secondary} ${themeClasses.bg.hover} hover:${themeClasses.text.primary}`
                    }`}
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Separator line (except for last group) */}
              {groupIndex < navigationGroups.length - 1 && (
                <div className={`my-4 border-t ${themeClasses.border.primary} opacity-50`}></div>
              )}
            </div>
          ))}
        </div>
      </nav>


    </div>
  );
};

export default AdminSidebar;