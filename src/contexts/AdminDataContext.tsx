import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { adminService } from '../services/adminService';
import { websocketService } from '../services/websocketService';
import { useEnhancedAuth } from './EnhancedAuthContext';
import { RoleBasedStorage } from '../utils/roleBasedStorage';
import { Role } from '../types/database';
import { Permission, permissionService } from '../services/permissionService';
import apiService from '../services/apiService';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  employeeNumber: string;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  businessName: string;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
  serviceLocationAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
}

export interface Business {
  id: string;
  businessName: string;
  contactEmail?: string;
  contactPhone?: string;
  industry?: string;
  locationCount: number;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  serviceName: string;
  description?: string;
  category?: string;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequest {
  id: string;
  clientId: string;
  serviceId: string;
  status: string;
  priority: string;
  description?: string;
  requestedDate: string;
  scheduledDate?: string;
  completedDate?: string;
  assignedEmployeeId?: string;
  isActive: boolean;
  softDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLocation {
  id: string;
  business_id: string;
  business_name: string;
  address_label: string;
  location_name?: string;
  location_type: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  is_headquarters: boolean;
  is_active: boolean;
  soft_delete: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  totalEmployees: number;
  totalClients: number;
  totalBusinesses: number;
  totalServices: number;
  totalServiceRequests: number;
  totalServiceLocations: number;
  activeEmployees: number;
  activeClients: number;
  activeBusinesses: number;
  activeServices: number;
  pendingServiceRequests: number;
  completedServiceRequests: number;
}

export interface GlobalQuota {
  id: string;
  maxFileSizeBytes: number;
  maxTotalStorageBytes: number;
  maxFileCount: number;
  storageSoftLimitBytes: number;
  warningThresholdPercentage: number;
  alertThresholdPercentage: number;
  softLimitBytes?: number;
  hardLimitBytes?: number;
  warningThresholdPercent?: number;
}

export interface QuotaSummary {
  totalStorageUsed: number;
  totalFiles: number;
  clientsWithCustomQuotas: number;
  clientsNearLimit: number;
  clientsOverLimit: number;
}

export interface ClientFile {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  mimeType: string;
  fileDescription: string | null;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  serviceRequestId: string | null;
  serviceRequestTitle: string | null;
  virusScanStatus: 'clean' | 'pending' | 'infected' | null;
  virusScanResult: string | null;
  virusScanDate: string | null;
  isPublicToBusiness: boolean;
  createdAt: string;
  updatedAt: string;
  uploader: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  } | null;
}

export interface ClientFilesData {
  businesses: Array<{
    id: string;
    name: string;
    totalFiles: number;
    totalStorageBytes: number;
  }>;
  files: ClientFile[];
}

export interface Technician {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
}

export interface ServiceRequestStatus {
  id: string;
  status_key: string;
  display_name: string;
  description: string;
  is_terminal: boolean;
  sort_order: number;
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  payment_status: string;
  total_amount: number;
  is_first_service_request: boolean;
  business_name: string;
  request_number: string;
  service_title: string;
}

export interface RateCategory {
  id: string;
  categoryName: string;
  baseHourlyRate: number;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
}

export interface WorkflowRule {
  id: string;
  rule_name: string;
  rule_description: string;
  trigger_event: string;
  recipient_type: string;
  recipient_roles: string[];
  notification_type: string;
  email_template_name: string;
  timeout_minutes: number | null;
  max_retry_count: number;
  retry_interval_minutes: number | null;
  execution_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStats {
  stateStats: { current_state: string; count: string }[];
  notificationStats: { trigger_event: string; count: string; sent_count: string; failed_count: string }[];
  pendingActions: { pending_count: string; next_action_time: string | null };
}

export interface Testimonial {
  id: string;
  service_request_id: string;
  client_id: string;
  client_name: string;
  total_score: number;
  original_testimonial_text: string;
  edited_testimonial_text: string | null;
  was_edited: boolean;
  is_approved: boolean;
  allow_public_display: boolean;
  display_name_preference: 'first' | 'last' | 'full' | 'anonymous';
  approved_by_employee_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RatingQuestion {
  id: string;
  question_key: string;
  question_text: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminDataContextType {
  // Data
  dashboardData: DashboardData | null;
  employees: Employee[];
  clients: Client[];
  businesses: Business[];
  services: Service[];
  serviceRequests: ServiceRequest[];
  serviceLocations: ServiceLocation[];
  roles: Role[];
  permissions: Permission[];
  serviceTypes: any[];
  closureReasons: any[];
  passwordPolicy: any | null;

  // Cached data with timestamps
  globalQuota: GlobalQuota | null;
  quotaSummary: QuotaSummary | null;
  clientFilesData: ClientFilesData | null;
  technicians: Technician[];
  serviceRequestStatuses: ServiceRequestStatus[];
  invoices: InvoiceSummary[];
  rateCategories: RateCategory[];
  workflowRules: WorkflowRule[];
  workflowStats: WorkflowStats | null;
  testimonials: Testimonial[];
  ratingQuestions: RatingQuestion[];

  // Loading and error states
  loading: boolean;
  error: string | null;

  // Actions
  refreshAllData: () => Promise<void>;
  refreshDashboardData: () => Promise<void>;
  refreshEmployees: () => Promise<void>;
  refreshClients: () => Promise<void>;
  refreshBusinesses: () => Promise<void>;
  refreshServices: () => Promise<void>;
  refreshServiceRequests: (force?: boolean) => Promise<void>;
  refreshServiceLocations: () => Promise<void>;
  refreshOnlineStatus: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  refreshServiceTypes: () => Promise<void>;
  refreshClosureReasons: () => Promise<void>;
  refreshPasswordPolicy: () => Promise<void>;
  refreshQuotaData: (force?: boolean) => Promise<void>;
  refreshClientFilesData: (force?: boolean) => Promise<void>;
  refreshTechnicians: (force?: boolean) => Promise<void>;
  refreshServiceRequestStatuses: (force?: boolean) => Promise<void>;
  refreshInvoices: (force?: boolean) => Promise<void>;
  refreshRateCategories: (force?: boolean) => Promise<void>;
  refreshWorkflowData: (force?: boolean) => Promise<void>;
  refreshTestimonials: (force?: boolean) => Promise<void>;
  refreshRatingQuestions: (force?: boolean) => Promise<void>;

  // Data setters (for optimistic updates)
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setBusinesses: React.Dispatch<React.SetStateAction<Business[]>>;
  setServices: React.Dispatch<React.SetStateAction<Service[]>>;
  setServiceRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>;
  setServiceLocations: React.Dispatch<React.SetStateAction<ServiceLocation[]>>;
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  setPermissions: React.Dispatch<React.SetStateAction<Permission[]>>;
  setServiceTypes: React.Dispatch<React.SetStateAction<any[]>>;
  setClosureReasons: React.Dispatch<React.SetStateAction<any[]>>;
  setPasswordPolicy: React.Dispatch<React.SetStateAction<any | null>>;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within AdminDataProvider');
  }
  return context;
};

interface AdminDataProviderProps {
  children: ReactNode;
}

export const AdminDataProvider: React.FC<AdminDataProviderProps> = ({ children }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [closureReasons, setClosureReasons] = useState<any[]>([]);
  const [passwordPolicy, setPasswordPolicy] = useState<any | null>(null);

  // Cached quota and file data
  const [globalQuota, setGlobalQuota] = useState<GlobalQuota | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummary | null>(null);
  const [clientFilesData, setClientFilesData] = useState<ClientFilesData | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceRequestStatuses, setServiceRequestStatuses] = useState<ServiceRequestStatus[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [rateCategories, setRateCategories] = useState<RateCategory[]>([]);
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [ratingQuestions, setRatingQuestions] = useState<RatingQuestion[]>([]);

  // Cache timestamps (5 minutes TTL)
  const quotaDataTimestampRef = useRef<number>(0);
  const clientFilesDataTimestampRef = useRef<number>(0);
  const testimonialsTimestampRef = useRef<number>(0);
  const ratingQuestionsTimestampRef = useRef<number>(0);
  const techniciansTimestampRef = useRef<number>(0);
  const statusesTimestampRef = useRef<number>(0);
  const invoicesTimestampRef = useRef<number>(0);
  const rateCategoriesTimestampRef = useRef<number>(0);
  const workflowDataTimestampRef = useRef<number>(0);
  const serviceRequestsTimestampRef = useRef<number>(0);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug: Log when serviceRequests changes
  useEffect(() => {
    console.log('🔔 AdminDataContext: serviceRequests array changed, count:', serviceRequests.length);
  }, [serviceRequests]);

  // Get session token for WebSocket authentication
  const { sessionToken } = useEnhancedAuth();

  // Helper function to enhance clients with service location addresses
  const enhanceClientsWithAddresses = (
    rawClients: unknown[], // Raw client data from API
    businesses: Business[],
    serviceLocations: ServiceLocation[]
  ): Client[] => {
    return rawClients.map(client => {
      // Find the business for this client by matching business name
      const business = businesses.find(b => b.businessName === client.businessName);
      if (business) {
        // Find the headquarters service location for this business
        const headquartersLocation = serviceLocations.find(sl =>
          sl.business_id === business.id && sl.is_headquarters
        );
        if (headquartersLocation) {
          return {
            ...client,
            serviceLocationAddress: {
              street: headquartersLocation.street,
              city: headquartersLocation.city,
              state: headquartersLocation.state,
              zipCode: headquartersLocation.zip_code,
              country: headquartersLocation.country
            }
          };
        }
      }
      return client;
    });
  };

  const refreshDashboardData = async () => {
    try {
      const data = await adminService.getDashboardData();
      setDashboardData(data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to fetch dashboard data');
    }
  };

  const refreshEmployees = async () => {
    try {
      console.log('🔄 Refreshing employee data...');
      // Use getEmployeesWithLoginStatus to get both soft_delete field AND real-time login status
      const data = await adminService.getEmployeesWithLoginStatus();
      console.log('📄 Raw employee data received:', data);
      console.log('👥 Employee count:', data.employees?.length);

      // Log soft delete status for debugging - check both softDelete and soft_delete
      const employees = data.employees || [];
      const softDeletedCount = employees.filter(emp => emp.softDelete || emp.soft_delete).length;
      console.log('🗑️ Soft deleted employees count:', softDeletedCount);


      // Map soft_delete to softDelete for frontend compatibility
      const normalizedEmployees = employees.map(emp => ({
        ...emp,
        softDelete: emp.softDelete || emp.soft_delete || false
      }));

      setEmployees(normalizedEmployees);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to fetch employees');
    }
  };

  const refreshClients = async () => {
    try {
      const data = await adminService.getUsers({ role: 'client', limit: 1000 });
      const rawClients = data.users || [];
      // Enhance clients with addresses using current businesses and service locations
      const enhancedClients = enhanceClientsWithAddresses(rawClients, businesses, serviceLocations);
      setClients(enhancedClients);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError('Failed to fetch clients');
    }
  };

  const refreshBusinesses = async () => {
    try {
      const data = await adminService.getBusinesses();
      setBusinesses(data.businesses || []);
    } catch (err) {
      console.error('Error fetching businesses:', err);
      setError('Failed to fetch businesses');
    }
  };

  const refreshServices = async () => {
    try {
      const data = await adminService.getServices();
      setServices(data.services || []);
    } catch (err) {
      console.error('Error fetching services:', err);
      setError('Failed to fetch services');
    }
  };

  const refreshServiceRequests = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - serviceRequestsTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && serviceRequests.length > 0) {
        console.log(`✅ Using cached service requests (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh service requests...');
      const data = await adminService.getServiceRequests();
      setServiceRequests(data.serviceRequests || []);
      serviceRequestsTimestampRef.current = now;
      console.log('✅ Service requests refreshed and cached');
    } catch (err) {
      console.error('Error fetching service requests:', err);
      setError('Failed to fetch service requests');
    }
  };

  const refreshServiceLocations = async () => {
    try {
      const data = await adminService.getServiceLocations();
      setServiceLocations(data.serviceLocations || []);
    } catch (err) {
      console.error('Error fetching service locations:', err);
      setError('Failed to fetch service locations');
    }
  };

  const refreshRoles = async () => {
    try {
      const data = await adminService.getRoles();
      setRoles(data || []);
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError('Failed to fetch roles');
    }
  };

  const refreshPermissions = async () => {
    try {
      const data = await permissionService.getAllPermissions();
      setPermissions(data || []);
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError('Failed to fetch permissions');
    }
  };

  const refreshServiceTypes = async () => {
    try {
      const response = await apiService.get('/service-types');
      setServiceTypes(response.data?.serviceTypes || response.serviceTypes || []);
    } catch (err) {
      console.error('Error fetching service types:', err);
      setError('Failed to fetch service types');
    }
  };

  const refreshClosureReasons = async () => {
    try {
      const response = await apiService.get('/admin/closure-reasons');
      setClosureReasons(response.data || response.closureReasons || []);
    } catch (err) {
      console.error('Error fetching closure reasons:', err);
      setError('Failed to fetch closure reasons');
    }
  };

  const refreshPasswordPolicy = async () => {
    try {
      const response = await apiService.get('/admin/password-policy');
      setPasswordPolicy(response.passwordPolicy || null);
    } catch (err) {
      console.error('Error fetching password policy:', err);
      setError('Failed to fetch password policy');
    }
  };

  const refreshQuotaData = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - quotaDataTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && globalQuota && quotaSummary) {
        console.log(`✅ Using cached quota data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh quota data...');
      const [quotaResponse, summaryResponse] = await Promise.all([
        apiService.get('/admin/global-quotas/active'),
        apiService.get('/admin/global-quotas/summary')
      ]);

      if (quotaResponse.success && quotaResponse.data) {
        setGlobalQuota(quotaResponse.data);
      }

      if (summaryResponse.success && summaryResponse.data) {
        setQuotaSummary(summaryResponse.data);
      }

      quotaDataTimestampRef.current = now;
      console.log('✅ Quota data refreshed and cached');
    } catch (err) {
      console.error('Error fetching quota data:', err);
      setError('Failed to fetch quota data');
    }
  };

  const refreshClientFilesData = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - clientFilesDataTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && clientFilesData) {
        console.log(`✅ Using cached client files data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh client files data...');
      const response = await apiService.get('/admin/client-files/all');

      if (response.success && response.data) {
        setClientFilesData(response.data);
      }

      clientFilesDataTimestampRef.current = now;
      console.log('✅ Client files data refreshed and cached');
    } catch (err) {
      console.error('Error fetching client files data:', err);
      setError('Failed to fetch client files data');
    }
  };

  const refreshTechnicians = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - techniciansTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && technicians.length > 0) {
        console.log(`✅ Using cached technicians data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh technicians data...');
      const response = await apiService.get('/admin/service-requests/technicians');

      if (response.success && response.data) {
        setTechnicians(response.data);
      }

      techniciansTimestampRef.current = now;
      console.log('✅ Technicians data refreshed and cached');
    } catch (err) {
      console.error('Error fetching technicians:', err);
      setError('Failed to fetch technicians');
    }
  };

  const refreshServiceRequestStatuses = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - statusesTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && serviceRequestStatuses.length > 0) {
        console.log(`✅ Using cached statuses data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh service request statuses...');
      const response = await apiService.get('/admin/service-requests/statuses');

      if (response.success && response.data) {
        setServiceRequestStatuses(response.data);
      }

      statusesTimestampRef.current = now;
      console.log('✅ Service request statuses refreshed and cached');
    } catch (err) {
      console.error('Error fetching service request statuses:', err);
      setError('Failed to fetch service request statuses');
    }
  };

  const refreshInvoices = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - invoicesTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && invoices.length > 0) {
        console.log(`✅ Using cached invoices data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh invoices data...');
      const response = await apiService.get('/admin/invoices');

      if (response.success && response.data) {
        setInvoices(response.data.invoices || []);
      }

      invoicesTimestampRef.current = now;
      console.log('✅ Invoices data refreshed and cached');
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to fetch invoices');
    }
  };

  const refreshRateCategories = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - rateCategoriesTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && rateCategories.length > 0) {
        console.log(`✅ Using cached rate categories data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh rate categories data...');
      const response = await apiService.get('/admin/hourly-rate-categories');

      if (response.success && response.data) {
        setRateCategories(response.data);
      }

      rateCategoriesTimestampRef.current = now;
      console.log('✅ Rate categories data refreshed and cached');
    } catch (err) {
      console.error('Error fetching rate categories:', err);
      setError('Failed to fetch rate categories');
    }
  };

  const refreshWorkflowData = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - workflowDataTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && workflowRules.length > 0 && workflowStats) {
        console.log(`✅ Using cached workflow data (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh workflow data...');
      const [rulesResponse, statsResponse] = await Promise.all([
        apiService.get('/admin/workflow-configuration/rules'),
        apiService.get('/admin/workflow-configuration/stats')
      ]);

      if (rulesResponse.success && rulesResponse.data?.rules) {
        setWorkflowRules(rulesResponse.data.rules);
      }

      if (statsResponse.success && statsResponse.data) {
        setWorkflowStats(statsResponse.data);
      }

      workflowDataTimestampRef.current = now;
      console.log('✅ Workflow data refreshed and cached');
    } catch (err) {
      console.error('Error fetching workflow data:', err);
      setError('Failed to fetch workflow data');
    }
  };

  const refreshTestimonials = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - testimonialsTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && testimonials.length > 0) {
        console.log(`✅ Using cached testimonials (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh testimonials...');
      const response = await apiService.get<{ testimonials: Testimonial[] }>('/admin/testimonials');

      if (response.testimonials) {
        setTestimonials(response.testimonials);
      }

      testimonialsTimestampRef.current = now;
      console.log('✅ Testimonials refreshed and cached');
    } catch (err) {
      console.error('Error fetching testimonials:', err);
      setError('Failed to fetch testimonials');
    }
  };

  const refreshRatingQuestions = async (force: boolean = false) => {
    try {
      const now = Date.now();
      const cacheAge = now - ratingQuestionsTimestampRef.current;

      // Return cached data if fresh and not forced
      if (!force && cacheAge < CACHE_TTL && ratingQuestions.length > 0) {
        console.log(`✅ Using cached rating questions (age: ${Math.round(cacheAge / 1000)}s)`);
        return;
      }

      console.log('🔄 Fetching fresh rating questions...');
      const response = await apiService.get<{ questions: RatingQuestion[] }>('/admin/rating-questions', {
        params: { includeInactive: 'true' }
      });

      if (response.questions) {
        setRatingQuestions(response.questions);
      }

      ratingQuestionsTimestampRef.current = now;
      console.log('✅ Rating questions refreshed and cached');
    } catch (err) {
      console.error('Error fetching rating questions:', err);
      setError('Failed to fetch rating questions');
    }
  };

  const refreshOnlineStatus = async () => {
    // Don't make API calls if no session token
    // Try localStorage as fallback if context value is not yet available (timing issue after login)
    const activeSessionToken = sessionToken || RoleBasedStorage.getItem('sessionToken');

    if (!activeSessionToken) {
      console.log('🔐 No session token (context or localStorage) - skipping online status refresh');
      return;
    }

    if (!sessionToken && activeSessionToken) {
      console.log('🔐 Using session token from localStorage (context not yet updated)');
    }

    try {
      // Only refresh login status without full data reload
      const data = await adminService.getEmployeesWithLoginStatus();
      const employees = data.employees || [];

      // Update existing employee data with fresh login status
      setEmployees(prevEmployees => {
        return prevEmployees.map(prevEmp => {
          const freshEmp = employees.find(emp => emp.id === prevEmp.id);
          if (freshEmp) {
            return {
              ...prevEmp,
              isLoggedIn: freshEmp.isLoggedIn,
              activeSessions: freshEmp.activeSessions,
              lastActivity: freshEmp.lastActivity,
              isRecentlyActive: freshEmp.isRecentlyActive
            };
          }
          return prevEmp;
        });
      });
    } catch (err) {
      // Silently handle errors to avoid disrupting UX during logout
      console.warn('Failed to refresh online status:', err);
    }
  };

  const refreshAllData = async () => {
    // Don't make API calls if no session token
    if (!sessionToken) {
      console.log('🔐 No session token - skipping data refresh');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Helper function to safely fetch data with permission handling
      const safeFetch = async <T,>(fetchFn: () => Promise<T>, defaultValue: T): Promise<T> => {
        try {
          return await fetchFn();
        } catch (error: any) {
          // If it's a permission error (403), silently return default value
          if (error.message?.includes('Insufficient permissions') || error.message?.includes('403')) {
            console.log(`ℹ️ Skipping data fetch due to insufficient permissions`);
            return defaultValue;
          }
          // Re-throw other errors
          throw error;
        }
      };

      // Fetch all data in parallel (including roles, permissions, service types, etc.)
      const [
        dashboardResult,
        employeesResult,
        businessesResult,
        serviceLocationsResult,
        clientsResult,
        servicesResult,
        serviceRequestsResult,
        rolesResult,
        permissionsResult,
        serviceTypesResult,
        closureReasonsResult,
        passwordPolicyResult,
        techniciansResult,
        statusesResult,
        invoicesResult,
        rateCategoriesResult,
        workflowRulesResult,
        workflowStatsResult,
        testimonialsResult,
        ratingQuestionsResult
      ] = await Promise.all([
        safeFetch(() => adminService.getDashboardData(), { employees: 0, businesses: 0, services: 0, clients: 0, serviceRequests: 0 }),
        safeFetch(() => adminService.getEmployeesWithLoginStatus(), { employees: [] }),
        safeFetch(() => adminService.getBusinesses(), { businesses: [] }),
        safeFetch(() => adminService.getServiceLocations(), { serviceLocations: [] }),
        safeFetch(() => adminService.getUsers({ role: 'client', limit: 1000 }), { users: [] }),
        safeFetch(() => adminService.getServices(), { services: [] }),
        safeFetch(() => adminService.getServiceRequests(), { serviceRequests: [] }),
        safeFetch(() => adminService.getRoles(), []),
        safeFetch(() => permissionService.getAllPermissions(), []),
        safeFetch(() => apiService.get('/service-types'), { serviceTypes: [] }),
        safeFetch(() => apiService.get('/admin/closure-reasons'), { closureReasons: [] }),
        safeFetch(() => apiService.get('/admin/password-complexity'), { requirements: null }),
        safeFetch(() => apiService.get('/admin/service-requests/technicians'), { data: [] }),
        safeFetch(() => apiService.get('/admin/service-requests/statuses'), { data: [] }),
        safeFetch(() => apiService.get('/admin/invoices'), { data: { invoices: [] } }),
        safeFetch(() => apiService.get('/admin/hourly-rate-categories'), { data: [] }),
        safeFetch(() => apiService.get('/admin/workflow-configuration/rules'), { data: { rules: [] } }),
        safeFetch(() => apiService.get('/admin/workflow-configuration/stats'), { data: null }),
        safeFetch(() => apiService.get('/admin/testimonials', { params: { includeInactive: 'true' } }), { testimonials: [] }),
        safeFetch(() => apiService.get('/admin/rating-questions', { params: { includeInactive: 'true' } }), { questions: [] })
      ]);

      // Set the data
      setDashboardData(dashboardResult);
      setEmployees(employeesResult.employees || []);

      const fetchedBusinesses = businessesResult.businesses || [];
      const fetchedServiceLocations = serviceLocationsResult.serviceLocations || [];
      setBusinesses(fetchedBusinesses);
      setServiceLocations(fetchedServiceLocations);

      // Enhance clients with addresses using the fetched businesses and service locations
      const rawClients = clientsResult.users || [];
      const enhancedClients = enhanceClientsWithAddresses(rawClients, fetchedBusinesses, fetchedServiceLocations);
      setClients(enhancedClients);

      setServices(servicesResult.services || []);

      // Set service requests and update timestamp for caching
      if (serviceRequestsResult.serviceRequests) {
        setServiceRequests(serviceRequestsResult.serviceRequests);
        serviceRequestsTimestampRef.current = Date.now();
      }

      // Set the new admin tab data
      setRoles(rolesResult || []);
      setPermissions(permissionsResult || []);
      setServiceTypes(serviceTypesResult.data?.serviceTypes || serviceTypesResult.serviceTypes || []);
      setClosureReasons(closureReasonsResult.data || closureReasonsResult.closureReasons || []);
      setPasswordPolicy(passwordPolicyResult.requirements || null);

      // Set cached data and update timestamps
      if (techniciansResult.data) {
        setTechnicians(techniciansResult.data);
        techniciansTimestampRef.current = Date.now();
      }
      if (statusesResult.data) {
        setServiceRequestStatuses(statusesResult.data);
        statusesTimestampRef.current = Date.now();
      }
      if (invoicesResult.data?.invoices) {
        setInvoices(invoicesResult.data.invoices);
        invoicesTimestampRef.current = Date.now();
      }
      if (rateCategoriesResult.data) {
        setRateCategories(rateCategoriesResult.data);
        rateCategoriesTimestampRef.current = Date.now();
      }
      if (workflowRulesResult.data?.rules) {
        setWorkflowRules(workflowRulesResult.data.rules);
      }
      if (workflowStatsResult.data) {
        setWorkflowStats(workflowStatsResult.data);
      }
      if (workflowRulesResult.data?.rules || workflowStatsResult.data) {
        workflowDataTimestampRef.current = Date.now();
      }
      if (testimonialsResult.testimonials) {
        setTestimonials(testimonialsResult.testimonials);
        testimonialsTimestampRef.current = Date.now();
      }
      if (ratingQuestionsResult.questions) {
        setRatingQuestions(ratingQuestionsResult.questions);
        ratingQuestionsTimestampRef.current = Date.now();
      }

    } catch (err) {
      console.error('Error fetching admin data:', err);
      setError('Failed to fetch admin data');
    } finally {
      setLoading(false);
    }
  };

  // Re-enhance clients when businesses or service locations change
  useEffect(() => {
    if (clients.length > 0 && businesses.length > 0 && serviceLocations.length > 0) {
      // Only re-enhance if we don't already have enhanced clients
      const hasEnhancedClients = clients.some(c => c.serviceLocationAddress);
      if (!hasEnhancedClients) {
        const enhancedClients = enhanceClientsWithAddresses(clients, businesses, serviceLocations);
        setClients(enhancedClients);
      }
    }
  }, [businesses, serviceLocations]);

  // Initial data fetch - only if session token exists
  useEffect(() => {
    if (sessionToken) {
      refreshAllData();
    }
  }, [sessionToken]);

  // Track previous sessionToken to prevent unnecessary reconnections
  const prevSessionTokenRef = useRef<string | null>(null);

  // WebSocket connection for real-time employee status updates
  useEffect(() => {
    console.log('🔌 WebSocket useEffect triggered, sessionToken:', sessionToken ? '***EXISTS***' : 'NULL');

    // 🚀 OPTIMIZATION: Skip if sessionToken hasn't actually changed
    if (prevSessionTokenRef.current === sessionToken && sessionToken) {
      console.log('✅ SessionToken unchanged, reusing existing WebSocket connection');
      return;
    }

    if (!sessionToken) {
      console.log('🔌 No session token available for WebSocket connection');
      // Disconnect if we had a previous connection
      if (prevSessionTokenRef.current) {
        websocketService.disconnect();
      }
      prevSessionTokenRef.current = null;
      return;
    }

    // Update ref with new sessionToken
    prevSessionTokenRef.current = sessionToken;

    const initializeWebSocket = async () => {
      try {
        // Connect to WebSocket server - construct WebSocket URL from API URL
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        console.log('🔍 Raw API base URL from env:', apiBaseUrl);

        // Extract the WebSocket URL by removing /api suffix
        let websocketUrl;
        if (apiBaseUrl.includes('api.romerotechsolutions.com')) {
          websocketUrl = 'https://api.romerotechsolutions.com';
        } else if (apiBaseUrl.includes('44.211.124.33:3001')) {
          // Production backend server (IP-based fallback)
          websocketUrl = 'http://44.211.124.33:3001';
        } else if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
          // Development environment
          websocketUrl = 'http://localhost:3001';
        } else {
          // Fallback: try to construct from API URL by removing /api suffix
          websocketUrl = apiBaseUrl.replace('/api', '').replace(/\/$/, '');
        }

        console.log('🔌 Connecting to WebSocket server:', websocketUrl);
        await websocketService.connect(websocketUrl);

        // Authenticate as admin
        console.log('🔐 Attempting WebSocket authentication with session token:', sessionToken ? 'PRESENT' : 'MISSING');
        websocketService.authenticateAdmin(sessionToken);

        // Set up event handlers
        websocketService.onEmployeeStatusChange((update) => {
          console.log('📊 Received employee status update via WebSocket');

          // Transform WebSocket data to match our Employee interface
          const transformedEmployees = update.employees.map(emp => ({
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
            preferredName: emp.preferredName,
            isActive: emp.isActive,
            workingStatus: emp.workingStatus,
            workingStatusDisplay: emp.workingStatusDisplay,
            workingStatusColor: emp.workingStatusColor,
            isLoggedIn: emp.isLoggedIn,
            lastActivity: emp.lastActivity,
            isRecentlyActive: emp.isRecentlyActive,
            // Keep other existing employee properties
            role: '',
            department: '',
            employeeNumber: '',
            softDelete: false,
            createdAt: '',
            updatedAt: ''
          }));

          // Update employees state with login status
          setEmployees(prevEmployees => {
            return prevEmployees.map(prevEmp => {
              const freshEmp = transformedEmployees.find(emp => emp.id === prevEmp.id);
              if (freshEmp) {
                return {
                  ...prevEmp,
                  isLoggedIn: freshEmp.isLoggedIn,
                  lastActivity: freshEmp.lastActivity,
                  isRecentlyActive: freshEmp.isRecentlyActive,
                  workingStatus: freshEmp.workingStatus,
                  workingStatusDisplay: freshEmp.workingStatusDisplay,
                  workingStatusColor: freshEmp.workingStatusColor
                };
              }
              return prevEmp;
            });
          });
        });

        websocketService.onEmployeeLogin((change) => {
          console.log('👤 Real-time login change:', change.email, '=', change.isLoggedIn);

          // Update specific employee login status
          setEmployees(prevEmployees => {
            return prevEmployees.map(emp => {
              if (emp.id === change.userId) {
                return {
                  ...emp,
                  isLoggedIn: change.isLoggedIn,
                  lastActivity: change.lastActivity,
                  isRecentlyActive: change.isRecentlyActive
                };
              }
              return emp;
            });
          });
        });

        // Listen for entity data changes (employees, clients, etc.)
        websocketService.onEntityDataChange(async (change) => {
          console.log(`📡 Entity ${change.entityType} ${change.action}:`, change.entityId, change);

          // Handle employee changes
          if (change.entityType === 'employee') {
            if (change.action === 'deleted') {
              // Remove from local state
              setEmployees(prevEmployees => prevEmployees.filter(emp => emp.id !== change.entityId));
            } else if (change.action === 'created' || change.action === 'updated' || change.action === 'restored') {
              // Fetch updated employee data
              try {
                const updatedEmployee = await adminService.getEmployeeFull(change.entityId);
                setEmployees(prevEmployees => {
                  const index = prevEmployees.findIndex(emp => emp.id === change.entityId);
                  if (index >= 0) {
                    // Update existing employee
                    const newEmployees = [...prevEmployees];
                    newEmployees[index] = updatedEmployee;
                    return newEmployees;
                  } else {
                    // Add new employee
                    return [...prevEmployees, updatedEmployee];
                  }
                });
                console.log(`✅ Employee ${change.action} in local state:`, change.entityId);
              } catch (error) {
                console.error(`❌ Failed to fetch updated employee ${change.entityId}:`, error);
              }
            }
          }

          // Handle client changes
          if (change.entityType === 'client') {
            // Similar logic for clients
            if (change.action === 'deleted') {
              setClients(prevClients => prevClients.filter(client => client.id !== change.entityId));
            } else {
              // For now, do a full refresh of clients since we don't have a single-client endpoint yet
              // TODO: Create similar getClientFull endpoint
              await refreshClients();
            }
          }

          // Handle service location changes
          if (change.entityType === 'serviceLocation') {
            if (change.action === 'deleted') {
              setServiceLocations(prevLocations => prevLocations.filter(loc => loc.id !== change.entityId));
            } else if (change.action === 'created' || change.action === 'updated' || change.action === 'restored') {
              // Refresh service locations
              await refreshServiceLocations();
            }
          }

          // Handle business changes
          if (change.entityType === 'business') {
            if (change.action === 'deleted') {
              setBusinesses(prevBusinesses => prevBusinesses.filter(biz => biz.id !== change.entityId));
            } else if (change.action === 'created' || change.action === 'updated' || change.action === 'restored') {
              // Refresh businesses
              await refreshBusinesses();
            }
          }

          // Handle role changes
          if (change.entityType === 'role') {
            await refreshRoles();
          }

          // Handle permission changes (note: permissions use a different broadcast pattern)
          if (change.entityType === 'permission') {
            await refreshPermissions();
          }

          // Handle service type changes
          if (change.entityType === 'serviceType') {
            await refreshServiceTypes();
          }

          // Handle closure reason changes
          if (change.entityType === 'closureReason') {
            await refreshClosureReasons();
          }

          // Handle password policy changes
          if (change.entityType === 'passwordPolicy') {
            await refreshPasswordPolicy();
          }

          // Handle service changes
          if (change.entityType === 'service') {
            console.log('🔄 Service changed, refreshing services...');
            await refreshServices();
          }

          // Handle service request changes
          if (change.entityType === 'serviceRequest') {
            try {
              console.log('🔄 Service request changed (optimistic):', change.action, change.entityId);
              console.log('🔍 Service request data:', change.serviceRequest);

              if (change.action === 'deleted') {
                // Remove from local state optimistically
                setServiceRequests(prevRequests => prevRequests.filter(req => req.id !== change.entityId));
                serviceRequestsTimestampRef.current = Date.now(); // Keep cache fresh
                console.log('✅ Service request removed from local state (optimistic)');
              } else if (change.action === 'created' && change.serviceRequest) {
                // Add new service request optimistically using data from WebSocket
                console.log('📝 Adding service request to array...');
                setServiceRequests(prevRequests => {
                  console.log('Current requests count:', prevRequests.length);
                  const newArray = [change.serviceRequest, ...prevRequests];
                  console.log('New requests count:', newArray.length);
                  return newArray;
                });
                serviceRequestsTimestampRef.current = Date.now(); // Keep cache fresh
                console.log('✅ New service request added to local state (optimistic)');
              } else if (change.action === 'updated' && change.serviceRequest) {
                // Update service request optimistically using data from WebSocket
                setServiceRequests(prevRequests => {
                  const index = prevRequests.findIndex(req => req.id === change.entityId);
                  if (index >= 0) {
                    const newRequests = [...prevRequests];
                    newRequests[index] = change.serviceRequest;
                    return newRequests;
                  } else {
                    // Request not in list yet, add it
                    return [change.serviceRequest, ...prevRequests];
                  }
                });
                serviceRequestsTimestampRef.current = Date.now(); // Keep cache fresh
                console.log('✅ Service request updated in local state (optimistic)');
              } else {
                // Fallback: if full data not in WebSocket event, fetch it
                console.warn('⚠️ WebSocket event missing full data, fetching from API');
                try {
                  const response = await adminService.getServiceRequest(change.entityId);
                  if (response.success && response.data) {
                    if (change.action === 'created') {
                      setServiceRequests(prevRequests => [response.data, ...prevRequests]);
                    } else {
                      setServiceRequests(prevRequests => {
                        const index = prevRequests.findIndex(req => req.id === change.entityId);
                        if (index >= 0) {
                          const newRequests = [...prevRequests];
                          newRequests[index] = response.data;
                          return newRequests;
                        }
                        return prevRequests;
                      });
                    }
                  }
                } catch (error) {
                  console.error('❌ Fallback fetch failed, doing full refresh:', error);
                  await refreshServiceRequests(true);
                }
              }
            } catch (error) {
              console.error('❌ CRITICAL ERROR in service request handler:', error);
              console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
              console.log('Change data that caused error:', change);
              // Don't crash - force refresh to get fresh data after error
              await refreshServiceRequests(true);
            }
          }

          // Handle invoice changes (optimistic - just refresh for now until backend sends full data)
          if (change.entityType === 'invoice') {
            console.log('🔄 Invoice changed, force refreshing invoices...');
            await refreshInvoices(true);
          }

          // Handle rate category / pricing settings changes (optimistic - just refresh for now)
          if (change.entityType === 'rateCategory' || change.entityType === 'pricingSetting') {
            console.log('🔄 Rate category changed, force refreshing rate categories...');
            await refreshRateCategories(true);
          }

          // Handle workflow rule changes (optimistic - just refresh for now)
          if (change.entityType === 'workflowRule' || change.entityType === 'workflow') {
            console.log('🔄 Workflow rule changed, force refreshing workflow data...');
            await refreshWorkflowData(true);
          }

          // Handle quota changes (optimistic - just refresh for now)
          if (change.entityType === 'quota' || change.entityType === 'globalQuota' || change.entityType === 'clientQuota') {
            console.log('🔄 Quota changed, force refreshing quota data...');
            await refreshQuotaData(true);
          }

          // Handle client file changes (optimistic - just refresh for now)
          if (change.entityType === 'clientFile' || change.entityType === 'file') {
            console.log('🔄 Client file changed, force refreshing file data...');
            await refreshClientFilesData(true);
          }

          // Handle testimonial changes
          if (change.entityType === 'testimonial') {
            console.log('🔄 Testimonial changed, force refreshing testimonials...');
            await refreshTestimonials(true);
          }

          // Handle rating question changes
          if (change.entityType === 'ratingQuestion') {
            console.log('🔄 Rating question changed, force refreshing rating questions...');
            await refreshRatingQuestions(true);
          }
        });

        websocketService.onAuthenticationError((error) => {
          console.error('❌ WebSocket authentication failed:', error.message);
          // Fallback to polling if WebSocket auth fails
          console.log('🔄 Falling back to initial data fetch...');
          refreshOnlineStatus();
        });

        console.log('✅ WebSocket initialized for real-time employee status updates');

      } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error);
        // Fallback to polling if WebSocket fails
        console.log('🔄 Falling back to initial data fetch...');
        refreshOnlineStatus();
      }
    };

    initializeWebSocket();

    // Cleanup - Note: websocketService is now smart about not disconnecting if connection is reused
    return () => {
      // Only cleanup runs when component unmounts or sessionToken actually changes
      // The websocketService will handle keeping connections alive when appropriate
      console.log('🧹 WebSocket cleanup function called (may not disconnect if connection reused)');
    };
  }, [sessionToken]);

  const value: AdminDataContextType = {
    // Data
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

    // Cached data
    globalQuota,
    quotaSummary,
    clientFilesData,
    technicians,
    serviceRequestStatuses,
    invoices,
    rateCategories,
    workflowRules,
    workflowStats,
    testimonials,
    ratingQuestions,

    // Loading and error states
    loading,
    error,

    // Actions
    refreshAllData,
    refreshDashboardData,
    refreshEmployees,
    refreshClients,
    refreshBusinesses,
    refreshServices,
    refreshServiceRequests,
    refreshServiceLocations,
    refreshOnlineStatus,
    refreshRoles,
    refreshPermissions,
    refreshServiceTypes,
    refreshClosureReasons,
    refreshPasswordPolicy,
    refreshQuotaData,
    refreshClientFilesData,
    refreshTechnicians,
    refreshServiceRequestStatuses,
    refreshInvoices,
    refreshRateCategories,
    refreshWorkflowData,
    refreshTestimonials,
    refreshRatingQuestions,

    // Data setters
    setEmployees,
    setClients,
    setBusinesses,
    setServices,
    setServiceRequests,
    setServiceLocations,
    setRoles,
    setPermissions,
    setServiceTypes,
    setClosureReasons,
    setPasswordPolicy
  };

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
};