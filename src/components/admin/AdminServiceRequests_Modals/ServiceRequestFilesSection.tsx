import React from 'react';
import { FileText, RefreshCw, Edit2, Download, Trash2, Check, X as XIcon } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequestFile } from './types';

interface ServiceRequestFilesSectionProps {
  files: ServiceRequestFile[];
  loading: boolean;
  fileCount: number;
  renamingFileId: string | null;
  newFileName: string;
  savingEdit: boolean;
  deletingFileId: string | null;
  apiBaseUrl: string;
  onStartRename: (file: ServiceRequestFile) => void;
  onCancelRename: () => void;
  onSaveFileName: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onFileNameChange: (name: string) => void;
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
  onStartRename,
  onCancelRename,
  onSaveFileName,
  onDeleteFile,
  onFileNameChange
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!fileCount || fileCount === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <h4 className={`font-medium ${themeClasses.text.secondary} mb-2`}>
        Attachments ({fileCount})
      </h4>
      {loading ? (
        <div className={`flex items-center gap-2 ${themeClasses.text.secondary}`}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading files...</span>
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className={`flex items-center justify-between p-3 ${themeClasses.bg.secondary} rounded-md`}>
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
                        {formatFileSize(file.file_size_bytes)} • {new Date(file.created_at).toLocaleDateString()}
                      </p>
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
          ))}
        </div>
      ) : (
        <p className={`${themeClasses.text.muted} text-sm`}>No files available</p>
      )}
    </div>
  );
};

export default ServiceRequestFilesSection;
