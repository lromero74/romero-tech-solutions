import React, { useRef } from 'react';
import { FileText, RefreshCw, Edit2, Download, Trash2, Check, X as XIcon, Upload } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequestFile } from './types';
import { FileUploadProgress } from '../../../hooks/useFileUploadWithProgress';

interface ServiceRequestFilesSectionProps {
  files: ServiceRequestFile[];
  loading: boolean;
  fileCount: number;
  renamingFileId: string | null;
  newFileName: string;
  savingEdit: boolean;
  deletingFileId: string | null;
  apiBaseUrl: string;
  uploading?: boolean;
  fileUploads?: FileUploadProgress[];
  newlyUploadedFileIds?: string[];
  onStartRename: (file: ServiceRequestFile) => void;
  onCancelRename: () => void;
  onSaveFileName: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onFileNameChange: (name: string) => void;
  onUploadFiles?: (files: FileList) => void;
}

const ServiceRequestFilesSection: React.FC<ServiceRequestFilesSectionProps> = ({
  files,
  loading,
  fileCount,
  renamingFileId,
  newFileName,
  savingEdit,
  deletingFileId,
  apiBaseUrl,
  uploading = false,
  fileUploads = [],
  newlyUploadedFileIds = [],
  onStartRename,
  onCancelRename,
  onSaveFileName,
  onDeleteFile,
  onFileNameChange,
  onUploadFiles
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatFileTimestamp = (timestamp: string) => {
    try {
      const dateObj = new Date(timestamp);

      if (isNaN(dateObj.getTime())) {
        return 'Invalid date';
      }

      const formattedDate = dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const formattedTime = dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      return `${formattedDate} ${formattedTime}`;
    } catch (error) {
      console.error('formatFileTimestamp error:', error);
      return 'Invalid date';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUploadFiles) {
      onUploadFiles(files);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className={`font-medium ${themeClasses.text.secondary}`}>
          Attachments ({files.length})
        </h4>
        {onUploadFiles && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading || loading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar,.7z"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                uploading || loading
                  ? 'opacity-50 cursor-not-allowed'
                  : `${themeClasses.button.primary} hover:opacity-90`
              }`}
              title="Upload files (max 5 files, 50MB each)"
            >
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Upload Files</span>
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Upload Progress */}
      {fileUploads.length > 0 && (
        <div className="space-y-2 mb-4">
          {fileUploads.map((upload) => (
            <div key={upload.id} className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {upload.file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-300">
                    {formatFileSize(upload.file.size)} • {
                      upload.status === 'pending' ? 'Pending...' :
                      upload.status === 'uploading' ? 'Uploading...' :
                      upload.status === 'scanning' ? 'Scanning...' :
                      upload.status === 'success' ? 'Upload complete!' :
                      upload.error || 'Upload failed'
                    }
                  </p>
                </div>
              </div>
              {upload.status !== 'error' && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      upload.status === 'success' ? 'bg-green-500' :
                      upload.status === 'scanning' ? 'bg-yellow-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              )}
              {upload.status === 'error' && upload.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className={`flex items-center gap-2 ${themeClasses.text.secondary}`}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading files...</span>
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => {
            const isNewlyUploaded = newlyUploadedFileIds.includes(file.id);
            return (
            <div
              key={file.id}
              className={`p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg transition-all duration-300 ${
                isNewlyUploaded ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/50 dark:ring-blue-500 dark:shadow-blue-500/50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {renamingFileId === file.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => onFileNameChange(e.target.value)}
                          className={`flex-1 px-2 py-1 rounded text-sm ${themeClasses.input}`}
                          disabled={savingEdit}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveFileName(file.id);
                            if (e.key === 'Escape') onCancelRename();
                          }}
                        />
                        <button
                          onClick={() => onSaveFileName(file.id)}
                          disabled={savingEdit || !newFileName.trim()}
                          className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                          title="Save"
                        >
                          {savingEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={onCancelRename}
                          disabled={savingEdit}
                          className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                          title="Cancel"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${themeClasses.text.primary} truncate`}>
                          {file.original_filename}
                        </p>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          {formatFileSize(file.file_size_bytes)} • {formatFileTimestamp(file.created_at)}
                        </p>
                        {file.uploaded_by_email && (
                          <p className={`text-xs ${themeClasses.text.muted} mt-0.5`}>
                            Uploaded by: {file.uploaded_by_email} ({file.uploaded_by_type})
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {renamingFileId !== file.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onStartRename(file)}
                    className={`p-2 ${themeClasses.text.muted} hover:text-blue-600`}
                    title="Rename file"
                    disabled={!!renamingFileId || !!deletingFileId}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      window.open(`${apiBaseUrl}/admin/files/${file.id}/download`, '_blank');
                    }}
                    className={`p-2 ${themeClasses.text.muted} hover:text-gray-600 dark:hover:text-gray-300`}
                    title="Download file"
                    disabled={!!renamingFileId || !!deletingFileId}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDeleteFile(file.id)}
                    className={`p-2 ${themeClasses.text.muted} hover:text-red-600`}
                    title="Delete file"
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
            </div>
          );
          })}
        </div>
      ) : (
        <p className={`${themeClasses.text.muted} text-sm`}>No files available</p>
      )}
    </div>
  );
};

export default ServiceRequestFilesSection;
