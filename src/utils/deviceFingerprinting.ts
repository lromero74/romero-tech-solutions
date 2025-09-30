/**
 * Device Fingerprinting Utility
 * Generates unique device fingerprints for trusted device registration
 */

import { SHA256 } from 'crypto-js';

export interface DeviceInfo {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  colorDepth: number;
  platform: string;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  pixelRatio: number;
  geolocation?: {
    city?: string;
    region?: string;
    country?: string;
    ip?: string;
    timestamp: string;
  };
}

export interface TrustedDevice {
  id?: string;
  userId: string;
  userType: 'employee' | 'client';
  deviceFingerprint: string;
  deviceName: string;
  deviceInfo: DeviceInfo;
  isSharedDevice: boolean;
  lastUsed: Date;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

/**
 * Fetch geolocation data from IP address
 * @returns Promise with geolocation data
 */
async function fetchGeolocation(): Promise<DeviceInfo['geolocation']> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      return {
        city: data.city,
        region: data.region,
        country: data.country_name,
        ip: data.ip,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.warn('Failed to fetch geolocation data:', error);
  }
  return {
    timestamp: new Date().toISOString()
  };
}

/**
 * Collect device characteristics for fingerprinting
 * @param includeGeolocation Whether to include geolocation data (async operation)
 * @returns DeviceInfo object with device characteristics
 */
export function collectDeviceInfo(includeGeolocation: boolean = false): DeviceInfo {
  const nav = navigator;
  const screen = window.screen;

  const deviceInfo: DeviceInfo = {
    userAgent: nav.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: nav.language,
    colorDepth: screen.colorDepth,
    platform: nav.platform,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    hardwareConcurrency: nav.hardwareConcurrency || 1,
    maxTouchPoints: nav.maxTouchPoints || 0,
    pixelRatio: window.devicePixelRatio || 1
  };

  // Add geolocation if requested (will be populated async)
  if (includeGeolocation) {
    fetchGeolocation().then(geo => {
      deviceInfo.geolocation = geo;
    });
  }

  return deviceInfo;
}

/**
 * Collect device characteristics for fingerprinting (async version with geolocation)
 * @returns Promise with DeviceInfo object including geolocation
 */
export async function collectDeviceInfoAsync(): Promise<DeviceInfo> {
  const nav = navigator;
  const screen = window.screen;

  const geolocation = await fetchGeolocation();

  return {
    userAgent: nav.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: nav.language,
    colorDepth: screen.colorDepth,
    platform: nav.platform,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    hardwareConcurrency: nav.hardwareConcurrency || 1,
    maxTouchPoints: nav.maxTouchPoints || 0,
    pixelRatio: window.devicePixelRatio || 1,
    geolocation
  };
}

/**
 * Generate a unique device fingerprint from device characteristics
 * @param deviceInfo Device information object
 * @returns SHA256 hash of device characteristics
 */
export function generateDeviceFingerprint(deviceInfo: DeviceInfo): string {
  // Create a consistent string from device characteristics
  const fingerprintString = [
    deviceInfo.userAgent,
    deviceInfo.screenResolution,
    deviceInfo.timezone,
    deviceInfo.language,
    deviceInfo.colorDepth,
    deviceInfo.platform,
    deviceInfo.cookieEnabled,
    deviceInfo.doNotTrack || 'null',
    deviceInfo.hardwareConcurrency,
    deviceInfo.maxTouchPoints,
    deviceInfo.pixelRatio
  ].join('|');

  // Return SHA256 hash of the fingerprint string
  return SHA256(fingerprintString).toString();
}

/**
 * Generate a human-readable device name based on device characteristics
 * @param deviceInfo Device information object
 * @returns User-friendly device name
 */
export function generateDeviceName(deviceInfo: DeviceInfo): string {
  const userAgent = deviceInfo.userAgent.toLowerCase();

  // Detect browser
  let browser = 'Unknown Browser';
  if (userAgent.includes('chrome') && !userAgent.includes('edg')) browser = 'Chrome';
  else if (userAgent.includes('firefox')) browser = 'Firefox';
  else if (userAgent.includes('safari') && !userAgent.includes('chrome')) browser = 'Safari';
  else if (userAgent.includes('edg')) browser = 'Edge';

  // Detect OS
  let os = 'Unknown OS';
  if (userAgent.includes('windows')) os = 'Windows';
  else if (userAgent.includes('mac')) os = 'macOS';
  else if (userAgent.includes('linux')) os = 'Linux';
  else if (userAgent.includes('android')) os = 'Android';
  else if (userAgent.includes('iphone') || userAgent.includes('ipad')) os = 'iOS';

  // Detect device type
  let deviceType = 'Desktop';
  if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
    deviceType = 'Mobile';
  } else if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
    deviceType = 'Tablet';
  }

  return `${browser} on ${os} (${deviceType})`;
}

/**
 * Check if current device appears to be shared/public
 * @param deviceInfo Device information object
 * @returns boolean indicating if device seems shared
 */
export function detectSharedDevice(deviceInfo: DeviceInfo): boolean {
  const userAgent = deviceInfo.userAgent.toLowerCase();

  // Common indicators of shared/public devices
  const sharedIndicators = [
    'kiosk',
    'public',
    'library',
    'shared',
    'internet cafe',
    'cyber cafe'
  ];

  // Check user agent for shared device indicators
  const hasSharedIndicator = sharedIndicators.some(indicator =>
    userAgent.includes(indicator)
  );

  // Additional heuristics for shared devices
  const hasIncognito = userAgent.includes('incognito') || userAgent.includes('private');
  const lowResolution = deviceInfo.screenResolution === '1024x768' || deviceInfo.screenResolution === '800x600';
  const noDoNotTrack = deviceInfo.doNotTrack === null;

  return hasSharedIndicator || hasIncognito || (lowResolution && noDoNotTrack);
}

/**
 * Create a complete device fingerprint with all information
 * @param userId User ID
 * @param userType User type ('employee' or 'client')
 * @param customDeviceName Optional custom device name
 * @param trustDurationDays Number of days to trust device (default: 30)
 * @returns Complete device fingerprint object
 */
export function createDeviceFingerprint(
  userId: string,
  userType: 'employee' | 'client',
  customDeviceName?: string,
  trustDurationDays: number = 30
): Omit<TrustedDevice, 'id'> {
  const deviceInfo = collectDeviceInfo();
  const fingerprint = generateDeviceFingerprint(deviceInfo);
  const deviceName = customDeviceName || generateDeviceName(deviceInfo);
  const isSharedDevice = detectSharedDevice(deviceInfo);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (trustDurationDays * 24 * 60 * 60 * 1000));

  return {
    userId,
    userType,
    deviceFingerprint: fingerprint,
    deviceName,
    deviceInfo,
    isSharedDevice,
    lastUsed: now,
    expiresAt,
    revoked: false,
    createdAt: now
  };
}

/**
 * Get the current device fingerprint for checking trusted status
 * @returns Current device fingerprint string
 */
export function getCurrentDeviceFingerprint(): string {
  const deviceInfo = collectDeviceInfo();
  return generateDeviceFingerprint(deviceInfo);
}

/**
 * Check if device fingerprint has changed significantly
 * @param oldFingerprint Previous device fingerprint
 * @param threshold Similarity threshold (0-1, default: 0.8)
 * @returns boolean indicating if device seems to be the same
 */
export function isSameDevice(oldFingerprint: string, threshold: number = 0.8): boolean {
  const currentFingerprint = getCurrentDeviceFingerprint();

  // For now, use exact match - could implement fuzzy matching later
  return oldFingerprint === currentFingerprint;
}

/**
 * Validate device trust expiration
 * @param expiresAt Expiration timestamp
 * @returns boolean indicating if device trust is still valid
 */
export function isDeviceTrustValid(expiresAt: Date): boolean {
  return new Date() < new Date(expiresAt);
}

/**
 * Format device information for display
 * @param deviceInfo Device information object
 * @returns Formatted string for UI display
 */
export function formatDeviceInfo(deviceInfo: DeviceInfo): string {
  return `${deviceInfo.platform} • ${deviceInfo.screenResolution} • ${deviceInfo.language}`;
}

/**
 * Get security level of device trust based on characteristics
 * @param deviceInfo Device information object
 * @returns Security level: 'high' | 'medium' | 'low'
 */
export function getDeviceSecurityLevel(deviceInfo: DeviceInfo): 'high' | 'medium' | 'low' {
  let score = 0;

  // Higher score = more secure/unique device
  if (deviceInfo.hardwareConcurrency > 4) score += 2;
  if (deviceInfo.screenResolution !== '1920x1080') score += 1; // Non-standard resolution
  if (deviceInfo.doNotTrack === '1') score += 1; // Privacy-conscious user
  if (!deviceInfo.userAgent.includes('mobile')) score += 1; // Desktop generally more secure
  if (deviceInfo.timezone !== 'UTC') score += 1; // Specific timezone

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}