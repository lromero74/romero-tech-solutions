import React, { useState, useEffect, useRef } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';
import { websocketService } from '../../services/websocketService';
import {
  AlertCircle,
  RefreshCw
} from 'lucide-react';

import {
  CancellationModal,
  CloseConfirmationModal,
  ServiceRequestDetailModal,
  ServiceRequestsFilters,
  ServiceRequestsList,
  ServiceRequestsPagination,
  SuccessMessage,
  ServiceRequest,
  ServiceRequestFile,
  ServiceRequestNote,
  PaginationInfo
} from './ServiceRequests_Modals';

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
        const files = data.data.files;
        setRequestFiles(files);

        // Update file count in selectedRequest and serviceRequests array
        const actualFileCount = files.length;
        if (selectedRequest && selectedRequest.id === requestId) {
          setSelectedRequest({ ...selectedRequest, fileCount: actualFileCount });
        }
        setServiceRequests(prev =>
          prev.map(req => req.id === requestId ? { ...req, fileCount: actualFileCount } : req)
        );
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

      // If a file was deleted from the currently selected request, refresh the files list
      if (change.entityType === 'serviceRequest' && change.fileDeleted && selectedRequest && change.entityId === selectedRequest.id) {
        console.log(`🗑️  File deleted from current service request, refreshing files list...`);
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
      <SuccessMessage message={successMessage} />

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
        <ServiceRequestsFilters
          filters={filters}
          themeClasses={themeClasses}
          t={t}
          onFiltersChange={setFilters}
        />
      </div>

      {/* Service Requests List */}
      <div className="divide-y dark:divide-gray-700">
        <ServiceRequestsList
          requests={filteredRequests}
          filters={filters}
          themeClasses={themeClasses}
          isDarkMode={isDarkMode}
          language={language}
          t={t}
          onViewRequest={handleViewRequest}
          onCancelRequest={handleCancelRequest}
        />
      </div>

      {/* Pagination */}
      <ServiceRequestsPagination
        pagination={pagination}
        loading={loading}
        themeClasses={themeClasses}
        t={t}
        onPageChange={fetchServiceRequests}
      />

      {/* Request Details Modal */}
      {selectedRequest && (
        <ServiceRequestDetailModal
          selectedRequest={selectedRequest}
          editingTitle={editingTitle}
          editingDescription={editingDescription}
          editedTitle={editedTitle}
          editedDescription={editedDescription}
          savingEdit={savingEdit}
          otherViewers={otherViewers}
          requestFiles={requestFiles}
          loadingFiles={loadingFiles}
          requestNotes={requestNotes}
          loadingNotes={loadingNotes}
          newNoteText={newNoteText}
          submittingNote={submittingNote}
          newlyReceivedNoteId={newlyReceivedNoteId}
          renamingFileId={renamingFileId}
          newFileName={newFileName}
          deletingFileId={deletingFileId}
          uploadingFiles={uploadingFiles}
          isDarkMode={isDarkMode}
          authUser={authUser}
          language={language}
          t={t}
          themeClasses={themeClasses}
          onClose={handleCloseDetailModal}
          onStartEditTitle={startEditTitle}
          onSaveTitle={saveTitle}
          onCancelEditTitle={cancelEditTitle}
          onEditedTitleChange={setEditedTitle}
          onStartEditDescription={startEditDescription}
          onSaveDescription={saveDescription}
          onCancelEditDescription={cancelEditDescription}
          onEditedDescriptionChange={setEditedDescription}
          onStartRenameFile={startRenameFile}
          onSaveFileName={saveFileName}
          onCancelRenameFile={cancelRenameFile}
          onDeleteFile={deleteFile}
          onUploadFiles={uploadFiles}
          onFileNameChange={setNewFileName}
          onNoteTextChange={setNewNoteText}
          onSubmitNote={submitNote}
          onCancelRequest={handleCancelRequest}
        />
      )}

      {/* Close Confirmation Modal */}
      <CloseConfirmationModal
        showModal={showCloseConfirmation}
        t={t}
        onConfirm={confirmCloseDetailModal}
        onCancel={() => setShowCloseConfirmation(false)}
      />

      {/* Cancellation Modal */}
      <CancellationModal
        showModal={showCancelModal}
        cancellingRequest={cancellingRequest}
        cancellationReason={cancellationReason}
        isCancelling={isCancelling}
        t={t}
        onReasonChange={setCancellationReason}
        onConfirm={handleConfirmCancellation}
        onClose={() => setShowCancelModal(false)}
      />
    </div>
  );
};

export default ServiceRequests;
