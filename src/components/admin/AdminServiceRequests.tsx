import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  FileText,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
  Mail,
  Download,
  RefreshCw
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';

interface ServiceRequest {
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
  business_name: string;
  location_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  technician_name: string | null;
  requested_date: string;
  requested_time_start: string | null;
  requested_time_end: string | null;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  started_at: string | null;
  total_work_duration_minutes: number | null;
  file_count?: number;
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

interface Filters {
  search: string;
  status: string;
  urgency: string;
  priority: string;
  business: string;
  technician: string;
}

interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  working_status: string;
  working_status_display: string;
  active_requests: number;
}

interface Status {
  id: string;
  name: string;
  description: string;
  color_code: string;
  sort_order: number;
  is_final_status: boolean;
  requires_technician: boolean;
}

interface ClosureReason {
  id: string;
  reason: string;
  description: string;
  requires_follow_up: boolean;
  is_active: boolean;
}

interface ServiceRequestFile {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_size_bytes: number;
  content_type: string;
  description: string;
  created_at: string;
}

interface ServiceRequestNote {
  id: string;
  note_text: string;
  note_type: string;
  created_by_type: string;
  created_by_name: string;
  created_at: string;
}

const AdminServiceRequests: React.FC = () => {
  const { isDark } = useTheme();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Assignment and status change state
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [selectedClosureReasonId, setSelectedClosureReasonId] = useState<string>('');
  const [resolutionSummary, setResolutionSummary] = useState<string>('');
  const [actualDurationMinutes, setActualDurationMinutes] = useState<string>('');
  const [equipmentUsed, setEquipmentUsed] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Files and Notes state
  const [requestFiles, setRequestFiles] = useState<ServiceRequestFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [requestNotes, setRequestNotes] = useState<ServiceRequestNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    urgency: 'all',
    priority: 'all',
    business: 'all',
    technician: 'all'
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0
  });

  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Fetch service requests
  const fetchServiceRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.urgency !== 'all' && { urgency: filters.urgency }),
        ...(filters.priority !== 'all' && { priority: filters.priority }),
        ...(filters.business !== 'all' && { businessId: filters.business }),
        ...(filters.technician !== 'all' && { technicianId: filters.technician })
      });

      const response = await fetch(`${API_BASE_URL}/admin/service-requests?${params}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setServiceRequests(data.data.serviceRequests);
        setPagination(prev => ({
          ...prev,
          ...data.data.pagination
        }));
      } else {
        throw new Error(data.message || 'Failed to fetch service requests');
      }
    } catch (err) {
      console.error('Error fetching service requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch service requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceRequests();
  }, [pagination.page, sortBy, sortOrder, filters]);

  // Fetch technicians, statuses, and closure reasons on mount
  useEffect(() => {
    fetchTechnicians();
    fetchStatuses();
    fetchClosureReasons();
  }, []);

  // Fetch technicians
  const fetchTechnicians = async () => {
    try {
      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) return;

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/technicians`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTechnicians(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching technicians:', err);
    }
  };

  // Fetch statuses
  const fetchStatuses = async () => {
    try {
      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) return;

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/statuses`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatuses(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching statuses:', err);
    }
  };

  // Fetch closure reasons
  const fetchClosureReasons = async () => {
    try {
      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) return;

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/closure-reasons`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setClosureReasons(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching closure reasons:', err);
    }
  };

  // Handle technician assignment
  const handleAssignTechnician = async () => {
    if (!selectedRequest || !selectedTechnicianId) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/assign`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ technicianId: selectedTechnicianId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowAssignModal(false);
        setSelectedTechnicianId('');
        setSelectedRequest(null);
      } else {
        throw new Error(data.message || 'Failed to assign technician');
      }
    } catch (err) {
      console.error('Error assigning technician:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to assign technician');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle status change
  const handleChangeStatus = async () => {
    if (!selectedRequest || !selectedStatusId) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statusId: selectedStatusId,
          notes: statusNotes || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowStatusModal(false);
        setSelectedStatusId('');
        setStatusNotes('');
        setSelectedRequest(null);
      } else {
        throw new Error(data.message || 'Failed to change status');
      }
    } catch (err) {
      console.error('Error changing status:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to change status');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle acknowledgment
  const handleAcknowledge = async () => {
    if (!selectedRequest) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/acknowledge`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setSelectedRequest(null);
      } else {
        throw new Error(data.message || 'Failed to acknowledge service request');
      }
    } catch (err) {
      console.error('Error acknowledging service request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to acknowledge service request');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle time tracking (start/stop)
  const handleTimeTracking = async (action: 'start' | 'stop') => {
    if (!selectedRequest) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/time-entry`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Refresh service requests list
        await fetchServiceRequests();
      } else {
        throw new Error(data.message || `Failed to ${action} time tracking`);
      }
    } catch (err) {
      console.error(`Error ${action}ing time tracking:`, err);
      setActionError(err instanceof Error ? err.message : `Failed to ${action} time tracking`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle closing service request
  const handleCloseRequest = async () => {
    if (!selectedRequest || !selectedClosureReasonId || !resolutionSummary) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const response = await fetch(`${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/close`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          closureReasonId: selectedClosureReasonId,
          resolutionSummary,
          actualDurationMinutes: actualDurationMinutes ? parseInt(actualDurationMinutes) : undefined,
          equipmentUsed: equipmentUsed || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowCloseModal(false);
        setSelectedClosureReasonId('');
        setResolutionSummary('');
        setActualDurationMinutes('');
        setEquipmentUsed('');
        setSelectedRequest(null);
      } else {
        throw new Error(data.message || 'Failed to close service request');
      }
    } catch (err) {
      console.error('Error closing service request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to close service request');
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch files for a service request
  const fetchRequestFiles = async (requestId: string) => {
    try {
      setLoadingFiles(true);

      const response = await apiService.get(`/admin/service-requests/${requestId}/files`);

      if (response.success) {
        setRequestFiles(response.data.files);
      } else {
        throw new Error(response.message || 'Failed to fetch request files');
      }
    } catch (err) {
      console.error('Error fetching request files:', err);
      setRequestFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Fetch notes for a service request
  const fetchRequestNotes = async (requestId: string) => {
    try {
      setLoadingNotes(true);

      const response = await apiService.get(`/admin/service-requests/${requestId}/notes`);

      if (response.success) {
        setRequestNotes(response.data.notes);
      } else {
        throw new Error(response.message || 'Failed to fetch request notes');
      }
    } catch (err) {
      console.error('Error fetching request notes:', err);
      setRequestNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  // Submit a new note
  const submitNote = async () => {
    if (!selectedRequest || !newNoteText.trim()) return;

    try {
      setSubmittingNote(true);

      // Use apiService to handle CSRF properly
      const response = await apiService.post(
        `/admin/service-requests/${selectedRequest.id}/notes`,
        { noteText: newNoteText.trim() }
      );

      if (response.success) {
        // Add the new note to the list
        setRequestNotes(prev => [response.data.note, ...prev]);
        setNewNoteText('');
      } else {
        throw new Error(response.message || 'Failed to submit note');
      }
    } catch (err) {
      console.error('Error submitting note:', err);
      alert('Failed to submit note. Please try again.');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format full address
  const formatFullAddress = (locationDetails: ServiceRequest['locationDetails']) => {
    if (!locationDetails) return '';

    const parts = [];
    if (locationDetails.street_address_1) parts.push(locationDetails.street_address_1);
    if (locationDetails.street_address_2) parts.push(locationDetails.street_address_2);
    if (locationDetails.city) parts.push(locationDetails.city);
    if (locationDetails.state) parts.push(locationDetails.state);
    if (locationDetails.zip_code) parts.push(locationDetails.zip_code);

    return parts.join(', ');
  };

  // Generate Google Maps URL
  const getMapUrl = (locationDetails: ServiceRequest['locationDetails']) => {
    if (!locationDetails) return '';
    const address = formatFullAddress(locationDetails);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  // Format phone number as (###) ###-####
  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return '';

    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if we have a valid 10-digit US phone number
    if (cleaned.length === 10) {
      return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }

    // If not 10 digits, return as-is
    return phone;
  };

  // Handle view request details
  const handleViewRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setNewNoteText('');
    setActionError(null);

    // Fetch files if there are any
    if (request.file_count && request.file_count > 0) {
      fetchRequestFiles(request.id);
    } else {
      setRequestFiles([]);
    }

    // Always fetch notes
    fetchRequestNotes(request.id);
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'pending') return <Clock className="h-4 w-4" />;
    if (statusLower === 'scheduled') return <Calendar className="h-4 w-4" />;
    if (statusLower === 'in progress') return <AlertCircle className="h-4 w-4" />;
    if (statusLower === 'completed') return <CheckCircle className="h-4 w-4" />;
    if (statusLower === 'cancelled') return <XCircle className="h-4 w-4" />;
    if (statusLower === 'on hold') return <Pause className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Format time
  const formatTime = (timeString: string | null) => {
    if (!timeString) return '';
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format duration
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  // Filter requests locally by search term
  const filteredRequests = serviceRequests.filter(request => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return (
      request.request_number.toLowerCase().includes(searchLower) ||
      request.title.toLowerCase().includes(searchLower) ||
      request.client_name.toLowerCase().includes(searchLower) ||
      request.business_name.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <ClipboardList className={`h-8 w-8 ${themeClasses.text.primary}`} />
          <div>
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Requests</h1>
            <p className={`text-sm ${themeClasses.text.muted}`}>
              {pagination.totalCount} total requests
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.bg.hover} transition-colors`}
        >
          <Filter className="h-5 w-5" />
          <span>Filters</span>
          {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Search
              </label>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${themeClasses.text.muted}`} />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Request #, title, client, business..."
                  className={`w-full pl-10 pr-4 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="on hold">On Hold</option>
              </select>
            </div>

            {/* Urgency */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Urgency
              </label>
              <select
                value={filters.urgency}
                onChange={(e) => setFilters(prev => ({ ...prev, urgency: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              >
                <option value="all">All Urgencies</option>
                <option value="normal">Normal</option>
                <option value="prime">Prime</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Priority
              </label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          {(filters.search || filters.status !== 'all' || filters.urgency !== 'all' || filters.priority !== 'all') && (
            <div className="mt-4">
              <button
                onClick={() => setFilters({
                  search: '',
                  status: 'all',
                  urgency: 'all',
                  priority: 'all',
                  business: 'all',
                  technician: 'all'
                })}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Service Requests Table */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading service requests...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={fetchServiceRequests}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className={`h-12 w-12 ${themeClasses.text.muted} mx-auto mb-4`} />
            <p className={`${themeClasses.text.secondary}`}>No service requests found</p>
            <p className={`text-sm ${themeClasses.text.muted} mt-2`}>
              {filters.search || filters.status !== 'all' || filters.urgency !== 'all'
                ? 'Try adjusting your filters'
                : 'Service requests will appear here once clients submit them'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themeClasses.bg.secondary} border-b ${themeClasses.border.primary}`}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('request_number')}>
                      Request #
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('title')}>
                      Title
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Urgency
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Client
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Technician
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('requested_date')}>
                      Requested Date
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className={`${themeClasses.bg.hover} transition-colors cursor-pointer`}
                      onClick={() => handleViewRequest(request)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`font-mono text-sm ${themeClasses.text.primary}`}>
                          {request.request_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {request.title}
                        </div>
                        <div className={`text-xs ${themeClasses.text.muted}`}>
                          {request.business_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${request.status_color}20`, color: request.status_color }}
                        >
                          {getStatusIcon(request.status)}
                          <span className="ml-1">{request.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${request.urgency_color}20`, color: request.urgency_color }}
                        >
                          {request.urgency}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${themeClasses.text.primary}`}>{request.client_name}</div>
                        <div className={`text-xs ${themeClasses.text.muted}`}>{request.client_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {request.technician_name ? (
                          <div className={`text-sm flex items-center ${themeClasses.text.primary}`}>
                            <User className="h-4 w-4 mr-1" />
                            {request.technician_name}
                          </div>
                        ) : (
                          <span className={`text-sm ${themeClasses.text.muted}`}>Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {formatDate(request.requested_date)}
                        </div>
                        {request.requested_time_start && (
                          <div className={`text-xs ${themeClasses.text.muted}`}>
                            {formatTime(request.requested_time_start)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewRequest(request);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex items-center justify-between`}>
                <div className={`text-sm ${themeClasses.text.secondary}`}>
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} requests
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className={`px-3 py-1 rounded ${pagination.page === 1 ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className={`px-3 py-1 rounded ${pagination.page === pagination.totalPages ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal - Placeholder for now */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                    {selectedRequest.request_number}
                  </h2>
                  <p className={`text-lg ${themeClasses.text.secondary} mt-1`}>
                    {selectedRequest.title}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-6">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${selectedRequest.status_color}20`, color: selectedRequest.status_color }}
                >
                  {getStatusIcon(selectedRequest.status)}
                  <span className="ml-1">{selectedRequest.status}</span>
                </span>
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${selectedRequest.urgency_color}20`, color: selectedRequest.urgency_color }}
                >
                  {selectedRequest.urgency}
                </span>
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${selectedRequest.priority_color}20`, color: selectedRequest.priority_color }}
                >
                  {selectedRequest.priority} Priority
                </span>
              </div>

              {/* Request Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <span className={`font-medium ${themeClasses.text.secondary}`}>Service Type:</span>
                  <p className={`${themeClasses.text.primary}`}>{selectedRequest.service_type}</p>
                </div>
                <div>
                  <span className={`font-medium ${themeClasses.text.secondary}`}>Technician:</span>
                  <p className={`${themeClasses.text.primary}`}>
                    {selectedRequest.technician_name || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <span className={`font-medium ${themeClasses.text.secondary}`}>Created:</span>
                  <p className={`${themeClasses.text.primary}`}>
                    {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Cost Summary & Location Side-by-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
                {/* Cost Summary */}
                {selectedRequest.cost && selectedRequest.requested_date && selectedRequest.requested_time_start && selectedRequest.requested_time_end && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Selected Date & Time</h4>
                    <div className={`text-lg font-semibold ${themeClasses.text.primary} mb-1`}>
                      {new Date(selectedRequest.requested_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className={`text-base ${themeClasses.text.secondary} mb-3`}>
                      {selectedRequest.requested_time_start.substring(0, 5)} - {selectedRequest.requested_time_end.substring(0, 5)} ({selectedRequest.cost.durationHours}h)
                    </div>
                    <div className="pt-3 border-t border-blue-200 dark:border-blue-700 space-y-1">
                      <div className={`text-sm ${themeClasses.text.secondary}`}>
                        Base Rate: ${selectedRequest.cost.baseRate}/hr
                      </div>
                      <div className={`text-sm ${themeClasses.text.secondary}`}>
                        {selectedRequest.cost.durationHours}h Standard @ 1x = ${selectedRequest.cost.total.toFixed(2)}
                      </div>
                      <div className={`text-base font-semibold ${themeClasses.text.primary} mt-2`}>
                        Total*: ${selectedRequest.cost.total.toFixed(2)}
                      </div>
                      <div className={`text-xs ${themeClasses.text.muted} mt-1 italic`}>
                        * Actual cost may vary based on time required to complete the service
                      </div>
                    </div>
                  </div>
                )}

                {/* Location & Contact Information */}
                {selectedRequest.locationDetails && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>Location & Contact</h4>

                    <div className="space-y-3">
                      {/* Address */}
                      <div>
                        <span className={`text-xs font-medium ${themeClasses.text.muted} uppercase`}>Address</span>
                        <a
                          href={getMapUrl(selectedRequest.locationDetails)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 mt-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <div>{selectedRequest.locationDetails.street_address_1}</div>
                            {selectedRequest.locationDetails.street_address_2 && (
                              <div>{selectedRequest.locationDetails.street_address_2}</div>
                            )}
                            <div>
                              {selectedRequest.locationDetails.city}, {selectedRequest.locationDetails.state} {selectedRequest.locationDetails.zip_code}
                            </div>
                          </div>
                        </a>
                      </div>

                      {/* Contact Person */}
                      {selectedRequest.locationDetails.contact_person && (
                        <div>
                          <span className={`text-xs font-medium ${themeClasses.text.muted} uppercase`}>Contact Person</span>
                          <div className={`flex items-center gap-2 mt-1 text-sm ${themeClasses.text.primary}`}>
                            <User className="h-4 w-4 text-gray-400" />
                            {selectedRequest.locationDetails.contact_person}
                          </div>
                        </div>
                      )}

                      {/* Phone Number */}
                      {selectedRequest.locationDetails.contact_phone && (
                        <div>
                          <span className={`text-xs font-medium ${themeClasses.text.muted} uppercase`}>Phone</span>
                          <a
                            href={`tel:${selectedRequest.locationDetails.contact_phone}`}
                            className="flex items-center gap-2 mt-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Phone className="h-4 w-4" />
                            {formatPhone(selectedRequest.locationDetails.contact_phone)}
                          </a>
                        </div>
                      )}

                      {/* Email */}
                      {selectedRequest.locationDetails.contact_email && (
                        <div>
                          <span className={`text-xs font-medium ${themeClasses.text.muted} uppercase`}>Email</span>
                          <a
                            href={`mailto:${selectedRequest.locationDetails.contact_email}`}
                            className="flex items-center gap-2 mt-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Mail className="h-4 w-4" />
                            {selectedRequest.locationDetails.contact_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Client Information */}
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>Client Information</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm ${themeClasses.text.primary}`}>
                    <User className="h-4 w-4 text-gray-400" />
                    {selectedRequest.client_name}
                  </div>
                  <a
                    href={`mailto:${selectedRequest.client_email}`}
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Mail className="h-4 w-4" />
                    {selectedRequest.client_email}
                  </a>
                  {selectedRequest.client_phone && (
                    <a
                      href={`tel:${selectedRequest.client_phone}`}
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {formatPhone(selectedRequest.client_phone)}
                    </a>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              {selectedRequest.scheduled_date && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className={`font-medium ${themeClasses.text.secondary}`}>Scheduled Date:</span>
                    <p className={`${themeClasses.text.primary}`}>
                      {formatDate(selectedRequest.scheduled_date)}
                      {selectedRequest.scheduled_time_start && ` at ${formatTime(selectedRequest.scheduled_time_start)}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedRequest.description && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Description</h4>
                  <p className={`${themeClasses.text.primary} whitespace-pre-wrap text-sm`}>
                    {selectedRequest.description}
                  </p>
                </div>
              )}

              {/* Notes Section */}
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>Notes</h4>

                {/* Add Note Form */}
                <div className="mb-4">
                  <textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add a note..."
                    className={`w-full px-3 py-2 rounded-md ${themeClasses.input} resize-none`}
                    rows={3}
                    disabled={submittingNote}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={submitNote}
                      disabled={!newNoteText.trim() || submittingNote}
                      className={`px-4 py-2 rounded-md text-white ${
                        !newNoteText.trim() || submittingNote
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      } transition-colors text-sm`}
                    >
                      {submittingNote ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Submitting...
                        </span>
                      ) : (
                        'Add Note'
                      )}
                    </button>
                  </div>
                </div>

                {/* Notes List */}
                {loadingNotes ? (
                  <div className={`flex items-center gap-2 ${themeClasses.text.secondary}`}>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Loading notes...</span>
                  </div>
                ) : requestNotes.length > 0 ? (
                  <div className="space-y-3">
                    {requestNotes.map((note, index) => (
                      <div key={note.id}>
                        {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
                        <div className={`text-xs ${themeClasses.text.muted} mb-1`}>
                          <span className="font-medium">{note.created_by_name}</span>
                          {' • '}
                          <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                        <p className={`text-sm ${themeClasses.text.primary} whitespace-pre-wrap`}>
                          {note.note_text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${themeClasses.text.muted}`}>No notes yet</p>
                )}
              </div>

              {/* Files Section */}
              {selectedRequest.file_count && selectedRequest.file_count > 0 && (
                <div className="mb-4">
                  <h4 className={`font-medium ${themeClasses.text.secondary} mb-2`}>
                    Attachments ({selectedRequest.file_count})
                  </h4>
                  {loadingFiles ? (
                    <div className={`flex items-center gap-2 ${themeClasses.text.secondary}`}>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Loading files...</span>
                    </div>
                  ) : requestFiles.length > 0 ? (
                    <div className="space-y-2">
                      {requestFiles.map((file) => (
                        <div key={file.id} className={`flex items-center justify-between p-3 ${themeClasses.bg.secondary} rounded-md`}>
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-gray-400" />
                            <div>
                              <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                {file.original_filename}
                              </p>
                              <p className={`text-xs ${themeClasses.text.muted}`}>
                                {formatFileSize(file.file_size_bytes)} • {new Date(file.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              // Handle file download
                              window.open(`${API_BASE_URL}/admin/files/${file.id}/download`, '_blank');
                            }}
                            className={`p-2 ${themeClasses.text.muted} hover:text-gray-600 dark:hover:text-gray-300`}
                            title="Download file"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`${themeClasses.text.muted} text-sm`}>No files available</p>
                  )}
                </div>
              )}

              {/* Display error if any */}
              {actionError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {actionError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                {/* Row 1: Assignment and Status */}
                <div className="flex space-x-3">
                  {!selectedRequest.technician_name && (
                    <button
                      onClick={() => {
                        setShowAssignModal(true);
                        setActionError(null);
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Assign Technician
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowStatusModal(true);
                      setActionError(null);
                    }}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    Change Status
                  </button>
                </div>

                {/* Row 2: Acknowledgment and Time Tracking */}
                {selectedRequest.technician_name && selectedRequest.status.toLowerCase() !== 'completed' && (
                  <div className="flex space-x-3">
                    {!selectedRequest.acknowledged_at && (
                      <button
                        onClick={handleAcknowledge}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {actionLoading ? 'Acknowledging...' : 'Acknowledge'}
                      </button>
                    )}
                    <button
                      onClick={() => handleTimeTracking('start')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Start Work
                    </button>
                    <button
                      onClick={() => handleTimeTracking('stop')}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center"
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Stop Work
                    </button>
                    <button
                      onClick={() => {
                        setShowCloseModal(true);
                        setActionError(null);
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Complete Request
                    </button>
                  </div>
                )}

                {/* Row 3: Close */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedRequest(null);
                      setActionError(null);
                    }}
                    disabled={actionLoading}
                    className={`px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Technician Modal */}
      {showAssignModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Assign Technician
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
              Assign a technician to service request <span className="font-mono">{selectedRequest.request_number}</span>
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {actionError}
              </div>
            )}

            <div className="mb-6">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Select Technician
              </label>
              <select
                value={selectedTechnicianId}
                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="">-- Select Technician --</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name} ({tech.active_requests} active requests)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleAssignTechnician}
                disabled={!selectedTechnicianId || actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Assigning...' : 'Assign'}
              </button>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedTechnicianId('');
                  setActionError(null);
                }}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {showStatusModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Change Status
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
              Change status for service request <span className="font-mono">{selectedRequest.request_number}</span>
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {actionError}
              </div>
            )}

            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                New Status
              </label>
              <select
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="">-- Select Status --</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name} {status.description && `- ${status.description}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Notes (Optional)
              </label>
              <textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Add notes about this status change..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleChangeStatus}
                disabled={!selectedStatusId || actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Changing...' : 'Change Status'}
              </button>
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedStatusId('');
                  setStatusNotes('');
                  setActionError(null);
                }}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete/Close Request Modal */}
      {showCloseModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Complete Service Request
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
              Complete and close service request <span className="font-mono">{selectedRequest.request_number}</span>
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {actionError}
              </div>
            )}

            {/* Closure Reason */}
            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Closure Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClosureReasonId}
                onChange={(e) => setSelectedClosureReasonId(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="">-- Select Closure Reason --</option>
                {closureReasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.reason} {reason.description && `- ${reason.description}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Resolution Summary */}
            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Resolution Summary <span className="text-red-500">*</span>
              </label>
              <textarea
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Describe what was done to resolve this service request..."
                rows={4}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
              />
            </div>

            {/* Actual Duration */}
            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Actual Duration (minutes)
              </label>
              <input
                type="number"
                value={actualDurationMinutes}
                onChange={(e) => setActualDurationMinutes(e.target.value)}
                placeholder="Enter actual time spent"
                min="0"
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              />
              {selectedRequest.total_work_duration_minutes && (
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  Tracked time: {formatDuration(selectedRequest.total_work_duration_minutes)}
                </p>
              )}
            </div>

            {/* Equipment Used */}
            <div className="mb-6">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Equipment/Materials Used (Optional)
              </label>
              <textarea
                value={equipmentUsed}
                onChange={(e) => setEquipmentUsed(e.target.value)}
                placeholder="List any equipment or materials used..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCloseRequest}
                disabled={!selectedClosureReasonId || !resolutionSummary || actionLoading}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Completing...' : 'Complete Request'}
              </button>
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedClosureReasonId('');
                  setResolutionSummary('');
                  setActualDurationMinutes('');
                  setEquipmentUsed('');
                  setActionError(null);
                }}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceRequests;