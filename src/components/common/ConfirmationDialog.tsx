import React, { useEffect } from 'react';
import { AlertTriangle, UserCheck, Info, Clock } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: 'red' | 'blue' | 'green' | 'grey';
  iconType?: 'warning' | 'success' | 'info' | 'timeout';
  showCancelButton?: boolean;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  confirmButtonColor = 'red',
  iconType = 'warning',
  showCancelButton = true
}) => {
  // Theme-aware classes using Tailwind's dark mode
  const themeClasses = {
    bg: {
      modal: 'bg-white dark:bg-gray-800',
      primary: 'bg-white dark:bg-gray-800',
      hover: 'hover:bg-gray-50 dark:hover:bg-gray-700'
    },
    text: {
      primary: 'text-gray-900 dark:text-gray-100',
      secondary: 'text-gray-600 dark:text-gray-300'
    },
    border: {
      primary: 'border-gray-300 dark:border-gray-600'
    }
  };

  // Handle ESC key to cancel dialog (only if cancel button is shown)
  useEffect(() => {
    if (!isOpen || !showCancelButton) return;

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, showCancelButton, onClose]);

  if (!isOpen) return null;

  const confirmButtonClasses = {
    red: 'px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500',
    blue: 'px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
    green: 'px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
    grey: 'px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500'
  };

  const getIconAndColor = () => {
    switch (iconType) {
      case 'success':
        return {
          icon: <UserCheck className="h-6 w-6 text-green-500" />,
          bgColor: 'bg-green-100',
        };
      case 'info':
        return {
          icon: <Info className="h-6 w-6 text-blue-500" />,
          bgColor: 'bg-blue-100',
        };
      case 'timeout':
        return {
          icon: <Clock className="h-6 w-6 text-gray-500" />,
          bgColor: 'bg-gray-100',
        };
      case 'warning':
      default:
        return {
          icon: <AlertTriangle className="h-6 w-6 text-orange-400" />,
          bgColor: 'bg-orange-100',
        };
    }
  };

  const { icon, bgColor } = getIconAndColor();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className={`${themeClasses.bg.modal} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}>
        <div className="flex items-center mb-4">
          <div className={`flex-shrink-0 p-2 rounded-full ${bgColor}`}>
            {icon}
          </div>
          <div className="ml-3">
            <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
              {title}
            </h3>
          </div>
        </div>
        <div className="mb-6">
          <p className={`text-sm ${themeClasses.text.secondary}`}>
            {message}
          </p>
        </div>
        <div className={`flex ${showCancelButton ? 'justify-end space-x-3' : 'justify-center'}`}>
          {showCancelButton && (
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              {cancelButtonText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={confirmButtonClasses[confirmButtonColor]}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;