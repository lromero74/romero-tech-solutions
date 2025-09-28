import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
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
  Search
} from 'lucide-react';
import FileUpload from './FileUpload';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface ClientFile {
  fileId: string;
  fileName: string;
  originalName: string;
  fileSizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  description: string;
  isPublic: boolean;
  categoryName: string;
  locationName: string;
  createdAt: string;
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

const FileManager: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { isAuthenticated, isLoading } = useEnhancedAuth();
  const { t } = useClientLanguage();
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);

  const filesPerPage = 10;

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

  // Load files and quota information
  const loadData = async () => {
    setLoading(true);
    try {
      // Load files
      const filesResponse = await fetch(`/api/client/files?page=${currentPage}&limit=${filesPerPage}&search=${encodeURIComponent(searchTerm)}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (filesResponse.ok) {
        const filesData = await filesResponse.json();
        setFiles(filesData.data.files);
        setTotalPages(filesData.data.pagination.totalPages);
      }

      // Load quota and usage stats
      const quotaResponse = await fetch(`${API_BASE_URL}/client/files/quota`, {
        method: 'GET',
        credentials: 'include'
      });

      if (quotaResponse.ok) {
        const quotaData = await quotaResponse.json();
        setQuotaInfo(quotaData.data.quota);
        setUsageStats(quotaData.data.usage);
      }
    } catch (error) {
      console.error('Failed to load file data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Delete file
  const deleteFile = async (fileId: string) => {
    if (!confirm(t('files.actions.confirmDelete'))) return;

    try {
      const response = await fetch(`/api/client/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        loadData(); // Refresh data
      } else {
        alert(t('files.actions.deleteFailed') || 'Failed to delete file');
      }
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

  // Load data when page/search changes - but only when authenticated and not on initial mount
  useEffect(() => {
    if (isAuthenticated && !isLoading && !showUpload) {
      loadData();
    }
  }, [currentPage, searchTerm]);

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
              loadData();
              setShowUpload(false);
            }}
            onQuotaUpdate={setQuotaInfo}
          />
        </div>
      ) : (
        <div className={`rounded-lg border p-6 ${themeClasses.container}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-semibold ${themeClasses.text}`}>{t('files.title')}</h2>
            <button
              onClick={() => setShowUpload(true)}
              className={`flex items-center px-4 py-2 rounded-md ${themeClasses.button}`}
            >
              <HardDrive className="h-4 w-4 mr-2" />
              {t('files.uploadFiles')}
            </button>
          </div>

          {/* Storage Overview */}
          {quotaInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className={`p-4 rounded-lg border ${themeClasses.border}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${themeClasses.textSecondary}`}>{t('files.storage.quotaUsed')}</p>
                    <p className={`text-lg font-semibold ${themeClasses.text}`}>
                      {((quotaInfo.currentUsageBytes / 1024 / 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <HardDrive className="h-8 w-8 text-blue-500" />
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${themeClasses.border}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${themeClasses.textSecondary}`}>{t('files.storage.totalFiles')}</p>
                    <p className={`text-lg font-semibold ${themeClasses.text}`}>
                      {usageStats?.totalFiles || 0}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-green-500" />
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${themeClasses.border}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${themeClasses.textSecondary}`}>{t('files.storage.availableSpace')}</p>
                    <p className={`text-lg font-semibold ${themeClasses.text}`}>
                      {((quotaInfo.availableBytes / 1024 / 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <Archive className="h-8 w-8 text-yellow-500" />
                </div>
              </div>
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

          {/* Files Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${themeClasses.border}`}>
                  <th className={`text-left py-3 px-4 font-medium ${themeClasses.text}`}>{t('files.details.file')}</th>
                  <th className={`text-left py-3 px-4 font-medium ${themeClasses.text}`}>{t('files.details.size')}</th>
                  <th className={`text-left py-3 px-4 font-medium ${themeClasses.text}`}>{t('files.details.uploaded')}</th>
                  <th className={`text-left py-3 px-4 font-medium ${themeClasses.text}`}>{t('files.details.location')}</th>
                  <th className={`text-left py-3 px-4 font-medium ${themeClasses.text}`}>{t('files.details.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className={themeClasses.textSecondary}>
                        {searchTerm ? t('files.noFilesSearch') : t('files.noFiles')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.fileId} className={`border-b ${themeClasses.tableRow}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <p className={`font-medium ${themeClasses.text}`}>
                              {file.originalName}
                            </p>
                            {file.description && (
                              <p className={`text-sm ${themeClasses.textSecondary}`}>
                                {file.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`py-3 px-4 ${themeClasses.textSecondary}`}>
                        {file.sizeFormatted}
                      </td>
                      <td className={`py-3 px-4 ${themeClasses.textSecondary}`}>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(file.createdAt)}</span>
                        </div>
                      </td>
                      <td className={`py-3 px-4 ${themeClasses.textSecondary}`}>
                        {file.locationName || t('files.details.allLocations')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => window.open(`/uploads/clients/${file.fileName}`, '_blank')}
                            className="text-blue-600 hover:text-blue-700"
                            title={t('files.actions.viewDownload')}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteFile(file.fileId)}
                            className="text-red-600 hover:text-red-700"
                            title={t('files.actions.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                {t('general.pageOf', { current: currentPage, total: totalPages }) || `Page ${currentPage} of ${totalPages}`}
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
      )}
    </div>
  );
};

export default FileManager;