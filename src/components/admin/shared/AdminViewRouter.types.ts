export type AdminView = 'overview' | 'employees' | 'employee-calendar' | 'clients' | 'businesses' | 'services' | 'service-requests' | 'invoices' | 'service-locations' | 'closure-reasons' | 'roles' | 'permissions' | 'permission-audit-log' | 'role-hierarchy' | 'reports' | 'settings' | 'service-hour-rates' | 'pricing-settings' | 'password-complexity' | 'workflow-configuration' | 'filter-presets' | 'quota-management' | 'client-files' | 'testimonials' | 'rating-questions' | 'agents' | 'agent-details' | 'trial-agents' | 'alert-configurations' | 'alert-history' | 'policy-automation' | 'software-deployment' | 'subscription-pricing';

export interface AdminViewRouterProps {
  currentView: AdminView;
  onViewChange?: (view: AdminView) => void;
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
  externalShowInactiveEmployees?: boolean;
  externalShowSoftDeletedEmployees?: boolean;
  // Toggle setter functions from parent (optional - falls back to internal state)
  setShowInactiveClients?: (show: boolean) => void;
  setShowSoftDeletedClients?: (show: boolean) => void;
  setShowInactiveBusinesses?: (show: boolean) => void;
  setShowSoftDeletedBusinesses?: (show: boolean) => void;
  setShowInactiveServiceLocations?: (show: boolean) => void;
  setShowSoftDeletedServiceLocations?: (show: boolean) => void;
  setShowInactiveEmployees?: (show: boolean) => void;
  setShowSoftDeletedEmployees?: (show: boolean) => void;
  // Modal handlers
  onOpenModal?: (modalName: string, entity?: unknown) => void;
  // Service request highlighting
  highlightUnacknowledged?: boolean;
  // Agent navigation from alerts
  agentNavigationContext?: {
    agentId: string;
    resource: 'cpu' | 'memory' | 'disk';
    timestamp: string;
    indicator?: string;
    alertId?: number;
  } | null;
  onNavigateToAgentFromAlert?: (context: {
    agentId: string;
    resource: 'cpu' | 'memory' | 'disk';
    timestamp: string;
    indicator?: string;
    alertId?: number;
  }) => void;
  onClearAgentNavigationContext?: () => void;
}

export interface ConfirmationDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmButtonText?: string;
  confirmButtonColor?: 'red' | 'blue' | 'green';
  iconType?: 'warning' | 'success' | 'info';
}

export interface UserCreationContext {
  businessId: string;
  serviceLocationId: string;
}

export interface ServiceLocationPrefillData {
  businessName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
}

export interface NewUserData {
  firstName: string;
  lastName: string;
  middleInitial: string;
  preferredName: string;
  pronouns: string;
  email: string;
  roles: string[];
  photo: string;
  phone: string;
  address: {
    street: string;
    street2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  department: string | undefined;
  jobTitle: string;
  hireDate: string;
  employeeStatus: string | undefined;
  emergencyContact: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
    email: string;
  };
}
