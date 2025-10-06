import React from 'react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest, Technician } from './types';

interface AssignTechnicianModalProps {
  show: boolean;
  selectedRequest: ServiceRequest | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  actionLoading: boolean;
  actionError: string | null;
  onTechnicianIdChange: (technicianId: string) => void;
  onAssign: () => void;
  onClose: () => void;
}

const AssignTechnicianModal: React.FC<AssignTechnicianModalProps> = ({
  show,
  selectedRequest,
  technicians,
  selectedTechnicianId,
  actionLoading,
  actionError,
  onTechnicianIdChange,
  onAssign,
  onClose
}) => {
  if (!show || !selectedRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
        <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
          Assign Technician
        </h2>

        <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
          Assign a technician to service request <span className="font-mono">{selectedRequest.request_number}</span>
        </p>

        {actionError && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {actionError}
          </div>
        )}

        <div className="mb-6">
          <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Select Technician
          </label>
          <select
            value={selectedTechnicianId}
            onChange={(e) => onTechnicianIdChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
          >
            <option value="">-- Select Technician --</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name} ({tech.active_requests} active requests)
              </option>
            ))}
          </select>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onAssign}
            disabled={!selectedTechnicianId || actionLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? 'Assigning...' : 'Assign'}
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

export default AssignTechnicianModal;
