// Database Types and Interfaces

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  text_color: string;
  background_color: string;
  border_color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'technician' | 'sales'; // Legacy type for backward compatibility
export type UserRoles = UserRole[]; // Array of roles for multi-role support
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'terminated';
export type Department = 'administration' | 'technical' | 'customer_service' | 'management' | 'other';

export interface User {
  id: string;
  cognitoId: string;
  email: string;
  role: UserRole; // Primary role for compatibility
  roles?: UserRoles; // Multiple roles support
  // Name fields (breaking up name into components)
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string; // Nickname/preferred name (e.g., "John" for "Jonathan")
  // Basic Info
  photo?: string;
  pronouns?: string;
  phone?: string;
  notes?: string;
  isActive: boolean;
  // Address fields (broken into components)
  address?: EmployeeAddress;
  // Employee-specific fields
  employeeNumber?: string; // e.g., "RT-2024-001"
  hireDate?: string; // ISO date string
  department?: Department;
  jobTitle?: string;
  managerId?: string; // ID of manager (another User)
  employeeStatus?: EmployeeStatus;
  terminationDate?: string; // ISO date string
  emergencyContact?: EmergencyContact;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAddress {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface EmergencyContact {
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface Admin extends User {
  role: 'admin';
  canCreateAdmins: boolean;
  canCreateTechnicians: boolean;
  canManageServices: boolean;
  canManageClients: boolean;
}

export interface Technician extends User {
  role: 'technician';
  availability: TechnicianAvailability;
  services: string[]; // Array of service IDs
  isAdmin: boolean; // Can be granted admin rights
  hourlyRate?: number;
  certifications?: string[];
}

export interface Client extends User {
  role: 'client';
  businessId: string; // Links to Business table
  isBusinessOwner: boolean; // Primary contact for the business
  jobTitle?: string;
  contracts: string[]; // Array of contract IDs
  preferredTechnicians?: string[]; // Array of technician IDs
  emailConfirmed: boolean;
  emailConfirmationToken?: string;
  emailConfirmationExpires?: string;
}

export interface Business {
  id: string;
  businessName: string;
  logo?: string;
  businessAddress: Address;
  serviceAddresses: ServiceAddress[];
  domainEmail: string; // For email confirmation (e.g., @company.com)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAddress {
  id: string;
  label: string; // e.g., "Main Office", "Warehouse", "Home"
  address: Address;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  isActive: boolean;
}

export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedHours: number;
  basePrice: number;
  isActive: boolean;
  requiredSkills: string[];
  tools?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
  exceptions: AvailabilityException[]; // Vacation, sick days, etc.
}

export interface TimeSlot {
  start: string; // HH:MM format
  end: string; // HH:MM format
  isAvailable: boolean;
}

export interface AvailabilityException {
  date: string; // YYYY-MM-DD format
  type: 'vacation' | 'sick' | 'personal' | 'unavailable';
  note?: string;
}

export interface Contract {
  id: string;
  clientId: string;
  title: string;
  description: string;
  services: ContractService[];
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed' | 'cancelled' | 'pending';
  totalAmount: number;
  paymentTerms: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractService {
  serviceId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  notes?: string;
}

export interface ServiceRequest {
  id: string;
  clientId: string;
  clientName: string;
  technicianId?: string;
  technicianName?: string;
  contractId?: string;
  services: ServiceRequestService[]; // Array of requested services
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'pending' | 'assigned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
  requestedDate: string; // When client requested service
  scheduledDate?: string; // When service is scheduled
  completedDate?: string; // When service was completed
  estimatedHours: number;
  actualHours?: number;
  estimatedCost: number;
  actualCost?: number;
  title: string;
  description: string;
  clientNotes?: string;
  technicianNotes?: string;
  adminNotes?: string;
  serviceAddress: ServiceAddress;
  urgency: 'routine' | 'urgent' | 'emergency';
  contactPerson: string;
  contactPhone: string;
  preferredTimeSlots?: TimeSlot[];
  attachments?: RequestAttachment[];
  statusHistory: ServiceRequestStatusChange[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestService {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  estimatedHours: number;
  notes?: string;
}

export interface ServiceRequestStatusChange {
  id: string;
  fromStatus: ServiceRequest['status'];
  toStatus: ServiceRequest['status'];
  changedBy: string;
  changedByName: string;
  reason?: string;
  notes?: string;
  timestamp: string;
}

export interface RequestAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  uploadedByName: string;
  description?: string;
  url: string;
  uploadedAt: string;
}

export interface WorkOrder {
  id: string;
  serviceRequestId: string;
  clientId: string;
  technicianId?: string;
  contractId?: string;
  services: string[]; // Array of service IDs
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate?: string;
  completedDate?: string;
  estimatedHours: number;
  actualHours?: number;
  description: string;
  notes?: string;
  clientNotes?: string;
  technicianNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form Types
export interface CreateUserRequest {
  email: string;
  name: string;
  role: UserRole; // Primary role
  roles?: UserRoles; // Multiple roles
  photo?: string;
  pronouns?: string;
  address?: string;
  phone?: string;
  notes?: string;
  // Employee fields
  hireDate?: string;
  department?: Department;
  jobTitle?: string;
  managerId?: string;
  employeeStatus?: EmployeeStatus;
  emergencyContact?: EmergencyContact;
  // Role-specific fields
  services?: string[]; // For technicians
  availability?: TechnicianAvailability; // For technicians
  companyName?: string; // For clients
  serviceAddresses?: Omit<ServiceAddress, 'id'>[]; // For clients
}

export interface UpdateUserRequest extends Partial<CreateUserRequest> {
  id: string;
  isActive?: boolean;
}

export interface CreateServiceRequest {
  name: string;
  description: string;
  category: string;
  estimatedHours: number;
  basePrice: number;
  requiredSkills: string[];
  tools?: string[];
  notes?: string;
}

export interface UpdateServiceRequest extends Partial<CreateServiceRequest> {
  id: string;
  isActive?: boolean;
}

// Authentication Types
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole; // Primary role
  roles?: UserRoles; // Multiple roles
  name: string;
  businessId?: string; // Business ID for the user
  businessName?: string; // Business name for the user
  timeFormatPreference?: '12h' | '24h';
  isFirstAdmin?: boolean;
  isTrial?: boolean; // Indicates if this is a trial user (unified approach)
  trialExpiresAt?: string; // When the trial expires (unified approach)
  agentId?: string; // Agent ID for users accessing via agent magic-link
  // Legacy trial fields (deprecated, will be removed)
  trialAgentId?: string;
  trialId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  loginType?: 'employee' | 'client';
}

export interface SignupRequest extends LoginRequest {
  name: string;
  role?: UserRole; // Only for admin registration
}

export interface ClientRegistrationRequest {
  // Business Information
  businessName: string;
  businessAddress: Address;
  domainEmail: string; // Business domain for email validation

  // Primary Contact Information
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  jobTitle?: string;

  // Service Addresses
  serviceAddresses: Omit<ServiceAddress, 'id'>[];

  // Account Information
  password: string;
  confirmPassword: string;
}

export interface EmailConfirmationRequest {
  token: string;
  email: string;
}

export interface EmailConfirmationResponse {
  success: boolean;
  message: string;
  user?: AuthUser;
}

// Service Request Filtering
export interface ServiceRequestFilters {
  status?: ServiceRequest['status'] | 'all';
  priority?: ServiceRequest['priority'] | 'all';
  urgency?: ServiceRequest['urgency'] | 'all';
  clientId?: string;
  technicianId?: string;
  dateFrom?: string;
  dateTo?: string;
  serviceId?: string;
  searchQuery?: string;
}

export interface ServiceRequestListRequest {
  filters?: ServiceRequestFilters;
  sortBy?: 'requestedDate' | 'scheduledDate' | 'priority' | 'status' | 'clientName';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}