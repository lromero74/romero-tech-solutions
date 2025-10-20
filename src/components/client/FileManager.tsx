import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import apiService from '../../services/apiService';
import {
  FileText,
  Image,
  Archive,
  File,
  Download,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  RefreshCw,
  Search,
  Folder,
  FolderOpen,
  FolderPlus,
  Edit,
  X,
  ChevronRight,
  ChevronDown,
  Shield,
  ShieldAlert,
  Clock,
  User,
  Link as LinkIcon,
  ArrowRight,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import FileUpload from './FileUpload';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface ClientFile {
  id: string;
  storedFilename: string;
  originalFilename: string;
  fileSizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  // Enhanced metadata
  folderId?: string;
  folderName?: string;
  folderColor?: string;
  serviceRequestId?: string;
  serviceRequestTitle?: string;
  virusScanStatus?: 'clean' | 'pending' | 'infected' | null;
  virusScanResult?: string | null;
  virusScanDate?: string | null;
  uploader?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  } | null;
}

interface ClientFolder {
  id: string;
  businessId: string;
  parentFolderId: string | null;
  folderName: string;
  folderDescription: string | null;
  folderColor: string;
  sortOrder: number;
  isSystemFolder: boolean;
  fileCount: number;
}

interface QuotaInfo {
  softLimitBytes: number;
  hardLimitBytes: number;
  currentUsageBytes: number;
  availableBytes: number;
  usagePercentage: number;
  warningLevel: string;
}

interface UsageStats {
  totalFiles: number;
  totalBytes: number;
  averageFileSize: number;
  largestFile: number;
  totalFormatted: string;
}

interface FileManagerProps {
  onNavigateToServiceRequest?: (serviceRequestId: string) => void;
}

const FileManager: React.FC<FileManagerProps> = ({ onNavigateToServiceRequest }) => {
  const { isDarkMode } = useClientTheme();
  const { isAuthenticated, isLoading } = useEnhancedAuth();
  const { t } = useClientLanguage();
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [folders, setFolders] = useState<ClientFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [showMoveToFolder, setShowMoveToFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileCache, setFileCache] = useState<Map<string, { files: ClientFile[], totalPages: number, timestamp: number }>>(new Map());
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);

  const filesPerPage = 20;
  const CACHE_DURATION = 30000; // 30 seconds

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return <FileText className="h-5 w-5 text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return <Archive className="h-5 w-5 text-yellow-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get virus scan status icon
  const getVirusScanIcon = (status: string | null | undefined) => {
    if (!status || status === 'pending') {
      return <Clock className="h-4 w-4 text-yellow-500" title={t('client.scanPending')} />;
    }
    if (status === 'clean') {
      return <Shield className="h-4 w-4 text-green-500" title={t('client.scanClean')} />;
    }
    if (status === 'infected') {
      return <ShieldAlert className="h-4 w-4 text-red-500" title="Infected" />;
    }
    return null;
  };

  // Load folders
  const loadFolders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/client/folders`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setFolders(data.data);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  // Get cache key for current view
  const getCacheKey = () => {
    return `${selectedFolder || 'null'}_${currentPage}_${searchTerm}`;
  };

  // Check if cache is fresh
  const isCacheFresh = (timestamp: number) => {
    return Date.now() - timestamp < CACHE_DURATION;
  };

  // Load files and quota information with caching
  const loadData = async (forceRefresh = false) => {
    const cacheKey = getCacheKey();
    const cached = fileCache.get(cacheKey);

    // Use cached data if available and fresh, unless force refresh
    if (!forceRefresh && cached && isCacheFresh(cached.timestamp)) {
      setFiles(cached.files);
      setTotalPages(cached.totalPages);
      // Don't set loading state - instant switch
      return;
    }

    // If we have stale cache, use it immediately but fetch in background
    const hasStaleCache = cached && !isCacheFresh(cached.timestamp);
    if (hasStaleCache) {
      setFiles(cached.files);
      setTotalPages(cached.totalPages);
      setIsBackgroundLoading(true);
    } else {
      // No cache at all - show loading spinner
      setLoading(true);
    }

    try {
      // Build file query params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: filesPerPage.toString(),
        search: searchTerm
      });

      // Always include folderId to filter properly
      params.append('folderId', selectedFolder || 'null');

      // Load files and quota in parallel
      const [filesResponse, quotaResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/client/files?${params.toString()}`, {
          method: 'GET',
          credentials: 'include'
        }),
        fetch(`${API_BASE_URL}/client/files/quota`, {
          method: 'GET',
          credentials: 'include'
        })
      ]);

      if (filesResponse.ok) {
        const filesData = await filesResponse.json();
        const newFiles = filesData.data.files;
        const newTotalPages = filesData.data.pagination.totalPages;

        setFiles(newFiles);
        setTotalPages(newTotalPages);

        // Update cache
        setFileCache(prev => {
          const updated = new Map(prev);
          updated.set(cacheKey, {
            files: newFiles,
            totalPages: newTotalPages,
            timestamp: Date.now()
          });
          return updated;
        });
      }

      if (quotaResponse.ok) {
        const quotaData = await quotaResponse.json();
        setQuotaInfo(quotaData.data.quota);
        setUsageStats(quotaData.data.usage);
      }
    } catch (error) {
      console.error('Failed to load file data:', error);
    } finally {
      setLoading(false);
      setIsBackgroundLoading(false);
    }
  };

  // Invalidate cache (e.g., after upload, delete, move)
  const invalidateCache = () => {
    setFileCache(new Map());
  };

  // Delete file
  const deleteFile = async (fileId: string) => {
    if (!confirm(t('files.actions.confirmDelete'))) return;

    try {
      await apiService.delete(`/client/files/${fileId}`);
      // If we get here, the delete was successful (apiService throws on error)
      invalidateCache();
      loadData(true); // Force refresh
    } catch (error) {
      console.error('Delete error:', error);
      alert(t('files.actions.deleteFailed'));
    }
  };

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setCurrentPage(1);
  };

  // Create folder
  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const result = await apiService.post('/client/folders', {
        folderName: newFolderName.trim(),
        folderDescription: newFolderDescription.trim() || null,
        folderColor: newFolderColor,
        parentFolderId: selectedFolder
      });

      if (result.success) {
        setNewFolderName('');
        setNewFolderDescription('');
        setNewFolderColor('#3B82F6');
        setShowCreateFolder(false);
        invalidateCache();
        await loadFolders();
      } else {
        alert(result.message || 'Failed to create folder');
      }
    } catch (error) {
      console.error('Create folder error:', error);
      alert('Failed to create folder');
    }
  };

  // Delete folder
  const deleteFolder = async (folderId: string) => {
    if (!confirm(t('client.deleteFolder') + '?')) return;

    try {
      await apiService.delete(`/client/folders/${folderId}`);
      // If we get here, the delete was successful (apiService throws on error)
      if (selectedFolder === folderId) {
        setSelectedFolder(null);
      }
      invalidateCache();
      await loadFolders();
    } catch (error) {
      console.error('Delete folder error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete folder';
      alert(errorMessage);
    }
  };

  // Move files to folder
  const moveFilesToFolder = async (targetFolderId: string | null) => {
    if (selectedFiles.size === 0) return;

    try {
      const result = await apiService.post('/client/folders/move-files', {
        fileIds: Array.from(selectedFiles),
        folderId: targetFolderId
      });

      if (result.success) {
        setSelectedFiles(new Set());
        setShowMoveToFolder(false);
        invalidateCache();
        await loadData(true);
      } else {
        alert(result.message || 'Failed to move files');
      }
    } catch (error) {
      console.error('Move files error:', error);
      alert('Failed to move files');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFile(fileId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    if (!draggedFile) return;

    try {
      const result = await apiService.post('/client/folders/move-files', {
        fileIds: [draggedFile],
        folderId: targetFolderId
      });

      if (result.success) {
        invalidateCache();
        await loadData(true);
      }
    } catch (error) {
      console.error('Drop error:', error);
    } finally {
      setDraggedFile(null);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  // Toggle folder expansion
  const toggleFolderExpansion = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // Calculate total file count including all children recursively
  const calculateTotalFileCount = (folder: ClientFolder & { children?: ClientFolder[] }): number => {
    let total = folder.fileCount;
    if (folder.children) {
      folder.children.forEach(child => {
        total += calculateTotalFileCount(child);
      });
    }
    return total;
  };

  // Check if a folder is the "Service Requests" parent folder
  const isServiceRequestsParent = (folderId: string | null): boolean => {
    if (!folderId) return false;
    const folder = folders.find(f => f.id === folderId);
    return folder?.folderName === 'Service Requests' && folder?.parentFolderId === null;
  };

  // Check if a folder is anywhere in the Service Requests tree (parent or child)
  const isInServiceRequestsTree = (folderId: string | null): boolean => {
    if (!folderId) return false;
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return false;

    // Check if this is the Service Requests parent folder
    if (folder.folderName === 'Service Requests' && folder.parentFolderId === null) {
      return true;
    }

    // Check if parent is Service Requests
    if (folder.parentFolderId) {
      const parent = folders.find(f => f.id === folder.parentFolderId);
      if (parent?.folderName === 'Service Requests' && parent?.parentFolderId === null) {
        return true;
      }
    }

    return false;
  };

  // Organize folders into tree structure
  const organizeFoldersIntoTree = () => {
    const rootFolders: ClientFolder[] = [];
    const folderMap = new Map<string, ClientFolder & { children: ClientFolder[] }>();

    // Create a map of all folders with children arrays
    folders.forEach(folder => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Organize into tree structure
    folders.forEach(folder => {
      if (folder.parentFolderId === null) {
        rootFolders.push(folderMap.get(folder.id)!);
      } else {
        const parent = folderMap.get(folder.parentFolderId);
        if (parent) {
          parent.children.push(folderMap.get(folder.id)!);
        }
      }
    });

    return rootFolders;
  };

  // Render folder tree recursively
  const renderFolderTree = (folder: ClientFolder & { children?: ClientFolder[] }, level: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const paddingLeft = `${level * 1.5}rem`;
    const totalFileCount = calculateTotalFileCount(folder);

    return (
      <React.Fragment key={folder.id}>
        <div
          className={`flex items-center justify-between p-2 mb-1 rounded cursor-pointer ${
            selectedFolder === folder.id
              ? 'bg-blue-100 dark:bg-blue-900'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, folder.id)}
          style={{ paddingLeft }}
        >
          <div
            onClick={() => setSelectedFolder(folder.id)}
            className="flex items-center flex-1"
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderExpansion(folder.id);
                }}
                className="mr-1"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </button>
            )}
            {!hasChildren && <span className="w-5" />}
            <Folder className="h-4 w-4 mr-2" style={{ color: folder.folderColor }} />
            <span className={`text-sm ${themeClasses.text}`}>{folder.folderName}</span>
            <span className={`ml-2 text-xs ${themeClasses.textSecondary}`}>({totalFileCount})</span>
          </div>
          {!folder.isSystemFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(folder.id);
              }}
              className="text-red-600 hover:text-red-700 ml-2"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {hasChildren && isExpanded && folder.children!.map(child => renderFolderTree(child, level + 1))}
      </React.Fragment>
    );
  };

  // Load folders once on mount
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      loadFolders();
    }
  }, [isAuthenticated, isLoading]);

  // Load files when folder/page/search changes
  useEffect(() => {
    if (isAuthenticated && !isLoading && !showUpload) {
      loadData();
    }
  }, [currentPage, searchTerm, selectedFolder]);

  const themeClasses = {
    container: isDarkMode
      ? 'bg-gray-800 border-gray-700'
      : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    input: isDarkMode
      ? 'bg-gray-700 border-gray-600 text-white'
      : 'bg-white border-gray-300 text-gray-900',
    button: isDarkMode
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white',
    tableRow: isDarkMode
      ? 'border-gray-700 hover:bg-gray-750'
      : 'border-gray-200 hover:bg-gray-50'
  };

  if (loading) {
    return (
      <div className={`rounded-lg border p-6 ${themeClasses.container} ${themeClasses.text}`}>
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p>{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      {showUpload ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-semibold ${themeClasses.text}`}>{t('files.upload.title')}</h2>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Eye className="h-5 w-5" />
            </button>
          </div>
          <FileUpload
            onUploadComplete={() => {
              invalidateCache();
              loadData(true);
              setShowUpload(false);
            }}
            onQuotaUpdate={setQuotaInfo}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Folder Sidebar */}
          <div className={`rounded-lg border p-4 ${themeClasses.container} lg:col-span-1`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text}`}>{t('client.folders')}</h3>
              {!isInServiceRequestsTree(selectedFolder) && (
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="text-blue-600 hover:text-blue-700"
                  title={t('client.createFolder')}
                >
                  <FolderPlus className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* All Files / Root */}
            <div
              onClick={() => setSelectedFolder(null)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, null)}
              className={`flex items-center p-2 mb-2 rounded cursor-pointer ${
                selectedFolder === null
                  ? 'bg-blue-100 dark:bg-blue-900'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Folder className="h-4 w-4 mr-2 text-gray-600" />
              <span className={`text-sm ${themeClasses.text}`}>{t('client.unorganizedFiles')}</span>
            </div>

            {/* Folder Tree */}
            {organizeFoldersIntoTree().map((folder) => renderFolderTree(folder))}
          </div>

          {/* Main Content Area */}
          <div className={`rounded-lg border p-6 ${themeClasses.container} lg:col-span-3`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <div className="flex items-center gap-2">
                <h2 className={`text-xl font-semibold ${themeClasses.text}`}>{t('files.title')}</h2>
                {isBackgroundLoading && (
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-500" title="Refreshing..." />
                )}
              </div>
              <div className="flex gap-2">
                {selectedFiles.size > 0 && (
                  <button
                    onClick={() => setShowMoveToFolder(true)}
                    className="flex items-center px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-700 text-white"
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {t('client.moveToFolder')}
                  </button>
                )}
                {!isServiceRequestsParent(selectedFolder) && (
                  <button
                    onClick={() => setShowUpload(true)}
                    className={`flex items-center px-4 py-2 rounded-md ${themeClasses.button}`}
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    {t('files.uploadFiles')}
                  </button>
                )}
              </div>
            </div>

            {/* Enhanced Storage Overview with Progress Bar */}
            {quotaInfo && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text}`}>
                    {t('files.storage.quotaUsed')}: {((quotaInfo.currentUsageBytes / 1024 / 1024)).toFixed(1)} MB / {((quotaInfo.hardLimitBytes / 1024 / 1024)).toFixed(1)} MB
                  </span>
                  <span className={`text-sm ${themeClasses.textSecondary}`}>
                    {usageStats?.totalFiles || 0} {t('client.fileCount')}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      quotaInfo.usagePercentage > 95
                        ? 'bg-red-600'
                        : quotaInfo.usagePercentage > 80
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(quotaInfo.usagePercentage, 100)}%` }}
                  >
                    <div className="h-full flex items-center justify-end pr-2">
                      {quotaInfo.usagePercentage > 10 && (
                        <span className="text-xs text-white font-medium">
                          {quotaInfo.usagePercentage.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {quotaInfo.usagePercentage > 80 && (
                  <div className="flex items-center mt-2 text-sm">
                    <AlertTriangle className="h-4 w-4 mr-1 text-yellow-600" />
                    <span className="text-yellow-600">
                      {quotaInfo.usagePercentage > 95
                        ? 'Storage almost full!'
                        : 'Approaching storage limit'}
                    </span>
                  </div>
                )}
              </div>
            )}

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('files.searchFiles')}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-md border ${themeClasses.input}`}
              />
            </div>
          </div>

          {/* Enhanced Files Display - Responsive */}
          {files.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className={`text-lg ${themeClasses.textSecondary}`}>
                {searchTerm ? t('files.noFilesSearch') : t('files.noFiles')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className={`border-b ${themeClasses.border}`}>
                      <th className="w-12 py-3 px-2"></th>
                      <th className={`text-left py-3 px-4 font-medium ${themeClasses.text} w-auto`}>{t('files.details.file')}</th>
                      <th className={`text-left py-3 px-2 font-medium ${themeClasses.text} w-24`}>{t('files.details.size')}</th>
                      <th className={`text-left py-3 px-2 font-medium ${themeClasses.text} w-32`}>{t('client.uploadedBy')}</th>
                      <th className={`text-left py-3 px-2 font-medium ${themeClasses.text} w-12 text-center`}>{t('client.virusScanStatus')}</th>
                      <th className={`text-left py-3 px-2 font-medium ${themeClasses.text} w-40`}>{t('files.details.uploaded')}</th>
                      <th className={`text-left py-3 px-2 font-medium ${themeClasses.text} w-24`}>{t('files.details.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {
                  files.map((file) => (
                    <tr
                      key={file.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, file.id)}
                      className={`border-b ${themeClasses.tableRow} ${
                        selectedFiles.has(file.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="py-3 px-2">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          {getFileIcon(file.mimeType)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`font-medium ${themeClasses.text} truncate`}>
                                {file.originalFilename}
                              </p>
                              {file.folderName && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                  style={{
                                    backgroundColor: `${file.folderColor}20`,
                                    color: file.folderColor
                                  }}
                                >
                                  <Folder className="h-3 w-3 mr-1" />
                                  {file.folderName}
                                </span>
                              )}
                            </div>
                            {file.description && (
                              <p className={`text-sm ${themeClasses.textSecondary} truncate`}>
                                {file.description}
                              </p>
                            )}
                            {file.serviceRequestId && file.serviceRequestTitle && (
                              <button
                                onClick={() => onNavigateToServiceRequest?.(file.serviceRequestId!)}
                                className="flex items-center mt-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                title={t('files.viewServiceRequest', 'View service request')}
                              >
                                <LinkIcon className="h-3 w-3 mr-1" />
                                <span className="underline">{file.serviceRequestTitle}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`py-3 px-2 ${themeClasses.textSecondary} whitespace-nowrap`}>
                        {file.sizeFormatted}
                      </td>
                      <td className={`py-3 px-2 ${themeClasses.textSecondary}`}>
                        {file.uploader ? (
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span className="text-sm">{file.uploader.fullName}</span>
                          </div>
                        ) : (
                          <span className="text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {getVirusScanIcon(file.virusScanStatus)}
                      </td>
                      <td className={`py-3 px-2 ${themeClasses.textSecondary} whitespace-nowrap`}>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">{formatDate(file.createdAt)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => window.open(`/uploads/clients/${file.storedFilename}`, '_blank')}
                            className="text-blue-600 hover:text-blue-700"
                            title={t('files.actions.viewDownload')}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
                            className="text-red-600 hover:text-red-700"
                            title={t('files.actions.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  }
                  </tbody>
                </table>
              </div>

              {/* Mobile/Tablet Card View */}
              <div className="lg:hidden space-y-4">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={`border rounded-lg p-4 ${themeClasses.border} ${
                      selectedFiles.has(file.id) ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' : ''
                    }`}
                  >
                    {/* File Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                          className="rounded mt-1"
                        />
                        {getFileIcon(file.mimeType)}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${themeClasses.text} break-words`}>
                            {file.originalFilename}
                          </p>
                          {file.folderName && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1"
                              style={{
                                backgroundColor: `${file.folderColor}20`,
                                color: file.folderColor
                              }}
                            >
                              <Folder className="h-3 w-3 mr-1" />
                              {file.folderName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* File Details */}
                    <div className={`space-y-2 text-sm ${themeClasses.textSecondary}`}>
                      {file.description && (
                        <p className="break-words">{file.description}</p>
                      )}

                      {file.serviceRequestId && file.serviceRequestTitle && (
                        <button
                          onClick={() => onNavigateToServiceRequest?.(file.serviceRequestId!)}
                          className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer text-left"
                          title={t('files.viewServiceRequest', 'View service request')}
                        >
                          <LinkIcon className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="break-words underline">{file.serviceRequestTitle}</span>
                        </button>
                      )}

                      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                        <span>{file.sizeFormatted}</span>
                        {getVirusScanIcon(file.virusScanStatus)}
                      </div>

                      {file.uploader && (
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1" />
                          <span>{file.uploader.fullName}</span>
                        </div>
                      )}

                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span>{formatDate(file.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-4 mt-4 pt-3 border-t dark:border-gray-700">
                      <button
                        onClick={() => window.open(`/uploads/clients/${file.storedFilename}`, '_blank')}
                        className="flex items-center text-blue-600 hover:text-blue-700"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        <span className="text-sm">{t('files.actions.viewDownload')}</span>
                      </button>
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="flex items-center text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        <span className="text-sm">{t('files.actions.delete')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                {t('general.pageOf', { current: currentPage, total: totalPages })}
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('general.previous')}
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('general.next')}
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border p-6 max-w-md w-full ${themeClasses.container}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text}`}>{t('client.createFolder')}</h3>
              <button
                onClick={() => setShowCreateFolder(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.text}`}>
                  {t('client.folderName')}
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-md border ${themeClasses.input}`}
                  placeholder="My Documents"
                  autoFocus
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.text}`}>
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  className={`w-full px-3 py-2 rounded-md border ${themeClasses.input}`}
                  placeholder="Important documents"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.text}`}>
                  Color
                </label>
                <div className="flex gap-2">
                  {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        newFolderColor === color ? 'border-gray-900 dark:border-white' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setShowCreateFolder(false)}
                  className="px-4 py-2 border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={createFolder}
                  disabled={!newFolderName.trim()}
                  className={`px-4 py-2 rounded-md ${themeClasses.button} disabled:opacity-50`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
      {showMoveToFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg border p-6 max-w-md w-full ${themeClasses.container}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
                {t('client.moveToFolder')} ({selectedFiles.size} files)
              </h3>
              <button
                onClick={() => setShowMoveToFolder(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Root / Unorganized */}
              <button
                onClick={() => moveFilesToFolder(null)}
                className="w-full flex items-center p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <Folder className="h-5 w-5 mr-2 text-gray-600" />
                <span className={themeClasses.text}>{t('client.unorganizedFiles')}</span>
              </button>

              {/* Folders Tree */}
              {(() => {
                const renderFolderOption = (folder: ClientFolder & { children?: ClientFolder[] }, level: number = 0) => {
                  const totalFileCount = calculateTotalFileCount(folder);
                  return (
                    <React.Fragment key={folder.id}>
                      <button
                        onClick={() => moveFilesToFolder(folder.id)}
                        className="w-full flex items-center p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                        style={{ paddingLeft: `${0.75 + level * 1.5}rem` }}
                      >
                        <Folder className="h-5 w-5 mr-2" style={{ color: folder.folderColor }} />
                        <span className={themeClasses.text}>{folder.folderName}</span>
                        <span className={`ml-auto text-xs ${themeClasses.textSecondary}`}>
                          ({totalFileCount} files)
                        </span>
                      </button>
                      {folder.children && folder.children.map(child => renderFolderOption(child, level + 1))}
                    </React.Fragment>
                  );
                };
                return organizeFoldersIntoTree().map(folder => renderFolderOption(folder));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;