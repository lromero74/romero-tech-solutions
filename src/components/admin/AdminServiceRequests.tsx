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
  RefreshCw,
  Edit2,
  Check,
  X as XIcon
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { usePermission } from '../../hooks/usePermission';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';
import { websocketService } from '../../services/websocketService';
import {
  ServiceRequest,
  Filters,
  Technician,
  Status,
  ClosureReason,
  ServiceRequestFile,
  ServiceRequestNote,
  Invoice,
  CompanyInfo,
  ServiceRequestNotesSection,
  ServiceRequestFilesSection
} from './AdminServiceRequests_Modals';

const AdminServiceRequests: React.FC = () => {
  const { isDark } = useTheme();
  const { user } = useEnhancedAuth();
  const { checkPermission } = usePermission();
  const canViewCosts = checkPermission('view.service_request_costs.enable');
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
  const [showUncancelModal, setShowUncancelModal] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [uncancelReason, setUncancelReason] = useState<string>('');
  const [selectedClosureReasonId, setSelectedClosureReasonId] = useState<string>('');
  const [resolutionSummary, setResolutionSummary] = useState<string>('');
  const [actualDurationMinutes, setActualDurationMinutes] = useState<string>('');
  const [equipmentUsed, setEquipmentUsed] = useState<string>('');
  const [timeBreakdown, setTimeBreakdown] = useState<{
    isFirstServiceRequest: boolean;
    waivedHours: string;
    standardBillableHours: number;
    premiumBillableHours: number;
    emergencyBillableHours: number;
    totalBillableHours: number;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Invoice state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState<{ invoice: Invoice; companyInfo: CompanyInfo } | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Files and Notes state
  const [requestFiles, setRequestFiles] = useState<ServiceRequestFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [requestNotes, setRequestNotes] = useState<ServiceRequestNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Close confirmation state
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  // Presence tracking
  const [otherViewers, setOtherViewers] = useState<Array<{userId: string; userName: string; userType: string}>>([]);

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

      const url = `${API_BASE_URL}/admin/service-requests?${params}`;

      const response = await fetch(url, {
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

  // Update selected request when service requests are refreshed
  useEffect(() => {
    if (selectedRequest) {
      const updatedRequest = serviceRequests.find(r => r.id === selectedRequest.id);
      if (updatedRequest && JSON.stringify(updatedRequest) !== JSON.stringify(selectedRequest)) {
        setSelectedRequest(updatedRequest);
      }
    }
  }, [serviceRequests]);

  // Fetch technicians, statuses, and closure reasons on mount
  useEffect(() => {
    fetchTechnicians();
    fetchStatuses();
    fetchClosureReasons();
  }, []);

  // Listen for websocket note updates
  useEffect(() => {
    const handleEntityChange = (change: any) => {
      // If a service request was updated with a note added, and it's the currently selected request
      if (change.entityType === 'serviceRequest' && change.noteAdded && selectedRequest && change.entityId === selectedRequest.id) {
        console.log('📝 Note added to current service request, refreshing notes...');
        fetchRequestNotes(selectedRequest.id);
      }
    };

    websocketService.onEntityDataChange(handleEntityChange);

    return () => {
      // Cleanup: remove listener when component unmounts or selectedRequest changes
      websocketService.onEntityDataChange(() => {});
    };
  }, [selectedRequest]);

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

  // Handle ESC key to close the Complete Service Request modal
  useEffect(() => {
    if (!showCloseModal) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) {
        setShowCloseModal(false);
        setSelectedClosureReasonId('');
        setResolutionSummary('');
        setActualDurationMinutes('');
        setEquipmentUsed('');
        setActionError(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showCloseModal, actionLoading]);

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
      console.log('🔍 Fetching closure reasons...');
      const response = await apiService.get('/admin/service-requests/closure-reasons');
      console.log('📋 Closure reasons response:', response);
      if (response.success && response.data) {
        console.log('✅ Setting closure reasons:', response.data);
        setClosureReasons(response.data);
      } else {
        console.warn('⚠️ No data in response:', response);
      }
    } catch (err) {
      console.error('❌ Error fetching closure reasons:', err);
    }
  };

  // Fetch time breakdown by rate tier
  const fetchTimeBreakdown = async (requestId: string) => {
    try {
      const response = await apiService.get(`/admin/service-requests/${requestId}/time-breakdown`);
      console.log('🔍 Time breakdown API response:', response);
      if (response.success && response.data) {
        console.log('📊 Time breakdown data:', {
          isFirstServiceRequest: response.data.isFirstServiceRequest,
          waivedHours: response.data.waivedHours,
          waivedMinutes: response.data.waivedMinutes,
          totalBillableMinutes: response.data.totalBillableMinutes,
          totalBillableHours: response.data.totalBillableHours
        });

        setTimeBreakdown({
          isFirstServiceRequest: response.data.isFirstServiceRequest,
          waivedHours: response.data.waivedHours,
          standardBillableHours: response.data.standardBillableHours,
          premiumBillableHours: response.data.premiumBillableHours,
          emergencyBillableHours: response.data.emergencyBillableHours,
          totalBillableHours: response.data.totalBillableHours
        });

        // Auto-populate actual duration field with total billable minutes
        if (response.data.totalBillableMinutes !== undefined && response.data.totalBillableMinutes !== null) {
          setActualDurationMinutes(response.data.totalBillableMinutes.toString());
        } else {
          console.warn('⚠️ totalBillableMinutes is undefined or null');
        }
      }
    } catch (err) {
      console.error('Error fetching time breakdown:', err);
    }
  };

  // Handle technician assignment
  const handleAssignTechnician = async () => {
    if (!selectedRequest || !selectedTechnicianId) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/assign`, {
        technicianId: selectedTechnicianId
      });

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowAssignModal(false);
        setSelectedTechnicianId('');
        setSelectedRequest(null);
      } else {
        throw new Error(response.message || 'Failed to assign technician');
      }
    } catch (err) {
      console.error('Error assigning technician:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to assign technician');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle assuming ownership (assign to self)
  const handleAssumeOwnership = async () => {
    if (!selectedRequest || !user) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/assign`, {
        technicianId: user.id,
        assumeOwnership: true // Flag to indicate this is an ownership assumption
      });

      if (response.success) {
        // Refresh service requests list and update selected request
        await fetchServiceRequests();
        // Update the selected request to reflect the new assignment
        if (selectedRequest) {
          const updatedRequest = { ...selectedRequest, assigned_technician_id: user.id, assigned_technician_name: user.name };
          setSelectedRequest(updatedRequest);
        }
      } else {
        throw new Error(response.message || 'Failed to assume ownership');
      }
    } catch (err) {
      console.error('Error assuming ownership:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to assume ownership');
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

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/status`, {
        statusId: selectedStatusId,
        notes: statusNotes || undefined
      });

      if (response.success) {
        // Refresh service requests list (will trigger useEffect to update selectedRequest)
        await fetchServiceRequests();

        // Close the status modal
        setShowStatusModal(false);
        setSelectedStatusId('');
        setStatusNotes('');
      } else {
        throw new Error(response.message || 'Failed to change status');
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

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/acknowledge`, {});

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setSelectedRequest(null);
      } else {
        throw new Error(response.message || 'Failed to acknowledge service request');
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

    // Check if starting work more than 10 minutes before scheduled time
    if (action === 'start' && selectedRequest.scheduled_date && selectedRequest.scheduled_time_start) {
      const now = new Date();
      const scheduledDateTime = new Date(`${selectedRequest.scheduled_date}T${selectedRequest.scheduled_time_start}`);
      const minutesUntilScheduled = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60);

      if (minutesUntilScheduled > 10) {
        const hoursUntil = Math.floor(minutesUntilScheduled / 60);
        const minutesRemainder = Math.floor(minutesUntilScheduled % 60);
        const timeUntilMessage = hoursUntil > 0
          ? `${hoursUntil} hour${hoursUntil > 1 ? 's' : ''} and ${minutesRemainder} minute${minutesRemainder !== 1 ? 's' : ''}`
          : `${Math.floor(minutesUntilScheduled)} minute${Math.floor(minutesUntilScheduled) !== 1 ? 's' : ''}`;

        const confirmed = window.confirm(
          `⚠️ Early Start Warning\n\n` +
          `This service request is scheduled to start in ${timeUntilMessage}.\n\n` +
          `Scheduled: ${scheduledDateTime.toLocaleString()}\n\n` +
          `Are you sure you want to start work now?`
        );

        if (!confirmed) {
          return; // User cancelled, don't start work
        }
      }
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/time-entry`, {
        action
      });

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
      } else {
        throw new Error(response.message || `Failed to ${action} time tracking`);
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

      const response = await apiService.put(`/admin/service-requests/${selectedRequest.id}/close`, {
        closureReasonId: selectedClosureReasonId,
        resolutionSummary,
        actualDurationMinutes: actualDurationMinutes ? parseInt(actualDurationMinutes) : undefined,
        equipmentUsed: equipmentUsed || undefined
      });

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowCloseModal(false);
        setSelectedClosureReasonId('');
        setResolutionSummary('');
        setActualDurationMinutes('');
        setEquipmentUsed('');
        setSelectedRequest(null);
      } else {
        throw new Error(response.message || 'Failed to close service request');
      }
    } catch (err) {
      console.error('Error closing service request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to close service request');
    } finally {
      setActionLoading(false);
    }
  };

  // Uncancel a service request
  const handleUncancelRequest = async () => {
    if (!selectedRequest) return;

    try {
      setActionLoading(true);
      setActionError(null);

      const response = await apiService.post(`/admin/service-requests/${selectedRequest.id}/uncancel`, {
        reason: uncancelReason || undefined
      });

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowUncancelModal(false);
        setUncancelReason('');
        setSelectedRequest(null);
      } else {
        throw new Error(response.message || 'Failed to uncancel service request');
      }
    } catch (err) {
      console.error('Error uncancelling service request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to uncancel service request');
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
    if (!selectedRequest || !editedTitle.trim() || !user) return;
    if (editedTitle === selectedRequest.title) {
      cancelEditTitle();
      return;
    }

    try {
      setSavingEdit(true);

      const response = await apiService.patch(
        `/admin/service-requests/${selectedRequest.id}/details`,
        {
          title: editedTitle.trim(),
          updatedBy: {
            id: user.id,
            name: user.name,
            type: 'employee'
          }
        }
      );

      if (response.success) {
        // Update the request in state
        setSelectedRequest({ ...selectedRequest, title: editedTitle.trim() });
        setServiceRequests(prev =>
          prev.map(req => req.id === selectedRequest.id ? { ...req, title: editedTitle.trim() } : req)
        );
        // Refresh notes to show the change
        fetchRequestNotes(selectedRequest.id);
        cancelEditTitle();
      } else {
        throw new Error(response.message || 'Failed to update title');
      }
    } catch (err) {
      console.error('Error updating title:', err);
      alert('Failed to update title. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const saveDescription = async () => {
    if (!selectedRequest || !user) return;
    if (editedDescription === (selectedRequest.description || '')) {
      cancelEditDescription();
      return;
    }

    try {
      setSavingEdit(true);

      const response = await apiService.patch(
        `/admin/service-requests/${selectedRequest.id}/details`,
        {
          description: editedDescription.trim() || null,
          updatedBy: {
            id: user.id,
            name: user.name,
            type: 'employee'
          }
        }
      );

      if (response.success) {
        // Update the request in state
        setSelectedRequest({ ...selectedRequest, description: editedDescription.trim() || '' });
        setServiceRequests(prev =>
          prev.map(req => req.id === selectedRequest.id ? { ...req, description: editedDescription.trim() } : req)
        );
        // Refresh notes to show the change
        fetchRequestNotes(selectedRequest.id);
        cancelEditDescription();
      } else {
        throw new Error(response.message || 'Failed to update description');
      }
    } catch (err) {
      console.error('Error updating description:', err);
      alert('Failed to update description. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle closing detail modal with confirmation if there are pending changes
  const handleCloseDetailModal = () => {
    const hasPendingChanges = editingTitle || editingDescription || savingEdit || newNoteText.trim().length > 0;

    if (hasPendingChanges) {
      setShowCloseConfirmation(true);
    } else {
      setSelectedRequest(null);
      setActionError(null);
    }
  };

  const confirmCloseDetailModal = () => {
    setSelectedRequest(null);
    setActionError(null);
    setShowCloseConfirmation(false);
    // Clear any pending changes
    setNewNoteText('');
    setEditingTitle(false);
    setEditingDescription(false);
  };

  // Handle file operations
  const startRenameFile = (file: ServiceRequestFile) => {
    setRenamingFileId(file.id);
    setNewFileName(file.original_filename);
  };

  const cancelRenameFile = () => {
    setRenamingFileId(null);
    setNewFileName('');
  };

  const saveFileName = async (fileId: string) => {
    if (!selectedRequest || !newFileName.trim() || !user) return;

    const currentFile = requestFiles.find(f => f.id === fileId);
    if (currentFile && newFileName === currentFile.original_filename) {
      cancelRenameFile();
      return;
    }

    try {
      setSavingEdit(true);

      const response = await apiService.patch(
        `/admin/service-requests/${selectedRequest.id}/files/${fileId}/rename`,
        {
          newFilename: newFileName.trim(),
          updatedBy: {
            id: user.id,
            name: user.name,
            type: 'employee'
          }
        }
      );

      if (response.success) {
        // Update file in state
        setRequestFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, original_filename: newFileName.trim() } : f)
        );
        // Refresh notes to show the change
        fetchRequestNotes(selectedRequest.id);
        cancelRenameFile();
      } else {
        throw new Error(response.message || 'Failed to rename file');
      }
    } catch (err) {
      console.error('Error renaming file:', err);
      alert('Failed to rename file. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!selectedRequest || !user) return;

    const confirmDelete = window.confirm('Are you sure you want to delete this file? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
      setDeletingFileId(fileId);

      // For DELETE requests, we can't send a body, so we'll use query params
      const response = await apiService.delete(
        `/admin/service-requests/${selectedRequest.id}/files/${fileId}?updatedById=${user.id}&updatedByName=${encodeURIComponent(user.name)}&updatedByType=employee`
      );

      if (response.success) {
        // Remove file from state
        setRequestFiles(prev => prev.filter(f => f.id !== fileId));
        // Update file count
        if (selectedRequest.file_count) {
          const newFileCount = selectedRequest.file_count - 1;
          setSelectedRequest({ ...selectedRequest, file_count: newFileCount });
          setServiceRequests(prev =>
            prev.map(req => req.id === selectedRequest.id ? { ...req, file_count: newFileCount } : req)
          );
        }
        // Refresh notes to show the change
        fetchRequestNotes(selectedRequest.id);
      } else {
        throw new Error(response.message || 'Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('Failed to delete file. Please try again.');
    } finally {
      setDeletingFileId(null);
    }
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

  // Fetch invoice data
  const fetchInvoice = async (invoiceId: string) => {
    try {
      setLoadingInvoice(true);
      const response = await apiService.get(`/admin/invoices/${invoiceId}`);

      if (response.success && response.data) {
        setInvoiceData(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch invoice');
      }
    } catch (err) {
      console.error('Error fetching invoice:', err);
      alert('Failed to load invoice. Please try again.');
      setShowInvoiceModal(false);
    } finally {
      setLoadingInvoice(false);
    }
  };

  // Handle view invoice
  const handleViewInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowInvoiceModal(true);
    fetchInvoice(invoiceId);
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

  // Get unique clients for filter dropdown
  const uniqueClients = React.useMemo(() => {
    const clientMap = new Map<string, string>();
    serviceRequests.forEach(req => {
      if (req.business_id && req.business_name) {
        clientMap.set(req.business_id, req.business_name);
      }
    });
    return Array.from(clientMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [serviceRequests]);

  // Check if user can complete a service request
  const canCompleteRequest = (request: ServiceRequest) => {
    if (!user) return false;

    // Check if user can complete any request
    const canCompleteAny = checkPermission('complete.service_requests.enable');
    if (canCompleteAny) {
      return true;
    }

    // Check if user can complete requests assigned to them
    const canCompleteAssigned = checkPermission('complete.assigned_service_requests.enable');
    if (canCompleteAssigned && request.assigned_technician_id === user.id) {
      return true;
    }

    return false;
  };

  // Check if user can assume ownership of a service request
  const canAssumeOwnership = (request: ServiceRequest) => {
    if (!user) return false;

    // Can't assume ownership if already assigned to you
    if (request.assigned_technician_id === user.id) {
      return false;
    }

    // Check permission to assume ownership
    return checkPermission('assume_ownership.service_requests.enable');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <ClipboardList className={`h-8 w-8 ${themeClasses.text.primary}`} />
        <div>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Requests</h1>
          <p className={`text-sm ${themeClasses.text.muted}`}>
            {pagination.totalCount} total requests
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} border ${themeClasses.border.primary} rounded-lg p-6`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2 lg:col-span-3 xl:col-span-2">
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
                  className={`w-full pl-10 pr-4 py-2 rounded-lg ${themeClasses.input}`}
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
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="all">All Statuses</option>
                {statuses
                  .filter(s => s.is_active)
                  .sort((a, b) => a.display_order - b.display_order)
                  .map(status => (
                    <option key={status.id} value={status.name}>
                      {status.name}
                    </option>
                  ))}
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
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
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
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Technician */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Technician
              </label>
              <select
                value={filters.technician}
                onChange={(e) => setFilters(prev => ({ ...prev, technician: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="all">All Technicians</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Client/Business */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Client
              </label>
              <select
                value={filters.business}
                onChange={(e) => setFilters(prev => ({ ...prev, business: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="all">All Clients</option>
                {uniqueClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          {(filters.search || filters.status !== 'all' || filters.urgency !== 'all' || filters.priority !== 'all' || filters.business !== 'all' || filters.technician !== 'all') && (
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
                className={`text-sm ${themeClasses.text.link} hover:underline`}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

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
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            request.status.toLowerCase() === 'cancelled'
                              ? 'bg-gray-500 text-white'
                              : request.status.toLowerCase() === 'submitted'
                              ? 'bg-blue-600 text-white'
                              : request.status.toLowerCase() === 'acknowledged'
                              ? `bg-orange-500 ${isDark ? 'text-white' : 'text-black'}`
                              : themeClasses.text.primary
                          }`}
                          style={
                            request.status.toLowerCase() === 'cancelled' ||
                            request.status.toLowerCase() === 'submitted' ||
                            request.status.toLowerCase() === 'acknowledged'
                              ? {}
                              : { backgroundColor: `${request.status_color}20` }
                          }
                        >
                          {getStatusIcon(request.status)}
                          <span className="ml-1">{request.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${themeClasses.text.primary}`}
                          style={{ backgroundColor: `${request.urgency_color}20` }}
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
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRequest(request);
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View Details
                          </button>
                          {request.invoice_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewInvoice(request.invoice_id!);
                              }}
                              className="text-green-600 dark:text-green-400 hover:underline flex items-center"
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              View Invoice
                            </button>
                          )}
                        </div>
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
                <div className="flex-1 mr-4">
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className={`flex-1 px-3 py-2 rounded-md text-2xl font-bold ${themeClasses.input}`}
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
                        <XIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                        {selectedRequest.title}
                      </h2>
                      <button
                        onClick={startEditTitle}
                        className={`p-1 ${themeClasses.text.muted} hover:text-blue-600`}
                        title="Edit title"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <p className={`text-lg ${themeClasses.text.secondary} mt-1 font-mono`}>
                    {selectedRequest.request_number}
                  </p>
                </div>
                <button
                  onClick={handleCloseDetailModal}
                  className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-6">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    selectedRequest.status.toLowerCase() === 'cancelled'
                      ? 'bg-gray-500 text-white'
                      : selectedRequest.status.toLowerCase() === 'submitted'
                      ? 'bg-blue-600 text-white'
                      : selectedRequest.status.toLowerCase() === 'acknowledged'
                      ? `bg-orange-500 ${isDark ? 'text-white' : 'text-black'}`
                      : themeClasses.text.primary
                  }`}
                  style={
                    selectedRequest.status.toLowerCase() === 'cancelled' ||
                    selectedRequest.status.toLowerCase() === 'submitted' ||
                    selectedRequest.status.toLowerCase() === 'acknowledged'
                      ? {}
                      : { backgroundColor: `${selectedRequest.status_color}20` }
                  }
                >
                  {getStatusIcon(selectedRequest.status)}
                  <span className="ml-1">{selectedRequest.status}</span>
                </span>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${themeClasses.text.primary}`}
                  style={{ backgroundColor: `${selectedRequest.urgency_color}20` }}
                >
                  {selectedRequest.urgency}
                </span>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${themeClasses.text.primary}`}
                  style={{ backgroundColor: `${selectedRequest.priority_color}20` }}
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

              {/* Date/Time & Cost Summary & Location Side-by-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
                {/* Date/Time */}
                {selectedRequest.requested_date && selectedRequest.requested_time_start && selectedRequest.requested_time_end && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Selected Date & Time</h4>
                    <div className={`text-lg font-semibold ${themeClasses.text.primary} mb-1`}>
                      {new Date(selectedRequest.requested_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className={`text-base ${themeClasses.text.secondary}`}>
                      {selectedRequest.requested_time_start.substring(0, 5)} - {selectedRequest.requested_time_end.substring(0, 5)}
                      {selectedRequest.cost?.durationHours && ` (${selectedRequest.cost.durationHours}h)`}
                    </div>
                  </div>
                )}

                {/* Cost Estimate - Only for users with permission */}
                {canViewCosts && selectedRequest.cost && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Estimated Cost</h4>
                    <div className={`text-sm ${themeClasses.text.secondary} mb-2`}>
                      Base Rate: ${selectedRequest.cost.baseRate}/hr
                    </div>
                    {/* Tier Breakdown */}
                    {selectedRequest.cost.breakdown && selectedRequest.cost.breakdown.map((block: any, idx: number) => (
                      <div key={idx} className={`text-sm ${themeClasses.text.secondary}`}>
                        {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                      </div>
                    ))}
                    {/* First Hour Discount */}
                    {selectedRequest.cost.firstHourDiscount && selectedRequest.cost.firstHourDiscount > 0 && (
                      <>
                        <div className={`text-sm ${themeClasses.text.secondary} mt-2 pt-2 border-t border-green-200 dark:border-green-700`}>
                          Subtotal: ${selectedRequest.cost.subtotal?.toFixed(2)}
                        </div>
                        <div className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
                          🎁 First Hour Comp (New Client):
                        </div>
                        {selectedRequest.cost.firstHourCompBreakdown?.map((compBlock: any, idx: number) => (
                          <div key={idx} className="text-sm text-green-600 dark:text-green-400 ml-4">
                            • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                          </div>
                        ))}
                        {selectedRequest.cost.firstHourCompBreakdown && selectedRequest.cost.firstHourCompBreakdown.length > 1 && (
                          <div className="text-sm text-green-600 dark:text-green-400 font-medium ml-4">
                            Total Discount: -${selectedRequest.cost.firstHourDiscount.toFixed(2)}
                          </div>
                        )}
                      </>
                    )}
                    <div className={`text-base font-semibold ${themeClasses.text.primary} mt-2 pt-2 border-t border-green-200 dark:border-green-700`}>
                      Total*: ${selectedRequest.cost.total.toFixed(2)}
                    </div>
                    <div className={`text-xs ${themeClasses.text.muted} mt-1 italic`}>
                      * Actual cost may vary based on time required to complete the service
                    </div>
                  </div>
                )}
              </div>

              {/* Location & Contact Information */}
              <div className="my-4">
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
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>Description</h4>
                  {!editingDescription && (
                    <button
                      onClick={startEditDescription}
                      className={`p-1 ${themeClasses.text.muted} hover:text-blue-600`}
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
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input} resize-none`}
                      rows={5}
                      disabled={savingEdit}
                      autoFocus
                      placeholder="Enter description..."
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={cancelEditDescription}
                        disabled={savingEdit}
                        className="px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveDescription}
                        disabled={savingEdit}
                        className="px-3 py-1 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {savingEdit ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={`${themeClasses.text.primary} whitespace-pre-wrap text-sm`}>
                    {selectedRequest.description || <span className={themeClasses.text.muted}>No description</span>}
                  </p>
                )}
              </div>

              {/* Notes Section */}
              <ServiceRequestNotesSection
                notes={requestNotes}
                loading={loadingNotes}
                newNoteText={newNoteText}
                submittingNote={submittingNote}
                onNewNoteChange={setNewNoteText}
                onSubmitNote={submitNote}
                otherViewers={otherViewers}
                timeFormatPreference={(user?.timeFormatPreference as '12h' | '24h') || '12h'}
              />

              {/* Files Section */}
              <ServiceRequestFilesSection
                files={requestFiles}
                loading={loadingFiles}
                fileCount={selectedRequest.file_count || 0}
                renamingFileId={renamingFileId}
                newFileName={newFileName}
                savingEdit={savingEdit}
                deletingFileId={deletingFileId}
                apiBaseUrl={API_BASE_URL}
                onStartRename={startRenameFile}
                onCancelRename={cancelRenameFile}
                onSaveFileName={saveFileName}
                onDeleteFile={deleteFile}
                onFileNameChange={setNewFileName}
              />

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
                  {canAssumeOwnership(selectedRequest) && (
                    <button
                      onClick={handleAssumeOwnership}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                    >
                      <User className="h-4 w-4 mr-2" />
                      {actionLoading ? 'Assuming...' : 'Assume Ownership'}
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
                  {selectedRequest.status.toLowerCase() === 'cancelled' && (() => {
                    // Check if request hasn't started yet
                    const now = new Date();
                    const requestedDate = new Date(selectedRequest.requested_date);
                    const year = requestedDate.getFullYear();
                    const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(requestedDate.getDate()).padStart(2, '0');
                    const requestedDateTime = new Date(`${year}-${month}-${day}T${selectedRequest.requested_time_start}`);
                    return requestedDateTime > now;
                  })() && (
                    <button
                      onClick={() => {
                        setShowUncancelModal(true);
                        setActionError(null);
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Restore Request
                    </button>
                  )}
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

                    {/* Time tracking toggle button - changes based on status */}
                    {selectedRequest.status === 'Started' ? (
                      <button
                        onClick={() => handleTimeTracking('stop')}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center"
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Pause Work
                      </button>
                    ) : selectedRequest.status === 'Paused' ? (
                      <button
                        onClick={() => handleTimeTracking('start')}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        Resume Work
                      </button>
                    ) : (
                      <button
                        onClick={() => handleTimeTracking('start')}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        Start Work
                      </button>
                    )}

                    {canCompleteRequest(selectedRequest) && (
                      <button
                        onClick={() => {
                          setShowCloseModal(true);
                          setActionError(null);
                          // Fetch time breakdown and auto-populate duration
                          if (selectedRequest?.id) {
                            fetchTimeBreakdown(selectedRequest.id);
                          }
                        }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete Request
                      </button>
                    )}
                  </div>
                )}

                {/* Row 3: Close */}
                <div className="flex justify-end">
                  <button
                    onClick={handleCloseDetailModal}
                    disabled={actionLoading}
                    className={`px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80 disabled:opacity-50`}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {showCloseConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Unsaved Changes
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-6`}>
              You have unsaved changes. Are you sure you want to close this service request? All unsaved changes will be lost.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={confirmCloseDetailModal}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowCloseConfirmation(false)}
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80`}
              >
                Cancel
              </button>
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
          <div className={`${themeClasses.bg.card} rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
            <div className="p-6 overflow-y-auto flex-1">
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
              {selectedRequest.total_work_duration_minutes > 0 && (
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  Tracked time: {formatDuration(selectedRequest.total_work_duration_minutes)}
                </p>
              )}
              {timeBreakdown && (
                <div className={`mt-3 p-3 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border}`}>
                  {/* Show waived time for first-time clients */}
                  {timeBreakdown.isFirstServiceRequest && parseFloat(timeBreakdown.waivedHours) > 0 && (
                    <div className={`mb-3 pb-3 border-b ${themeClasses.border}`}>
                      <p className={`text-xs ${themeClasses.text.secondary} mb-1`}>
                        First Service Request Discount:
                      </p>
                      <p className={`text-sm font-medium text-green-600 dark:text-green-400`}>
                        New Client Assessment - Waived: {timeBreakdown.waivedHours} hours
                      </p>
                    </div>
                  )}

                  {/* Billable hours breakdown */}
                  <p className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                    Billable Hours:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className={`${themeClasses.text.secondary} mb-1`}>Standard</div>
                      <div className={`font-bold ${themeClasses.text.primary}`}>
                        {timeBreakdown.standardBillableHours.toFixed(2)} hrs
                      </div>
                      <div className={`text-xs ${themeClasses.text.muted}`}>1.0x rate</div>
                    </div>
                    <div className="text-center">
                      <div className={`${themeClasses.text.secondary} mb-1`}>Premium</div>
                      <div className={`font-bold ${themeClasses.text.primary}`}>
                        {timeBreakdown.premiumBillableHours.toFixed(2)} hrs
                      </div>
                      <div className={`text-xs ${themeClasses.text.muted}`}>1.5x rate</div>
                    </div>
                    <div className="text-center">
                      <div className={`${themeClasses.text.secondary} mb-1`}>Emergency</div>
                      <div className={`font-bold ${themeClasses.text.primary}`}>
                        {timeBreakdown.emergencyBillableHours.toFixed(2)} hrs
                      </div>
                      <div className={`text-xs ${themeClasses.text.muted}`}>2.0x rate</div>
                    </div>
                  </div>
                  <div className={`mt-2 pt-2 border-t ${themeClasses.border} text-center`}>
                    <span className={`text-xs ${themeClasses.text.secondary}`}>Total Billable: </span>
                    <span className={`text-sm font-bold ${themeClasses.text.primary}`}>
                      {timeBreakdown.totalBillableHours.toFixed(2)} hours
                    </span>
                  </div>
                </div>
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
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80 disabled:opacity-50`}
              >
                Cancel
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Uncancel Modal */}
      {showUncancelModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-lg w-full p-6`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Restore Service Request
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
              Are you sure you want to restore service request <span className="font-mono">{selectedRequest.request_number}</span>?
              This will change the status back to "Submitted".
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {actionError}
              </div>
            )}

            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Reason for restoring (optional)
              </label>
              <textarea
                value={uncancelReason}
                onChange={(e) => setUncancelReason(e.target.value)}
                placeholder="Provide a reason for restoring this request..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleUncancelRequest}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? 'Restoring...' : 'Restore Request'}
              </button>
              <button
                onClick={() => {
                  setShowUncancelModal(false);
                  setUncancelReason('');
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

      {/* Invoice Viewer Modal */}
      {showInvoiceModal && selectedInvoiceId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
            {loadingInvoice ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading invoice...</p>
              </div>
            ) : invoiceData ? (
              <div className="p-8" id="invoice-content">
                {/* Header with Close Button */}
                <div className="flex justify-between items-start mb-6">
                  <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Invoice</h2>
                  <button
                    onClick={() => {
                      setShowInvoiceModal(false);
                      setSelectedInvoiceId(null);
                      setInvoiceData(null);
                    }}
                    className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                {/* Company Letterhead */}
                <div className="mb-8 pb-6 border-b-2 border-gray-300 dark:border-gray-600">
                  <h1 className={`text-3xl font-bold ${themeClasses.text.primary} mb-2`}>
                    {invoiceData.companyInfo.company_name}
                  </h1>
                  <div className={`text-sm ${themeClasses.text.secondary}`}>
                    <p>{invoiceData.companyInfo.company_address_line1}</p>
                    <p>{invoiceData.companyInfo.company_address_line2}</p>
                    <p>
                      {invoiceData.companyInfo.company_city}, {invoiceData.companyInfo.company_state}{' '}
                      {invoiceData.companyInfo.company_zip}
                    </p>
                    <p className="mt-2">Phone: {invoiceData.companyInfo.company_phone}</p>
                    <p>Email: {invoiceData.companyInfo.company_email}</p>
                  </div>
                </div>

                {/* Invoice Details & Client Info Side by Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Invoice Details */}
                  <div>
                    <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Invoice Details</h3>
                    <div className={`space-y-2 text-sm ${themeClasses.text.secondary}`}>
                      <div className="flex justify-between">
                        <span className="font-medium">Invoice Number:</span>
                        <span className="font-mono">{invoiceData.invoice.invoice_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Issue Date:</span>
                        <span>{formatDate(invoiceData.invoice.issue_date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Due Date:</span>
                        <span className="font-semibold">{formatDate(invoiceData.invoice.due_date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Payment Status:</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            invoiceData.invoice.payment_status === 'paid'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : invoiceData.invoice.payment_status === 'overdue'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}
                        >
                          {invoiceData.invoice.payment_status.toUpperCase()}
                        </span>
                      </div>
                      {invoiceData.invoice.payment_date && (
                        <div className="flex justify-between">
                          <span className="font-medium">Payment Date:</span>
                          <span>{formatDate(invoiceData.invoice.payment_date)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bill To */}
                  <div>
                    <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Bill To</h3>
                    <div className={`text-sm ${themeClasses.text.secondary}`}>
                      <p className="font-semibold text-base">{invoiceData.invoice.business_name}</p>
                      <p className="mt-2">{invoiceData.invoice.primary_contact_name}</p>
                      <p>{invoiceData.invoice.street_address}</p>
                      <p>
                        {invoiceData.invoice.city}, {invoiceData.invoice.state} {invoiceData.invoice.zip_code}
                      </p>
                      <p className="mt-2">{invoiceData.invoice.primary_contact_phone}</p>
                      <p>{invoiceData.invoice.primary_contact_email}</p>
                    </div>
                  </div>
                </div>

                {/* Service Request Details */}
                <div className={`mb-6 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
                  <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Service Request</h3>
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-sm ${themeClasses.text.secondary}`}>
                    <div>
                      <span className="font-medium">Request Number:</span>
                      <span className="ml-2 font-mono">{invoiceData.invoice.request_number}</span>
                    </div>
                    <div>
                      <span className="font-medium">Service:</span>
                      <span className="ml-2">{invoiceData.invoice.service_title}</span>
                    </div>
                    <div>
                      <span className="font-medium">Service Started:</span>
                      <span className="ml-2">{formatDate(invoiceData.invoice.service_created_at)}</span>
                    </div>
                    <div>
                      <span className="font-medium">Service Completed:</span>
                      <span className="ml-2">{formatDate(invoiceData.invoice.service_completed_at)}</span>
                    </div>
                  </div>
                  {invoiceData.invoice.work_description && (
                    <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                      <p className="font-medium text-sm mb-1">Work Description:</p>
                      <p className={`text-sm ${themeClasses.text.secondary} whitespace-pre-wrap`}>
                        {invoiceData.invoice.work_description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Billable Hours Breakdown */}
                <div className="mb-6">
                  <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Time & Cost Breakdown</h3>

                  {/* First-time Client Discount */}
                  {invoiceData.invoice.is_first_service_request && invoiceData.invoice.waived_hours > 0 && (
                    <div className={`mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg`}>
                      <div className="flex justify-between items-center">
                        <span className={`font-medium ${themeClasses.text.primary}`}>
                          New Client Assessment - Waived
                        </span>
                        <span className={`font-semibold text-green-600 dark:text-green-400`}>
                          {invoiceData.invoice.waived_hours.toFixed(2)} hours
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Billable Hours Table */}
                  <div className={`overflow-hidden border ${themeClasses.border} rounded-lg`}>
                    <table className="w-full">
                      <thead className={`${themeClasses.bg.secondary}`}>
                        <tr>
                          <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>
                            Rate Tier
                          </th>
                          <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                            Hours
                          </th>
                          <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                            Rate
                          </th>
                          <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${themeClasses.border}`}>
                        {/* Standard Hours */}
                        {invoiceData.invoice.standard_hours > 0 && (
                          <tr>
                            <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                              Standard (1.0x)
                              <div className={`text-xs ${themeClasses.text.muted}`}>Mon-Fri 8am-5pm</div>
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              {invoiceData.invoice.standard_hours.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.standard_rate.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.standard_cost.toFixed(2)}
                            </td>
                          </tr>
                        )}

                        {/* Premium Hours */}
                        {invoiceData.invoice.premium_hours > 0 && (
                          <tr>
                            <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                              Premium (1.5x)
                              <div className={`text-xs ${themeClasses.text.muted}`}>Weekends</div>
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              {invoiceData.invoice.premium_hours.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.premium_rate.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.premium_cost.toFixed(2)}
                            </td>
                          </tr>
                        )}

                        {/* Emergency Hours */}
                        {invoiceData.invoice.emergency_hours > 0 && (
                          <tr>
                            <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                              Emergency (2.0x)
                              <div className={`text-xs ${themeClasses.text.muted}`}>Late night/overnight</div>
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              {invoiceData.invoice.emergency_hours.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.emergency_rate.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                              ${invoiceData.invoice.emergency_cost.toFixed(2)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={`text-xs ${themeClasses.text.muted} mt-2 italic`}>
                    * Final end time rounded up to nearest 15 minutes. Exact hours billed per tier.
                  </div>
                </div>

                {/* Totals */}
                <div className="mb-6">
                  <div className={`max-w-sm ml-auto space-y-2 text-sm`}>
                    <div className="flex justify-between">
                      <span className={`${themeClasses.text.secondary}`}>Subtotal:</span>
                      <span className={`${themeClasses.text.primary} font-semibold`}>
                        ${invoiceData.invoice.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {invoiceData.invoice.tax_rate > 0 && (
                      <div className="flex justify-between">
                        <span className={`${themeClasses.text.secondary}`}>
                          Tax ({(invoiceData.invoice.tax_rate * 100).toFixed(2)}%):
                        </span>
                        <span className={`${themeClasses.text.primary} font-semibold`}>
                          ${invoiceData.invoice.tax_amount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className={`flex justify-between pt-2 border-t-2 border-gray-300 dark:border-gray-600`}>
                      <span className={`text-lg font-bold ${themeClasses.text.primary}`}>Total Due:</span>
                      <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                        ${invoiceData.invoice.total_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {invoiceData.invoice.notes && (
                  <div className={`mb-6 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
                    <h3 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Notes</h3>
                    <p className={`text-sm ${themeClasses.text.secondary} whitespace-pre-wrap`}>
                      {invoiceData.invoice.notes}
                    </p>
                  </div>
                )}

                {/* Payment Terms */}
                <div className={`text-xs ${themeClasses.text.muted} text-center`}>
                  <p>Payment due within 30 days of invoice date.</p>
                  <p className="mt-1">Thank you for your business!</p>
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex justify-end space-x-3">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Print / Save PDF
                  </button>
                  <button
                    onClick={() => {
                      setShowInvoiceModal(false);
                      setSelectedInvoiceId(null);
                      setInvoiceData(null);
                    }}
                    className={`px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80`}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceRequests;