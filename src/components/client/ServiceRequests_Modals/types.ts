export interface ServiceRequest {
  id: string;
  requestNumber: string;
  title: string;
  description: string;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  requestedDatetime?: string | null;
  requestedDurationMinutes?: number | null;
  scheduledDate: string | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  scheduledDatetime?: string | null;
  scheduledDurationMinutes?: number | null;
  status: string;
  statusDescription: string;
  urgency: string;
  priority: string;
  serviceType: string;
  location: string;
  locationDetails?: {
    name: string;
    streetAddress1: string;
    streetAddress2: string | null;
    city: string;
    state: string;
    zipCode: string;
    contactPhone: string | null;
    contactPerson: string | null;
    contactEmail: string | null;
  } | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  cost?: {
    baseRate: number;
    rateCategoryName?: string;
    durationHours: number;
    total: number;
    subtotal?: number;
    firstHourDiscount?: number;
    firstHourCompBreakdown?: {
      tierName: string;
      multiplier: number;
      hours: number;
      discount: number;
    }[];
    breakdown: {
      tierName: string;
      multiplier: number;
      hours: number;
      cost: number;
    }[];
    isFirstRequest?: boolean;
  } | null;
}

export interface ServiceRequestFile {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSizeBytes: number;
  contentType: string;
  description: string;
  createdAt: string;
  uploadedByEmail?: string;
  uploadedByType?: string;
}

export interface ServiceRequestNote {
  id: string;
  noteText: string;
  noteType: string;
  createdByType: string;
  createdByName: string;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface ThemeClasses {
  background: string;
  border: string;
  text: string;
  textSecondary: string;
  input: string;
  button: string;
  card: string;
}
