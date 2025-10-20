import React, { useState, useEffect } from 'react';
import { X, Monitor, AlertCircle, Check } from 'lucide-react';
import { agentService } from '../../services/agentService';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

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
  const { t } = useClientLanguage();
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
      setError(t('devices.settings.error_name_required', {}, 'Device name is required'));
      return;
    }

    if (!deviceType) {
      setError(t('devices.settings.error_type_required', {}, 'Device type is required'));
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
        setSuccess(t('devices.settings.success_message', {}, 'Device settings updated successfully!'));
        onUpdate?.();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(response.message || t('devices.settings.error_update_failed', {}, 'Failed to update device settings'));
      }
    } catch (err) {
      console.error('Error updating device:', err);
      setError(err instanceof Error ? err.message : t('devices.settings.error_update_failed', {}, 'Failed to update device settings'));
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
            {t('devices.settings.title', {}, 'Device Settings')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t('devices.settings.close', {}, 'Close')}
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
                <p>{t('devices.settings.info_notice', {}, 'Customize your device name and type. These changes will be reflected in your monitoring dashboard.')}</p>
              </div>
            </div>
          </div>

          {/* Device Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('devices.settings.device_name', {}, 'Device Name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3"
              disabled={updating}
              placeholder={t('devices.settings.placeholder', {}, 'e.g., My MacBook Pro')}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('devices.settings.friendly_name_helper', {}, 'Give your device a friendly name')}
            </p>
          </div>

          {/* Device Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Monitor className="w-4 h-4 inline mr-1" />
              {t('devices.settings.device_type', {}, 'Device Type')} <span className="text-red-500">*</span>
            </label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3 pr-10 appearance-none bg-no-repeat bg-right"
              disabled={updating}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="">{t('devices.settings.select_device_type', {}, 'Select device type')}</option>
              <option value="laptop">{t('devices.types.laptop', {}, 'Laptop')}</option>
              <option value="desktop">{t('devices.types.desktop', {}, 'Desktop')}</option>
              <option value="workstation">{t('devices.types.workstation', {}, 'Workstation')}</option>
              <option value="server">{t('devices.types.server', {}, 'Server')}</option>
              <option value="mobile">{t('devices.types.mobile', {}, 'Mobile')}</option>
              <option value="tablet">{t('devices.types.tablet', {}, 'Tablet')}</option>
              <option value="other">{t('devices.types.other', {}, 'Other')}</option>
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
            {t('devices.settings.cancel', {}, 'Cancel')}
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating || !deviceName.trim() || !deviceType}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {updating ? t('devices.settings.saving', {}, 'Saving...') : t('devices.settings.save_changes', {}, 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceSettingsModal;
