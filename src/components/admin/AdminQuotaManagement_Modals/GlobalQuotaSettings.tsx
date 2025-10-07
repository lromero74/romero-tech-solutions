import React, { useState, useEffect } from 'react';
import { X, Save, HardDrive, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import apiService from '../../../services/apiService';

interface GlobalQuota {
  id: string;
  softLimitBytes: number;
  hardLimitBytes: number;
  warningThresholdPercent: number;
  isActive: boolean;
}

interface Props {
  currentQuota: GlobalQuota | null;
  onClose: () => void;
  onSave: () => void;
}

const GlobalQuotaSettings: React.FC<Props> = ({ currentQuota, onClose, onSave }) => {
  const [softLimitGB, setSoftLimitGB] = useState(10.00);
  const [hardLimitGB, setHardLimitGB] = useState(15.00);
  const [warningPercent, setWarningPercent] = useState(80);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentQuota) {
      setSoftLimitGB(parseFloat((currentQuota.softLimitBytes / (1024 * 1024 * 1024)).toFixed(2)));
      setHardLimitGB(parseFloat((currentQuota.hardLimitBytes / (1024 * 1024 * 1024)).toFixed(2)));
      setWarningPercent(currentQuota.warningThresholdPercent);
    }
  }, [currentQuota]);

  const handleSave = async () => {
    // Validation
    if (hardLimitGB <= softLimitGB) {
      setError('Hard limit must be greater than soft limit');
      return;
    }

    if (warningPercent < 50 || warningPercent > 100) {
      setError('Warning threshold must be between 50% and 100%');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await apiService.put('/admin/global-quotas', {
        maxFileSizeBytes: Math.round(100 * 1024 * 1024), // 100 MB default max file size
        maxTotalStorageBytes: Math.round(hardLimitGB * 1024 * 1024 * 1024),
        maxFileCount: 10000, // Default max file count
        storageSoftLimitBytes: Math.round(softLimitGB * 1024 * 1024 * 1024),
        warningThresholdPercentage: warningPercent,
        alertThresholdPercentage: 95 // Default alert at 95%
      });

      if (response.success) {
        onSave();
      } else {
        setError(response.message || 'Failed to save quota settings');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <HardDrive className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Global Quota Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-900 dark:text-white" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          </div>
        )}

        {/* Info Box */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-gray-900 dark:text-white">
            These settings define the default storage quota for all clients. Individual clients can be assigned custom quotas that override these defaults.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Soft Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Soft Limit (GB)
            </label>
            <input
              type="number"
              min="0.01"
              max="1000"
              step="0.01"
              value={softLimitGB}
              onChange={(e) => setSoftLimitGB(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Warning threshold - clients will receive warnings when approaching this limit
            </p>
          </div>

          {/* Hard Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Hard Limit (GB)
            </label>
            <input
              type="number"
              min="0.01"
              max="1000"
              step="0.01"
              value={hardLimitGB}
              onChange={(e) => setHardLimitGB(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Maximum storage - file uploads will be blocked when this limit is reached
            </p>
          </div>

          {/* Warning Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Warning Threshold (%)
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="50"
                max="100"
                value={warningPercent}
                onChange={(e) => setWarningPercent(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-lg font-semibold text-gray-900 dark:text-white w-16 text-right">
                {warningPercent}%
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Show warnings when usage exceeds this percentage of the soft limit
            </p>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Preview</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Soft Limit:</span>
                <span className="text-gray-900 dark:text-white">{softLimitGB.toFixed(2)} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Hard Limit:</span>
                <span className="text-gray-900 dark:text-white">{hardLimitGB.toFixed(2)} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Warning at:</span>
                <span className="text-gray-900 dark:text-white">
                  {((softLimitGB * warningPercent) / 100).toFixed(2)} GB ({warningPercent}% of soft limit)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Buffer zone:</span>
                <span className="text-gray-900 dark:text-white">
                  {(hardLimitGB - softLimitGB).toFixed(2)} GB ({Math.round(((hardLimitGB - softLimitGB) / hardLimitGB) * 100)}% of hard limit)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalQuotaSettings;
