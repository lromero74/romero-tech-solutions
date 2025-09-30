import React, { useState, useEffect } from 'react';
import {
  Shield,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Calendar,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { trustedDeviceService } from '../../services/trustedDeviceService';
import AlertModal from './AlertModal';

interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceInfo: {
    userAgent: string;
    platform: string;
    screenResolution: string;
    timezone: string;
    language: string;
    geolocation?: {
      city?: string;
      region?: string;
      country?: string;
      ip?: string;
      timestamp: string;
    };
  };
  isSharedDevice: boolean;
  lastUsed: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
}

interface TrustedDeviceManagementProps {
  isDarkMode?: boolean;
}

const TrustedDeviceManagement: React.FC<TrustedDeviceManagementProps> = ({ isDarkMode = false }) => {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<{ deviceId: string; deviceName: string } | null>(null);

  const themeClasses = {
    container: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    card: isDarkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200',
    cardHover: isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
    button: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonDanger: isDarkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await trustedDeviceService.getTrustedDevices(false);
      if (response.success && response.data) {
        setDevices(response.data);
      } else {
        setError(response.message || 'Failed to load trusted devices');
      }
    } catch (err) {
      setError('Failed to load trusted devices');
      console.error('Error loading trusted devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      const response = await trustedDeviceService.revokeTrustedDevice(deviceId);
      if (response.success) {
        await loadDevices(); // Reload devices
        setShowRevokeConfirm(null);
      } else {
        setError(response.message || 'Failed to revoke device');
      }
    } catch (err) {
      setError('Failed to revoke device');
      console.error('Error revoking device:', err);
    } finally {
      setRevoking(null);
    }
  };

  const getDeviceIcon = (deviceInfo: TrustedDevice['deviceInfo']) => {
    const userAgent = deviceInfo.userAgent.toLowerCase();
    if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
      return <Smartphone className="h-6 w-6" />;
    } else if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
      return <Tablet className="h-6 w-6" />;
    }
    return <Monitor className="h-6 w-6" />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLocationString = (geolocation?: TrustedDevice['deviceInfo']['geolocation']) => {
    if (!geolocation) return 'Location unknown';
    const parts = [geolocation.city, geolocation.region, geolocation.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location unknown';
  };

  const isExpiringSoon = (expiresAt: string) => {
    const daysUntilExpiry = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry < 7;
  };

  if (loading) {
    return (
      <div className={`rounded-lg border p-6 ${themeClasses.container}`}>
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className={themeClasses.textSecondary}>Loading trusted devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Shield className={`h-6 w-6 mr-2 ${themeClasses.text}`} />
          <h2 className={`text-xl font-semibold ${themeClasses.text}`}>Trusted Devices</h2>
        </div>
        <button
          onClick={loadDevices}
          className={`flex items-center px-3 py-2 rounded-md ${themeClasses.button}`}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-md border border-red-200 bg-red-50 text-red-800">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className={`p-4 rounded-md border ${themeClasses.card}`}>
        <p className={`text-sm ${themeClasses.textSecondary}`}>
          <Shield className="h-4 w-4 inline mr-1" />
          Trusted devices allow you to skip MFA verification for routine actions. Devices are trusted for 30 days
          and can be revoked at any time. Only register devices you personally own and use regularly.
        </p>
      </div>

      {/* Devices List */}
      {devices.length === 0 ? (
        <div className={`rounded-lg border p-8 text-center ${themeClasses.container}`}>
          <Shield className={`h-12 w-12 mx-auto mb-4 ${themeClasses.textMuted}`} />
          <p className={`text-lg font-medium mb-2 ${themeClasses.text}`}>No Trusted Devices</p>
          <p className={themeClasses.textSecondary}>
            You haven't registered any trusted devices yet. You'll be prompted to register your device after logging in.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => (
            <div
              key={device.id}
              className={`rounded-lg border p-4 ${themeClasses.card} ${themeClasses.cardHover} transition-colors`}
            >
              <div className="flex items-start justify-between">
                {/* Device Info */}
                <div className="flex items-start space-x-4 flex-1">
                  <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-600' : 'bg-white'}`}>
                    {getDeviceIcon(device.deviceInfo)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Device Name */}
                    <h3 className={`text-lg font-medium ${themeClasses.text} mb-1`}>
                      {device.deviceName}
                    </h3>

                    {/* Device Details */}
                    <div className={`text-sm ${themeClasses.textSecondary} space-y-1`}>
                      <div className="flex items-center">
                        <Monitor className="h-4 w-4 mr-1.5" />
                        <span>{device.deviceInfo.platform} • {device.deviceInfo.screenResolution}</span>
                      </div>

                      {device.deviceInfo.geolocation && (
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-1.5" />
                          <span>{getLocationString(device.deviceInfo.geolocation)}</span>
                        </div>
                      )}

                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1.5" />
                        <span>Registered: {formatDate(device.createdAt)}</span>
                      </div>

                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1.5" />
                        <span>Last used: {formatDate(device.lastUsed)}</span>
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center mt-3 space-x-2">
                      {isExpiringSoon(device.expiresAt) ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Expires {formatDate(device.expiresAt)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active until {formatDate(device.expiresAt)}
                        </span>
                      )}

                      {device.isSharedDevice && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Shared Device
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Revoke Button */}
                <button
                  onClick={() => setShowRevokeConfirm({ deviceId: device.id, deviceName: device.deviceName })}
                  disabled={revoking === device.id}
                  className={`ml-4 flex items-center px-3 py-2 rounded-md ${themeClasses.buttonDanger} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {revoking === device.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Revoke
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevokeConfirm && (
        <AlertModal
          isOpen={true}
          onClose={() => setShowRevokeConfirm(null)}
          onConfirm={() => handleRevokeDevice(showRevokeConfirm.deviceId)}
          type="warning"
          title="Revoke Trusted Device"
          message={`Are you sure you want to revoke trust for "${showRevokeConfirm.deviceName}"? You will need to complete MFA verification the next time you log in from this device.`}
          confirmText="Revoke Device"
          cancelText="Cancel"
        />
      )}
    </div>
  );
};

export default TrustedDeviceManagement;