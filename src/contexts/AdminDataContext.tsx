import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { adminService } from '../services/adminService';
import { websocketService } from '../services/websocketService';
import { useEnhancedAuth } from './EnhancedAuthContext';
import { RoleBasedStorage } from '../utils/roleBasedStorage';

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

interface AdminDataContextType {
  // Data
  dashboardData: DashboardData | null;
  employees: Employee[];
  clients: Client[];
  businesses: Business[];
  services: Service[];
  serviceRequests: ServiceRequest[];
  serviceLocations: ServiceLocation[];

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
  refreshServiceRequests: () => Promise<void>;
  refreshServiceLocations: () => Promise<void>;
  refreshOnlineStatus: () => Promise<void>;

  // Data setters (for optimistic updates)
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setBusinesses: React.Dispatch<React.SetStateAction<Business[]>>;
  setServices: React.Dispatch<React.SetStateAction<Service[]>>;
  setServiceRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>;
  setServiceLocations: React.Dispatch<React.SetStateAction<ServiceLocation[]>>;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const refreshServiceRequests = async () => {
    try {
      const data = await adminService.getServiceRequests();
      setServiceRequests(data.serviceRequests || []);
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
      // Fetch all data in parallel
      const [
        dashboardResult,
        employeesResult,
        businessesResult,
        serviceLocationsResult,
        clientsResult,
        servicesResult,
        serviceRequestsResult
      ] = await Promise.all([
        adminService.getDashboardData(),
        adminService.getEmployeesWithLoginStatus(),
        adminService.getBusinesses(),
        adminService.getServiceLocations(),
        adminService.getUsers({ role: 'client', limit: 1000 }),
        adminService.getServices(),
        adminService.getServiceRequests()
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
      setServiceRequests(serviceRequestsResult.serviceRequests || []);

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

  // WebSocket connection for real-time employee status updates
  useEffect(() => {
    console.log('🔌 WebSocket useEffect triggered, sessionToken:', sessionToken ? '***EXISTS***' : 'NULL');
    if (!sessionToken) {
      console.log('🔌 No session token available for WebSocket connection');
      return;
    }

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
          console.log(`📡 Entity ${change.entityType} ${change.action}:`, change.entityId);

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

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up WebSocket connection...');
      websocketService.disconnect();
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

    // Data setters
    setEmployees,
    setClients,
    setBusinesses,
    setServices,
    setServiceRequests,
    setServiceLocations
  };

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
};