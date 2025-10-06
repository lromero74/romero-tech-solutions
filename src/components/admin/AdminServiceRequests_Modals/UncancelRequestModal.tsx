import React from 'react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest } from './types';

interface UncancelRequestModalProps {
  show: boolean;
  selectedRequest: ServiceRequest | null;
  uncancelReason: string;
  actionLoading: boolean;
  actionError: string | null;
  onUncancelReasonChange: (reason: string) => void;
  onUncancel: () => void;
  onClose: () => void;
}

const UncancelRequestModal: React.FC<UncancelRequestModalProps> = ({
  show,
  selectedRequest,
  uncancelReason,
  actionLoading,
  actionError,
  onUncancelReasonChange,
  onUncancel,
  onClose
}) => {
  if (!show || !selectedRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-lg w-full p-6`}>
        <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
          Restore Service Request
        </h2>

        <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
          Are you sure you want to restore service request <span className="font-mono">{selectedRequest.request_number}</span>?
          This will change the status back to "Submitted".
        </p>

        {actionError && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {actionError}
          </div>
        )}

        <div className="mb-4">
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Reason for restoring (optional)
          </label>
          <textarea
            value={uncancelReason}
            onChange={(e) => onUncancelReasonChange(e.target.value)}
            placeholder="Provide a reason for restoring this request..."
            rows={3}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
          />
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onUncancel}
            disabled={actionLoading}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading ? 'Restoring...' : 'Restore Request'}
          </button>
          <button
            onClick={onClose}
            disabled={actionLoading}
            className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default UncancelRequestModal;
