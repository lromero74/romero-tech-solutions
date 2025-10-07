import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Image,
  Archive,
  File,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Shield,
  ShieldAlert,
  Clock,
  User,
  AlertTriangle,
  X,
  Building2
} from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { themeClasses } from '../../contexts/ThemeContext';
import apiService from '../../services/apiService';

interface Business {
  id: string;
  name: string;
  totalFiles: number;
  totalStorageBytes: number;
}

interface Folder {
  id: string;
  parentFolderId: string | null;
  folderName: string;
  folderDescription: string | null;
  folderColor: string;
  sortOrder: number;
  isSystemFolder: boolean;
  fileCount: number;
  depth: number;
  children?: Folder[];
}

interface ClientFile {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  mimeType: string;
  fileDescription: string | null;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  serviceRequestId: string | null;
  serviceRequestTitle: string | null;
  virusScanStatus: 'clean' | 'pending' | 'infected' | null;
  virusScanResult: string | null;
  virusScanDate: string | null;
  isPublicToBusiness: boolean;
  createdAt: string;
  updatedAt: string;
  uploader: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  } | null;
}

interface ClientFilesData {
  businesses: Business[];
  files: ClientFile[];
}

interface AdminClientFileBrowserProps {
  clientFilesData?: ClientFilesData | null;
  loading?: boolean;
  error?: string | null;
  refreshClientFilesData?: (force?: boolean) => Promise<void>;
}

const AdminClientFileBrowser: React.FC<AdminClientFileBrowserProps> = ({
  clientFilesData: propsClientFilesData,
  loading: propsLoading = false,
  error: propsError = null,
  refreshClientFilesData
}) => {
  const { checkPermission, loading: permissionsLoading } = usePermission();

  // Permission checks
  const canViewClientFiles = checkPermission('view.client_files.enable');
  const canDeleteClientFiles = checkPermission('delete.client_files.enable');
  const canDownloadClientFiles = checkPermission('download.client_files.enable');

  // State with session storage caching
  const [businesses, setBusinesses] = useState<Business[]>(() => {
    // Use props if provided, otherwise check session storage
    if (propsClientFilesData?.businesses) {
      return propsClientFilesData.businesses;
    }
    const cached = sessionStorage.getItem('adminClientFiles_businesses');
    return cached ? JSON.parse(cached) : [];
  });
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(() => {
    return sessionStorage.getItem('adminClientFiles_selectedBusiness') || null;
  });
  const [folders, setFolders] = useState<Folder[]>(() => {
    const cached = sessionStorage.getItem('adminClientFiles_folders');
    return cached ? JSON.parse(cached) : [];
  });
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => {
    return sessionStorage.getItem('adminClientFiles_selectedFolder') || null;
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const cached = sessionStorage.getItem('adminClientFiles_expandedFolders');
    return cached ? new Set(JSON.parse(cached)) : new Set();
  });
  const [allFiles, setAllFiles] = useState<ClientFile[]>(() => {
    const cached = sessionStorage.getItem('adminClientFiles_allFiles');
    return cached ? JSON.parse(cached) : [];
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const filesPerPage = 20;

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
    if (mimeType?.includes('pdf') || mimeType?.includes('document')) return <FileText className="h-5 w-5 text-red-500" />;
    if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return <Archive className="h-5 w-5 text-yellow-500" />;
    return <File className="h-5 w-5 text-gray-500 dark:text-gray-400" />;
  };

  // Get virus scan status icon
  const getVirusScanIcon = (status: string | null | undefined) => {
    if (!status || status === 'pending') {
      return <Clock className="h-4 w-4 text-yellow-500" title="Scan Pending" />;
    }
    if (status === 'clean') {
      return <Shield className="h-4 w-4 text-green-500" title="Clean" />;
    }
    if (status === 'infected') {
      return <ShieldAlert className="h-4 w-4 text-red-500" title="Infected" />;
    }
    return null;
  };

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Cache to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('adminClientFiles_businesses', JSON.stringify(businesses));
  }, [businesses]);

  useEffect(() => {
    if (selectedBusiness) {
      sessionStorage.setItem('adminClientFiles_selectedBusiness', selectedBusiness);
    } else {
      sessionStorage.removeItem('adminClientFiles_selectedBusiness');
    }
  }, [selectedBusiness]);

  useEffect(() => {
    sessionStorage.setItem('adminClientFiles_folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    if (selectedFolder) {
      sessionStorage.setItem('adminClientFiles_selectedFolder', selectedFolder);
    } else {
      sessionStorage.removeItem('adminClientFiles_selectedFolder');
    }
  }, [selectedFolder]);

  useEffect(() => {
    sessionStorage.setItem('adminClientFiles_expandedFolders', JSON.stringify(Array.from(expandedFolders)));
  }, [expandedFolders]);

  useEffect(() => {
    sessionStorage.setItem('adminClientFiles_allFiles', JSON.stringify(allFiles));
  }, [allFiles]);

  // Sync businesses from props
  useEffect(() => {
    if (propsClientFilesData?.businesses) {
      setBusinesses(propsClientFilesData.businesses);
    }
  }, [propsClientFilesData?.businesses]);

  // Load businesses on mount (only if cache is empty and no props provided)
  useEffect(() => {
    if (canViewClientFiles && businesses.length === 0 && !propsClientFilesData) {
      loadBusinesses();
    } else if (canViewClientFiles && refreshClientFilesData && !propsClientFilesData) {
      // If we have a refresh function but no props data, refresh in background
      refreshClientFilesData();
    }
  }, [canViewClientFiles]);

  // Load folders/files for cached business on mount
  useEffect(() => {
    if (selectedBusiness && allFiles.length === 0) {
      loadFolders();
      loadFiles();
    }
  }, []);

  // Client-side filtering
  const filteredFiles = useMemo(() => {
    let filtered = allFiles;

    // Filter by folder
    if (selectedFolder !== null) {
      filtered = filtered.filter(f => f.folderId === selectedFolder);
    }

    // Filter by search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(f =>
        f.originalFilename.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [allFiles, selectedFolder, searchTerm]);

  // Paginated files
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * filesPerPage;
    const endIndex = startIndex + filesPerPage;
    return filteredFiles.slice(startIndex, endIndex);
  }, [filteredFiles, currentPage]);

  const totalPages = Math.ceil(filteredFiles.length / filesPerPage);

  // Load folders/files when business changes (but not on initial mount)
  const [previousBusiness, setPreviousBusiness] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBusiness && selectedBusiness !== previousBusiness) {
      // Only reload if switching to a different business
      loadFolders();
      loadFiles();
      setSelectedFolder(null);
      setCurrentPage(1);
      setExpandedFolders(new Set());
      setPreviousBusiness(selectedBusiness);
    }
  }, [selectedBusiness]);

  // Reset to page 1 when folder/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFolder, searchTerm]);

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const response = await apiService.get('/admin/client-files/businesses');
      setBusinesses(response.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load businesses');
      console.error('Error loading businesses:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    if (!selectedBusiness) return;

    try {
      const response = await apiService.get(`/admin/client-files/businesses/${selectedBusiness}/folders`);
      setFolders(response.data);
    } catch (err: any) {
      setError('Failed to load folders');
      console.error('Error loading folders:', err);
    }
  };

  const loadFiles = async () => {
    if (!selectedBusiness) return;

    setLoading(true);
    try {
      // Load ALL files for the business (no folder filter, no pagination)
      const response = await apiService.get(
        `/admin/client-files/businesses/${selectedBusiness}/files?page=1&limit=10000`
      );

      setAllFiles(response.data.files);
    } catch (err: any) {
      setError(err?.message || 'Failed to load files');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileId: string, filename: string) => {
    if (!canDownloadClientFiles || !selectedBusiness) return;

    try {
      const sessionToken = localStorage.getItem('sessionToken');
      const headers: HeadersInit = {
        'Accept': 'application/octet-stream'
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/admin/client-files/businesses/${selectedBusiness}/files/${fileId}/download`,
        {
          method: 'GET',
          headers,
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download file');
      console.error('Error downloading file:', err);
    }
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    if (!canDeleteClientFiles || !selectedBusiness) return;
    if (!confirm(`Delete "${filename}"? This action cannot be undone.`)) return;

    try {
      await apiService.delete(
        `/admin/client-files/businesses/${selectedBusiness}/files/${fileId}`
      );

      loadFiles();
      loadBusinesses(); // Refresh storage totals
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
      console.error('Error deleting file:', err);
    }
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
  const calculateTotalFileCount = (folder: Folder): number => {
    let total = folder.fileCount;
    if (folder.children) {
      folder.children.forEach(child => {
        total += calculateTotalFileCount(child);
      });
    }
    return total;
  };

  // Organize folders into tree structure
  const organizeFoldersIntoTree = () => {
    const rootFolders: Folder[] = [];
    const folderMap = new Map<string, Folder & { children: Folder[] }>();

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
  const renderFolderTree = (folder: Folder, level: number = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const paddingLeft = `${level * 1.5}rem`;
    const totalFileCount = calculateTotalFileCount(folder);

    return (
      <React.Fragment key={folder.id}>
        <div
          className={`flex items-center justify-between p-2 mb-1 rounded cursor-pointer ${
            selectedFolder === folder.id
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
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
                  <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            )}
            {!hasChildren && <span className="w-5" />}
            <Folder className="h-4 w-4 mr-2" style={{ color: folder.folderColor }} />
            <span className="text-sm text-gray-900 dark:text-gray-100">{folder.folderName}</span>
            <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">({totalFileCount})</span>
          </div>
        </div>
        {hasChildren && isExpanded && folder.children!.map(child => renderFolderTree(child, level + 1))}
      </React.Fragment>
    );
  };

  // Permission denied view
  if (permissionsLoading) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8 text-center`}>
        <RefreshCw className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <p className="text-gray-600 dark:text-gray-400">Loading permissions...</p>
      </div>
    );
  }

  if (!canViewClientFiles) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8 text-center`}>
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Access Denied
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          You don't have permission to view client files.
        </p>
      </div>
    );
  }

  const selectedBusinessData = businesses.find(b => b.id === selectedBusiness);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Client File Browser
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            View and manage client files across all businesses
          </p>
        </div>
        <button
          onClick={() => {
            loadBusinesses();
            if (selectedBusiness) {
              loadFolders();
              loadFiles();
            }
          }}
          className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          </div>
          <button onClick={() => setError('')}>
            <X className="h-4 w-4 text-red-600 dark:text-red-400" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Business Selector - Left Sidebar */}
        <div className="lg:col-span-3">
          <div className={`${themeClasses.container} rounded-lg p-4`}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
              <Building2 className="h-4 w-4 mr-2" />
              Businesses
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {businesses.map(business => (
                <div
                  key={business.id}
                  onClick={() => setSelectedBusiness(business.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedBusiness === business.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/80'
                  }`}
                >
                  <div className={`font-medium mb-1 text-sm ${
                    selectedBusiness === business.id
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {business.name}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{business.totalFiles} files</span>
                    <span className="text-gray-600 dark:text-gray-400">{formatBytes(business.totalStorageBytes)}</span>
                  </div>
                </div>
              ))}
              {businesses.length === 0 && !loading && (
                <p className={`text-sm ${themeClasses.mutedText} text-center py-4`}>
                  No businesses found
                </p>
              )}
            </div>
          </div>

          {/* Folder Tree */}
          {selectedBusiness && folders.length > 0 && (
            <div className={`${themeClasses.container} rounded-lg p-4 mt-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Folders
                </h3>
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`text-xs px-2 py-1 rounded ${
                    selectedFolder === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  All Files
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {organizeFoldersIntoTree().map(folder => renderFolderTree(folder))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content - Files List */}
        <div className="lg:col-span-9">
          {selectedBusiness ? (
            <div className={`${themeClasses.container} rounded-lg p-6`}>
              {/* Business Info & Search */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {selectedBusinessData?.name}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedBusinessData?.totalFiles} files • {formatBytes(selectedBusinessData?.totalStorageBytes || 0)}
                    </p>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Files List */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-3 text-gray-900 dark:text-gray-100">Loading files...</span>
                </div>
              ) : paginatedFiles.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {paginatedFiles.map(file => (
                      <div
                        key={file.id}
                        className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/80"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            {getFileIcon(file.mimeType)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {file.originalFilename}
                                </span>
                                {getVirusScanIcon(file.virusScanStatus)}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {file.fileSizeFormatted}
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                  {formatDate(file.createdAt)}
                                </span>
                                {file.folderName && (
                                  <span className="flex items-center text-gray-700 dark:text-gray-300" style={{ color: file.folderColor || undefined }}>
                                    <Folder className="h-3 w-3 mr-1" />
                                    {file.folderName}
                                  </span>
                                )}
                                {file.uploader && (
                                  <span className="flex items-center text-gray-600 dark:text-gray-400">
                                    <User className="h-3 w-3 mr-1" />
                                    {file.uploader.fullName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 ml-4">
                            {canDownloadClientFiles && (
                              <button
                                onClick={() => handleDownloadFile(file.id, file.originalFilename)}
                                className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            )}
                            {canDeleteClientFiles && (
                              <button
                                onClick={() => handleDeleteFile(file.id, file.originalFilename)}
                                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-gray-600 dark:text-gray-400">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <File className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchTerm ? 'No files match your search' : 'No files found'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className={`${themeClasses.container} rounded-lg p-12 text-center`}>
              <FolderOpen className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Select a business to view their files
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminClientFileBrowser;
