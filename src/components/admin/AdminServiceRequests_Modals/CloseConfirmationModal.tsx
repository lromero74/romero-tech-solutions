import React from 'react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';

interface CloseConfirmationModalProps {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CloseConfirmationModal: React.FC<CloseConfirmationModalProps> = ({
  show,
  onConfirm,
  onCancel
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
        <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
          Unsaved Changes
        </h2>

        <p className={`text-sm ${themeClasses.text.secondary} mb-6`}>
          You have unsaved changes. Are you sure you want to close this service request? All unsaved changes will be lost.
        </p>

        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Discard Changes
          </button>
          <button
            onClick={onCancel}
            className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloseConfirmationModal;
