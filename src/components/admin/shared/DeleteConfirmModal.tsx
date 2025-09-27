import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';

interface DeleteConfirmModalProps {
  showModal: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  entityName: string;
  entityType: string;
  isLoading?: boolean;
  deleteType?: 'soft' | 'hard';
  customMessage?: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  showModal,
  onClose,
  onConfirm,
  entityName,
  entityType,
  isLoading = false,
  deleteType = 'soft',
  customMessage
}) => {
  // const { theme } = useTheme(); // Theme not currently used

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (error) {
      console.error(`Error deleting ${entityType}:`, error);
      // Error handling is up to the parent component
    }
  };

  if (!showModal) return null;

  const getDeleteMessage = () => {
    if (customMessage) return customMessage;

    const action = deleteType === 'hard' ? 'permanently delete' : 'delete';
    const recovery = deleteType === 'hard'
      ? 'This action cannot be undone.'
      : 'This item will be moved to the trash and can be restored later.';

    return `Are you sure you want to ${action} "${entityName}"? ${recovery}`;
  };

  const getButtonText = () => {
    if (isLoading) return 'Deleting...';
    return deleteType === 'hard' ? 'Permanently Delete' : 'Delete';
  };

  const getButtonColor = () => {
    return deleteType === 'hard' ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl border ${themeClasses.border.primary} p-6 max-w-md w-full`}>
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
            Confirm {deleteType === 'hard' ? 'Permanent ' : ''}Deletion
          </h3>
        </div>

        <p className={`${themeClasses.text.secondary} mb-6`}>
          {getDeleteMessage()}
        </p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`inline-flex items-center px-4 py-2 ${getButtonColor()} text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {getButtonText()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;