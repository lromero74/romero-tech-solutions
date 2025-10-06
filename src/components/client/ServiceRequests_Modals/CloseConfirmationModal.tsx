import React from 'react';

interface CloseConfirmationModalProps {
  showModal: boolean;
  t: (key: string, params?: any, fallback?: string) => string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CloseConfirmationModal: React.FC<CloseConfirmationModalProps> = ({
  showModal,
  t,
  onConfirm,
  onCancel
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCancel} />

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              {t('serviceRequests.unsavedChanges', undefined, 'Unsaved Changes')}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {t('serviceRequests.unsavedChangesMessage', undefined, 'You have unsaved changes. Are you sure you want to close this service request? All unsaved changes will be lost.')}
            </p>

            <div className="sm:flex sm:flex-row-reverse gap-3">
              <button
                onClick={onConfirm}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm"
              >
                {t('serviceRequests.discardChanges', undefined, 'Discard Changes')}
              </button>
              <button
                onClick={onCancel}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
              >
                {t('general.cancel', undefined, 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloseConfirmationModal;
