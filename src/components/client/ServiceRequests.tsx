import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
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
  fileCount: number;
  createdAt: string;
  updatedAt: string;
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

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const ServiceRequests: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();

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

  // Fetch service requests
  const fetchServiceRequests = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const sessionToken = localStorage.getItem('sessionToken');
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
        setServiceRequests(data.data.serviceRequests);
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

      const sessionToken = localStorage.getItem('sessionToken');
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

  // Handle view request details
  const handleViewRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    if (request.fileCount > 0) {
      fetchRequestFiles(request.id);
    } else {
      setRequestFiles([]);
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

  // Format date and time
  const formatDateTime = (date: string | null, time: string | null) => {
    if (!date) return 'Not scheduled';

    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString();

    if (time) {
      return `${formattedDate} at ${time}`;
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

  if (loading && serviceRequests.length === 0) {
    return (
      <div className={`${themeClasses.background} rounded-lg shadow-sm border ${themeClasses.border} p-6`}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className={`h-8 w-8 ${themeClasses.textSecondary} animate-spin`} />
          <span className={`ml-3 ${themeClasses.textSecondary}`}>
            {t('serviceRequests.loading', 'Loading service requests...')}
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
              {t('serviceRequests.error', 'Error loading service requests')}
            </p>
            <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>{error}</p>
            <button
              onClick={() => fetchServiceRequests()}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {t('general.retry', 'Try Again')}
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
            {t('serviceRequests.title', 'Service Requests')}
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
                placeholder={t('serviceRequests.searchPlaceholder', 'Search requests...')}
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
              <option value="all">{t('serviceRequests.allStatuses', 'All Statuses')}</option>
              <option value="pending">{t('serviceRequests.pending', 'Pending')}</option>
              <option value="progress">{t('serviceRequests.inProgress', 'In Progress')}</option>
              <option value="completed">{t('serviceRequests.completed', 'Completed')}</option>
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
                ? t('serviceRequests.noFilteredResults', 'No service requests match your filters')
                : t('serviceRequests.noRequests', 'No service requests found')
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
                      {request.status}
                    </span>
                    {request.priority && (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(request.priority)}`}>
                        {request.priority}
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
                        <span>{request.fileCount} file{request.fileCount !== 1 ? 's' : ''}</span>
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
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} requests
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
              {pagination.page} of {pagination.totalPages}
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
                      {selectedRequest.status}
                    </span>
                    {selectedRequest.priority && (
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPriorityColor(selectedRequest.priority)}`}>
                        {selectedRequest.priority} Priority
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Request #:</span>
                      <p className="text-gray-900 dark:text-white">{selectedRequest.requestNumber}</p>
                    </div>
                    {selectedRequest.location && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Location:</span>
                        <p className="text-gray-900 dark:text-white">{selectedRequest.location}</p>
                      </div>
                    )}
                    {selectedRequest.serviceType && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Service Type:</span>
                        <p className="text-gray-900 dark:text-white">{selectedRequest.serviceType}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Requested Date:</span>
                      <p className="text-gray-900 dark:text-white">
                        {formatDateTime(selectedRequest.requestedDate, selectedRequest.requestedTimeStart)}
                      </p>
                    </div>
                    {selectedRequest.scheduledDate && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Scheduled Date:</span>
                        <p className="text-gray-900 dark:text-white">
                          {formatDateTime(selectedRequest.scheduledDate, selectedRequest.scheduledTimeStart)}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Created:</span>
                      <p className="text-gray-900 dark:text-white">
                        {new Date(selectedRequest.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {selectedRequest.description && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>
                      <p className="text-gray-900 dark:text-white mt-1 whitespace-pre-wrap">
                        {selectedRequest.description}
                      </p>
                    </div>
                  )}

                  {/* Files Section */}
                  {selectedRequest.fileCount > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Attachments ({selectedRequest.fileCount})
                      </h4>
                      {loadingFiles ? (
                        <div className="flex items-center gap-2 text-gray-500">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Loading files...</span>
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
                                  window.open(`/api/client/files/${file.id}/download`, '_blank');
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">No files available</p>
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
                  Close
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