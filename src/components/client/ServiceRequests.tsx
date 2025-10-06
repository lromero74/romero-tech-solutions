import React, { useState, useEffect, useRef } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';
import { formatLongDate } from '../../utils/dateFormatter';
import { websocketService } from '../../services/websocketService';
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
  ExternalLink,
  X,
  Edit2,
  Trash2,
  Check,
  Upload
} from 'lucide-react';

interface ServiceRequest {
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

/**
 * Format a timestamp to show both local time and UTC
 * @param timestamp - ISO timestamp string
 * @param locale - Locale string for formatting
 * @param timeFormat - '12h' or '24h' format preference (defaults to '12h')
 */
const formatTimestampWithUTC = (timestamp: string, locale?: string, timeFormat: '12h' | '24h' = '12h'): { local: string; utc: string } => {
  const date = new Date(timestamp);
  const use12Hour = timeFormat === '12h';

  // Format local time
  const local = date.toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour
  });

  // Format UTC time
  const utc = date.toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour,
    timeZone: 'UTC'
  });

  return { local, utc };
};

interface ServiceRequestsProps {
  initialServiceRequestId?: string | null;
  onServiceRequestOpened?: () => void;
}

const ServiceRequests: React.FC<ServiceRequestsProps> = ({
  initialServiceRequestId,
  onServiceRequestOpened
}) => {
  const { isDarkMode } = useClientTheme();
  const { t, language } = useClientLanguage();
  const { addServiceRequestChange } = useNotifications();

  // Get current client user for change tracking
  const authUser = React.useMemo(() => {
    const storedUser = RoleBasedStorage.getItem('authUser');
    return storedUser ? JSON.parse(storedUser) : null;
  }, []);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 0
  });

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    hideClosed: true  // Hide completed/cancelled by default
  });

  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [requestFiles, setRequestFiles] = useState<ServiceRequestFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [requestNotes, setRequestNotes] = useState<ServiceRequestNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [newlyReceivedNoteId, setNewlyReceivedNoteId] = useState<string | null>(null);
  const [lastSubmittedNoteId, setLastSubmittedNoteId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState<ServiceRequest | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Close confirmation state
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  // Presence tracking
  const [otherViewers, setOtherViewers] = useState<Array<{userId: string; userName: string; userType: string}>>([]);

  // Status color mapping
  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('cancelled') || statusLower.includes('rejected')) {
      return 'bg-gray-500 text-white';
    } else if (statusLower === 'submitted') {
      return 'bg-blue-600 text-white';
    } else if (statusLower === 'acknowledged') {
      return isDarkMode ? 'bg-orange-500 text-white' : 'bg-orange-500 text-black';
    } else if (statusLower.includes('pending')) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
    } else if (statusLower.includes('progress') || statusLower.includes('assigned')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
    } else if (statusLower.includes('completed') || statusLower.includes('resolved')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
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

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests?page=${page}&limit=${pagination.limit}&hideClosed=${filters.hideClosed}`, {
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
        // Add the new note to the list (optimistic update)
        setRequestNotes(prev => [data.data.note, ...prev]);
        // Track this note ID so we don't add it again from websocket
        setLastSubmittedNoteId(data.data.note.id);
        // Trigger blue halo effect for the note we just submitted
        setNewlyReceivedNoteId(data.data.note.id);
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

  // Handle title/description editing
  const startEditTitle = () => {
    if (selectedRequest) {
      setEditedTitle(selectedRequest.title);
      setEditingTitle(true);
    }
  };

  const startEditDescription = () => {
    if (selectedRequest) {
      setEditedDescription(selectedRequest.description || '');
      setEditingDescription(true);
    }
  };

  const cancelEditTitle = () => {
    setEditingTitle(false);
    setEditedTitle('');
  };

  const cancelEditDescription = () => {
    setEditingDescription(false);
    setEditedDescription('');
  };

  const saveTitle = async () => {
    if (!selectedRequest || !editedTitle.trim() || !authUser) return;
    if (editedTitle === selectedRequest.title) {
      cancelEditTitle();
      return;
    }

    try {
      setSavingEdit(true);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) throw new Error('No session token found');

      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/details`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          title: editedTitle.trim(),
          updatedBy: {
            id: authUser.id,
            name: authUser.name,
            type: 'client'
          }
        })
      });

      if (!response.ok) throw new Error(`Failed to update title: ${response.statusText}`);

      const data = await response.json();
      if (data.success) {
        setSelectedRequest({ ...selectedRequest, title: editedTitle.trim() });
        setServiceRequests(prev =>
          prev.map(req => req.id === selectedRequest.id ? { ...req, title: editedTitle.trim() } : req)
        );
        fetchRequestNotes(selectedRequest.id);
        cancelEditTitle();
      } else {
        throw new Error(data.message || 'Failed to update title');
      }
    } catch (err) {
      console.error('Error updating title:', err);
      alert(t('serviceRequests.updateError', undefined, 'Failed to update title. Please try again.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const saveDescription = async () => {
    if (!selectedRequest || !authUser) return;
    if (editedDescription === (selectedRequest.description || '')) {
      cancelEditDescription();
      return;
    }

    try {
      setSavingEdit(true);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) throw new Error('No session token found');

      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/details`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          description: editedDescription.trim() || null,
          updatedBy: {
            id: authUser.id,
            name: authUser.name,
            type: 'client'
          }
        })
      });

      if (!response.ok) throw new Error(`Failed to update description: ${response.statusText}`);

      const data = await response.json();
      if (data.success) {
        setSelectedRequest({ ...selectedRequest, description: editedDescription.trim() || '' });
        setServiceRequests(prev =>
          prev.map(req => req.id === selectedRequest.id ? { ...req, description: editedDescription.trim() } : req)
        );
        fetchRequestNotes(selectedRequest.id);
        cancelEditDescription();
      } else {
        throw new Error(data.message || 'Failed to update description');
      }
    } catch (err) {
      console.error('Error updating description:', err);
      alert(t('serviceRequests.updateError', undefined, 'Failed to update description. Please try again.'));
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle file operations
  const startRenameFile = (file: ServiceRequestFile) => {
    setRenamingFileId(file.id);
    setNewFileName(file.originalFilename);
  };

  const cancelRenameFile = () => {
    setRenamingFileId(null);
    setNewFileName('');
  };

  // Handle closing detail modal with confirmation if there are pending changes
  const handleCloseDetailModal = () => {
    const hasPendingChanges = editingTitle || editingDescription || savingEdit || newNoteText.trim().length > 0;

    if (hasPendingChanges) {
      setShowCloseConfirmation(true);
    } else {
      setSelectedRequest(null);
    }
  };

  const confirmCloseDetailModal = () => {
    setSelectedRequest(null);
    setShowCloseConfirmation(false);
    // Clear any pending changes
    setNewNoteText('');
    setEditingTitle(false);
    setEditingDescription(false);
  };

  const saveFileName = async (fileId: string) => {
    if (!selectedRequest || !newFileName.trim() || !authUser) return;

    const currentFile = requestFiles.find(f => f.id === fileId);
    if (currentFile && newFileName === currentFile.originalFilename) {
      cancelRenameFile();
      return;
    }

    try {
      setSavingEdit(true);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) throw new Error('No session token found');

      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/files/${fileId}/rename`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          newFilename: newFileName.trim(),
          updatedBy: {
            id: authUser.id,
            name: authUser.name,
            type: 'client'
          }
        })
      });

      if (!response.ok) throw new Error(`Failed to rename file: ${response.statusText}`);

      const data = await response.json();
      if (data.success) {
        setRequestFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, originalFilename: newFileName.trim() } : f)
        );
        fetchRequestNotes(selectedRequest.id);
        cancelRenameFile();
      } else {
        throw new Error(data.message || 'Failed to rename file');
      }
    } catch (err) {
      console.error('Error renaming file:', err);
      alert(t('serviceRequests.fileRenameError', undefined, 'Failed to rename file. Please try again.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!selectedRequest || !authUser) return;

    const confirmDelete = window.confirm(t('serviceRequests.confirmFileDelete', undefined, 'Are you sure you want to delete this file? This action cannot be undone.'));
    if (!confirmDelete) return;

    try {
      setDeletingFileId(fileId);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) throw new Error('No session token found');

      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/files/${fileId}?updatedById=${authUser.id}&updatedByName=${encodeURIComponent(authUser.name)}&updatedByType=client`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken
        },
        credentials: 'include'
      });

      if (!response.ok) throw new Error(`Failed to delete file: ${response.statusText}`);

      const data = await response.json();
      if (data.success) {
        setRequestFiles(prev => prev.filter(f => f.id !== fileId));
        if (selectedRequest.fileCount) {
          const newFileCount = selectedRequest.fileCount - 1;
          setSelectedRequest({ ...selectedRequest, fileCount: newFileCount });
          setServiceRequests(prev =>
            prev.map(req => req.id === selectedRequest.id ? { ...req, fileCount: newFileCount } : req)
          );
        }
        fetchRequestNotes(selectedRequest.id);
      } else {
        throw new Error(data.message || 'Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      alert(t('serviceRequests.fileDeleteError', undefined, 'Failed to delete file. Please try again.'));
    } finally {
      setDeletingFileId(null);
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!selectedRequest || !authUser) return;

    try {
      setUploadingFiles(true);

      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      if (!sessionToken) throw new Error('No session token found');

      const csrfToken = await apiService.getToken();

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/client/service-requests/${selectedRequest.id}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: formData
      });

      if (!response.ok) throw new Error(`Failed to upload files: ${response.statusText}`);

      const result = await response.json();

      if (result.success) {
        // Refresh files list
        fetchRequestFiles(selectedRequest.id);
        // Refresh notes to show the upload note
        fetchRequestNotes(selectedRequest.id);
        // Update file count
        if (result.data?.uploadedFiles) {
          const newFileCount = (selectedRequest.fileCount || 0) + result.data.uploadedFiles.length;
          setSelectedRequest({ ...selectedRequest, fileCount: newFileCount });
          setServiceRequests(prev =>
            prev.map(req => req.id === selectedRequest.id ? { ...req, fileCount: newFileCount } : req)
          );
        }

        // Show success message
        if (result.data?.failedFiles?.length > 0) {
          alert(t('serviceRequests.uploadCompleted', undefined, `Upload completed!\n${result.data.uploadedFiles.length} file(s) uploaded successfully.\n${result.data.failedFiles.length} file(s) failed.`));
        }
      } else {
        throw new Error(result.message || 'Failed to upload files');
      }
    } catch (err) {
      console.error('Error uploading files:', err);
      alert(t('serviceRequests.fileUploadError', undefined, 'Failed to upload files. Please try again.'));
    } finally {
      setUploadingFiles(false);
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

  // Check if a service request can be cancelled
  const canCancelRequest = (request: ServiceRequest) => {
    // Cannot cancel if already in final status
    const statusLower = request.status.toLowerCase();
    if (statusLower.includes('completed') || statusLower.includes('cancelled')) {
      console.log(`Cannot cancel ${request.requestNumber}: status is ${request.status}`);
      return false;
    }

    const now = new Date();

    // Use new datetime field if available, otherwise fall back to old fields
    let requestedDateTime: Date;

    if (request.requestedDatetime) {
      requestedDateTime = new Date(request.requestedDatetime);
    } else if (request.requestedDate && request.requestedTimeStart) {
      // Parse the UTC date to get the local date part
      const utcDate = new Date(request.requestedDate);
      const year = utcDate.getFullYear();
      const month = String(utcDate.getMonth() + 1).padStart(2, '0');
      const day = String(utcDate.getDate()).padStart(2, '0');
      requestedDateTime = new Date(`${year}-${month}-${day}T${request.requestedTimeStart}`);
    } else {
      console.log(`Cannot cancel ${request.requestNumber}: missing date/time`);
      return false;
    }

    if (isNaN(requestedDateTime.getTime())) {
      console.log(`Cannot cancel ${request.requestNumber}: invalid date format`);
      return false;
    }

    if (requestedDateTime > now) {
      console.log(`✅ Can cancel ${request.requestNumber}: scheduled for ${requestedDateTime}`);
      return true;
    } else {
      console.log(`Cannot cancel ${request.requestNumber}: already started (${requestedDateTime} < ${now})`);
      return false;
    }
  };

  // Calculate hours until service request starts
  const getHoursUntilStart = (request: ServiceRequest) => {
    const now = new Date();

    // Use new datetime field if available, otherwise fall back to old fields
    let requestedDateTime: Date;

    if (request.requestedDatetime) {
      requestedDateTime = new Date(request.requestedDatetime);
    } else if (request.requestedDate && request.requestedTimeStart) {
      // Parse the UTC date to get the local date part
      const utcDate = new Date(request.requestedDate);
      const year = utcDate.getFullYear();
      const month = String(utcDate.getMonth() + 1).padStart(2, '0');
      const day = String(utcDate.getDate()).padStart(2, '0');
      requestedDateTime = new Date(`${year}-${month}-${day}T${request.requestedTimeStart}`);
    } else {
      return 0;
    }

    return (requestedDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  };

  // Handle cancel request click
  const handleCancelRequest = (request: ServiceRequest) => {
    setCancellingRequest(request);
    setCancellationReason('');
    setShowCancelModal(true);
  };

  // Handle cancel confirmation
  const handleConfirmCancellation = async () => {
    if (!cancellingRequest) return;

    setIsCancelling(true);
    try {
      const response = await apiService.post(
        `/client/service-requests/${cancellingRequest.id}/cancel`,
        { cancellationReason: cancellationReason.trim() || undefined }
      );

      if (response.success) {
        // Refresh service requests
        await fetchServiceRequests(pagination.page);

        // Close modal
        setShowCancelModal(false);
        setCancellingRequest(null);
        setCancellationReason('');

        // Show success message
        setSuccessMessage(t('serviceRequests.cancelSuccess', undefined, 'Service request cancelled successfully'));

        // Auto-hide success message after 5 seconds
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        alert(response.message || t('serviceRequests.cancelError', undefined, 'Failed to cancel service request'));
      }
    } catch (error: any) {
      console.error('Error cancelling service request:', error);
      alert(error.message || t('serviceRequests.cancelError', undefined, 'Failed to cancel service request'));
    } finally {
      setIsCancelling(false);
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

  // Format date and time (converts UTC to local timezone)
  const formatDateTime = (datetime: string | null, fallbackDate?: string | null, fallbackTime?: string | null) => {
    // If we have the new combined datetime field (UTC ISO string), use it
    if (datetime) {
      try {
        const dateObj = new Date(datetime);
        if (isNaN(dateObj.getTime())) {
          return t('serviceRequests.notScheduled', undefined, 'Not scheduled');
        }
        const formattedDate = dateObj.toLocaleDateString(getLocale());
        const formattedTime = dateObj.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
        return `${formattedDate} ${t('serviceRequests.at', undefined, 'at')} ${formattedTime}`;
      } catch (error) {
        console.error('formatDateTime error:', error);
      }
    }

    // Fallback to old date/time fields for backward compatibility
    if (!fallbackDate) return t('serviceRequests.notScheduled', undefined, 'Not scheduled');
    const dateObj = new Date(fallbackDate);
    const formattedDate = dateObj.toLocaleDateString(getLocale());
    if (fallbackTime) {
      return `${formattedDate} ${t('serviceRequests.at', undefined, 'at')} ${fallbackTime}`;
    }
    return formattedDate;
  };

  // Filter service requests (hideClosed is now handled by backend)
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

  // Handle opening specific service request when navigating from FileManager
  useEffect(() => {
    if (initialServiceRequestId && serviceRequests.length > 0) {
      const requestToOpen = serviceRequests.find(req => req.id === initialServiceRequestId);
      if (requestToOpen) {
        setSelectedRequest(requestToOpen);
        onServiceRequestOpened?.();
      }
    }
  }, [initialServiceRequestId, serviceRequests, onServiceRequestOpened]);

  // Connect to websocket for real-time updates
  useEffect(() => {
    const initializeWebSocket = async () => {
      try {
        const sessionToken = RoleBasedStorage.getItem('sessionToken');
        if (!sessionToken) {
          console.log('🔌 No session token available for WebSocket connection');
          return;
        }

        // Connect to WebSocket server
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        let websocketUrl;
        if (apiBaseUrl.includes('api.romerotechsolutions.com')) {
          websocketUrl = 'https://api.romerotechsolutions.com';
        } else if (apiBaseUrl.includes('44.211.124.33:3001')) {
          websocketUrl = 'http://44.211.124.33:3001';
        } else if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
          websocketUrl = 'http://localhost:3001';
        } else {
          websocketUrl = apiBaseUrl.replace('/api', '').replace(/\/$/, '');
        }

        console.log('🔌 Client connecting to WebSocket server:', websocketUrl);
        await websocketService.connect(websocketUrl);

        // Authenticate as client
        console.log('🔐 Attempting client WebSocket authentication');
        websocketService.authenticateClient(sessionToken);

        console.log('✅ Client WebSocket initialized');
      } catch (error) {
        console.error('❌ Failed to initialize client WebSocket:', error);
      }
    };

    initializeWebSocket();

    return () => {
      console.log('🧹 Cleaning up client WebSocket connection...');
      websocketService.disconnect();
    };
  }, []);

  // Set up periodic polling for service request changes
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchServiceRequests(pagination.page);
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(pollInterval);
  }, [pagination.page, filters.hideClosed]);

  // Listen for websocket note updates and file uploads
  useEffect(() => {
    const handleEntityChange = (change: any) => {
      // If a service request was updated with a note added, and it's the currently selected request
      if (change.entityType === 'serviceRequest' && change.noteAdded && selectedRequest && change.entityId === selectedRequest.id) {
        console.log('📝 Note added to current service request, inserting new note...');
        // Instead of reloading all notes, directly insert the new note at the top
        if (change.note) {
          // Skip if this is the note we just submitted (already added optimistically)
          if (change.note.id === lastSubmittedNoteId) {
            console.log('📝 Skipping duplicate note (we just submitted this one)');
            setLastSubmittedNoteId(null); // Clear the flag
            return;
          }
          // Transform snake_case from backend to camelCase for client
          const transformedNote: ServiceRequestNote = {
            id: change.note.id,
            noteText: change.note.note_text,
            noteType: change.note.note_type,
            createdByType: change.note.created_by_type,
            createdByName: change.note.created_by_name,
            createdAt: change.note.created_at
          };
          setRequestNotes(prev => [transformedNote, ...prev]);
          // Trigger blue halo effect for the newly received note
          setNewlyReceivedNoteId(change.note.id);
        }
      }

      // If files were uploaded to the currently selected request, refresh the files list
      if (change.entityType === 'serviceRequest' && change.filesUploaded && selectedRequest && change.entityId === selectedRequest.id) {
        console.log(`📎 Files uploaded to current service request, refreshing files list (${change.fileCount} files)...`);
        fetchRequestFiles(selectedRequest.id);
      }
    };

    websocketService.onEntityDataChange(handleEntityChange);

    return () => {
      // Cleanup: remove listener when component unmounts or selectedRequest changes
      websocketService.onEntityDataChange(() => {});
    };
  }, [selectedRequest, lastSubmittedNoteId]);

  // Auto-remove highlight after 3 seconds
  useEffect(() => {
    if (newlyReceivedNoteId) {
      const timer = setTimeout(() => {
        setNewlyReceivedNoteId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newlyReceivedNoteId]);

  // Track viewers of the selected service request
  useEffect(() => {
    if (!selectedRequest) {
      setOtherViewers([]);
      return;
    }

    // Notify server that we're viewing this request
    websocketService.startViewingRequest(selectedRequest.id);

    // Listen for viewer updates
    const handleViewersUpdate = (update: any) => {
      if (update.serviceRequestId === selectedRequest.id) {
        console.log(`👁️  Other viewers for request ${selectedRequest.id}:`, update.viewers);
        setOtherViewers(update.viewers);
      }
    };

    websocketService.onServiceRequestViewersChange(handleViewersUpdate);

    return () => {
      // Notify server that we stopped viewing this request
      websocketService.stopViewingRequest(selectedRequest.id);
      websocketService.onServiceRequestViewersChange(() => {});
      setOtherViewers([]);
    };
  }, [selectedRequest]);

  // Handle ESC key to close the detail modal (only if no edits in progress)
  useEffect(() => {
    if (!selectedRequest) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseDetailModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedRequest, editingTitle, editingDescription, savingEdit, newNoteText]);

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
      {/* Success Message */}
      {successMessage && (
        <div className="mx-6 mt-6 rounded-md bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-3" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              {successMessage}
            </p>
          </div>
        </div>
      )}

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
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hideClosed}
                onChange={(e) => setFilters(prev => ({ ...prev, hideClosed: e.target.checked }))}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className={`text-sm ${themeClasses.text} whitespace-nowrap`}>
                {t('serviceRequests.hideClosed', undefined, 'Hide Closed')}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Service Requests List */}
      <div className="divide-y dark:divide-gray-700">
        {filteredRequests.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className={`h-12 w-12 ${themeClasses.textSecondary} mx-auto mb-4`} />
            <p className={`${themeClasses.textSecondary}`}>
              {filters.search || filters.status !== 'all' || filters.hideClosed
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

                  {/* Date and Time Block */}
                  {request.cost && (request.requestedDatetime || (request.requestedDate && request.requestedTimeStart && request.requestedTimeEnd)) && (
                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('serviceRequests.scheduledDateTime', undefined, 'Scheduled Date & Time')}</h4>
                      {request.requestedDatetime && request.requestedDurationMinutes ? (
                        <>
                          <div className="text-sm text-blue-800 dark:text-blue-200 mb-1">
                            {formatLongDate(new Date(request.requestedDatetime), t, language)}
                          </div>
                          <div className="text-sm text-blue-800 dark:text-blue-200">
                            {new Date(request.requestedDatetime).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} - {new Date(new Date(request.requestedDatetime).getTime() + request.requestedDurationMinutes * 60000).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} ({(request.requestedDurationMinutes / 60).toFixed(1)}h)
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-blue-800 dark:text-blue-200 mb-1">
                            {formatLongDate(new Date(request.requestedDate!), t, language)}
                          </div>
                          <div className="text-sm text-blue-800 dark:text-blue-200">
                            {request.requestedTimeStart!.substring(0, 5)} - {request.requestedTimeEnd!.substring(0, 5)} ({request.cost.durationHours}h)
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Cost Estimate Block */}
                  {request.cost && (
                    <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">{t('serviceRequests.costEstimate', undefined, 'Cost Estimate')}</h4>
                      <div className="text-xs text-green-700 dark:text-green-300 mb-1">
                        {t('serviceRequests.baseRatePerHour', { rate: String(request.cost.baseRate) }, 'Base Rate: ${{rate}}/hr')} ({request.cost.rateCategoryName || 'Standard'})
                      </div>
                      {/* Tier Breakdown */}
                      {request.cost.breakdown && request.cost.breakdown.map((block, idx) => (
                        <div key={idx} className="text-xs text-green-700 dark:text-green-300">
                          {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                        </div>
                      ))}
                      {/* First Hour Discount */}
                      {request.cost.firstHourDiscount && request.cost.firstHourDiscount > 0 && (
                        <>
                          <div className="text-xs text-green-700 dark:text-green-300 mt-1 pt-1 border-t border-green-200 dark:border-green-700">
                            {t('serviceRequests.subtotal', undefined, 'subtotal')}: ${request.cost.subtotal?.toFixed(2)}
                          </div>
                          <div className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">
                            🎁 {t('serviceRequests.firstHourComp', undefined, 'First Hour Comp (New Client)')}:
                          </div>
                          {request.cost.firstHourCompBreakdown?.map((compBlock, idx) => (
                            <div key={idx} className="text-xs text-green-700 dark:text-green-300 ml-4">
                              • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                            </div>
                          ))}
                          {request.cost.firstHourCompBreakdown && request.cost.firstHourCompBreakdown.length > 1 && (
                            <div className="text-xs text-green-700 dark:text-green-300 font-medium ml-4">
                              {t('serviceRequests.totalDiscount', undefined, 'Total Discount')}: -${request.cost.firstHourDiscount.toFixed(2)}
                            </div>
                          )}
                        </>
                      )}
                      <div className="mt-1 pt-1 border-t border-green-200 dark:border-green-700 text-sm font-semibold text-green-900 dark:text-green-100">
                        {t('serviceRequests.totalEstimate', { total: request.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1 italic">
                        * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
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
                      <span>{formatDateTime(request.requestedDatetime, request.requestedDate, request.requestedTimeStart)}</span>
                    </div>
                    {request.fileCount > 0 && (
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>{request.fileCount} {request.fileCount === 1 ? t('serviceRequests.file', 'file') : t('serviceRequests.files', 'files')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  {canCancelRequest(request) && (
                    <button
                      onClick={() => handleCancelRequest(request)}
                      className={`p-2 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
                      title={t('serviceRequests.cancel', undefined, 'Cancel')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleViewRequest(request)}
                    className={`p-2 rounded-md border ${themeClasses.border} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                  >
                    <Eye className={`h-4 w-4 ${themeClasses.textSecondary}`} />
                  </button>
                </div>
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
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseDetailModal} />

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 mr-4">
                    {editingTitle ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-md text-lg font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                          disabled={savingEdit}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitle();
                            if (e.key === 'Escape') cancelEditTitle();
                          }}
                        />
                        <button
                          onClick={saveTitle}
                          disabled={savingEdit || !editedTitle.trim()}
                          className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50"
                          title="Save"
                        >
                          {savingEdit ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                        </button>
                        <button
                          onClick={cancelEditTitle}
                          disabled={savingEdit}
                          className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                          title="Cancel"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                          {selectedRequest.title}
                        </h3>
                        <button
                          onClick={startEditTitle}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Edit title"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {/* Other Viewers Indicator */}
                        {otherViewers.length > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-full">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-medium text-green-700 dark:text-green-300">
                              {otherViewers[0].userName} viewing
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCloseDetailModal}
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

                  {/* Date & Time Block */}
                  {selectedRequest.cost && (selectedRequest.requestedDatetime || (selectedRequest.requestedDate && selectedRequest.requestedTimeStart && selectedRequest.requestedTimeEnd)) && (
                    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('serviceRequests.selectedDateTime', undefined, 'Selected Date & Time')}</h4>
                      {selectedRequest.requestedDatetime && selectedRequest.requestedDurationMinutes ? (
                        <>
                          <div className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            {formatLongDate(new Date(selectedRequest.requestedDatetime), t, language)}
                          </div>
                          <div className="text-base text-blue-800 dark:text-blue-200">
                            {new Date(selectedRequest.requestedDatetime).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} - {new Date(new Date(selectedRequest.requestedDatetime).getTime() + selectedRequest.requestedDurationMinutes * 60000).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })} ({(selectedRequest.requestedDurationMinutes / 60).toFixed(1)}h)
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            {formatLongDate(new Date(selectedRequest.requestedDate!), t, language)}
                          </div>
                          <div className="text-base text-blue-800 dark:text-blue-200">
                            {selectedRequest.requestedTimeStart!.substring(0, 5)} - {selectedRequest.requestedTimeEnd!.substring(0, 5)} ({selectedRequest.cost.durationHours}h)
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Cost Estimate Block */}
                  {selectedRequest.cost && (
                    <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">{t('serviceRequests.costEstimate', undefined, 'Cost Estimate')}</h4>
                      <div className="space-y-1">
                        <div className="text-sm text-green-700 dark:text-green-300">
                          {t('serviceRequests.baseRatePerHour', { rate: String(selectedRequest.cost.baseRate) }, 'Base Rate')} ({selectedRequest.cost.rateCategoryName || 'Standard'}): ${selectedRequest.cost.baseRate}/hr
                        </div>
                        {/* Tier Breakdown */}
                        {selectedRequest.cost.breakdown && selectedRequest.cost.breakdown.map((block, idx) => (
                          <div key={idx} className="text-sm text-green-700 dark:text-green-300">
                            {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                          </div>
                        ))}
                        {/* First Hour Discount */}
                        {selectedRequest.cost.firstHourDiscount && selectedRequest.cost.firstHourDiscount > 0 && (
                          <>
                            <div className="text-sm text-green-700 dark:text-green-300 mt-1 pt-1 border-t border-green-200 dark:border-green-700">
                              {t('serviceRequests.subtotal', 'Subtotal')}: ${selectedRequest.cost.subtotal?.toFixed(2)}
                            </div>
                            <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">
                              🎁 {t('serviceRequests.firstHourComp', 'First Hour Comp (New Client)')}:
                            </div>
                            {selectedRequest.cost.firstHourCompBreakdown?.map((compBlock, idx) => (
                              <div key={idx} className="text-sm text-green-700 dark:text-green-300 ml-4">
                                • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                              </div>
                            ))}
                            {selectedRequest.cost.firstHourCompBreakdown && selectedRequest.cost.firstHourCompBreakdown.length > 1 && (
                              <div className="text-sm text-green-700 dark:text-green-300 font-medium ml-4">
                                {t('serviceRequests.totalDiscount', 'Total Discount')}: -${selectedRequest.cost.firstHourDiscount.toFixed(2)}
                              </div>
                            )}
                          </>
                        )}
                        <div className="text-base font-semibold text-green-900 dark:text-green-100 mt-2 pt-1 border-t border-green-200 dark:border-green-700">
                          {t('serviceRequests.totalEstimate', { total: selectedRequest.cost.total.toFixed(2) }, 'Total*: ${{total}}')}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1 italic">
                          * {t('scheduler.costDisclaimer', undefined, 'Actual cost may vary based on time required to complete the service')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location & Contact Information Side-by-Side on larger screens */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

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

                          {/* Contact Information - Compact */}
                          <div className="space-y-2">
                            {selectedRequest.locationDetails.contactPerson && (
                              <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                                <User className="h-4 w-4 text-gray-400" />
                                {selectedRequest.locationDetails.contactPerson}
                              </div>
                            )}

                            {selectedRequest.locationDetails.contactEmail && (
                              <a
                                href={`mailto:${selectedRequest.locationDetails.contactEmail}`}
                                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <Mail className="h-4 w-4" />
                                {selectedRequest.locationDetails.contactEmail}
                              </a>
                            )}

                            {selectedRequest.locationDetails.contactPhone && (
                              <a
                                href={`tel:${selectedRequest.locationDetails.contactPhone}`}
                                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <Phone className="h-4 w-4" />
                                {formatPhone(selectedRequest.locationDetails.contactPhone)}
                              </a>
                            )}
                          </div>
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
                            {formatDateTime(selectedRequest.scheduledDatetime, selectedRequest.scheduledDate, selectedRequest.scheduledTimeStart)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Files Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-700 dark:text-gray-300">
                        {t('serviceRequests.attachments', undefined, 'Attachments')} ({selectedRequest.fileCount || 0})
                      </h4>
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              uploadFiles(files);
                              // Reset input so the same file can be selected again
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }
                          }}
                          disabled={uploadingFiles || loadingFiles}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar,.7z"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFiles || loadingFiles}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                            uploadingFiles || loadingFiles
                              ? 'opacity-50 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          title={t('serviceRequests.uploadFiles', undefined, 'Upload files (max 5 files, 50MB each)')}
                        >
                          {uploadingFiles ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>{t('serviceRequests.uploading', undefined, 'Uploading...')}</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span>{t('serviceRequests.uploadFilesButton', undefined, 'Upload Files')}</span>
                            </>
                          )}
                        </button>
                      </>
                    </div>
                    {selectedRequest.fileCount > 0 && (
                      <div>
                      {loadingFiles ? (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>{t('serviceRequests.loadingFiles', undefined, 'Loading files...')}</span>
                        </div>
                      ) : requestFiles.length > 0 ? (
                        <div className="space-y-2">
                          {requestFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  {renamingFileId === file.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        className="flex-1 px-2 py-1 rounded text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white"
                                        disabled={savingEdit}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveFileName(file.id);
                                          if (e.key === 'Escape') cancelRenameFile();
                                        }}
                                      />
                                      <button
                                        onClick={() => saveFileName(file.id)}
                                        disabled={savingEdit || !newFileName.trim()}
                                        className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                                        title="Save"
                                      >
                                        {savingEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                      </button>
                                      <button
                                        onClick={cancelRenameFile}
                                        disabled={savingEdit}
                                        className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                        title="Cancel"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {file.originalFilename}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatFileSize(file.fileSizeBytes)} • {new Date(file.createdAt).toLocaleDateString()}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                              {renamingFileId !== file.id && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => startRenameFile(file)}
                                    className="p-2 text-gray-400 hover:text-blue-600"
                                    title={t('serviceRequests.renameFile', undefined, 'Rename file')}
                                    disabled={!!renamingFileId || !!deletingFileId}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => downloadFile(file.id, file.originalFilename)}
                                    className="p-2 text-gray-400 hover:text-green-600"
                                    title={t('serviceRequests.downloadFile', undefined, 'Download file')}
                                    disabled={!!renamingFileId || !!deletingFileId}
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteFile(file.id)}
                                    disabled={!!renamingFileId || deletingFileId === file.id}
                                    className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50"
                                    title={t('serviceRequests.deleteFile', undefined, 'Delete file')}
                                  >
                                    {deletingFileId === file.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('serviceRequests.noFiles', undefined, 'No files available')}</p>
                      )}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('serviceRequests.description', undefined, 'Description')}</h4>
                      {!editingDescription && (
                        <button
                          onClick={startEditDescription}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Edit description"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {editingDescription ? (
                      <div>
                        <textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          className={`w-full px-3 py-2 border ${themeClasses.border} rounded-md ${themeClasses.background} ${themeClasses.text} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                          rows={5}
                          disabled={savingEdit}
                          autoFocus
                          placeholder={t('serviceRequests.descriptionPlaceholder', undefined, 'Enter description...')}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={cancelEditDescription}
                            disabled={savingEdit}
                            className="px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50"
                          >
                            {t('common.cancel', undefined, 'Cancel')}
                          </button>
                          <button
                            onClick={saveDescription}
                            disabled={savingEdit}
                            className="px-3 py-1 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            {savingEdit ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                {t('common.saving', undefined, 'Saving...')}
                              </>
                            ) : (
                              t('common.save', undefined, 'Save')
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                        {selectedRequest.description || <span className="text-gray-500 dark:text-gray-400">{t('serviceRequests.noDescription', undefined, 'No description')}</span>}
                      </p>
                    )}
                  </div>

                  {/* Notes Section */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('serviceRequests.notes', undefined, 'Notes')}</h4>
                      {otherViewers.length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-full">
                          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium text-green-700 dark:text-green-300">
                            {otherViewers[0].userName}
                          </span>
                        </div>
                      )}
                    </div>

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
                        {requestNotes.map((note, index) => {
                          const timestamps = formatTimestampWithUTC(note.createdAt, getLocale(), (authUser?.timeFormatPreference as '12h' | '24h') || '12h');
                          const isHighlighted = newlyReceivedNoteId === note.id;
                          return (
                            <div key={note.id}>
                              {index > 0 && <hr className="border-gray-300 dark:border-gray-600 mb-3" />}
                              <div className={`
                                p-2 rounded-lg transition-all duration-300
                                ${isHighlighted ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/50 dark:ring-blue-500 dark:shadow-blue-500/50' : ''}
                              `}>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                  <span className="font-medium">{note.createdByName}</span>
                                  {' • '}
                                  <span className="inline-flex flex-col sm:flex-row sm:gap-1">
                                    <span>{timestamps.local} ({t('serviceRequests.localTime', undefined, 'Local')})</span>
                                    <span className="hidden sm:inline">•</span>
                                    <span>{timestamps.utc} (UTC)</span>
                                  </span>
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                                  {note.noteText}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('serviceRequests.noNotes', undefined, 'No notes yet')}</p>
                    )}
                  </div>

                  {/* Files Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-700 dark:text-gray-300">
                        {t('serviceRequests.attachments', undefined, 'Attachments')} ({selectedRequest.fileCount || 0})
                      </h4>
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              uploadFiles(files);
                              // Reset input so the same file can be selected again
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }
                          }}
                          disabled={uploadingFiles || loadingFiles}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar,.7z"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFiles || loadingFiles}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                            uploadingFiles || loadingFiles
                              ? 'opacity-50 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          title={t('serviceRequests.uploadFiles', undefined, 'Upload files (max 5 files, 50MB each)')}
                        >
                          {uploadingFiles ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>{t('serviceRequests.uploading', undefined, 'Uploading...')}</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span>{t('serviceRequests.uploadFilesButton', undefined, 'Upload Files')}</span>
                            </>
                          )}
                        </button>
                      </>
                    </div>
                    {selectedRequest.fileCount > 0 && (
                      <div>
                      {loadingFiles ? (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>{t('serviceRequests.loadingFiles', undefined, 'Loading files...')}</span>
                        </div>
                      ) : requestFiles.length > 0 ? (
                        <div className="space-y-2">
                          {requestFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  {renamingFileId === file.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        className="flex-1 px-2 py-1 rounded text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white"
                                        disabled={savingEdit}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveFileName(file.id);
                                          if (e.key === 'Escape') cancelRenameFile();
                                        }}
                                      />
                                      <button
                                        onClick={() => saveFileName(file.id)}
                                        disabled={savingEdit || !newFileName.trim()}
                                        className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                                        title="Save"
                                      >
                                        {savingEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                      </button>
                                      <button
                                        onClick={cancelRenameFile}
                                        disabled={savingEdit}
                                        className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                        title="Cancel"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {file.originalFilename}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatFileSize(file.fileSizeBytes)} • {new Date(file.createdAt).toLocaleDateString()}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                              {renamingFileId !== file.id && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => startRenameFile(file)}
                                    className="p-2 text-gray-400 hover:text-blue-600"
                                    title={t('serviceRequests.renameFile', undefined, 'Rename file')}
                                    disabled={!!renamingFileId || !!deletingFileId}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
                                      window.open(`${apiBaseUrl}/client/files/${file.id}/download`, '_blank');
                                    }}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title={t('serviceRequests.downloadFile', undefined, 'Download file')}
                                    disabled={!!renamingFileId || !!deletingFileId}
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteFile(file.id)}
                                    className="p-2 text-gray-400 hover:text-red-600"
                                    title={t('serviceRequests.deleteFile', undefined, 'Delete file')}
                                    disabled={!!renamingFileId || deletingFileId === file.id}
                                  >
                                    {deletingFileId === file.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('serviceRequests.noFilesAvailable', undefined, 'No files available')}</p>
                      )}
                      </div>
                    )}
                    {(!selectedRequest.fileCount || selectedRequest.fileCount === 0) && (
                      <p className="text-gray-500 dark:text-gray-400 text-sm">{t('serviceRequests.noFilesAvailable', undefined, 'No files available')}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  onClick={handleCloseDetailModal}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
                >
                  {t('general.close', undefined, 'Close')}
                </button>
                {canCancelRequest(selectedRequest) && (
                  <button
                    onClick={() => {
                      setSelectedRequest(null);
                      handleCancelRequest(selectedRequest);
                    }}
                    className="w-full inline-flex justify-center rounded-md border border-red-300 dark:border-red-700 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm"
                  >
                    {t('serviceRequests.cancel', undefined, 'Cancel')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {showCloseConfirmation && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowCloseConfirmation(false)} />

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
                  {t('serviceRequests.unsavedChanges', undefined, 'Unsaved Changes')}
                </h3>

                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                  {t('serviceRequests.unsavedChangesMessage', undefined, 'You have unsaved changes. Are you sure you want to close this service request? All unsaved changes will be lost.')}
                </p>

                <div className="sm:flex sm:flex-row-reverse gap-3">
                  <button
                    onClick={confirmCloseDetailModal}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm"
                  >
                    {t('serviceRequests.discardChanges', undefined, 'Discard Changes')}
                  </button>
                  <button
                    onClick={() => setShowCloseConfirmation(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    {t('general.cancel', undefined, 'Cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && cancellingRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => !isCancelling && setShowCancelModal(false)} />

            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      {t('serviceRequests.cancelModal.title', undefined, 'Cancel Service Request')}
                    </h3>
                    <div className="mt-4 space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t('serviceRequests.cancelModal.confirmMessage', {
                          requestNumber: cancellingRequest.requestNumber
                        }, 'Are you sure you want to cancel service request {{requestNumber}}?')}
                      </p>

                      {/* Late Cancellation Warning */}
                      {getHoursUntilStart(cancellingRequest) < 1 && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                          <div className="flex items-start">
                            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
                                {t('serviceRequests.cancelModal.lateFeeWarning', undefined, '⚠️ Late Cancellation Fee')}
                              </h4>
                              <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                                {t('serviceRequests.cancelModal.lateFeeMessage', undefined,
                                  'This service request starts in less than 1 hour. A late cancellation fee may apply.')}
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                                {t('serviceRequests.cancelModal.hoursNotice', {
                                  hours: getHoursUntilStart(cancellingRequest).toFixed(2)
                                }, 'Hours of notice: {{hours}}')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cancellation Reason */}
                      <div>
                        <label htmlFor="cancellationReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {t('serviceRequests.cancelModal.reasonLabel', undefined, 'Reason for cancellation (optional)')}
                        </label>
                        <textarea
                          id="cancellationReason"
                          rows={3}
                          value={cancellationReason}
                          onChange={(e) => setCancellationReason(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          placeholder={t('serviceRequests.cancelModal.reasonPlaceholder', undefined, 'Please provide a reason for cancellation...')}
                          disabled={isCancelling}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  type="button"
                  onClick={handleConfirmCancellation}
                  disabled={isCancelling}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCancelling ? (
                    <>
                      <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                      {t('serviceRequests.cancelModal.cancelling', undefined, 'Cancelling...')}
                    </>
                  ) : (
                    t('serviceRequests.cancelModal.confirm', undefined, 'Yes, Cancel Request')
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isCancelling}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('general.cancel', undefined, 'Cancel')}
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