import React, { useState, useEffect } from 'react';
import { HardDrive, Settings, Users, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { themeClasses } from '../../contexts/ThemeContext';
import GlobalQuotaSettings from './AdminQuotaManagement_Modals/GlobalQuotaSettings';
import ClientQuotaManager from './AdminQuotaManagement_Modals/ClientQuotaManager';

interface GlobalQuota {
  id: string;
  softLimitBytes: number;
  hardLimitBytes: number;
  warningThresholdPercent: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface QuotaSummary {
  totalClients: number;
  clientsWithCustomQuotas: number;
  clientsUsingDefaultQuota: number;
  totalStorageUsed: number;
  averageUsagePercent: number;
  clientsNearLimit: number;
  clientsOverLimit: number;
}

const AdminQuotaManagement: React.FC = () => {
  const { checkPermission } = usePermission();

  // Permission checks
  const canManageGlobalQuotas = checkPermission('manage.global_quotas.enable');
  const canManageClientQuotas = checkPermission('manage.client_quotas.enable');
  const canViewQuotaStats = checkPermission('view.quota_statistics.enable');

  // State
  const [globalQuota, setGlobalQuota] = useState<GlobalQuota | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const [quotaResponse, summaryResponse] = await Promise.all([
        fetch('/api/admin/global-quotas/active', {
          credentials: 'include'
        }),
        fetch('/api/admin/global-quotas/summary', {
          credentials: 'include'
        })
      ]);

      if (quotaResponse.ok) {
        const quotaData = await quotaResponse.json();
        setGlobalQuota(quotaData.data);
      }

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setQuotaSummary(summaryData.data);
      }
    } catch (error) {
      console.error('Failed to load quota data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Permission denied view
  if (!canManageGlobalQuotas && !canManageClientQuotas && !canViewQuotaStats) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8 text-center`}>
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className={`text-xl font-semibold ${themeClasses.text} mb-2`}>
          Access Denied
        </h2>
        <p className={themeClasses.mutedText}>
          You don't have permission to access quota management.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${themeClasses.container} rounded-lg p-8`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <span className={`ml-3 ${themeClasses.text}`}>Loading quota information...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <HardDrive className="h-8 w-8 text-blue-500 mr-3" />
          <div>
            <h1 className={`text-2xl font-bold ${themeClasses.text}`}>
              Quota Management
            </h1>
            <p className={themeClasses.mutedText}>
              Manage storage quotas and monitor client usage
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw className={`h-5 w-5 ${themeClasses.text}`} />
        </button>
      </div>

      {/* Global Quota Card */}
      {canViewQuotaStats && globalQuota && (
        <div className={`${themeClasses.container} rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold ${themeClasses.text} flex items-center`}>
              <Settings className="h-5 w-5 mr-2" />
              Global Default Quota
            </h2>
            {canManageGlobalQuotas && (
              <button
                onClick={() => setShowGlobalSettings(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Configure
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Soft Limit</p>
              <p className={`text-xl font-semibold ${themeClasses.text}`}>
                {formatBytes(globalQuota.softLimitBytes)}
              </p>
              <p className={`text-xs ${themeClasses.mutedText} mt-1`}>Warning threshold</p>
            </div>

            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Hard Limit</p>
              <p className={`text-xl font-semibold ${themeClasses.text}`}>
                {formatBytes(globalQuota.hardLimitBytes)}
              </p>
              <p className={`text-xs ${themeClasses.mutedText} mt-1`}>Maximum allowed</p>
            </div>

            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Warning At</p>
              <p className={`text-xl font-semibold ${themeClasses.text}`}>
                {globalQuota.warningThresholdPercent}%
              </p>
              <p className={`text-xs ${themeClasses.mutedText} mt-1`}>Of soft limit</p>
            </div>
          </div>
        </div>
      )}

      {/* Usage Summary */}
      {canViewQuotaStats && quotaSummary && (
        <div className={`${themeClasses.container} rounded-lg p-6`}>
          <h2 className={`text-lg font-semibold ${themeClasses.text} mb-4 flex items-center`}>
            <Users className="h-5 w-5 mr-2" />
            Client Storage Overview
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Total Clients</p>
              <p className={`text-2xl font-bold ${themeClasses.text}`}>
                {quotaSummary.totalClients}
              </p>
            </div>

            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Custom Quotas</p>
              <p className={`text-2xl font-bold ${themeClasses.text}`}>
                {quotaSummary.clientsWithCustomQuotas}
              </p>
              <p className={`text-xs ${themeClasses.mutedText} mt-1`}>
                {quotaSummary.clientsUsingDefaultQuota} using default
              </p>
            </div>

            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <p className={`text-sm ${themeClasses.mutedText} mb-1`}>Total Storage Used</p>
              <p className={`text-2xl font-bold ${themeClasses.text}`}>
                {formatBytes(quotaSummary.totalStorageUsed)}
              </p>
              <p className={`text-xs ${themeClasses.mutedText} mt-1`}>
                Avg: {quotaSummary.averageUsagePercent}%
              </p>
            </div>

            <div className={`p-4 rounded-lg ${themeClasses.cardBg}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm ${themeClasses.mutedText}`}>Alerts</p>
                {(quotaSummary.clientsNearLimit > 0 || quotaSummary.clientsOverLimit > 0) && (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className={`text-sm ${themeClasses.mutedText}`}>Near limit:</span>
                  <span className={`text-sm font-semibold ${themeClasses.text}`}>
                    {quotaSummary.clientsNearLimit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={`text-sm ${themeClasses.mutedText}`}>Over limit:</span>
                  <span className={`text-sm font-semibold text-red-600`}>
                    {quotaSummary.clientsOverLimit}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Quota Management */}
      {canManageClientQuotas && (
        <div className={`${themeClasses.container} rounded-lg p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-lg font-semibold ${themeClasses.text} mb-1`}>
                Client-Specific Quotas
              </h2>
              <p className={themeClasses.mutedText}>
                Customize storage limits for individual clients
              </p>
            </div>
            <button
              onClick={() => setShowClientManager(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Manage Client Quotas
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showGlobalSettings && (
        <GlobalQuotaSettings
          currentQuota={globalQuota}
          onClose={() => setShowGlobalSettings(false)}
          onSave={() => {
            setShowGlobalSettings(false);
            loadData();
          }}
        />
      )}

      {showClientManager && (
        <ClientQuotaManager
          onClose={() => setShowClientManager(false)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
};

export default AdminQuotaManagement;
