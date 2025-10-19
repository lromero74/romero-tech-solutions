import React, { useState, useEffect } from 'react';
import { X, Monitor, AlertCircle, Check } from 'lucide-react';
import { agentService } from '../../services/agentService';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  currentDeviceName: string;
  currentDeviceType: string;
  onUpdate?: () => void;
}

const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  agentId,
  currentDeviceName,
  currentDeviceType,
  onUpdate,
}) => {
  const [deviceName, setDeviceName] = useState(currentDeviceName);
  const [deviceType, setDeviceType] = useState(currentDeviceType);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setDeviceName(currentDeviceName);
      setDeviceType(currentDeviceType);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, currentDeviceName, currentDeviceType]);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    if (!deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    if (!deviceType) {
      setError('Device type is required');
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      setSuccess(null);

      const response = await agentService.updateAgent(agentId, {
        device_name: deviceName.trim(),
        device_type: deviceType,
      });

      if (response.success) {
        setSuccess('Device settings updated successfully!');
        onUpdate?.();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(response.message || 'Failed to update device settings');
      }
    } catch (err) {
      console.error('Error updating device:', err);
      setError(err instanceof Error ? err.message : 'Failed to update device settings');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Device Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Info Notice */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p>Customize your device name and type. These changes will be reflected in your monitoring dashboard.</p>
              </div>
            </div>
          </div>

          {/* Device Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3"
              disabled={updating}
              placeholder="e.g., My MacBook Pro"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Give your device a friendly name
            </p>
          </div>

          {/* Device Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Monitor className="w-4 h-4 inline mr-1" />
              Device Type <span className="text-red-500">*</span>
            </label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3"
              disabled={updating}
            >
              <option value="">Select device type</option>
              <option value="laptop">Laptop</option>
              <option value="desktop">Desktop</option>
              <option value="workstation">Workstation</option>
              <option value="server">Server</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                <p className="text-green-800 dark:text-green-200">{success}</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            disabled={updating}
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating || !deviceName.trim() || !deviceType}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {updating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceSettingsModal;
