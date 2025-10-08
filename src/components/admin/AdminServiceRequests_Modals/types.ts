// Shared types for AdminServiceRequests and its sub-components

export interface ServiceRequest {
  id: string;
  request_number: string;
  title: string;
  description: string;
  status: string;
  status_color: string;
  urgency: string;
  urgency_color: string;
  priority: string;
  priority_color: string;
  service_type: string;
  business_id?: string;
  business_name: string;
  is_individual: boolean;
  location_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  technician_name: string | null;
  requested_date: string;
  requested_time_start: string | null;
  requested_time_end: string | null;
  requested_datetime?: string | null;
  requested_duration_minutes?: number | null;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  scheduled_datetime?: string | null;
  scheduled_duration_minutes?: number | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  started_at: string | null;
  total_work_duration_minutes: number | null;
  file_count?: number;
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_total?: number | null;
  invoice_payment_status?: string | null;
  locationDetails?: {
    name: string;
    street_address_1: string;
    street_address_2: string | null;
    city: string;
    state: string;
    zip_code: string;
    contact_phone: string | null;
    contact_person: string | null;
    contact_email: string | null;
  } | null;
  cost?: {
    baseRate: number;
    durationHours: number;
    total: number;
  } | null;
}

export interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  name: string; // Alias for full_name, used in filters
  email: string;
  working_status: string;
  working_status_display: string;
  active_requests: number;
}

export interface Status {
  id: string;
  name: string;
  description: string;
  color_code: string;
  sort_order: number;
  display_order: number;
  is_active: boolean;
  is_final_status: boolean;
  requires_technician: boolean;
}

export interface ClosureReason {
  id: string;
  reason: string;
  description: string;
  requires_follow_up: boolean;
  is_active: boolean;
}

export interface ServiceRequestFile {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_size_bytes: number;
  content_type: string;
  description: string;
  created_at: string;
  uploaded_by_email?: string;
  uploaded_by_type?: string;
}

export interface ServiceRequestNote {
  id: string;
  note_text: string;
  note_type: string;
  created_by_type: string;
  created_by_name: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  payment_status: string;
  base_hourly_rate: number;
  standard_hours: number;
  standard_rate: number;
  standard_cost: number;
  premium_hours: number;
  premium_rate: number;
  premium_cost: number;
  emergency_hours: number;
  emergency_rate: number;
  emergency_cost: number;
  waived_hours: number;
  is_first_service_request: boolean;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  work_description: string | null;
  notes: string | null;
  business_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  request_number: string;
  service_title: string;
  service_created_at: string;
  service_completed_at: string;
}

export interface CompanyInfo {
  company_name: string;
  company_address_line1: string;
  company_address_line2: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  company_phone: string;
  company_email: string;
}

export interface Filters {
  search: string;
  status: string;
  urgency: string;
  priority: string;
  business: string;
  technician: string;
}
