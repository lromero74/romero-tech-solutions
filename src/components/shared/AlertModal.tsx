import React from 'react';
import { X, AlertTriangle, CheckCircle, Info, MapPin } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  suggestedAreas?: string[];
  serviceStates?: string[];
  geographicallyRelevant?: boolean;
}

const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  type,
  title,
  message,
  suggestedAreas,
  serviceStates,
  geographicallyRelevant = false
}) => {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          textColor: 'text-red-800 dark:text-red-200',
          iconColor: 'text-red-600 dark:text-red-400',
          Icon: AlertTriangle
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          textColor: 'text-yellow-800 dark:text-yellow-200',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          Icon: AlertTriangle
        };
      case 'success':
        return {
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          textColor: 'text-green-800 dark:text-green-200',
          iconColor: 'text-green-600 dark:text-green-400',
          Icon: CheckCircle
        };
      case 'info':
      default:
        return {
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          textColor: 'text-blue-800 dark:text-blue-200',
          iconColor: 'text-blue-600 dark:text-blue-400',
          Icon: Info
        };
    }
  };

  const { bgColor, borderColor, textColor, iconColor, Icon } = getTypeStyles();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
        {/* Modal */}
        <div className={`relative w-full max-w-md ${themeClasses.bg.modal} rounded-lg shadow-xl border ${themeClasses.border.primary}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center">
              <Icon className={`w-5 h-5 ${iconColor} mr-3`} />
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                {title}
              </h3>
            </div>
            <button
              onClick={onClose}
              className={`p-1 rounded-md hover:${themeClasses.bg.hover} ${themeClasses.text.secondary}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Main Message */}
            <div className={`p-3 rounded-md ${bgColor} border ${borderColor}`}>
              <p className={`text-sm ${textColor}`}>
                {message}
              </p>
            </div>

            {/* Suggested Areas */}
            {suggestedAreas && suggestedAreas.length > 0 && (
              <div className={`p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800`}>
                <div className="flex items-start">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-3 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      {geographicallyRelevant ? 'Suggested locations in your area:' : 'Available service locations:'}
                    </p>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      {suggestedAreas.map((area, index) => (
                        <li key={index} className="flex items-center">
                          <MapPin className="w-3 h-3 mr-2 flex-shrink-0" />
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Service States */}
            {serviceStates && serviceStates.length > 0 && (
              <div className={`p-3 rounded-md ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
                <div className="flex items-start">
                  <MapPin className={`w-4 h-4 ${themeClasses.text.muted} mr-3 flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <p className={`text-sm ${themeClasses.text.secondary} mb-2`}>
                      We currently provide services in: {serviceStates.join(', ')}
                    </p>
                    <p className={`text-xs ${themeClasses.text.muted}`}>
                      Contact us to discuss expanding our services to your area.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end p-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AlertModal;