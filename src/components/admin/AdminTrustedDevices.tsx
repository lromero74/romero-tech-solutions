import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Monitor,
  Tablet,
  Shield,
  ShieldAlert,
  Calendar,
  Clock,
  Edit3,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { trustedDeviceService } from '../../services/trustedDeviceService';
import { formatDeviceInfo } from '../../utils/deviceFingerprinting';

interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceInfo: any;
  isSharedDevice: boolean;
  lastUsed: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
}

interface TrustedDeviceStats {
  total_devices: number;
  active_devices: number;
  expired_devices: number;
  shared_devices: number;
  users_with_trusted_devices: number;
}

const AdminTrustedDevices: React.FC = () => {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [stats, setStats] = useState<TrustedDeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [includeRevoked]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load devices
      const devicesResponse = await trustedDeviceService.getTrustedDevices(includeRevoked);
      if (devicesResponse.success) {
        setDevices(devicesResponse.data || []);
      } else {
        setError('Failed to load trusted devices');
      }

      // Load stats (admin only)
      const statsResponse = await trustedDeviceService.getTrustedDeviceStats();
      if (statsResponse.success) {
        setStats(statsResponse.data);
      }
    } catch (err) {
      setError('Failed to load trusted device data');
      console.error('Error loading trusted devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to revoke this trusted device? The user will need to complete MFA on their next login.')) {
      return;
    }

    try {
      const response = await trustedDeviceService.revokeTrustedDevice(deviceId);
      if (response.success) {
        setSuccess('Trusted device revoked successfully');
        loadData();
      } else {
        setError(response.message || 'Failed to revoke trusted device');
      }
    } catch (err) {
      setError('Failed to revoke trusted device');
      console.error('Error revoking device:', err);
    }
  };

  const handleRevokeAllDevices = async () => {
    if (!confirm('Are you sure you want to revoke ALL trusted devices for your account? You will need to complete MFA on all devices.')) {
      return;
    }

    try {
      const response = await trustedDeviceService.revokeAllTrustedDevices();
      if (response.success) {
        setSuccess(`${response.revokedCount || 0} trusted devices revoked successfully`);
        loadData();
      } else {
        setError(response.message || 'Failed to revoke trusted devices');
      }
    } catch (err) {
      setError('Failed to revoke trusted devices');
      console.error('Error revoking all devices:', err);
    }
  };

  const handleRenameDevice = async (deviceId: string) => {
    if (!newDeviceName.trim()) {
      setError('Device name cannot be empty');
      return;
    }

    try {
      const response = await trustedDeviceService.renameTrustedDevice(deviceId, newDeviceName.trim());
      if (response.success) {
        setSuccess('Device renamed successfully');
        setEditingDevice(null);
        setNewDeviceName('');
        loadData();
      } else {
        setError(response.message || 'Failed to rename device');
      }
    } catch (err) {
      setError('Failed to rename device');
      console.error('Error renaming device:', err);
    }
  };

  const handleExtendDevice = async (deviceId: string) => {
    try {
      const response = await trustedDeviceService.extendTrustedDevice(deviceId, 30);
      if (response.success) {
        setSuccess('Device trust extended by 30 days');
        loadData();
      } else {
        setError(response.message || 'Failed to extend device trust');
      }
    } catch (err) {
      setError('Failed to extend device trust');
      console.error('Error extending device:', err);
    }
  };

  const getDeviceIcon = (deviceInfo: any) => {
    const userAgent = deviceInfo.userAgent?.toLowerCase() || '';
    if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
      return <Smartphone className="w-5 h-5" />;
    } else if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
      return <Tablet className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const getSecurityLevel = (device: TrustedDevice) => {
    if (device.isSharedDevice) return 'low';
    if (device.revoked) return 'revoked';
    if (new Date(device.expiresAt) < new Date()) return 'expired';
    return 'active';
  };

  const getSecurityBadge = (level: string) => {
    switch (level) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Expired
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Revoked
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Shared Device
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
      return `Expired ${Math.abs(diffInDays)} days ago`;
    } else if (diffInDays === 0) {
      return 'Expires today';
    } else if (diffInDays === 1) {
      return 'Expires tomorrow';
    } else {
      return `Expires in ${diffInDays} days`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading trusted devices...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Shield className="w-6 h-6 mr-2 text-blue-600" />
            Trusted Devices
          </h2>
          <p className="text-gray-600 mt-1">
            Manage devices that can skip MFA verification
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeRevoked}
              onChange={(e) => setIncludeRevoked(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Show revoked</span>
          </label>

          {devices.length > 0 && (
            <button
              onClick={handleRevokeAllDevices}
              className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Shield className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Devices</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.total_devices}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.active_devices}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Expired</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.expired_devices}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-orange-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Shared</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.shared_devices}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Monitor className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Users</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.users_with_trusted_devices}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Success</h3>
              <div className="mt-2 text-sm text-green-700">
                <p>{success}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Devices List */}
      {devices.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No trusted devices</h3>
          <p className="mt-1 text-sm text-gray-500">
            No devices have been registered as trusted for MFA bypass.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {devices.map((device) => (
              <li key={device.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getDeviceIcon(device.deviceInfo)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        {editingDevice === device.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={newDeviceName}
                              onChange={(e) => setNewDeviceName(e.target.value)}
                              className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                              placeholder="Enter device name"
                            />
                            <button
                              onClick={() => handleRenameDevice(device.id)}
                              className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingDevice(null);
                                setNewDeviceName('');
                              }}
                              className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h4 className="text-sm font-medium text-gray-900">{device.deviceName}</h4>
                            {!device.revoked && (
                              <button
                                onClick={() => {
                                  setEditingDevice(device.id);
                                  setNewDeviceName(device.deviceName);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                        {getSecurityBadge(getSecurityLevel(device))}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {formatDeviceInfo(device.deviceInfo)}
                      </div>

                      <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          Created {formatDate(device.createdAt)}
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          Last used {formatDate(device.lastUsed)}
                        </span>
                        {!device.revoked && (
                          <span className="flex items-center">
                            <Info className="w-3 h-3 mr-1" />
                            {formatRelativeTime(device.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {!device.revoked && new Date(device.expiresAt) > new Date() && (
                      <button
                        onClick={() => handleExtendDevice(device.id)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Extend 30d
                      </button>
                    )}

                    {!device.revoked && (
                      <button
                        onClick={() => handleRevokeDevice(device.id)}
                        className="inline-flex items-center px-3 py-1 border border-red-300 shadow-sm text-xs font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Revoke
                      </button>
                    )}
                  </div>
                </div>

                {device.isSharedDevice && (
                  <div className="mt-2 p-2 bg-orange-50 rounded-md">
                    <div className="flex">
                      <AlertTriangle className="h-4 w-4 text-orange-400" />
                      <div className="ml-2">
                        <p className="text-xs text-orange-700">
                          This device was detected as shared/public and should not bypass MFA.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-md bg-blue-50 p-4">
        <div className="flex">
          <Info className="h-5 w-5 text-blue-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">About Trusted Devices</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Trusted devices allow users to skip MFA verification for up to 30 days. Devices are automatically
                expired and removed when they haven't been used. Shared or public devices cannot be registered
                as trusted for security reasons.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTrustedDevices;