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
  baseRate: number;
  standardRate: number;
  premiumRate: number;
  emergencyRate: number;
  standardCost: number;
  premiumCost: number;
  emergencyCost: number;
  totalCost: number;
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

  // Check if selected closure reason is "Complete" - only show billing for completed requests
  const selectedReason = closureReasons.find(r => r.id === selectedClosureReasonId);
  const isCompleteReason = selectedReason?.reason?.toLowerCase() === 'complete';

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
            <div className={`px-3 py-2 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border}`}>
              <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                {actualDurationMinutes || '0'} minutes
              </p>
              {actualDurationMinutes && parseFloat(actualDurationMinutes) > 0 && (
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  ({formatDuration(parseFloat(actualDurationMinutes))})
                </p>
              )}
            </div>
            {timeBreakdown && isCompleteReason && (
              <div className={`mt-3 p-3 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border}`}>
                {/* Total Time Calculation */}
                <div className={`mb-3 pb-3 border-b ${themeClasses.border}`}>
                  <p className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                    Time Calculation:
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className={themeClasses.text.secondary}>Total time tracked:</span>
                      <span className={`font-semibold ${themeClasses.text.primary}`}>
                        {(timeBreakdown.totalBillableHours + parseFloat(timeBreakdown.waivedHours)).toFixed(2)} hours
                      </span>
                    </div>
                    {timeBreakdown.isFirstServiceRequest && parseFloat(timeBreakdown.waivedHours) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-green-600 dark:text-green-400">
                          First hour waived (new client):
                        </span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          -{timeBreakdown.waivedHours} hours
                        </span>
                      </div>
                    )}
                    <div className={`flex justify-between pt-1 border-t ${themeClasses.border}`}>
                      <span className={`font-semibold ${themeClasses.text.primary}`}>Billable time:</span>
                      <span className={`font-bold ${themeClasses.text.primary}`}>
                        {timeBreakdown.totalBillableHours.toFixed(2)} hours
                      </span>
                    </div>
                  </div>
                </div>

                {/* Billable hours breakdown by tier */}
                <p className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                  Billable Hours by Rate Tier:
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

                {/* Cost Breakdown */}
                <div className={`mt-4 pt-4 border-t ${themeClasses.border}`}>
                  <p className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>
                    Cost Breakdown:
                  </p>
                  <div className="space-y-2 text-xs">
                    {/* Standard Cost */}
                    {timeBreakdown.standardBillableHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className={themeClasses.text.secondary}>
                          Standard ({timeBreakdown.standardBillableHours.toFixed(2)} hrs × ${timeBreakdown.standardRate.toFixed(2)})
                        </span>
                        <span className={`font-semibold ${themeClasses.text.primary}`}>
                          ${timeBreakdown.standardCost.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {/* Premium Cost */}
                    {timeBreakdown.premiumBillableHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className={themeClasses.text.secondary}>
                          Premium ({timeBreakdown.premiumBillableHours.toFixed(2)} hrs × ${timeBreakdown.premiumRate.toFixed(2)})
                        </span>
                        <span className={`font-semibold ${themeClasses.text.primary}`}>
                          ${timeBreakdown.premiumCost.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {/* Emergency Cost */}
                    {timeBreakdown.emergencyBillableHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className={themeClasses.text.secondary}>
                          Emergency ({timeBreakdown.emergencyBillableHours.toFixed(2)} hrs × ${timeBreakdown.emergencyRate.toFixed(2)})
                        </span>
                        <span className={`font-semibold ${themeClasses.text.primary}`}>
                          ${timeBreakdown.emergencyCost.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Total Cost */}
                  <div className={`mt-3 pt-3 border-t ${themeClasses.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${themeClasses.text.primary}`}>Total Cost:</span>
                    <span className={`text-lg font-bold text-teal-600 dark:text-teal-400`}>
                      ${timeBreakdown.totalCost.toFixed(2)}
                    </span>
                  </div>
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
