import React, { useState, useEffect } from 'react';
import {
  Users,
  Settings,
  UserPlus,
  FileText,
  BarChart3,
  Shield,
  ClipboardList,
  Building,
  UserCog,
  Lock,
  MapPin,
  XCircle,
  Calendar,
  Network,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Workflow,
  Receipt
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';

type AdminView = 'overview' | 'employees' | 'employee-calendar' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'invoices' | 'service-locations' | 'closure-reasons' | 'roles' | 'permissions' | 'permission-audit-log' | 'role-hierarchy' | 'reports' | 'settings' | 'service-hour-rates' | 'pricing-settings' | 'password-complexity' | 'workflow-configuration';

interface AdminSidebarProps {
  currentView: AdminView;
  setCurrentView: (view: AdminView) => void;
  user: unknown;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView,
  setCurrentView,
  user
}) => {
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
        { id: 'employees', label: 'Employees', icon: Users },
        { id: 'employee-calendar', label: 'Employee Calendar', icon: Calendar }
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
        { id: 'service-requests', label: 'Service Requests', icon: ClipboardList },
        { id: 'invoices', label: 'Invoices', icon: Receipt },
        { id: 'workflow-configuration', label: 'Workflow Configuration', icon: Workflow },
        { id: 'closure-reasons', label: 'Closure Reasons', icon: XCircle }
      ]
    },
    {
      title: 'System Management',
      items: [
        { id: 'roles', label: 'Roles', icon: UserCog },
        { id: 'permissions', label: 'Permissions', icon: Shield },
        { id: 'role-hierarchy', label: 'Role Hierarchy', icon: Network },
        { id: 'permission-audit-log', label: 'Permission Audit Log', icon: FileText },
        { id: 'password-complexity', label: 'Password Policy', icon: Lock },
        { id: 'service-hour-rates', label: 'Service Hour Rates', icon: Clock },
        { id: 'pricing-settings', label: 'Pricing Settings', icon: DollarSign },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'settings', label: 'Settings', icon: Settings }
      ]
    }
  ] as const;

  // Find which group contains the current view
  const getActiveGroupIndex = (): number => {
    return navigationGroups.findIndex(group =>
      group.items.some(item => item.id === currentView)
    );
  };

  // Load manually expanded group from localStorage
  const [manuallyExpandedGroup, setManuallyExpandedGroup] = useState<number>(() => {
    const saved = localStorage.getItem('adminSidebarExpandedGroup');
    return saved !== null ? parseInt(saved) : -1; // Default to none manually expanded
  });

  // Save to localStorage whenever manually expanded group changes
  useEffect(() => {
    localStorage.setItem('adminSidebarExpandedGroup', manuallyExpandedGroup.toString());
  }, [manuallyExpandedGroup]);

  // Toggle group - smart expansion (keeps active view's group expanded)
  const toggleGroup = (groupIndex: number) => {
    setManuallyExpandedGroup(manuallyExpandedGroup === groupIndex ? -1 : groupIndex);
  };

  // Determine if a group should be expanded
  const isGroupExpanded = (groupIndex: number): boolean => {
    const activeGroupIndex = getActiveGroupIndex();
    // Show if: no title (Overview), manually expanded, or contains active view
    return !navigationGroups[groupIndex].title ||
           manuallyExpandedGroup === groupIndex ||
           activeGroupIndex === groupIndex;
  };

  return (
    <div className={`w-64 ${themeClasses.bg.sidebar} ${themeClasses.shadow.md} h-screen flex flex-col`}>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 pt-8">
        <div className="space-y-2">
          {navigationGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Group Header - Collapsible */}
              {group.title ? (
                <button
                  onClick={() => toggleGroup(groupIndex)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors hover:opacity-80"
                >
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${themeClasses.text.tertiary}`}>
                    {group.title}
                  </h3>
                  {isGroupExpanded(groupIndex) ? (
                    <ChevronDown className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
                  )}
                </button>
              ) : (
                // No title groups (like Overview) are always visible
                <div className="mb-2"></div>
              )}

              {/* Group Items - Only show if expanded */}
              {isGroupExpanded(groupIndex) && (
                <div className="space-y-1 mt-1">
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
              )}

              {/* Separator line (except for last group) */}
              {groupIndex < navigationGroups.length - 1 && (
                <div className={`my-3 border-t ${themeClasses.border.primary} opacity-50`}></div>
              )}
            </div>
          ))}
        </div>
      </nav>


    </div>
  );
};

export default AdminSidebar;