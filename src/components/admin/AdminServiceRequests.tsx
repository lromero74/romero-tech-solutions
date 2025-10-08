import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  AlertCircle,
  FileText,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  Pause
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { usePermission } from '../../hooks/usePermission';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';
import { getUserTimezone, getUserTimeFormat, formatDateInUserTimezone, formatTimeOnly } from '../../utils/timezoneUtils';
import { websocketService } from '../../services/websocketService';
import { useFileUploadWithProgress } from '../../hooks/useFileUploadWithProgress';
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
  ServiceRequestFilesSection,
  FilterBar,
  AssignTechnicianModal,
  ChangeStatusModal,
  CompleteRequestModal,
  UncancelRequestModal,
  InvoiceViewerModal,
  CloseConfirmationModal,
  ServiceRequestDetailModal,
  ServiceRequestsTable,
  ServiceRequestsMobileView
} from './AdminServiceRequests_Modals';
import AdminRescheduleModal from './AdminServiceRequests_Modals/AdminRescheduleModal';

interface AdminServiceRequestsProps {
  serviceRequests?: ServiceRequest[];
  clients?: any[];
  services?: any[];
  employees?: any[];
  technicians?: Technician[];
  serviceRequestStatuses?: Status[];
  closureReasons?: ClosureReason[];
  loading?: boolean;
  error?: string | null;
  selectedServiceRequest?: ServiceRequest | null;
  onSelectServiceRequest?: (request: ServiceRequest | null) => void;
  onRefresh?: () => Promise<void>;
  refreshTechnicians?: (force?: boolean) => Promise<void>;
  refreshServiceRequestStatuses?: (force?: boolean) => Promise<void>;
  highlightUnacknowledged?: boolean;
}

const AdminServiceRequests: React.FC<AdminServiceRequestsProps> = ({
  serviceRequests: propsServiceRequests = [],
  technicians: propsTechnicians = [],
  serviceRequestStatuses: propsStatuses = [],
  closureReasons: propsClosureReasons = [],
  loading: propsLoading = false,
  refreshTechnicians,
  refreshServiceRequestStatuses,
  highlightUnacknowledged = false
}) => {
  const { isDark } = useTheme();
  const { user } = useEnhancedAuth();
  const { checkPermission } = usePermission();
  const canViewCosts = checkPermission('view.service_request_costs.enable');
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  // Use props or local state for backward compatibility
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>(propsServiceRequests);
  const [loading, setLoading] = useState(propsLoading);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Use cached data from props
  const technicians = propsTechnicians;
  const statuses = propsStatuses;
  const closureReasons = propsClosureReasons;
  const [filterPresets, setFilterPresets] = useState<Array<{id: string; name: string; description: string}>>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showUncancelModal, setShowUncancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
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
    baseRate: number;
    standardRate: number;
    premiumRate: number;
    emergencyRate: number;
    standardCost: number;
    premiumCost: number;
    emergencyCost: number;
    totalCost: number;
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
  const [newlyUploadedFileIds, setNewlyUploadedFileIds] = useState<string[]>([]);
  const [requestNotes, setRequestNotes] = useState<ServiceRequestNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [newlyReceivedNoteId, setNewlyReceivedNoteId] = useState<string | null>(null);
  const [lastSubmittedNoteId, setLastSubmittedNoteId] = useState<string | null>(null);
  const lastSubmittedNoteIdRef = useRef<string | null>(null);

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
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Presence tracking
  const [otherViewers, setOtherViewers] = useState<Array<{userId: string; userName: string; userType: string}>>([]);

  // Highlighting unacknowledged requests
  const [highlightedRequestIds, setHighlightedRequestIds] = useState<string[]>([]);

  // File upload with progress
  const {
    uploads: fileUploads,
    isUploading: isUploadingWithProgress,
    uploadFiles: uploadFilesWithProgress,
    clearUploads
  } = useFileUploadWithProgress({
    uploadUrl: selectedRequest
      ? `${API_BASE_URL}/admin/service-requests/${selectedRequest.id}/files/upload`
      : '',
    onSuccess: (uploadedFiles) => {
      if (selectedRequest) {
        // Track newly uploaded file IDs for blue halo effect
        const fileIds = uploadedFiles.map((f: any) => f.fileId).filter(Boolean);
        setNewlyUploadedFileIds(fileIds);

        // Refresh files list
        fetchRequestFiles(selectedRequest.id);
        // Refresh notes to show the upload note
        fetchRequestNotes(selectedRequest.id);
        // Update file count
        const newFileCount = (selectedRequest.file_count || 0) + uploadedFiles.length;
        setSelectedRequest({ ...selectedRequest, file_count: newFileCount });
        setServiceRequests(prev =>
          prev.map(req => req.id === selectedRequest.id ? { ...req, file_count: newFileCount } : req)
        );

        // Clear upload progress after a short delay
        setTimeout(() => {
          clearUploads();
        }, 1000);

        // Clear blue halos after 3 seconds
        setTimeout(() => {
          setNewlyUploadedFileIds([]);
        }, 3000);
      }
    },
    onError: (error) => {
      console.error('Error uploading files:', error);
      alert('Failed to upload files. Please try again.');
    },
    onComplete: () => {
      setUploadingFiles(false);
    },
    getHeaders: async () => {
      const token = RoleBasedStorage.getItem('sessionToken');
      if (!token) throw new Error('No token found');
      return {
        'Authorization': `Bearer ${token}`
      };
    }
  });

  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: '*Open',
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

  const [sortBy, setSortBy] = useState('requested_date');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

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
        ...(filters.technician !== 'all' && { technicianId: filters.technician }),
        ...(filters.search && { search: filters.search })
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

  // Sync service requests from props (always sync, even if empty)
  useEffect(() => {
    console.log('🔄 AdminServiceRequests: Props changed! Syncing service requests from props:', propsServiceRequests.length);
    console.log('🔄 AdminServiceRequests: First 3 request numbers:', propsServiceRequests.slice(0, 3).map(r => r.request_number));
    setServiceRequests(propsServiceRequests);
    setLoading(false);
  }, [propsServiceRequests]);

  // Handle highlighting of unacknowledged requests when navigating from notification bell
  useEffect(() => {
    if (!highlightUnacknowledged || serviceRequests.length === 0) return;

    // Find unacknowledged service requests
    const unackRequests = serviceRequests.filter(sr =>
      !sr.softDelete &&
      (sr.status?.toLowerCase() === 'pending' || sr.status?.toLowerCase() === 'submitted') &&
      !sr.acknowledgedByEmployeeId
    );

    const unackIds = unackRequests.map(sr => sr.id);

    if (unackIds.length === 0) return;

    console.log('🔔 Highlighting unacknowledged requests:', unackIds.length);
    setHighlightedRequestIds(unackIds);

    // Clear highlighting after 3 seconds
    const highlightTimer = setTimeout(() => {
      console.log('🔔 Clearing highlight animation');
      setHighlightedRequestIds([]);
    }, 3000);

    // Acknowledge requests after 5 seconds to remove badge
    const acknowledgeTimer = setTimeout(async () => {
      console.log('🔔 Auto-acknowledging requests to remove badge');
      try {
        await Promise.all(
          unackIds.map(async (requestId) => {
            await apiService.put(`/admin/service-requests/${requestId}/acknowledge`);
          })
        );
        console.log('✅ Successfully acknowledged requests, badge should disappear');
      } catch (error) {
        console.error('❌ Failed to auto-acknowledge requests:', error);
      }
    }, 5000);

    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(acknowledgeTimer);
    };
  }, [highlightUnacknowledged, serviceRequests, user]);

  // Fetch filter presets on mount (not cached yet)
  useEffect(() => {
    fetchFilterPresets();
    // Refresh cached data on mount if needed
    if (refreshTechnicians) refreshTechnicians();
    if (refreshServiceRequestStatuses) refreshServiceRequestStatuses();

    // Load employee timezone preference from API if not in authUser
    const loadTimezonePreference = async () => {
      try {
        const authUserStr = RoleBasedStorage.getItem('authUser');
        if (authUserStr) {
          const authUser = JSON.parse(authUserStr);
          if (!authUser.timezonePreference) {
            console.log('🌍 Timezone not in authUser, fetching from employee profile API...');
            const profileResult = await apiService.get('/employees/profile');
            if (profileResult.success && profileResult.data.timezonePreference) {
              authUser.timezonePreference = profileResult.data.timezonePreference;
              RoleBasedStorage.setItem('authUser', JSON.stringify(authUser));
              console.log('✅ Loaded and saved employee timezone preference:', profileResult.data.timezonePreference);
            } else {
              console.log('ℹ️ Employee has no timezone preference set, will use browser timezone');
            }
          } else {
            console.log('✅ Employee timezone preference already loaded:', authUser.timezonePreference);
          }
        }
      } catch (error) {
        console.error('Failed to load employee timezone preference:', error);
      }
    };

    loadTimezonePreference();
  }, []);

  // Listen for websocket note updates and file uploads
  useEffect(() => {
    const handleEntityChange = (change: any) => {
      // If a service request was updated with a note added, and it's the currently selected request
      if (change.entityType === 'serviceRequest' && change.noteAdded && selectedRequest && change.entityId === selectedRequest.id) {
        console.log('📝 Note added to current service request, inserting new note...');
        // Instead of reloading all notes, directly insert the new note at the top
        if (change.note) {
          console.log('🔍 Admin Debug - Websocket received note.id:', change.note.id);
          console.log('🔍 Admin Debug - lastSubmittedNoteIdRef.current:', lastSubmittedNoteIdRef.current);

          // Check if note already exists in the array
          setRequestNotes(prev => {
            const noteExists = prev.some(n => n.id === change.note.id);
            if (noteExists) {
              console.log('📝 Skipping duplicate note - already exists in array');
              return prev;
            }

            // Skip if this is the note we just submitted (already added optimistically)
            if (change.note.id === lastSubmittedNoteIdRef.current) {
              console.log('📝 Skipping duplicate note (we just submitted this one)');
              lastSubmittedNoteIdRef.current = null; // Clear the flag
              setLastSubmittedNoteId(null); // Clear state too
              return prev;
            }

            console.log('🔍 Admin Debug - Adding note from websocket to array of length:', prev.length);
            // Trigger blue halo effect for the newly received note
            setNewlyReceivedNoteId(change.note.id);
            return [change.note, ...prev];
          });
        }
      }

      // If files were uploaded to the currently selected request, refresh the files list
      if (change.entityType === 'serviceRequest' && change.filesUploaded && selectedRequest && change.entityId === selectedRequest.id) {
        console.log(`📎 Files uploaded to current service request (${change.fileCount} files)...`);
        // Track the newly uploaded file IDs for blue halo effect
        if (change.uploadedFiles && Array.isArray(change.uploadedFiles)) {
          const fileIds = change.uploadedFiles.map((f: any) => f.fileId);
          setNewlyUploadedFileIds(fileIds);
          // Auto-remove highlight after 3 seconds
          setTimeout(() => {
            setNewlyUploadedFileIds([]);
          }, 3000);
        }
        fetchRequestFiles(selectedRequest.id);
      }

      // If a file was deleted from the currently selected request, remove it smoothly from the list
      if (change.entityType === 'serviceRequest' && change.fileDeleted && selectedRequest && change.entityId === selectedRequest.id) {
        console.log(`🗑️  File "${change.fileName}" deleted from current service request`);
        // Remove the file from the list (smooth in-place update)
        if (change.fileId) {
          setRequestFiles(prev => prev.filter(f => f.id !== change.fileId));
          // Update file count
          if (selectedRequest.file_count && selectedRequest.file_count > 0) {
            const newFileCount = selectedRequest.file_count - 1;
            setSelectedRequest({ ...selectedRequest, file_count: newFileCount });
            setServiceRequests(prev =>
              prev.map(req => req.id === selectedRequest.id ? { ...req, file_count: newFileCount } : req)
            );
          }
        }
      }

      // If a service request status changed (e.g., completed/closed), refresh the list
      if (change.entityType === 'serviceRequest' && change.statusChanged) {
        console.log(`🔄 Service request ${change.entityId} status changed to ${change.newStatus}, refreshing list...`);
        // Refresh the service requests list to reflect status change
        fetchServiceRequests();

        // If this was the selected request and it was closed, close the detail modal
        if (selectedRequest && change.entityId === selectedRequest.id && change.closed) {
          console.log(`✅ Service request ${change.entityId} was completed, closing detail modal...`);
          setSelectedRequest(null);
          setShowCloseModal(false);
        }
      }
    };

    const unsubscribe = websocketService.onEntityDataChange(handleEntityChange);

    return () => {
      // Cleanup: unsubscribe when component unmounts or selectedRequest changes
      unsubscribe();
    };
  }, [selectedRequest]); // Removed lastSubmittedNoteId from dependencies since we use ref

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

  // Fetch filter presets
  const fetchFilterPresets = async () => {
    try {
      const response = await apiService.get('/admin/service-requests/filter-presets');
      if (response.success && response.data) {
        setFilterPresets(response.data);
      }
    } catch (err) {
      console.error('Error fetching filter presets:', err);
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
          totalBillableHours: response.data.totalBillableHours,
          baseRate: response.data.baseRate,
          standardRate: response.data.standardRate,
          premiumRate: response.data.premiumRate,
          emergencyRate: response.data.emergencyRate,
          standardCost: response.data.standardCost,
          premiumCost: response.data.premiumCost,
          emergencyCost: response.data.emergencyCost,
          totalCost: response.data.totalCost
        });

        // Auto-populate actual duration field with total tracked minutes (before waivers)
        if (response.data.totalMinutes !== undefined && response.data.totalMinutes !== null) {
          setActualDurationMinutes(response.data.totalMinutes.toString());
        } else {
          console.warn('⚠️ totalMinutes is undefined or null');
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

  // Handle reschedule
  const handleReschedule = async (requestId: string, newDateTime: Date, durationMinutes: number) => {
    try {
      setActionLoading(true);
      setActionError(null);

      const response = await apiService.patch(`/admin/service-requests/${requestId}/reschedule`, {
        requestedDatetime: newDateTime.toISOString(),
        requestedDurationMinutes: durationMinutes
      });

      if (response.success) {
        // Refresh service requests list
        await fetchServiceRequests();
        setShowRescheduleModal(false);
        setSelectedRequest(null);
      } else {
        throw new Error(response.message || 'Failed to reschedule');
      }
    } catch (err) {
      console.error('Error rescheduling service request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to reschedule service request');
      throw err;
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
    if (action === 'start' && (selectedRequest.scheduled_datetime || (selectedRequest.scheduled_date && selectedRequest.scheduled_time_start))) {
      const now = new Date();
      const scheduledDateTime = selectedRequest.scheduled_datetime
        ? new Date(selectedRequest.scheduled_datetime)
        : new Date(`${selectedRequest.scheduled_date.includes('T') ? selectedRequest.scheduled_date.split('T')[0] : selectedRequest.scheduled_date}T${selectedRequest.scheduled_time_start}Z`);
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
        const files = response.data.files;
        setRequestFiles(files);

        // Update file count in selectedRequest and serviceRequests array
        const actualFileCount = files.length;
        if (selectedRequest && selectedRequest.id === requestId) {
          setSelectedRequest({ ...selectedRequest, file_count: actualFileCount });
        }
        setServiceRequests(prev =>
          prev.map(req => req.id === requestId ? { ...req, file_count: actualFileCount } : req)
        );
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
        console.log('🔍 Admin Debug - Submitted note ID:', response.data.note.id);
        console.log('🔍 Admin Debug - Full response.data.note:', JSON.stringify(response.data.note));
        // Track this note ID immediately in ref (synchronous) AND state
        lastSubmittedNoteIdRef.current = response.data.note.id;
        setLastSubmittedNoteId(response.data.note.id);
        console.log('🔍 Admin Debug - Set lastSubmittedNoteIdRef.current to:', lastSubmittedNoteIdRef.current);
        // Add the new note to the list (optimistic update) - but check for duplicates first
        console.log('🔍 Admin Debug - About to add note optimistically');
        setRequestNotes(prev => {
          // Check if note already exists (websocket may have added it already)
          const noteExists = prev.some(n => n.id === response.data.note.id);
          if (noteExists) {
            console.log('📝 Skipping optimistic update - note already exists in array (websocket was faster)');
            return prev;
          }
          console.log('🔍 Admin Debug - Adding note optimistically to prev array of length:', prev.length);
          return [response.data.note, ...prev];
        });
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

  const uploadFiles = async (files: FileList) => {
    if (!selectedRequest) return;
    setUploadingFiles(true);
    clearUploads(); // Clear previous uploads
    await uploadFilesWithProgress(files);
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

    // Always fetch files (don't rely on file_count as it may be stale)
    fetchRequestFiles(request.id);

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

  // Format date from ISO 8601 UTC string to user's local date
  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        console.error('formatDate: Invalid date for input:', isoString);
        return 'N/A';
      }
      // Use timezone utilities to format in employee's timezone preference
      const userTimezone = getUserTimezone();
      return date.toLocaleDateString('en-US', {
        timeZone: userTimezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
    } catch (error) {
      console.error('formatDate error:', error, 'input:', isoString);
      return 'N/A';
    }
  };

  // Format time from ISO 8601 UTC string to employee's timezone preference
  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        console.error('formatTime: Invalid datetime for:', isoString);
        return '';
      }
      // Use timezone utilities to format in employee's timezone and format preference
      return formatTimeOnly(date);
    } catch (error) {
      console.error('formatTime error:', error);
      return '';
    }
  };

  // Format full date and time from ISO 8601 UTC string to employee's timezone preference
  const formatDateTime = (isoString: string | null, options?: Intl.DateTimeFormatOptions) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        console.error('formatDateTime: Invalid datetime for:', isoString);
        return 'N/A';
      }
      // Use timezone utilities to format in employee's timezone preference
      return formatDateInUserTimezone(date, options);
    } catch (error) {
      console.error('formatDateTime error:', error);
      return 'N/A';
    }
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

  // Filter requests locally to match the filter state
  // When using cached data from props, we need to apply filters client-side
  const filteredRequests = React.useMemo(() => {
    console.log('🔍 FILTER: Starting filter computation...');
    console.log('🔍 FILTER: Input serviceRequests count:', serviceRequests.length);
    console.log('🔍 FILTER: Current filter state:', filters);

    let filtered = serviceRequests;

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      console.log('🔍 FILTER: Applying status filter:', filters.status);
      const beforeCount = filtered.length;

      if (filters.status === '*Open') {
        // Show only non-final statuses (not Completed, Cancelled, or Closed)
        filtered = filtered.filter(req => {
          const statusName = req.status || '';
          const statusLower = statusName.toLowerCase();
          return !['completed', 'cancelled', 'closed'].includes(statusLower);
        });
        console.log(`🔍 FILTER: *Open filter - ${beforeCount} → ${filtered.length}`);
      } else {
        // Filter by specific status
        filtered = filtered.filter(req => {
          const statusName = req.status || '';
          return statusName.toLowerCase() === filters.status.toLowerCase();
        });
        console.log(`🔍 FILTER: Specific status filter - ${beforeCount} → ${filtered.length}`);
      }
    }

    // Filter by search term
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(req => {
        const requestNumber = (req.request_number || '').toLowerCase();
        const title = (req.title || '').toLowerCase();
        const clientName = (req.client_name || req.business_name || '').toLowerCase();
        const businessName = (req.business_name || '').toLowerCase();
        return requestNumber.includes(searchLower) ||
               title.includes(searchLower) ||
               clientName.includes(searchLower) ||
               businessName.includes(searchLower);
      });
    }

    // Filter by urgency
    if (filters.urgency && filters.urgency !== 'all') {
      filtered = filtered.filter(req => {
        const urgency = req.urgency_name || '';
        return urgency.toLowerCase() === filters.urgency.toLowerCase();
      });
    }

    // Filter by priority
    if (filters.priority && filters.priority !== 'all') {
      filtered = filtered.filter(req => {
        const priority = req.priority_name || '';
        return priority.toLowerCase() === filters.priority.toLowerCase();
      });
    }

    // Filter by business/client
    if (filters.business && filters.business !== 'all') {
      filtered = filtered.filter(req => req.business_id === filters.business);
    }

    // Filter by technician
    if (filters.technician && filters.technician !== 'all') {
      filtered = filtered.filter(req => req.assigned_to_employee_id === filters.technician);
    }

    console.log('🔍 FILTER: Final filtered count:', filtered.length);
    console.log('🔍 FILTER: First 3 filtered request numbers:', filtered.slice(0, 3).map(r => r.request_number));

    return filtered;
  }, [serviceRequests, filters]);

  // Debug: Log when filteredRequests changes
  React.useEffect(() => {
    console.log('🔔 RENDER: filteredRequests array changed, count:', filteredRequests.length);
    console.log('🔔 RENDER: First 3 filtered request numbers:', filteredRequests.slice(0, 3).map(r => r.request_number));
  }, [filteredRequests]);

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

      {/* Filters (Hidden on mobile) */}
      <FilterBar
        filters={filters}
        statuses={statuses}
        technicians={technicians}
        filterPresets={filterPresets}
        uniqueClients={uniqueClients}
        onFiltersChange={setFilters}
      />

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
            {/* Desktop Table View */}
            <ServiceRequestsTable
              requests={filteredRequests}
              isDark={isDark}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onViewRequest={handleViewRequest}
              onViewInvoice={handleViewInvoice}
              formatDate={formatDate}
              formatTime={formatTime}
              getStatusIcon={getStatusIcon}
              highlightedRequestIds={highlightedRequestIds}
            />

            {/* Mobile Card View */}
            <ServiceRequestsMobileView
              requests={filteredRequests}
              isDark={isDark}
              onViewRequest={handleViewRequest}
              onViewInvoice={handleViewInvoice}
              formatDate={formatDate}
              formatTime={formatTime}
              formatFullAddress={formatFullAddress}
              getMapUrl={getMapUrl}
              formatPhone={formatPhone}
              getStatusIcon={getStatusIcon}
              highlightedRequestIds={highlightedRequestIds}
            />

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className={`px-4 md:px-6 py-4 border-t ${themeClasses.border.primary} flex flex-col md:flex-row items-center justify-between gap-3`}>
                <div className={`text-xs md:text-sm ${themeClasses.text.secondary} text-center md:text-left`}>
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} requests
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className={`px-4 py-2 text-sm rounded ${pagination.page === 1 ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className={`px-4 py-2 text-sm rounded ${pagination.page === pagination.totalPages ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <ServiceRequestDetailModal
          selectedRequest={selectedRequest}
          requestFiles={requestFiles}
          loadingFiles={loadingFiles}
          requestNotes={requestNotes}
          loadingNotes={loadingNotes}
          newNoteText={newNoteText}
          submittingNote={submittingNote}
          editingTitle={editingTitle}
          editingDescription={editingDescription}
          editedTitle={editedTitle}
          editedDescription={editedDescription}
          savingEdit={savingEdit}
          renamingFileId={renamingFileId}
          newFileName={newFileName}
          deletingFileId={deletingFileId}
          uploadingFiles={uploadingFiles}
          fileUploads={fileUploads}
          newlyUploadedFileIds={newlyUploadedFileIds}
          actionError={actionError}
          actionLoading={actionLoading}
          otherViewers={otherViewers}
          apiBaseUrl={API_BASE_URL}
          canViewCosts={canViewCosts}
          canCompleteRequest={canCompleteRequest(selectedRequest)}
          isDark={isDark}
          userTimeFormatPreference={(user?.timeFormatPreference as '12h' | '24h') || '12h'}
          newlyReceivedNoteId={newlyReceivedNoteId}
          onClose={handleCloseDetailModal}
          onNewNoteChange={setNewNoteText}
          onSubmitNote={submitNote}
          onStartEditTitle={startEditTitle}
          onStartEditDescription={startEditDescription}
          onCancelEditTitle={cancelEditTitle}
          onCancelEditDescription={cancelEditDescription}
          onEditedTitleChange={setEditedTitle}
          onEditedDescriptionChange={setEditedDescription}
          onSaveTitle={saveTitle}
          onSaveDescription={saveDescription}
          onStartRenameFile={startRenameFile}
          onCancelRenameFile={cancelRenameFile}
          onSaveFileName={saveFileName}
          onDeleteFile={deleteFile}
          onFileNameChange={setNewFileName}
          onUploadFiles={uploadFiles}
          onTimeTracking={handleTimeTracking}
          onShowCompleteModal={() => {
            setShowCloseModal(true);
            setActionError(null);
            if (selectedRequest?.id) {
              fetchTimeBreakdown(selectedRequest.id);
            }
          }}
          onShowStatusModal={() => {
            setShowStatusModal(true);
            setActionError(null);
          }}
          onAcknowledge={handleAcknowledge}
          onShowAssignModal={() => {
            setShowAssignModal(true);
            setActionError(null);
          }}
          onReschedule={() => setShowRescheduleModal(true)}
          formatFullAddress={formatFullAddress}
          getMapUrl={getMapUrl}
          formatPhone={formatPhone}
          formatDate={formatDate}
          formatTime={formatTime}
          formatDateTime={formatDateTime}
          getStatusIcon={getStatusIcon}
        />
      )}

      {/* Close Confirmation Modal */}
      <CloseConfirmationModal
        show={showCloseConfirmation}
        onConfirm={confirmCloseDetailModal}
        onCancel={() => setShowCloseConfirmation(false)}
      />

      {/* Assign Technician Modal */}
      <AssignTechnicianModal
        show={showAssignModal}
        selectedRequest={selectedRequest}
        technicians={technicians}
        selectedTechnicianId={selectedTechnicianId}
        actionLoading={actionLoading}
        actionError={actionError}
        onTechnicianIdChange={setSelectedTechnicianId}
        onAssign={handleAssignTechnician}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedTechnicianId('');
          setActionError(null);
        }}
      />

      {/* Change Status Modal */}
      <ChangeStatusModal
        show={showStatusModal}
        selectedRequest={selectedRequest}
        statuses={statuses}
        selectedStatusId={selectedStatusId}
        statusNotes={statusNotes}
        actionLoading={actionLoading}
        actionError={actionError}
        onStatusIdChange={setSelectedStatusId}
        onStatusNotesChange={setStatusNotes}
        onChangeStatus={handleChangeStatus}
        onClose={() => {
          setShowStatusModal(false);
          setSelectedStatusId('');
          setStatusNotes('');
          setActionError(null);
        }}
      />

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedRequest && (
        <AdminRescheduleModal
          serviceRequest={selectedRequest}
          onClose={() => {
            setShowRescheduleModal(false);
            setSelectedRequest(null);
          }}
          onReschedule={handleReschedule}
        />
      )}

      {/* Complete/Close Request Modal */}
      <CompleteRequestModal
        show={showCloseModal}
        selectedRequest={selectedRequest}
        closureReasons={closureReasons}
        selectedClosureReasonId={selectedClosureReasonId}
        resolutionSummary={resolutionSummary}
        actualDurationMinutes={actualDurationMinutes}
        equipmentUsed={equipmentUsed}
        timeBreakdown={timeBreakdown}
        actionLoading={actionLoading}
        actionError={actionError}
        onClosureReasonIdChange={setSelectedClosureReasonId}
        onResolutionSummaryChange={setResolutionSummary}
        onActualDurationChange={setActualDurationMinutes}
        onEquipmentUsedChange={setEquipmentUsed}
        onComplete={handleCloseRequest}
        onClose={() => {
          setShowCloseModal(false);
          setSelectedClosureReasonId('');
          setResolutionSummary('');
          setActualDurationMinutes('');
          setEquipmentUsed('');
          setActionError(null);
        }}
        formatDuration={formatDuration}
      />


      {/* Uncancel Modal */}
      <UncancelRequestModal
        show={showUncancelModal}
        selectedRequest={selectedRequest}
        uncancelReason={uncancelReason}
        actionLoading={actionLoading}
        actionError={actionError}
        onUncancelReasonChange={setUncancelReason}
        onUncancel={handleUncancelRequest}
        onClose={() => {
          setShowUncancelModal(false);
          setUncancelReason('');
          setActionError(null);
        }}
      />

      {/* Invoice Viewer Modal */}
      <InvoiceViewerModal
        show={showInvoiceModal}
        selectedInvoiceId={selectedInvoiceId}
        invoiceData={invoiceData}
        loadingInvoice={loadingInvoice}
        formatDate={formatDate}
        onClose={() => {
          setShowInvoiceModal(false);
          setSelectedInvoiceId(null);
          setInvoiceData(null);
        }}
      />

    </div>
  );
};

export default AdminServiceRequests;