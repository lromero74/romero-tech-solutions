import React, { useState, useEffect } from 'react';
import { X, Save, Search, Users, HardDrive, AlertTriangle, RotateCcw } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';

interface ClientQuota {
  businessId: string;
  businessName: string;
  currentUsageBytes: number;
  softLimitBytes: number | null;
  hardLimitBytes: number | null;
  warningThresholdPercent: number | null;
  usagePercent: number;
  isOverLimit: boolean;
  isNearLimit: boolean;
  isUsingCustomQuota: boolean;
}

interface Props {
  onClose: () => void;
  onUpdate: () => void;
}

const ClientQuotaManager: React.FC<Props> = ({ onClose, onUpdate }) => {
  const [clients, setClients] = useState<ClientQuota[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientQuota[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [customSoftLimitGB, setCustomSoftLimitGB] = useState<number | null>(null);
  const [customHardLimitGB, setCustomHardLimitGB] = useState<number | null>(null);
  const [customWarningPercent, setCustomWarningPercent] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'custom' | 'default' | 'near-limit' | 'over-limit'>('all');

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    // Filter clients based on search term and status filter
    let filtered = clients;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.businessName.toLowerCase().includes(term));
    }

    // Apply status filter
    switch (filterStatus) {
      case 'custom':
        filtered = filtered.filter(c => c.isUsingCustomQuota);
        break;
      case 'default':
        filtered = filtered.filter(c => !c.isUsingCustomQuota);
        break;
      case 'near-limit':
        filtered = filtered.filter(c => c.isNearLimit);
        break;
      case 'over-limit':
        filtered = filtered.filter(c => c.isOverLimit);
        break;
    }

    setFilteredClients(filtered);
  }, [clients, searchTerm, filterStatus]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/client-quotas', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.data);
      } else {
        setError('Failed to load client quotas');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectClient = (client: ClientQuota) => {
    setSelectedClient(client.businessId);
    setCustomSoftLimitGB(client.softLimitBytes ? Math.round(client.softLimitBytes / (1024 * 1024 * 1024)) : null);
    setCustomHardLimitGB(client.hardLimitBytes ? Math.round(client.hardLimitBytes / (1024 * 1024 * 1024)) : null);
    setCustomWarningPercent(client.warningThresholdPercent);
    setError('');
  };

  const handleSaveQuota = async () => {
    if (!selectedClient) return;

    // Validation
    if (customSoftLimitGB !== null && customHardLimitGB !== null && customHardLimitGB <= customSoftLimitGB) {
      setError('Hard limit must be greater than soft limit');
      return;
    }

    if (customWarningPercent !== null && (customWarningPercent < 50 || customWarningPercent > 100)) {
      setError('Warning threshold must be between 50% and 100%');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/client-quotas/${selectedClient}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          softLimitBytes: customSoftLimitGB ? customSoftLimitGB * 1024 * 1024 * 1024 : null,
          hardLimitBytes: customHardLimitGB ? customHardLimitGB * 1024 * 1024 * 1024 : null,
          warningThresholdPercent: customWarningPercent
        })
      });

      if (response.ok) {
        await loadClients();
        setSelectedClient(null);
        setCustomSoftLimitGB(null);
        setCustomHardLimitGB(null);
        setCustomWarningPercent(null);
        onUpdate();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to save quota');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!selectedClient) return;
    if (!confirm('Reset this client to use the default global quota?')) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/client-quotas/${selectedClient}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        await loadClients();
        setSelectedClient(null);
        setCustomSoftLimitGB(null);
        setCustomHardLimitGB(null);
        setCustomWarningPercent(null);
        onUpdate();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to reset quota');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getUsageColor = (client: ClientQuota): string => {
    if (client.isOverLimit) return 'text-red-600';
    if (client.isNearLimit) return 'text-yellow-600';
    return themeClasses.text;
  };

  const getUsageBgColor = (client: ClientQuota): string => {
    if (client.isOverLimit) return 'bg-red-100 dark:bg-red-900/20';
    if (client.isNearLimit) return 'bg-yellow-100 dark:bg-yellow-900/20';
    return themeClasses.cardBg;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${themeClasses.container} rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className={`text-xl font-bold ${themeClasses.text}`}>
              Client Quota Management
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className={`ml-3 ${themeClasses.text}`}>Loading clients...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Client List */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-lg border ${themeClasses.input}`}
                  />
                </div>
              </div>

              {/* Filter Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1 rounded-lg text-sm ${filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  All ({clients.length})
                </button>
                <button
                  onClick={() => setFilterStatus('custom')}
                  className={`px-3 py-1 rounded-lg text-sm ${filterStatus === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Custom ({clients.filter(c => c.isUsingCustomQuota).length})
                </button>
                <button
                  onClick={() => setFilterStatus('default')}
                  className={`px-3 py-1 rounded-lg text-sm ${filterStatus === 'default' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Default ({clients.filter(c => !c.isUsingCustomQuota).length})
                </button>
                <button
                  onClick={() => setFilterStatus('near-limit')}
                  className={`px-3 py-1 rounded-lg text-sm ${filterStatus === 'near-limit' ? 'bg-yellow-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Near Limit ({clients.filter(c => c.isNearLimit).length})
                </button>
                <button
                  onClick={() => setFilterStatus('over-limit')}
                  className={`px-3 py-1 rounded-lg text-sm ${filterStatus === 'over-limit' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Over Limit ({clients.filter(c => c.isOverLimit).length})
                </button>
              </div>

              {/* Client List */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredClients.map(client => (
                  <div
                    key={client.businessId}
                    onClick={() => selectClient(client)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedClient === client.businessId
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                        : `${getUsageBgColor(client)} border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-semibold ${themeClasses.text}`}>
                        {client.businessName}
                      </span>
                      {client.isUsingCustomQuota && (
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={themeClasses.mutedText}>Usage:</span>
                      <span className={getUsageColor(client)}>
                        {formatBytes(client.currentUsageBytes)} ({client.usagePercent}%)
                      </span>
                    </div>
                    {client.hardLimitBytes && (
                      <div className="flex items-center justify-between text-sm">
                        <span className={themeClasses.mutedText}>Limit:</span>
                        <span className={themeClasses.text}>
                          {formatBytes(client.hardLimitBytes)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                {filteredClients.length === 0 && (
                  <div className={`text-center py-8 ${themeClasses.mutedText}`}>
                    No clients found
                  </div>
                )}
              </div>
            </div>

            {/* Client Details / Editor */}
            <div>
              {selectedClient ? (
                <div className={`p-6 rounded-lg ${themeClasses.cardBg} border border-gray-200 dark:border-gray-700`}>
                  <h3 className={`text-lg font-semibold ${themeClasses.text} mb-4`}>
                    Configure Quota
                  </h3>

                  <div className="space-y-4">
                    {/* Soft Limit */}
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text} mb-2`}>
                        Soft Limit (GB)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={customSoftLimitGB || ''}
                        onChange={(e) => setCustomSoftLimitGB(e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="Use default"
                        className={`w-full px-4 py-2 rounded-lg border ${themeClasses.input}`}
                      />
                      <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
                        Leave empty to use global default
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
                        value={customHardLimitGB || ''}
                        onChange={(e) => setCustomHardLimitGB(e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="Use default"
                        className={`w-full px-4 py-2 rounded-lg border ${themeClasses.input}`}
                      />
                      <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
                        Leave empty to use global default
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
                          value={customWarningPercent || 80}
                          onChange={(e) => setCustomWarningPercent(parseInt(e.target.value))}
                          className="flex-1"
                          disabled={customWarningPercent === null}
                        />
                        <span className={`text-lg font-semibold ${themeClasses.text} w-16 text-right`}>
                          {customWarningPercent || 80}%
                        </span>
                      </div>
                      <div className="mt-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={customWarningPercent !== null}
                            onChange={(e) => setCustomWarningPercent(e.target.checked ? 80 : null)}
                            className="mr-2"
                          />
                          <span className={`text-sm ${themeClasses.mutedText}`}>
                            Use custom threshold
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Preview */}
                    {(customSoftLimitGB || customHardLimitGB) && (
                      <div className={`p-4 rounded-lg ${themeClasses.cardBg} border border-gray-200 dark:border-gray-700`}>
                        <h4 className={`text-sm font-semibold ${themeClasses.text} mb-2`}>Preview</h4>
                        <div className="space-y-1 text-sm">
                          {customSoftLimitGB && (
                            <div className="flex justify-between">
                              <span className={themeClasses.mutedText}>Soft Limit:</span>
                              <span className={themeClasses.text}>{customSoftLimitGB} GB</span>
                            </div>
                          )}
                          {customHardLimitGB && (
                            <div className="flex justify-between">
                              <span className={themeClasses.mutedText}>Hard Limit:</span>
                              <span className={themeClasses.text}>{customHardLimitGB} GB</span>
                            </div>
                          )}
                          {customSoftLimitGB && customWarningPercent && (
                            <div className="flex justify-between">
                              <span className={themeClasses.mutedText}>Warning at:</span>
                              <span className={themeClasses.text}>
                                {Math.round((customSoftLimitGB * customWarningPercent) / 100 * 10) / 10} GB
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex space-x-3 pt-4">
                      <button
                        onClick={handleResetToDefault}
                        disabled={saving || !clients.find(c => c.businessId === selectedClient)?.isUsingCustomQuota}
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset to Default
                      </button>
                      <button
                        onClick={handleSaveQuota}
                        disabled={saving}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                      >
                        {saving ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Quota
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`p-12 rounded-lg ${themeClasses.cardBg} border border-gray-200 dark:border-gray-700 text-center`}>
                  <HardDrive className={`h-16 w-16 ${themeClasses.mutedText} mx-auto mb-4`} />
                  <p className={themeClasses.mutedText}>
                    Select a client to configure their quota
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientQuotaManager;
