import React, { useRef } from 'react';
import { FileText, Edit2, Download, Trash2, Check, X, RefreshCw, Upload } from 'lucide-react';
import { ServiceRequestFile, ThemeClasses } from './types';
import { formatFileSize, formatFileTimestamp } from './utils';

interface ServiceRequestFilesSectionProps {
  fileCount: number;
  loadingFiles: boolean;
  files: ServiceRequestFile[];
  renamingFileId: string | null;
  newFileName: string;
  deletingFileId: string | null;
  uploadingFiles: boolean;
  savingEdit: boolean;
  t: (key: string, params?: any, fallback?: string) => string;
  themeClasses: ThemeClasses;
  onStartRename: (file: ServiceRequestFile) => void;
  onSaveFileName: (fileId: string) => void;
  onCancelRename: () => void;
  onDeleteFile: (fileId: string) => void;
  onUploadFiles: (files: FileList) => void;
  onFileNameChange: (name: string) => void;
}

const ServiceRequestFilesSection: React.FC<ServiceRequestFilesSectionProps> = ({
  fileCount,
  loadingFiles,
  files,
  renamingFileId,
  newFileName,
  deletingFileId,
  uploadingFiles,
  savingEdit,
  t,
  themeClasses,
  onStartRename,
  onSaveFileName,
  onCancelRename,
  onDeleteFile,
  onUploadFiles,
  onFileNameChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-700 dark:text-gray-300">
          {t('serviceRequests.attachments', undefined, 'Attachments')} ({fileCount || 0})
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
                onUploadFiles(files);
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
      {fileCount > 0 && (
        <div>
        {loadingFiles ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{t('serviceRequests.loadingFiles', undefined, 'Loading files...')}</span>
          </div>
        ) : files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {renamingFileId === file.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => onFileNameChange(e.target.value)}
                          className="flex-1 px-2 py-1 rounded text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white"
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
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {file.originalFilename}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.fileSizeBytes)} • {formatFileTimestamp(file.createdAt)}
                        </p>
                        {file.uploadedByEmail && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Uploaded by: {file.uploadedByEmail} ({file.uploadedByType})
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
                      onClick={() => onDeleteFile(file.id)}
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
      {(!fileCount || fileCount === 0) && (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('serviceRequests.noFilesAvailable', undefined, 'No files available')}</p>
      )}
    </div>
  );
};

export default ServiceRequestFilesSection;
