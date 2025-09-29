import React, { useState, useEffect } from 'react';
import { Shield, Users, Globe, Save, Eye, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { adminService } from '../../services/adminService';
import AlertModal from '../AlertModal';

interface SignupStats {
  date: string;
  globalLimit: number;
  ipLimit: number;
  currentGlobalCount: number;
  totalDatabaseAttempts: number;
  ipStats: Array<{
    ip_address: string;
    attempts: number;
    last_attempt: string;
  }>;
  resetTime: string;
  status: {
    globalLimitReached: boolean;
    highRiskIps: Array<{
      ip_address: string;
      attempts: number;
      last_attempt: string;
    }>;
  };
}

interface SystemSettings {
  signup_ip_daily_limit: number;
  signup_global_daily_limit: number;
}

const AdminSignupSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    signup_ip_daily_limit: 3,
    signup_global_daily_limit: 20
  });
  const [stats, setStats] = useState<SignupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, title: '', message: '', type: 'success' });

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await adminService.getSystemSettings();
      if (response.success) {
        const settingsData = response.data.reduce((acc: any, setting: any) => {
          if (setting.setting_key.startsWith('signup_')) {
            acc[setting.setting_key] = parseInt(setting.setting_value);
          }
          return acc;
        }, {
          signup_ip_daily_limit: 3,
          signup_global_daily_limit: 20
        });
        setSettings(settingsData);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to load signup settings',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/signup-stats`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (error) {
      console.error('Error loading signup stats:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        {
          setting_key: 'signup_ip_daily_limit',
          setting_value: settings.signup_ip_daily_limit.toString(),
          description: 'Maximum signups per day from the same IP address'
        },
        {
          setting_key: 'signup_global_daily_limit',
          setting_value: settings.signup_global_daily_limit.toString(),
          description: 'Maximum signups per day across all IP addresses'
        }
      ];

      const response = await adminService.updateSystemSettings(updates);
      if (response.success) {
        setAlertModal({
          show: true,
          title: 'Success',
          message: 'Signup rate limits updated successfully',
          type: 'success'
        });
        await loadStats(); // Refresh stats to show new limits
      } else {
        throw new Error(response.message || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to update signup settings',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading signup settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Signup Rate Limiting</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* IP Daily Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Signups per IP per Day
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={settings.signup_ip_daily_limit}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                signup_ip_daily_limit: parseInt(e.target.value) || 1
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Maximum number of signup attempts allowed from a single IP address per day
            </p>
          </div>

          {/* Global Daily Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Globe className="inline h-4 w-4 mr-1" />
              Total Signups per Day
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={settings.signup_global_daily_limit}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                signup_global_daily_limit: parseInt(e.target.value) || 1
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Maximum total signup attempts allowed across all IP addresses per day
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>

          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <Eye className="h-4 w-4" />
            {showStats ? 'Hide' : 'View'} Statistics
          </button>
        </div>
      </div>

      {/* Statistics Display */}
      {showStats && stats && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="h-6 w-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Today's Signup Activity</h3>
          </div>

          {/* Summary Cards */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.currentGlobalCount}</div>
              <div className="text-sm text-blue-700">Current Global Count</div>
              <div className="text-xs text-gray-500">Limit: {stats.globalLimit}</div>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{stats.totalDatabaseAttempts}</div>
              <div className="text-sm text-green-700">Total DB Attempts</div>
              <div className="text-xs text-gray-500">Logged today</div>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.status.highRiskIps.length}</div>
              <div className="text-sm text-yellow-700">High Risk IPs</div>
              <div className="text-xs text-gray-500">At limit</div>
            </div>

            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">
                {stats.status.globalLimitReached ? 'YES' : 'NO'}
              </div>
              <div className="text-sm text-red-700">Global Limit Reached</div>
              <div className="text-xs text-gray-500">
                <Clock className="inline h-3 w-3 mr-1" />
                Resets: {formatTime(stats.resetTime)}
              </div>
            </div>
          </div>

          {/* Status Alerts */}
          {(stats.status.globalLimitReached || stats.status.highRiskIps.length > 0) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Rate Limit Alerts</span>
              </div>
              {stats.status.globalLimitReached && (
                <div className="text-sm text-red-700 mb-1">
                  ⚠️ Global signup limit has been reached ({stats.currentGlobalCount}/{stats.globalLimit})
                </div>
              )}
              {stats.status.highRiskIps.length > 0 && (
                <div className="text-sm text-red-700">
                  ⚠️ {stats.status.highRiskIps.length} IP address(es) have reached the daily limit
                </div>
              )}
            </div>
          )}

          {/* IP Statistics Table */}
          {stats.ipStats.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">IP Address Activity</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Attempts
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Attempt
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.ipStats.map((ip, index) => (
                      <tr key={index} className={ip.attempts >= stats.ipLimit ? 'bg-red-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {ip.ip_address}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={ip.attempts >= stats.ipLimit ? 'text-red-600 font-semibold' : ''}>
                            {ip.attempts}/{stats.ipLimit}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatTime(ip.last_attempt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {ip.attempts >= stats.ipLimit ? (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                              At Limit
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Normal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.ipStats.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No signup attempts recorded today
            </div>
          )}
        </div>
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ ...alertModal, show: false })}
      />
    </div>
  );
};

export default AdminSignupSettings;