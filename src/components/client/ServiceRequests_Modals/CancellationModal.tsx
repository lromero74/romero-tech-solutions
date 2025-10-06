import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ServiceRequest } from './types';
import { getHoursUntilStart } from './utils';

interface CancellationModalProps {
  showModal: boolean;
  cancellingRequest: ServiceRequest | null;
  cancellationReason: string;
  isCancelling: boolean;
  t: (key: string, params?: any, fallback?: string) => string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const CancellationModal: React.FC<CancellationModalProps> = ({
  showModal,
  cancellingRequest,
  cancellationReason,
  isCancelling,
  t,
  onReasonChange,
  onConfirm,
  onClose
}) => {
  if (!showModal || !cancellingRequest) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => !isCancelling && onClose()} />

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 sm:mx-0 sm:h-10 sm:w-10">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  {t('serviceRequests.cancelModal.title', undefined, 'Cancel Service Request')}
                </h3>
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('serviceRequests.cancelModal.confirmMessage', {
                      requestNumber: cancellingRequest.requestNumber
                    }, 'Are you sure you want to cancel service request {{requestNumber}}?')}
                  </p>

                  {/* Late Cancellation Warning */}
                  {getHoursUntilStart(cancellingRequest) < 1 && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
                            {t('serviceRequests.cancelModal.lateFeeWarning', undefined, '⚠️ Late Cancellation Fee')}
                          </h4>
                          <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                            {t('serviceRequests.cancelModal.lateFeeMessage', undefined,
                              'This service request starts in less than 1 hour. A late cancellation fee may apply.')}
                          </p>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                            {t('serviceRequests.cancelModal.hoursNotice', {
                              hours: getHoursUntilStart(cancellingRequest).toFixed(2)
                            }, 'Hours of notice: {{hours}}')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Reason */}
                  <div>
                    <label htmlFor="cancellationReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('serviceRequests.cancelModal.reasonLabel', undefined, 'Reason for cancellation (optional)')}
                    </label>
                    <textarea
                      id="cancellationReason"
                      rows={3}
                      value={cancellationReason}
                      onChange={(e) => onReasonChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder={t('serviceRequests.cancelModal.reasonPlaceholder', undefined, 'Please provide a reason for cancellation...')}
                      disabled={isCancelling}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isCancelling}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCancelling ? (
                <>
                  <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                  {t('serviceRequests.cancelModal.cancelling', undefined, 'Cancelling...')}
                </>
              ) : (
                t('serviceRequests.cancelModal.confirm', undefined, 'Yes, Cancel Request')
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isCancelling}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('general.cancel', undefined, 'Cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancellationModal;
