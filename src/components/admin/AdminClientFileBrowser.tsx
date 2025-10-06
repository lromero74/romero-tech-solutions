import React, { useState, useEffect } from 'react';
import { Search, FolderOpen, File, Download, Trash2, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { themeClasses } from '../../contexts/ThemeContext';

interface Business {
  id: string;
  name: string;
  totalFiles: number;
  totalStorageBytes: number;
}

interface Folder {
  id: string;
  folderName: string;
  fileCount: number;
  isSystemFolder: boolean;
}

interface ClientFile {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  contentType: string;
  createdAt: string;
  folderName: string | null;
  serviceLocationName: string | null;
  serviceRequestId: string | null;
}

const AdminClientFileBrowser: React.FC = () => {
  const { checkPermission, loading: permissionsLoading } = usePermission();

  // Permission checks
  const canViewClientFiles = checkPermission('view.client_files.enable');
  const canDeleteClientFiles = checkPermission('delete.client_files.enable');
  const canDownloadClientFiles = checkPermission('download.client_files.enable');

  // State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const filesPerPage = 20;

  // Load businesses on mount
  useEffect(() => {
    if (canViewClientFiles) {
      loadBusinesses();
    }
  }, [canViewClientFiles]);

  // Load folders when business selected
  useEffect(() => {
    if (selectedBusiness) {
      loadFolders();
      setSelectedFolder(null);
      setFiles([]);
      setCurrentPage(1);
    }
  }, [selectedBusiness]);

  // Load files when folder/page/search changes
  useEffect(() => {
    if (selectedBusiness) {
      loadFiles();
    }
  }, [selectedBusiness, selectedFolder, currentPage, searchTerm]);

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/client-files/businesses', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setBusinesses(data.data);
      } else {
        setError('Failed to load businesses');
      }
    } catch (err) {
      setError('Network error loading businesses');
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    if (!selectedBusiness) return;

    try {
      const response = await fetch(`/api/admin/client-files/businesses/${selectedBusiness}/folders`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setFolders(data.data);
      } else {
        setError('Failed to load folders');
      }
    } catch (err) {
      setError('Network error loading folders');
    }
  };

  const loadFiles = async () => {
    if (!selectedBusiness) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: filesPerPage.toString()
      });

      if (selectedFolder) {
        params.append('folderId', selectedFolder);
      }

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await fetch(
        `/api/admin/client-files/businesses/${selectedBusiness}/files?${params.toString()}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setFiles(data.data.files);
        setTotalPages(data.data.pagination.totalPages);
      } else {
        setError('Failed to load files');
      }
    } catch (err) {
      setError('Network error loading files');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileId: string, filename: string) => {
    if (!canDownloadClientFiles || !selectedBusiness) return;

    try {
      const response = await fetch(
        `/api/admin/client-files/businesses/${selectedBusiness}/files/${fileId}/download`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        setError('Failed to download file');
      }
    } catch (err) {
      setError('Network error downloading file');
    }
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    if (!canDeleteClientFiles || !selectedBusiness) return;
    if (!confirm(`Delete "${filename}"? This action cannot be undone.`)) return;

    try {
      const response = await fetch(
        `/api/admin/client-files/businesses/${selectedBusiness}/files/${fileId}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (response.ok) {
        loadFiles();
        loadBusinesses(); // Refresh storage totals
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to delete file');
      }
    } catch (err) {
      setError('Network error deleting file');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Loading permissions view
  if (permissionsLoading) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8 text-center`}>
        <RefreshCw className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <p className={themeClasses.mutedText}>Loading permissions...</p>
      </div>
    );
  }

  // Permission denied view
  if (!canViewClientFiles) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8 text-center`}>
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className={`text-xl font-semibold ${themeClasses.text} mb-2`}>
          Access Denied
        </h2>
        <p className={themeClasses.mutedText}>
          You don't have permission to view client files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${themeClasses.text}`}>
            Client File Browser
          </h1>
          <p className={themeClasses.mutedText}>
            View and manage client files across all businesses
          </p>
        </div>
        <button
          onClick={() => {
            loadBusinesses();
            if (selectedBusiness) loadFiles();
          }}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${themeClasses.text}`} />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
          <button onClick={() => setError('')}>
            <X className="h-4 w-4 text-red-600" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Business List */}
        <div className={`${themeClasses.container} rounded-lg p-4 h-fit`}>
          <h3 className={`text-sm font-semibold ${themeClasses.text} mb-3`}>Businesses</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {businesses.map(business => (
              <div
                key={business.id}
                onClick={() => setSelectedBusiness(business.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedBusiness === business.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                    : `${themeClasses.cardBg} border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700`
                }`}
              >
                <div className={`font-medium ${themeClasses.text} mb-1`}>
                  {business.name}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={themeClasses.mutedText}>{business.totalFiles} files</span>
                  <span className={themeClasses.mutedText}>{formatBytes(business.totalStorageBytes)}</span>
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

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {selectedBusiness ? (
            <>
              {/* Search and Folders */}
              <div className={`${themeClasses.container} rounded-lg p-4`}>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className={`w-full pl-10 pr-4 py-2 rounded-lg border ${themeClasses.input}`}
                    />
                  </div>
                </div>

                {/* Folder Filter */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSelectedFolder(null);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      selectedFolder === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    All Files
                  </button>
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        setSelectedFolder(folder.id);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg text-sm flex items-center ${
                        selectedFolder === folder.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <FolderOpen className="h-3 w-3 mr-1" />
                      {folder.folderName} ({folder.fileCount})
                    </button>
                  ))}
                </div>
              </div>

              {/* Files List */}
              <div className={`${themeClasses.container} rounded-lg p-4`}>
                <h3 className={`text-lg font-semibold ${themeClasses.text} mb-4`}>
                  Files {selectedFolder && `in ${folders.find(f => f.id === selectedFolder)?.folderName}`}
                </h3>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                    <span className={`ml-3 ${themeClasses.text}`}>Loading files...</span>
                  </div>
                ) : files.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {files.map(file => (
                        <div
                          key={file.id}
                          className={`p-4 rounded-lg ${themeClasses.cardBg} border border-gray-200 dark:border-gray-700`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <File className={`h-5 w-5 ${themeClasses.mutedText} mt-1`} />
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium ${themeClasses.text} truncate`}>
                                  {file.originalFilename}
                                </div>
                                <div className="flex items-center space-x-4 mt-1 text-xs">
                                  <span className={themeClasses.mutedText}>
                                    {formatBytes(file.fileSizeBytes)}
                                  </span>
                                  <span className={themeClasses.mutedText}>
                                    {formatDate(file.createdAt)}
                                  </span>
                                  {file.folderName && (
                                    <span className={themeClasses.mutedText}>
                                      📁 {file.folderName}
                                    </span>
                                  )}
                                  {file.serviceLocationName && (
                                    <span className={themeClasses.mutedText}>
                                      📍 {file.serviceLocationName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 ml-4">
                              {canDownloadClientFiles && (
                                <button
                                  onClick={() => handleDownloadFile(file.id, file.originalFilename)}
                                  className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                              {canDeleteClientFiles && (
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.originalFilename)}
                                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
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
                      <div className="flex items-center justify-between mt-6">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <span className={themeClasses.mutedText}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <File className={`h-12 w-12 ${themeClasses.mutedText} mx-auto mb-3`} />
                    <p className={themeClasses.mutedText}>
                      {searchTerm ? 'No files match your search' : 'No files found'}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={`${themeClasses.container} rounded-lg p-12 text-center`}>
              <FolderOpen className={`h-16 w-16 ${themeClasses.mutedText} mx-auto mb-4`} />
              <p className={themeClasses.mutedText}>
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
