import React from 'react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { ServiceRequest, ClosureReason } from './types';

interface TimeBreakdown {
  isFirstServiceRequest: boolean;
  waivedHours: string;
  standardBillableHours: number;
  premiumBillableHours: number;
  emergencyBillableHours: number;
  totalBillableHours: number;
}

interface CompleteRequestModalProps {
  show: boolean;
  selectedRequest: ServiceRequest | null;
  closureReasons: ClosureReason[];
  selectedClosureReasonId: string;
  resolutionSummary: string;
  actualDurationMinutes: string;
  equipmentUsed: string;
  timeBreakdown: TimeBreakdown | null;
  actionLoading: boolean;
  actionError: string | null;
  onClosureReasonIdChange: (reasonId: string) => void;
  onResolutionSummaryChange: (summary: string) => void;
  onActualDurationChange: (duration: string) => void;
  onEquipmentUsedChange: (equipment: string) => void;
  onComplete: () => void;
  onClose: () => void;
  formatDuration: (minutes: number | null) => string;
}

const CompleteRequestModal: React.FC<CompleteRequestModalProps> = ({
  show,
  selectedRequest,
  closureReasons,
  selectedClosureReasonId,
  resolutionSummary,
  actualDurationMinutes,
  equipmentUsed,
  timeBreakdown,
  actionLoading,
  actionError,
  onClosureReasonIdChange,
  onResolutionSummaryChange,
  onActualDurationChange,
  onEquipmentUsedChange,
  onComplete,
  onClose,
  formatDuration
}) => {
  if (!show || !selectedRequest) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="p-6 overflow-y-auto flex-1">
          <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
            Complete Service Request
          </h2>

          <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
            Complete and close service request <span className="font-mono">{selectedRequest.request_number}</span>
          </p>

          {actionError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {actionError}
            </div>
          )}

          {/* Closure Reason */}
          <div className="mb-4">
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Closure Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedClosureReasonId}
              onChange={(e) => onClosureReasonIdChange(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
            >
              <option value="">-- Select Closure Reason --</option>
              {closureReasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.reason} {reason.description && `- ${reason.description}`}
                </option>
              ))}
            </select>
          </div>

          {/* Resolution Summary */}
          <div className="mb-4">
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Resolution Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              value={resolutionSummary}
              onChange={(e) => onResolutionSummaryChange(e.target.value)}
              placeholder="Describe what was done to resolve this service request..."
              rows={4}
              className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
            />
          </div>

          {/* Actual Duration */}
          <div className="mb-4">
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Actual Duration (minutes)
            </label>
            <input
              type="number"
              value={actualDurationMinutes}
              onChange={(e) => onActualDurationChange(e.target.value)}
              placeholder="Enter actual time spent"
              min="0"
              className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
            />
            {selectedRequest.total_work_duration_minutes > 0 && (
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Tracked time: {formatDuration(selectedRequest.total_work_duration_minutes)}
              </p>
            )}
            {timeBreakdown && (
              <div className={`mt-3 p-3 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border}`}>
                {/* Show waived time for first-time clients */}
                {timeBreakdown.isFirstServiceRequest && parseFloat(timeBreakdown.waivedHours) > 0 && (
                  <div className={`mb-3 pb-3 border-b ${themeClasses.border}`}>
                    <p className={`text-xs ${themeClasses.text.secondary} mb-1`}>
                      First Service Request Discount:
                    </p>
                    <p className={`text-sm font-medium text-green-600 dark:text-green-400`}>
                      New Client Assessment - Waived: {timeBreakdown.waivedHours} hours
                    </p>
                  </div>
                )}

                {/* Billable hours breakdown */}
                <p className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                  Billable Hours:
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className={`${themeClasses.text.secondary} mb-1`}>Standard</div>
                    <div className={`font-bold ${themeClasses.text.primary}`}>
                      {timeBreakdown.standardBillableHours.toFixed(2)} hrs
                    </div>
                    <div className={`text-xs ${themeClasses.text.muted}`}>1.0x rate</div>
                  </div>
                  <div className="text-center">
                    <div className={`${themeClasses.text.secondary} mb-1`}>Premium</div>
                    <div className={`font-bold ${themeClasses.text.primary}`}>
                      {timeBreakdown.premiumBillableHours.toFixed(2)} hrs
                    </div>
                    <div className={`text-xs ${themeClasses.text.muted}`}>1.5x rate</div>
                  </div>
                  <div className="text-center">
                    <div className={`${themeClasses.text.secondary} mb-1`}>Emergency</div>
                    <div className={`font-bold ${themeClasses.text.primary}`}>
                      {timeBreakdown.emergencyBillableHours.toFixed(2)} hrs
                    </div>
                    <div className={`text-xs ${themeClasses.text.muted}`}>2.0x rate</div>
                  </div>
                </div>
                <div className={`mt-2 pt-2 border-t ${themeClasses.border} text-center`}>
                  <span className={`text-xs ${themeClasses.text.secondary}`}>Total Billable: </span>
                  <span className={`text-sm font-bold ${themeClasses.text.primary}`}>
                    {timeBreakdown.totalBillableHours.toFixed(2)} hours
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Equipment Used */}
          <div className="mb-6">
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
              Equipment/Materials Used (Optional)
            </label>
            <textarea
              value={equipmentUsed}
              onChange={(e) => onEquipmentUsedChange(e.target.value)}
              placeholder="List any equipment or materials used..."
              rows={3}
              className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onComplete}
              disabled={!selectedClosureReasonId || !resolutionSummary || actionLoading}
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? 'Completing...' : 'Complete Request'}
            </button>
            <button
              onClick={onClose}
              disabled={actionLoading}
              className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:opacity-80 disabled:opacity-50`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompleteRequestModal;
