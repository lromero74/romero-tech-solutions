import React from 'react';

export interface ServiceLocation {
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
}

export interface UrgencyLevel {
  id: string;
  level_name: string;
  lead_time_hours: number;
  priority_multiplier: number;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export interface ServiceType {
  id: string;
  type_code: string;
  type_name: string;
  category: string;
  description: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface ServiceRequest {
  service_type_id: string;
  service_location_id: string;
  urgency_level_id: string;
  priority_level_id: string;
  scheduled_date: string;
  scheduled_time: string;
  description: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  files?: File[];
}

export interface ServiceSchedulerState {
  currentDate: Date;
  selectedDate: Date | null;
  selectedTime: string;
  selectedEndTime: string;
  selectedDuration: number;
  selectedLocation: string;
  selectedUrgency: string;
  selectedServiceType: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  isSubmitting: boolean;
  showConfirmation: boolean;
  uploadedFiles: File[];
  calendarView: 'month' | 'week' | 'day';
  showTimeSlotScheduler: boolean;
  locations: ServiceLocation[];
  serviceTypes: ServiceType[];
}