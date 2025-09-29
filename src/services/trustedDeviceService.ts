/**
 * Trusted Device Service
 * Handles communication with the backend for trusted device operations
 */

import { apiService } from './apiService';
import {
  DeviceInfo,
  TrustedDevice,
  createDeviceFingerprint,
  getCurrentDeviceFingerprint
} from '../utils/deviceFingerprinting';

interface TrustedDeviceResponse {
  success: boolean;
  message?: string;
  data?: any;
}

interface MfaRequirement {
  requireMFA: boolean;
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  trustedDevice?: {
    deviceName: string;
    isSharedDevice: boolean;
  };
}

export class TrustedDeviceService {
  private static instance: TrustedDeviceService;

  private constructor() {}

  public static getInstance(): TrustedDeviceService {
    if (!TrustedDeviceService.instance) {
      TrustedDeviceService.instance = new TrustedDeviceService();
    }
    return TrustedDeviceService.instance;
  }

  /**
   * Register current device as trusted
   * @param customDeviceName Optional custom name for device
   * @param trustDurationDays Number of days to trust device
   * @returns Promise with registration result
   */
  async registerCurrentDevice(
    customDeviceName?: string,
    trustDurationDays: number = 30
  ): Promise<TrustedDeviceResponse> {
    try {
      const deviceFingerprintData = createDeviceFingerprint(
        '', // userId will be filled by backend from session
        'employee', // userType will be filled by backend from session
        customDeviceName,
        trustDurationDays
      );

      const response = await apiService.post('/trusted-devices/register', {
        deviceFingerprint: deviceFingerprintData.deviceFingerprint,
        deviceName: deviceFingerprintData.deviceName,
        deviceInfo: deviceFingerprintData.deviceInfo,
        isSharedDevice: deviceFingerprintData.isSharedDevice,
        trustDurationDays
      });

      return response;
    } catch (error) {
      console.error('Error registering trusted device:', error);
      return {
        success: false,
        message: 'Failed to register trusted device'
      };
    }
  }

  /**
   * Check if current device is trusted (requires authentication)
   * @returns Promise with trust status
   */
  async checkCurrentDeviceTrust(): Promise<TrustedDeviceResponse & { trusted?: boolean }> {
    try {
      const deviceFingerprint = getCurrentDeviceFingerprint();

      const response = await apiService.post('/trusted-devices/check', {
        deviceFingerprint
      });

      return response;
    } catch (error) {
      console.error('Error checking device trust:', error);
      return {
        success: false,
        trusted: false,
        message: 'Failed to check device trust'
      };
    }
  }

  /**
   * Check if current device is trusted before authentication (no auth required)
   * @param userEmail User email to check device trust for
   * @returns Promise with trust status
   */
  async checkPreAuthDeviceTrust(userEmail: string): Promise<TrustedDeviceResponse & { trusted?: boolean }> {
    try {
      const deviceFingerprint = getCurrentDeviceFingerprint();

      const response = await apiService.post('/trusted-devices/check-pre-auth', {
        deviceFingerprint,
        userEmail
      });

      return response;
    } catch (error) {
      console.error('Error checking pre-auth device trust:', error);
      return {
        success: false,
        trusted: false,
        message: 'Failed to check device trust'
      };
    }
  }

  /**
   * Login using trusted device credentials (bypasses MFA)
   * @param email User email
   * @param password User password
   * @returns Promise with authentication result
   */
  async loginWithTrustedDevice(email: string, password: string): Promise<TrustedDeviceResponse & { user?: any }> {
    try {
      const deviceFingerprint = getCurrentDeviceFingerprint();

      const response = await apiService.post('/auth/trusted-device-login', {
        email,
        password,
        deviceFingerprint
      });

      return response;
    } catch (error) {
      console.error('Error logging in with trusted device:', error);
      return {
        success: false,
        message: 'Failed to login with trusted device'
      };
    }
  }

  /**
   * Determine if MFA is required for current action
   * @param action Action being performed
   * @param newLocation Whether this is from a new location
   * @returns Promise with MFA requirement decision
   */
  async checkMfaRequirement(
    action?: string,
    newLocation?: boolean
  ): Promise<TrustedDeviceResponse & MfaRequirement> {
    try {
      const deviceFingerprint = getCurrentDeviceFingerprint();

      const response = await apiService.post('/trusted-devices/mfa-required', {
        deviceFingerprint,
        action,
        newLocation
      });

      // Ensure we always return requireMFA as true if there's an error
      if (!response.success) {
        return {
          ...response,
          requireMFA: true,
          reasons: ['Error checking trusted device status'],
          riskLevel: 'high'
        };
      }

      return response;
    } catch (error) {
      console.error('Error checking MFA requirement:', error);
      return {
        success: false,
        requireMFA: true,
        reasons: ['Failed to check trusted device status'],
        riskLevel: 'high',
        message: 'Failed to determine MFA requirement'
      };
    }
  }

  /**
   * Get all trusted devices for the current user
   * @param includeRevoked Whether to include revoked devices
   * @returns Promise with list of trusted devices
   */
  async getTrustedDevices(includeRevoked: boolean = false): Promise<TrustedDeviceResponse> {
    try {
      const queryParam = includeRevoked ? '?includeRevoked=true' : '';
      const response = await apiService.get(`/trusted-devices${queryParam}`);

      return response;
    } catch (error) {
      console.error('Error getting trusted devices:', error);
      return {
        success: false,
        message: 'Failed to get trusted devices',
        data: []
      };
    }
  }

  /**
   * Revoke a specific trusted device
   * @param deviceId Device ID to revoke
   * @returns Promise with revocation result
   */
  async revokeTrustedDevice(deviceId: string): Promise<TrustedDeviceResponse> {
    try {
      const response = await apiService.delete(`/trusted-devices/${deviceId}`);

      return response;
    } catch (error) {
      console.error('Error revoking trusted device:', error);
      return {
        success: false,
        message: 'Failed to revoke trusted device'
      };
    }
  }

  /**
   * Revoke all trusted devices for the current user
   * @returns Promise with revocation result
   */
  async revokeAllTrustedDevices(): Promise<TrustedDeviceResponse> {
    try {
      const response = await apiService.delete('/trusted-devices');

      return response;
    } catch (error) {
      console.error('Error revoking all trusted devices:', error);
      return {
        success: false,
        message: 'Failed to revoke all trusted devices'
      };
    }
  }

  /**
   * Extend expiration of a trusted device
   * @param deviceId Device ID to extend
   * @param additionalDays Additional days to extend
   * @returns Promise with extension result
   */
  async extendTrustedDevice(
    deviceId: string,
    additionalDays: number = 30
  ): Promise<TrustedDeviceResponse> {
    try {
      const response = await apiService.put(`/trusted-devices/${deviceId}/extend`, {
        additionalDays
      });

      return response;
    } catch (error) {
      console.error('Error extending trusted device:', error);
      return {
        success: false,
        message: 'Failed to extend trusted device'
      };
    }
  }

  /**
   * Rename a trusted device
   * @param deviceId Device ID to rename
   * @param newDeviceName New device name
   * @returns Promise with rename result
   */
  async renameTrustedDevice(
    deviceId: string,
    newDeviceName: string
  ): Promise<TrustedDeviceResponse> {
    try {
      const response = await apiService.put(`/trusted-devices/${deviceId}/rename`, {
        deviceName: newDeviceName
      });

      return response;
    } catch (error) {
      console.error('Error renaming trusted device:', error);
      return {
        success: false,
        message: 'Failed to rename trusted device'
      };
    }
  }

  /**
   * Get trusted device statistics (admin only)
   * @returns Promise with statistics
   */
  async getTrustedDeviceStats(): Promise<TrustedDeviceResponse> {
    try {
      const response = await apiService.get('/trusted-devices/stats');

      return response;
    } catch (error) {
      console.error('Error getting trusted device stats:', error);
      return {
        success: false,
        message: 'Failed to get trusted device statistics',
        data: {
          total_devices: 0,
          active_devices: 0,
          expired_devices: 0,
          shared_devices: 0,
          users_with_trusted_devices: 0
        }
      };
    }
  }

  /**
   * Helper method to show device registration prompt
   * @param onRegister Callback when user chooses to register device
   * @param onSkip Callback when user chooses to skip registration
   * @returns Device registration prompt configuration
   */
  createRegistrationPrompt(
    onRegister: (customName?: string) => void,
    onSkip: () => void
  ) {
    return {
      title: 'Remember This Device?',
      message: 'Would you like to skip MFA verification on this device for the next 30 days?',
      options: [
        {
          label: 'Yes, remember this device',
          action: () => onRegister(),
          primary: true
        },
        {
          label: 'Customize device name',
          action: () => {
            const customName = prompt('Enter a name for this device:');
            if (customName) {
              onRegister(customName);
            }
          }
        },
        {
          label: 'No, always require MFA',
          action: onSkip,
          secondary: true
        }
      ],
      securityNote: 'Only register devices you trust and use regularly. Shared or public devices should not be registered.'
    };
  }

  /**
   * Check if device appears to be shared/public
   * @returns Whether device seems shared
   */
  isCurrentDeviceShared(): boolean {
    const deviceInfo = createDeviceFingerprint('', 'employee').deviceInfo;
    return deviceInfo.isSharedDevice;
  }

  /**
   * Get user-friendly device name for current device
   * @returns Generated device name
   */
  getCurrentDeviceName(): string {
    const deviceInfo = createDeviceFingerprint('', 'employee').deviceInfo;
    return deviceInfo.deviceName;
  }
}

// Export singleton instance
export const trustedDeviceService = TrustedDeviceService.getInstance();