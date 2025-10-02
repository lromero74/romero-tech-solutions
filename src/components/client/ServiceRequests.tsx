import React, { useState, useEffect, useRef } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';
import { formatLongDate } from '../../utils/dateFormatter';
import {
  Clock,
  Calendar,
  MapPin,
  User,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  FileText,
  Filter,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
  ExternalLink
} from 'lucide-react';

interface ServiceRequest {
  id: string;
  requestNumber: string;
  title: string;
  description: string;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  scheduledDate: string | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
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
    durationHours: number;
    total: number;
    subtotal?: number;
    firstHourWaiver?: number;
    isFirstRequest?: boolean;
  } | null;
}

interface ServiceRequestFile {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSizeBytes: number;
  contentType: string;
  description: string;
  createdAt: string;
}

interface ServiceRequestNote {
  id: string;
  noteText: string;
  noteType: string;
  createdByType: string;
  createdByName: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const ServiceRequests: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t, language } = useClientLanguage();
  const { addServiceRequestChange } = useNotifications();

  const themeClasses = {
    background: isDarkMode ? 'bg-gray-800' : 'bg-white',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    input: isDarkMode
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
    button: isDarkMode
      ? 'bg-blue-600 hover:bg-blue-700'
      : 'bg-blue-600 hover:bg-blue-700',
    card: isDarkMode ? 'bg-gray-750' : 'bg-gray-50'
  };

  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousServiceRequestsRef = useRef<ServiceRequest[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState({
    search: '',
    status: 'all'
  });

  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [requestFiles, setRequestFiles] = useState<ServiceRequestFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [requestNotes, setRequestNotes] = useState<ServiceRequestNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Status color mapping
  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('pending') || statusLower.includes('submitted')) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
    } else if (statusLower.includes('progress') || statusLower.includes('assigned')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
    } else if (statusLower.includes('completed') || statusLower.includes('resolved')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
    } else if (statusLower.includes('cancelled') || statusLower.includes('rejected')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  // Priority color mapping
  const getPriorityColor = (priority: string) => {
    const priorityLower = priority?.toLowerCase() || '';
    if (priorityLower.includes('high') || priorityLower.includes('urgent')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
    } else if (priorityLower.includes('medium') || priorityLower.includes('normal')) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
    } else if (priorityLower.includes('low')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  // Detect changes in service requests
  const detectServiceRequestChanges = (newRequests: ServiceRequest[]) => {
    const previousRequests = previousServiceRequestsRef.current;

    // Skip change detection on initial load
    if (previousRequests.length === 0) {
      return false;
    }

    // Check if any service request has changed
    let hasChanges = false;

    // Check for different number of requests
    if (newRequests.length !== previousRequests.length) {
      hasChanges = true;
    } else {
      // Check each request for changes in key fields
      for (const newRequest of newRequests) {
        const previousRequest = previousRequests.find(prev => prev.id === newRequest.id);

        if (!previousRequest) {
          // New request added
          hasChanges = true;
          break;
        }

        // Check for changes in critical fields that would indicate status updates
        if (
          newRequest.status !== previousRequest.status ||
          newRequest.statusDescription !== previousRequest.statusDescription ||
          newRequest.priority !== previousRequest.priority ||
          newRequest.scheduledDate !== previousRequest.scheduledDate ||
          newRequest.scheduledTimeStart !== previousRequest.scheduledTimeStart ||
          newRequest.updatedAt !== previousRequest.updatedAt
        ) {
          hasChanges = true;
          break;
        }
      }
    }

    return hasChanges;
  };

  // Fetch service requests
  const fetchServiceRequests = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token found');
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests?page=${page}&limit=${pagination.limit}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch service requests: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        const newServiceRequests = data.data.serviceRequests;

        // Detect changes and trigger notification if needed
        if (detectServiceRequestChanges(newServiceRequests)) {
          addServiceRequestChange();
        }

        // Update state and store reference for future comparisons
        setServiceRequests(newServiceRequests);
        previousServiceRequestsRef.current = newServiceRequests;
        setPagination(data.data.pagination);
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

  // Fetch files for a service request
  const fetchRequestFiles = async (requestId: string) => {
    try {
      setLoadingFiles(true);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token found');
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${requestId}/files`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch request files: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setRequestFiles(data.data.files);
      } else {
        throw new Error(data.message || 'Failed to fetch request files');
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

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token found');
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${requestId}/notes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch request notes: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setRequestNotes(data.data.notes);
      } else {
        throw new Error(data.message || 'Failed to fetch request notes');
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

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No session token found');
      }

      // Get CSRF token
      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ noteText: newNoteText.trim() })
      });

      if (!response.ok) {
        throw new Error(`Failed to submit note: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        // Add the new note to the list
        setRequestNotes(prev => [data.data.note, ...prev]);
        setNewNoteText('');
      } else {
        throw new Error(data.message || 'Failed to submit note');
      }
    } catch (err) {
      console.error('Error submitting note:', err);
      alert(t('serviceRequests.noteSubmitError', undefined, 'Failed to submit note. Please try again.'));
    } finally {
      setSubmittingNote(false);
    }
  };

  // Handle view request details
  const handleViewRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setNewNoteText('');
    if (request.fileCount > 0) {
      fetchRequestFiles(request.id);
    } else {
      setRequestFiles([]);
    }
    fetchRequestNotes(request.id);
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
    if (locationDetails.streetAddress1) parts.push(locationDetails.streetAddress1);
    if (locationDetails.streetAddress2) parts.push(locationDetails.streetAddress2);
    if (locationDetails.city) parts.push(locationDetails.city);
    if (locationDetails.state) parts.push(locationDetails.state);
    if (locationDetails.zipCode) parts.push(locationDetails.zipCode);

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

  // Get locale for date formatting based on current language
  const getLocale = () => {
    return language === 'es' ? 'es-ES' : 'en-US';
  };

  // Format date and time
  const formatDateTime = (date: string | null, time: string | null) => {
    if (!date) return t('serviceRequests.notScheduled', undefined, 'Not scheduled');

    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString(getLocale());

    if (time) {
      return `${formattedDate} ${t('serviceRequests.at', undefined, 'at')} ${time}`;
    }
    return formattedDate;
  };

  // Filter service requests
  const filteredRequests = serviceRequests.filter(request => {
    const matchesSearch = !filters.search ||
      request.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      request.requestNumber.toLowerCase().includes(filters.search.toLowerCase()) ||
      request.description.toLowerCase().includes(filters.search.toLowerCase());

    const matchesStatus = filters.status === 'all' ||
      request.status.toLowerCase().includes(filters.status.toLowerCase());

    return matchesSearch && matchesStatus;
  });

  // Load service requests on component mount
  useEffect(() => {
    fetchServiceRequests();
  }, []);

  // Set up periodic polling for service request changes
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchServiceRequests(pagination.page);
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(pollInterval);
  }, [pagination.page]);

  if (loading && serviceRequests.length === 0) {
    return (
      <div className={`${themeClasses.background} rounded-lg shadow-sm border ${themeClasses.border} p-6`}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className={`h-8 w-8 ${themeClasses.textSecondary} animate-spin`} />
          <span className={`ml-3 ${themeClasses.textSecondary}`}>
            {t('serviceRequests.loading', undefined, 'Loading service requests...')}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${themeClasses.background} rounded-lg shadow-sm border ${themeClasses.border} p-6`}>
        <div className="flex items-center justify-center py-12">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <div className="ml-3">
            <p className="text-red-600 dark:text-red-400 font-medium">
              {t('serviceRequests.error', undefined, 'Error loading service requests')}
            </p>
            <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>{error}</p>
            <button
              onClick={() => fetchServiceRequests()}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {t('general.retry', undefined, 'Try Again')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.background} rounded-lg shadow-sm border ${themeClasses.border} overflow-hidden`}>
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className={`text-xl font-semibold ${themeClasses.text}`}>
            {t('serviceRequests.title', undefined, 'Service Requests')}
          </h2>
          <button
            onClick={() => fetchServiceRequests(pagination.page)}
            disabled={loading}
            className={`p-2 rounded-md ${themeClasses.border} border hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${themeClasses.textSecondary} ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${themeClasses.textSecondary}`} />
              <input
                type="text"
                placeholder={t('serviceRequests.searchPlaceholder', undefined, 'Search requests...')}
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className={`pl-10 pr-4 py-2 w-full border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">{t('serviceRequests.allStatuses', undefined, 'All Statuses')}</option>
              <option value="pending">{t('serviceRequests.pending', undefined, 'Pending')}</option>
              <option value="progress">{t('serviceRequests.inProgress', undefined, 'In Progress')}</option>
              <option value="completed">{t('serviceRequests.completed', undefined, 'Completed')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Service Requests List */}
      <div className="divide-y dark:divide-gray-700">
        {filteredRequests.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className={`h-12 w-12 ${themeClasses.textSecondary} mx-auto mb-4`} />
            <p className={`${themeClasses.textSecondary}`}>
              {filters.search || filters.status !== 'all'
                ? t('serviceRequests.noFilteredResults', undefined, 'No service requests match your filters')
                : t('serviceRequests.noRequests', undefined, 'No service requests found')
              }
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <div key={request.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={`font-medium ${themeClasses.text} truncate`}>
                      {request.title}
                    </h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                      {t(`status.${request.status}`, undefined, request.status)}
                    </span>
                    {request.priority && (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(request.priority)}`}>
                        {t(`priority.${request.priority}`, undefined, request.priority)}
                      </span>
                    )}
                  </div>

                  <p className={`text-sm ${themeClasses.textSecondary} mb-2`}>
                    #{request.requestNumber}
                  </p>

                  {request.description && (
                    <p className={`text-sm ${themeClasses.textSecondary} mb-3 line-clamp-2`}>
                      {request.description}
                    </p>
                  )}

                  {/* Cost Summary */}
                  {request.cost && request.requestedDate && request.requestedTimeStart && request.requestedTimeEnd && (
                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        {formatLongDate(new Date(request.requestedDate), t, language)}
                      </div>
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        {request.requestedTimeStart.substring(0, 5)} - {request.requestedTimeEnd.substring(0, 5)} ({request.cost.durationHours}h)
                      </div>
                      <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                          {t('serviceRequests.baseRatePerHour', { rate: String(request.cost.baseRate) }, 'Base Rate: ${{rate}}/hr')}
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                          {t('serviceRequests.standardRate', {
                            hours: String(request.cost.durationHours),
                            total: (request.cost.subtotal || request.cost.total).toFixed(2)
                          }, '{{hours}}h Standard @ 1x = ${{total}}')}
                        </div>
                        {request.cost.firstHourWaiver && request.cost.firstHourWaiver > 0 && (
                          <div className="text-xs text-green-700 dark:text-green-300 font-medium">
                            {t('serviceRequests.newClientFirstHourWaived', { amount: request.cost.firstHourWaiver.toFixed(2) }, 'New Client 1st Hour Waived: -${{amount}}')}
                          </div>
                        )}
                        <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {t('serviceRequests.totalEstimate', { total: request.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
                          * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {request.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{request.location}</span>
                      </div>
                    )}
                    {request.serviceType && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{request.serviceType}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDateTime(request.requestedDate, request.requestedTimeStart)}</span>
                    </div>
                    {request.fileCount > 0 && (
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>{request.fileCount} {request.fileCount === 1 ? t('serviceRequests.file', 'file') : t('serviceRequests.files', 'files')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleViewRequest(request)}
                  className={`ml-4 p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                >
                  <Eye className={`h-4 w-4 ${themeClasses.textSecondary}`} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between">
          <div className={`text-sm ${themeClasses.textSecondary}`}>
            {t('serviceRequests.showingRequests', {
              start: String(((pagination.page - 1) * pagination.limit) + 1),
              end: String(Math.min(pagination.page * pagination.limit, pagination.totalCount)),
              total: String(pagination.totalCount)
            }, 'Showing {{start}} to {{end}} of {{total}} requests')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchServiceRequests(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <ChevronLeft className={`h-4 w-4 ${themeClasses.textSecondary}`} />
            </button>
            <span className={`px-3 py-2 text-sm ${themeClasses.text}`}>
              {t('serviceRequests.pageOfPages', {
                page: String(pagination.page),
                totalPages: String(pagination.totalPages)
              }, '{{page}} of {{totalPages}}')}
            </span>
            <button
              onClick={() => fetchServiceRequests(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <ChevronRight className={`h-4 w-4 ${themeClasses.textSecondary}`} />
            </button>
          </div>
        </div>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedRequest(null)} />

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                    {selectedRequest.title}
                  </h3>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <ExternalLink className="h-5 w-5 rotate-45" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedRequest.status)}`}>
                      {t(`status.${selectedRequest.status}`, undefined, selectedRequest.status)}
                    </span>
                    {selectedRequest.priority && (
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPriorityColor(selectedRequest.priority)}`}>
                        {t(`priority.${selectedRequest.priority}`, undefined, selectedRequest.priority)} {t('serviceRequests.priority', undefined, 'Priority')}
                      </span>
                    )}
                  </div>

                  {/* Request Metadata */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.requestNumber', undefined, 'Request #')}:</span>
                      <p className="text-gray-900 dark:text-white">{selectedRequest.requestNumber}</p>
                    </div>
                    {selectedRequest.serviceType && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.serviceType', undefined, 'Service Type')}:</span>
                        <p className="text-gray-900 dark:text-white">{selectedRequest.serviceType}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.created', undefined, 'Created')}:</span>
                      <p className="text-gray-900 dark:text-white">
                        {new Date(selectedRequest.createdAt).toLocaleString(getLocale())}
                      </p>
                    </div>
                  </div>

                  {/* Cost Summary & Location Side-by-Side on larger screens */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    {/* Cost Summary in Modal */}
                    {selectedRequest.cost && selectedRequest.requestedDate && selectedRequest.requestedTimeStart && selectedRequest.requestedTimeEnd && (
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('serviceRequests.selectedDateTime', undefined, 'Selected Date & Time')}</h4>
                        <div className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          {formatLongDate(new Date(selectedRequest.requestedDate), t, language)}
                        </div>
                        <div className="text-base text-blue-800 dark:text-blue-200 mb-3">
                          {selectedRequest.requestedTimeStart.substring(0, 5)} - {selectedRequest.requestedTimeEnd.substring(0, 5)} ({selectedRequest.cost.durationHours}h)
                        </div>
                        <div className="pt-3 border-t border-blue-200 dark:border-blue-700 space-y-1">
                          <div className="text-sm text-blue-700 dark:text-blue-300">
                            {t('serviceRequests.baseRatePerHour', { rate: String(selectedRequest.cost.baseRate) }, 'Base Rate: ${{rate}}/hr')}
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">
                            {t('serviceRequests.standardRate', {
                              hours: String(selectedRequest.cost.durationHours),
                              total: (selectedRequest.cost.subtotal || selectedRequest.cost.total).toFixed(2)
                            }, '{{hours}}h Standard @ 1x = ${{total}}')}
                          </div>
                          {selectedRequest.cost.firstHourWaiver && selectedRequest.cost.firstHourWaiver > 0 && (
                            <div className="text-sm text-green-700 dark:text-green-300 font-medium">
                              {t('serviceRequests.newClientFirstHourWaived', { amount: selectedRequest.cost.firstHourWaiver.toFixed(2) }, 'New Client 1st Hour Waived: -${{amount}}')}
                            </div>
                          )}
                          <div className="text-base font-semibold text-blue-900 dark:text-blue-100 mt-2">
                            {t('serviceRequests.totalEstimate', { total: selectedRequest.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
                            * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Location & Contact Information */}
                    {selectedRequest.locationDetails && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('serviceRequests.locationContact', undefined, 'Location & Contact')}</h4>

                        <div className="space-y-3">
                          {/* Address */}
                          <div>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('serviceRequests.address', undefined, 'Address')}</span>
                            <a
                              href={getMapUrl(selectedRequest.locationDetails)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 mt-1 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div className="text-sm">
                                <div>{selectedRequest.locationDetails.streetAddress1}</div>
                                {selectedRequest.locationDetails.streetAddress2 && (
                                  <div>{selectedRequest.locationDetails.streetAddress2}</div>
                                )}
                                <div>
                                  {selectedRequest.locationDetails.city}, {selectedRequest.locationDetails.state} {selectedRequest.locationDetails.zipCode}
                                </div>
                              </div>
                            </a>
                          </div>

                          {/* Contact Person */}
                          {selectedRequest.locationDetails.contactPerson && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('serviceRequests.contactPerson', undefined, 'Contact Person')}</span>
                              <div className="flex items-center gap-2 mt-1 text-sm text-gray-900 dark:text-white">
                                <User className="h-4 w-4 text-gray-400" />
                                {selectedRequest.locationDetails.contactPerson}
                              </div>
                            </div>
                          )}

                          {/* Phone Number */}
                          {selectedRequest.locationDetails.contactPhone && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('serviceRequests.phone', undefined, 'Phone')}</span>
                              <a
                                href={`tel:${selectedRequest.locationDetails.contactPhone}`}
                                className="flex items-center gap-2 mt-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <Phone className="h-4 w-4" />
                                {formatPhone(selectedRequest.locationDetails.contactPhone)}
                              </a>
                            </div>
                          )}

                          {/* Email */}
                          {selectedRequest.locationDetails.contactEmail && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('serviceRequests.email', undefined, 'Email')}</span>
                              <a
                                href={`mailto:${selectedRequest.locationDetails.contactEmail}`}
                                className="flex items-center gap-2 mt-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <Mail className="h-4 w-4" />
                                {selectedRequest.locationDetails.contactEmail}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional Details */}
                  {(selectedRequest.scheduledDate) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {selectedRequest.scheduledDate && (
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{t('serviceRequests.scheduledDate', undefined, 'Scheduled Date')}:</span>
                          <p className="text-gray-900 dark:text-white">
                            {formatDateTime(selectedRequest.scheduledDate, selectedRequest.scheduledTimeStart)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedRequest.description && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('serviceRequests.description', undefined, 'Description')}</h4>
                      <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                        {selectedRequest.description}
                      </p>
                    </div>
                  )}

                  {/* Notes Section */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('serviceRequests.notes', undefined, 'Notes')}</h4>

                    {/* Add Note Form */}
                    <div className="mb-4">
                      <textarea
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder={t('serviceRequests.addNotePlaceholder', undefined, 'Add a note...')}
                        className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
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
                              {t('serviceRequests.submittingNote', undefined, 'Submitting...')}
                            </span>
                          ) : (
                            t('serviceRequests.addNote', undefined, 'Add Note')
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Notes List */}
                    {loadingNotes ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>{t('serviceRequests.loadingNotes', undefined, 'Loading notes...')}</span>
                      </div>
                    ) : requestNotes.length > 0 ? (
                      <div className="space-y-3">
                        {requestNotes.map((note, index) => (
                          <div key={note.id}>
                            {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span className="font-medium">{note.createdByName}</span>
                              {' • '}
                              <span>{new Date(note.createdAt).toLocaleString(getLocale())}</span>
                            </div>
                            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                              {note.noteText}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('serviceRequests.noNotes', undefined, 'No notes yet')}</p>
                    )}
                  </div>

                  {/* Files Section */}
                  {selectedRequest.fileCount > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('serviceRequests.attachments', undefined, 'Attachments')} ({selectedRequest.fileCount})
                      </h4>
                      {loadingFiles ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>{t('serviceRequests.loadingFiles', undefined, 'Loading files...')}</span>
                        </div>
                      ) : requestFiles.length > 0 ? (
                        <div className="space-y-2">
                          {requestFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-gray-400" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {file.originalFilename}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatFileSize(file.fileSizeBytes)} • {new Date(file.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  // Handle file download
                                  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
                                  window.open(`${apiBaseUrl}/client/files/${file.id}/download`, '_blank');
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title={t('serviceRequests.downloadFile', undefined, 'Download file')}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('serviceRequests.noFilesAvailable', undefined, 'No files available')}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {t('general.close', undefined, 'Close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceRequests;