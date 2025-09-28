import React, { useState, useCallback, useRef } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import {
  Upload,
  X,
  Check,
  AlertTriangle,
  FileText,
  Image,
  Archive,
  File,
  Shield
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface FileUploadProgress {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'scanning' | 'success' | 'error';
  error?: string;
  scanId?: string;
  fileId?: string;
}

interface QuotaInfo {
  softLimitBytes: number;
  hardLimitBytes: number;
  currentUsageBytes: number;
  availableBytes: number;
  usagePercentage: number;
  warningLevel: string;
}

interface FileUploadProps {
  onUploadComplete?: (files: any[]) => void;
  onQuotaUpdate?: (quota: QuotaInfo) => void;
  serviceLocationId?: string;
  categoryId?: string;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
}

const FileUpload: React.FC<FileUploadProps> = ({
  onQuotaUpdate,
  serviceLocationId,
  categoryId,
  maxFiles = 5,
  maxFileSize = 50 * 1024 * 1024 // 50MB
}) => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
  const [uploads, setUploads] = useState<FileUploadProgress[]>([]);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get file icon based on type
  const getFileIcon = (file: File) => {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return <Image className="h-6 w-6" />;
    if (type.includes('pdf') || type.includes('document')) return <FileText className="h-6 w-6" />;
    if (type.includes('zip') || type.includes('compressed')) return <Archive className="h-6 w-6" />;
    return <File className="h-6 w-6" />;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get progress color based on status
  const getProgressColor = (status: string) => {
    switch (status) {
      case 'uploading': return 'bg-blue-500';
      case 'scanning': return 'bg-yellow-500';
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };


  // Validate files before upload
  const validateFiles = (files: File[]): { valid: File[], invalid: { file: File, reason: string }[] } => {
    const valid: File[] = [];
    const invalid: { file: File, reason: string }[] = [];

    for (const file of files) {
      // Check file size
      if (file.size > maxFileSize) {
        invalid.push({ file, reason: `File too large. Maximum size is ${formatFileSize(maxFileSize)}` });
        continue;
      }

      // Check file type
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/zip',
        'application/x-zip-compressed',
        'application/gzip'
      ];

      if (!allowedTypes.includes(file.type)) {
        invalid.push({ file, reason: `File type ${file.type} not supported` });
        continue;
      }

      valid.push(file);
    }

    // Check total file count
    if (valid.length + uploads.length > maxFiles) {
      const excess = valid.splice(maxFiles - uploads.length);
      excess.forEach(file => {
        invalid.push({ file, reason: `Maximum ${maxFiles} files allowed` });
      });
    }

    return { valid, invalid };
  };

  // Upload files with progress tracking
  const uploadFiles = async (files: File[]) => {
    const { valid, invalid } = validateFiles(files);

    // Show validation errors
    invalid.forEach(({ file, reason }) => {
      const upload: FileUploadProgress = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        progress: 0,
        status: 'error',
        error: reason
      };
      setUploads(prev => [...prev, upload]);
    });

    // Process valid files
    for (const file of valid) {
      const upload: FileUploadProgress = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        progress: 0,
        status: 'pending'
      };

      setUploads(prev => [...prev, upload]);

      try {
        // Create FormData
        const formData = new FormData();
        formData.append('files', file);
        if (serviceLocationId) formData.append('serviceLocationId', serviceLocationId);
        if (categoryId) formData.append('categoryId', categoryId);

        // Update status to uploading
        setUploads(prev => prev.map(u =>
          u.id === upload.id ? { ...u, status: 'uploading' } : u
        ));

        // Upload with progress tracking
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 70); // 70% for upload
            setUploads(prev => prev.map(u =>
              u.id === upload.id ? { ...u, progress } : u
            ));
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status === 200) {
            // Update status to scanning
            setUploads(prev => prev.map(u =>
              u.id === upload.id ? { ...u, status: 'scanning', progress: 75 } : u
            ));

            try {
              const result = JSON.parse(xhr.responseText);

              if (result.success && result.data.uploadedFiles.length > 0) {
                const uploadedFile = result.data.uploadedFiles[0];

                // Simulate virus scan progress
                await new Promise(resolve => {
                  let scanProgress = 75;
                  const scanInterval = setInterval(() => {
                    scanProgress += 5;
                    setUploads(prev => prev.map(u =>
                      u.id === upload.id ? { ...u, progress: Math.min(scanProgress, 95) } : u
                    ));

                    if (scanProgress >= 95) {
                      clearInterval(scanInterval);
                      resolve(true);
                    }
                  }, 200);
                });

                // Complete upload
                setUploads(prev => prev.map(u =>
                  u.id === upload.id ? {
                    ...u,
                    status: 'success',
                    progress: 100,
                    scanId: uploadedFile.scanId,
                    fileId: uploadedFile.fileId
                  } : u
                ));

                // Update quota info
                setQuotaInfo(result.data.quotaInfo);
                onQuotaUpdate?.(result.data.quotaInfo);

              } else if (result.data.failedFiles.length > 0) {
                const failedFile = result.data.failedFiles[0];
                setUploads(prev => prev.map(u =>
                  u.id === upload.id ? {
                    ...u,
                    status: 'error',
                    error: failedFile.error
                  } : u
                ));
              }
            } catch {
              setUploads(prev => prev.map(u =>
                u.id === upload.id ? {
                  ...u,
                  status: 'error',
                  error: 'Failed to process server response'
                } : u
              ));
            }
          } else {
            setUploads(prev => prev.map(u =>
              u.id === upload.id ? {
                ...u,
                status: 'error',
                error: `Upload failed: ${xhr.statusText}`
              } : u
            ));
          }
        });

        xhr.addEventListener('error', () => {
          setUploads(prev => prev.map(u =>
            u.id === upload.id ? {
              ...u,
              status: 'error',
              error: 'Network error during upload'
            } : u
          ));
        });

        xhr.open('POST', `${API_BASE_URL}/client/files/upload`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.send(formData);

      } catch (error) {
        setUploads(prev => prev.map(u =>
          u.id === upload.id ? {
            ...u,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          } : u
        ));
      }
    }
  };

  // Handle file selection
  const handleFiles = useCallback((files: FileList | null) => {
    if (files) {
      uploadFiles(Array.from(files));
    }
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Remove upload
  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  // Clear completed uploads
  const clearCompleted = () => {
    setUploads(prev => prev.filter(u => u.status !== 'success'));
  };

  // Load quota only when user starts uploading - removed automatic loading

  const themeClasses = {
    container: isDarkMode
      ? 'bg-gray-800 border-gray-700'
      : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    dropzone: isDragOver
      ? (isDarkMode ? 'bg-blue-900/20 border-blue-400' : 'bg-blue-50 border-blue-400')
      : (isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'),
    button: isDarkMode
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white'
  };

  return (
    <div className={`rounded-lg border p-6 ${themeClasses.container} ${themeClasses.text}`}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">{t('files.upload.title')}</h3>

        {/* Quota Display */}
        {quotaInfo && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className={themeClasses.textSecondary}>
{t('files.storage.quotaUsed')}: {formatFileSize(quotaInfo.currentUsageBytes)} / {formatFileSize(quotaInfo.hardLimitBytes)}
              </span>
              <span className={`text-sm ${
                quotaInfo.warningLevel === 'critical' ? 'text-red-500' :
                quotaInfo.warningLevel === 'high' ? 'text-yellow-500' :
                themeClasses.textSecondary
              }`}>
                {quotaInfo.usagePercentage.toFixed(1)}% used
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  quotaInfo.warningLevel === 'critical' ? 'bg-red-500' :
                  quotaInfo.warningLevel === 'high' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${Math.min(quotaInfo.usagePercentage, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${themeClasses.dropzone}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="mx-auto h-12 w-12 mb-4 text-gray-400" />
          <p className="text-lg mb-2">
            {t('files.upload.dragDrop')}{' '}
            <button
              type="button"
              className="text-blue-600 hover:text-blue-700 underline"
              onClick={() => fileInputRef.current?.click()}
            >
              {t('files.upload.selectFiles')}
            </button>
          </p>
          <p className={`text-sm ${themeClasses.textSecondary}`}>
            {t('files.upload.maxSize')}: {formatFileSize(maxFileSize)}, {t('files.upload.maxFiles', {count: maxFiles}) || `Maximum ${maxFiles} files`}
          </p>
          <p className={`text-xs mt-1 ${themeClasses.textSecondary}`}>
            {t('files.upload.allowedTypes')}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp,.zip"
        />
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{t('files.upload.uploadProgress') || 'Upload Progress'}</h4>
            {uploads.some(u => u.status === 'success') && (
              <button
                onClick={clearCompleted}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {t('files.upload.clearCompleted') || 'Clear Completed'}
              </button>
            )}
          </div>

          {uploads.map((upload) => (
            <div
              key={upload.id}
              className={`border rounded-lg p-4 ${themeClasses.border}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  {getFileIcon(upload.file)}
                  <div>
                    <p className="font-medium text-sm">{upload.file.name}</p>
                    <p className={`text-xs ${themeClasses.textSecondary}`}>
                      {formatFileSize(upload.file.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {upload.status === 'success' && (
                    <div className="flex items-center text-green-600">
                      <Check className="h-4 w-4 mr-1" />
                      <span className="text-xs">{t('files.upload.uploadComplete')}</span>
                    </div>
                  )}

                  {upload.status === 'scanning' && (
                    <div className="flex items-center text-yellow-600">
                      <Shield className="h-4 w-4 mr-1 animate-pulse" />
                      <span className="text-xs">{t('files.upload.virusScanning')}</span>
                    </div>
                  )}

                  {upload.status === 'error' && (
                    <div className="flex items-center text-red-600">
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      <span className="text-xs">{t('files.upload.uploadFailed')}</span>
                    </div>
                  )}

                  <button
                    onClick={() => removeUpload(upload.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {upload.status !== 'error' && (
                <div className="mb-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(upload.status)}`}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className={themeClasses.textSecondary}>
                      {upload.status === 'uploading' && t('files.upload.uploading')}
                      {upload.status === 'scanning' && t('files.upload.virusScanning')}
                      {upload.status === 'success' && t('files.upload.uploadComplete')}
                    </span>
                    <span className={themeClasses.textSecondary}>
                      {upload.progress}%
                    </span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {upload.error && (
                <div className="text-red-600 text-sm">
                  {upload.error}
                </div>
              )}

              {/* Scan ID for debugging */}
              {upload.scanId && (
                <div className={`text-xs ${themeClasses.textSecondary} mt-1`}>
                  Scan ID: {upload.scanId}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;