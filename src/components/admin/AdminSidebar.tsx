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
  Receipt,
  Filter,
  HardDrive,
  FolderOpen,
  MessageSquare,
  HelpCircle,
  Monitor
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermissionContext } from '../../contexts/PermissionContext';

type AdminView = 'overview' | 'employees' | 'employee-calendar' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'invoices' | 'service-locations' | 'closure-reasons' | 'roles' | 'permissions' | 'permission-audit-log' | 'role-hierarchy' | 'reports' | 'settings' | 'service-hour-rates' | 'pricing-settings' | 'password-complexity' | 'workflow-configuration' | 'filter-presets' | 'quota-management' | 'client-files' | 'testimonials' | 'rating-questions' | 'agents' | 'agent-details';

interface AdminSidebarProps {
  currentView: AdminView;
  setCurrentView: (view: AdminView) => void;
  user: unknown;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  permission?: string;
}

interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView,
  setCurrentView,
  user
}) => {
  const { hasPermission } = usePermissionContext();

  const navigationGroups: NavigationGroup[] = [
    {
      title: '',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart3 }
      ]
    },
    {
      title: 'People & HR',
      items: [
        { id: 'employees', label: 'Employees', icon: Users, permission: 'view.employees.enable' },
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
      title: 'Service Operations',
      items: [
        { id: 'services', label: 'Service Types', icon: Settings, permission: 'view.services.enable' },
        { id: 'service-requests', label: 'Service Requests', icon: ClipboardList, permission: 'view.service_requests.enable' },
        { id: 'agents', label: 'Monitoring Agents', icon: Monitor, permission: 'view.agents.enable' },
        { id: 'workflow-configuration', label: 'Workflow Configuration', icon: Workflow, permission: 'view.workflow_configuration.enable' },
        { id: 'closure-reasons', label: 'Closure Reasons', icon: XCircle, permission: 'view.closure_reasons.enable' },
        { id: 'testimonials', label: 'Testimonials', icon: MessageSquare, permission: 'view.testimonials.enable' },
        { id: 'rating-questions', label: 'Rating Questions', icon: HelpCircle, permission: 'view.rating_questions.enable' }
      ]
    },
    {
      title: 'Billing & Finance',
      items: [
        { id: 'invoices', label: 'Invoices', icon: Receipt, permission: 'view.invoices.enable' },
        { id: 'service-hour-rates', label: 'Service Hour Rates', icon: Clock, permission: 'view.service_hour_rates.enable' },
        { id: 'pricing-settings', label: 'Pricing Settings', icon: DollarSign, permission: 'view.pricing_settings.enable' }
      ]
    },
    {
      title: 'Security & Permissions',
      items: [
        { id: 'roles', label: 'Roles', icon: UserCog, permission: 'view.roles.enable' },
        { id: 'permissions', label: 'Permissions', icon: Shield, permission: 'view.permissions.enable' },
        { id: 'role-hierarchy', label: 'Role Hierarchy', icon: Network, permission: 'view.role_hierarchy.enable' },
        { id: 'permission-audit-log', label: 'Permission Audit Log', icon: FileText, permission: 'view.permission_audit_log.enable' },
        { id: 'password-complexity', label: 'Password Policy', icon: Lock, permission: 'view.password_complexity.enable' }
      ]
    },
    {
      title: 'Storage & Files',
      items: [
        { id: 'quota-management', label: 'Quota Management', icon: HardDrive, permission: 'view.quota_statistics.enable' },
        { id: 'client-files', label: 'Client Files', icon: FolderOpen, permission: 'view.client_files.enable' }
      ]
    },
    {
      title: 'Administration',
      items: [
        { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'view.reports.enable' },
        { id: 'filter-presets', label: 'Filter Presets', icon: Filter, permission: 'view.settings.enable' },
        { id: 'settings', label: 'Settings', icon: Settings, permission: 'view.settings.enable' }
      ]
    }
  ];

  // Filter navigation groups to show only items with permissions
  const filteredNavigationGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // If item has no permission requirement, always show it
      if (!item.permission) return true;
      // Otherwise, check if user has the required permission
      return hasPermission(item.permission);
    })
  })).filter(group => group.items.length > 0); // Hide groups with no visible items

  // Find which group contains the current view
  const getActiveGroupIndex = (): number => {
    return filteredNavigationGroups.findIndex(group =>
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
    return !filteredNavigationGroups[groupIndex].title ||
           manuallyExpandedGroup === groupIndex ||
           activeGroupIndex === groupIndex;
  };

  return (
    <div className={`w-64 ${themeClasses.bg.sidebar} ${themeClasses.shadow.md} h-screen flex flex-col`}>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 pt-8">
        <div className="space-y-2">
          {filteredNavigationGroups.map((group, groupIndex) => (
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