import React from 'react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest, Status } from './types';

interface ChangeStatusModalProps {
  show: boolean;
  selectedRequest: ServiceRequest | null;
  statuses: Status[];
  selectedStatusId: string;
  statusNotes: string;
  actionLoading: boolean;
  actionError: string | null;
  onStatusIdChange: (statusId: string) => void;
  onStatusNotesChange: (notes: string) => void;
  onChangeStatus: () => void;
  onClose: () => void;
}

const ChangeStatusModal: React.FC<ChangeStatusModalProps> = ({
  show,
  selectedRequest,
  statuses,
  selectedStatusId,
  statusNotes,
  actionLoading,
  actionError,
  onStatusIdChange,
  onStatusNotesChange,
  onChangeStatus,
  onClose
}) => {
  if (!show || !selectedRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
        <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
          Change Status
        </h2>

        <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
          Change status for service request <span className="font-mono">{selectedRequest.request_number}</span>
        </p>

        {actionError && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {actionError}
          </div>
        )}

        <div className="mb-4">
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            New Status
          </label>
          <select
            value={selectedStatusId}
            onChange={(e) => onStatusIdChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="">-- Select Status --</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name} {status.description && `- ${status.description}`}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Notes (Optional)
          </label>
          <textarea
            value={statusNotes}
            onChange={(e) => onStatusNotesChange(e.target.value)}
            placeholder="Add notes about this status change..."
            rows={3}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
          />
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onChangeStatus}
            disabled={!selectedStatusId || actionLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? 'Changing...' : 'Change Status'}
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

export default ChangeStatusModal;
