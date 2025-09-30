import React, { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Monitor,
  Smartphone,
  X,
  CheckCircle
} from 'lucide-react';
import { trustedDeviceService } from '../services/trustedDeviceService';

interface TrustedDevicePromptProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: () => void;
  onSkip: () => void;
}

const TrustedDevicePrompt: React.FC<TrustedDevicePromptProps> = ({
  isOpen,
  onClose,
  onRegister,
  onSkip
}) => {
  const [showCustomName, setShowCustomName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceName = trustedDeviceService.getCurrentDeviceName();
  const isSharedDevice = trustedDeviceService.isCurrentDeviceShared();

  const handleRegisterDevice = async (useCustomName: boolean = false) => {
    setIsRegistering(true);
    setError(null);

    try {
      const finalDeviceName = useCustomName && customName.trim() ? customName.trim() : undefined;
      const response = await trustedDeviceService.registerCurrentDevice(finalDeviceName);

      if (response.success) {
        onRegister();
        onClose();
      } else {
        setError(response.message || 'Failed to register device');
      }
    } catch (err) {
      setError('Failed to register trusted device');
      console.error('Error registering device:', err);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  const sanitizeDeviceName = (name: string): string => {
    // Remove potentially dangerous characters while allowing Unicode letters, numbers, spaces, and common punctuation
    return name
      .trim()
      // eslint-disable-next-line no-useless-escape
      .replace(/[<>{}[\]\\\/'"`;]/g, '') // Remove injection characters
      .substring(0, 100); // Limit length
  };

  const handleCustomNameSubmit = () => {
    const sanitized = sanitizeDeviceName(customName);
    if (!sanitized) {
      setError('Please enter a valid device name');
      return;
    }
    // Use the sanitized name
    const finalName = sanitized;
    setCustomName(finalName);
    handleRegisterDevice(true);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          {/* Close button */}
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <Shield className="h-6 w-6 text-blue-600" />
          </div>

          {/* Content */}
          <div className="mt-3 text-center sm:mt-5">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Remember This Device?
            </h3>

            <div className="mt-4">
              {/* Device info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-center space-x-2">
                  {deviceName.includes('Mobile') ? (
                    <Smartphone className="h-5 w-5 text-gray-500" />
                  ) : (
                    <Monitor className="h-5 w-5 text-gray-500" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{deviceName}</span>
                </div>
              </div>

              {/* Shared device warning */}
              {isSharedDevice && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-orange-800">
                        Shared Device Detected
                      </h4>
                      <p className="mt-1 text-sm text-orange-700">
                        This appears to be a shared or public device. We recommend not registering
                        shared devices as trusted for security reasons.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Main message */}
              <div className="text-sm text-gray-500">
                <p className="mb-3">
                  Would you like to skip MFA verification on this device for the next{' '}
                  <span className="font-semibold">30 days</span>?
                </p>

                {/* Benefits */}
                <div className="bg-green-50 rounded-lg p-3 mb-4">
                  <div className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-green-800">Benefits</h4>
                      <ul className="mt-1 text-sm text-green-700 space-y-1">
                        <li>• Skip MFA for routine actions</li>
                        <li>• Faster login experience</li>
                        <li>• Still required for sensitive operations</li>
                        <li>• Automatically expires in 30 days</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom name input */}
              {showCustomName && (
                <div className="mb-4">
                  <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700">
                    Device Name
                  </label>
                  <input
                    type="text"
                    id="deviceName"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g., John's Work Laptop"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={isRegistering}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 sm:mt-6 space-y-2">
            {showCustomName ? (
              <>
                <button
                  type="button"
                  onClick={handleCustomNameSubmit}
                  disabled={isRegistering}
                  className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegistering ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Register with Custom Name
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCustomName(false);
                    setCustomName('');
                    setError(null);
                  }}
                  disabled={isRegistering}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                {!isSharedDevice && (
                  <button
                    type="button"
                    onClick={() => handleRegisterDevice(false)}
                    disabled={isRegistering}
                    className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegistering ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Yes, Remember This Device
                      </>
                    )}
                  </button>
                )}

                {!isSharedDevice && (
                  <button
                    type="button"
                    onClick={() => setShowCustomName(true)}
                    disabled={isRegistering}
                    className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Customize Device Name
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={isRegistering}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharedDevice ? 'Continue' : 'No, Always Require MFA'}
                </button>
              </>
            )}
          </div>

          {/* Security note */}
          <div className="mt-4 text-xs text-gray-500 text-center">
            <p>
              Only register devices you trust and use regularly. You can manage trusted devices
              in your security settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrustedDevicePrompt;