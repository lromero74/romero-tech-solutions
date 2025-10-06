import React, { useState, useEffect } from 'react';
import { X, Save, HardDrive, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';

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
  const [softLimitGB, setSoftLimitGB] = useState(10);
  const [hardLimitGB, setHardLimitGB] = useState(15);
  const [warningPercent, setWarningPercent] = useState(80);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentQuota) {
      setSoftLimitGB(Math.round(currentQuota.softLimitBytes / (1024 * 1024 * 1024)));
      setHardLimitGB(Math.round(currentQuota.hardLimitBytes / (1024 * 1024 * 1024)));
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
      const response = await fetch('/api/admin/global-quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          softLimitBytes: softLimitGB * 1024 * 1024 * 1024,
          hardLimitBytes: hardLimitGB * 1024 * 1024 * 1024,
          warningThresholdPercent: warningPercent
        })
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to save quota settings');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${themeClasses.container} rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <HardDrive className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className={`text-xl font-bold ${themeClasses.text}`}>
              Global Quota Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className={`h-5 w-5 ${themeClasses.text}`} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}

        {/* Info Box */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className={`text-sm ${themeClasses.text}`}>
            These settings define the default storage quota for all clients. Individual clients can be assigned custom quotas that override these defaults.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Soft Limit */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>
              Soft Limit (GB)
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={softLimitGB}
              onChange={(e) => setSoftLimitGB(parseInt(e.target.value) || 0)}
              className={`w-full px-4 py-2 rounded-lg border ${themeClasses.input}`}
            />
            <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
              Warning threshold - clients will receive warnings when approaching this limit
            </p>
          </div>

          {/* Hard Limit */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>
              Hard Limit (GB)
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={hardLimitGB}
              onChange={(e) => setHardLimitGB(parseInt(e.target.value) || 0)}
              className={`w-full px-4 py-2 rounded-lg border ${themeClasses.input}`}
            />
            <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
              Maximum storage - file uploads will be blocked when this limit is reached
            </p>
          </div>

          {/* Warning Threshold */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>
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
              <span className={`text-lg font-semibold ${themeClasses.text} w-16 text-right`}>
                {warningPercent}%
              </span>
            </div>
            <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
              Show warnings when usage exceeds this percentage of the soft limit
            </p>
          </div>

          {/* Preview */}
          <div className={`p-4 rounded-lg ${themeClasses.cardBg} border border-gray-200 dark:border-gray-700`}>
            <h3 className={`text-sm font-semibold ${themeClasses.text} mb-3`}>Preview</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className={themeClasses.mutedText}>Soft Limit:</span>
                <span className={themeClasses.text}>{softLimitGB} GB</span>
              </div>
              <div className="flex justify-between">
                <span className={themeClasses.mutedText}>Hard Limit:</span>
                <span className={themeClasses.text}>{hardLimitGB} GB</span>
              </div>
              <div className="flex justify-between">
                <span className={themeClasses.mutedText}>Warning at:</span>
                <span className={themeClasses.text}>
                  {Math.round((softLimitGB * warningPercent) / 100 * 10) / 10} GB ({warningPercent}% of soft limit)
                </span>
              </div>
              <div className="flex justify-between">
                <span className={themeClasses.mutedText}>Buffer zone:</span>
                <span className={themeClasses.text}>
                  {hardLimitGB - softLimitGB} GB ({Math.round(((hardLimitGB - softLimitGB) / hardLimitGB) * 100)}% of hard limit)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg border ${themeClasses.button}`}
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
