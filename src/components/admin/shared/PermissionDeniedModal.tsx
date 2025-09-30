/**
 * Permission Denied Modal
 *
 * Generic modal for displaying permission denial messages.
 * Shows helpful information about why the action was denied and what role is required.
 *
 * Usage:
 *   import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
 *
 *   <PermissionDeniedModal
 *     isOpen={showDenied}
 *     onClose={() => setShowDenied(false)}
 *     action="Delete Business"
 *     requiredPermission="hardDelete.businesses.enable"
 *     userRoles="Administrator"
 *     reason="Your role does not have the required permission"
 *   />
 */

import React from 'react';
import { X, ShieldAlert, Lock, Info } from 'lucide-react';

interface PermissionDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
  requiredPermission?: string;
  userRoles?: string;
  reason?: string;
  message?: string;
  code?: string;
}

export const PermissionDeniedModal: React.FC<PermissionDeniedModalProps> = ({
  isOpen,
  onClose,
  action = 'Perform this action',
  requiredPermission,
  userRoles,
  reason,
  message,
  code
}) => {
  if (!isOpen) return null;

  // Parse permission key to make it more readable
  const formatPermissionKey = (key: string | undefined): string => {
    if (!key) return 'unknown permission';

    const parts = key.split('.');
    if (parts.length >= 2) {
      const actionType = parts[0].replace(/([A-Z])/g, ' $1').trim();
      const resourceType = parts[1].replace(/_/g, ' ');
      return `${actionType} ${resourceType}`;
    }

    return key;
  };

  // Determine icon and styling based on code
  const getIconAndStyle = () => {
    if (code === 'LAST_RECORD_PROTECTION') {
      return {
        icon: <ShieldAlert className="w-16 h-16 text-yellow-500" />,
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-800'
      };
    } else if (code === 'EXECUTIVE_IMMUTABLE') {
      return {
        icon: <Lock className="w-16 h-16 text-blue-500" />,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-800'
      };
    } else {
      return {
        icon: <Lock className="w-16 h-16 text-red-500" />,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800'
      };
    }
  };

  const { icon, bgColor, borderColor, textColor } = getIconAndStyle();

  const getRequiredRoleHint = (permissionKey: string | undefined): string | null => {
    if (!permissionKey) return null;

    if (permissionKey.startsWith('hardDelete.')) {
      return 'Executive role required';
    } else if (permissionKey.startsWith('modify.role_permissions.')) {
      return 'Executive role required';
    } else if (permissionKey.startsWith('view.permission_audit_log.')) {
      return 'Executive role required';
    } else if (permissionKey.startsWith('softDelete.')) {
      return 'Admin or Executive role required';
    } else if (permissionKey.startsWith('add.businesses.')) {
      return 'Sales or Executive role required';
    } else if (permissionKey.startsWith('modify.businesses.')) {
      return 'Sales, Admin, or Executive role required';
    }

    return null;
  };

  const roleHint = getRequiredRoleHint(requiredPermission);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-lg shadow-2xl max-w-md w-full relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>

          {/* Content */}
          <div className="p-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              {icon}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-4">
              Permission Denied
            </h2>

            {/* Message */}
            <p className="text-center text-gray-700 mb-6">
              {message || `You don't have permission to ${action.toLowerCase()}.`}
            </p>

            {/* Details */}
            <div className={`${bgColor} ${borderColor} border rounded-lg p-4 space-y-3`}>
              {/* Action attempted */}
              {action && (
                <div className="flex items-start gap-2">
                  <Info className={`w-5 h-5 ${textColor} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>Action Attempted:</p>
                    <p className="text-sm text-gray-700">{action}</p>
                  </div>
                </div>
              )}

              {/* Required permission */}
              {requiredPermission && (
                <div className="flex items-start gap-2">
                  <Lock className={`w-5 h-5 ${textColor} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>Required Permission:</p>
                    <p className="text-sm text-gray-700 font-mono">{formatPermissionKey(requiredPermission)}</p>
                    {roleHint && (
                      <p className={`text-xs ${textColor} mt-1`}>({roleHint})</p>
                    )}
                  </div>
                </div>
              )}

              {/* Current roles */}
              {userRoles && (
                <div className="flex items-start gap-2">
                  <ShieldAlert className={`w-5 h-5 ${textColor} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>Your Role:</p>
                    <p className="text-sm text-gray-700">{userRoles}</p>
                  </div>
                </div>
              )}

              {/* Reason */}
              {reason && reason !== message && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <p className="text-sm text-gray-600 italic">{reason}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Understood
              </button>
            </div>

            {/* Help text */}
            <p className="text-xs text-gray-500 text-center mt-4">
              Contact your system administrator if you believe you should have access to this feature.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PermissionDeniedModal;