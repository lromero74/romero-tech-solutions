/**
 * Timezone Utilities
 * Helper functions for handling user timezone preferences and displaying dates/times
 */

import { RoleBasedStorage } from './roleBasedStorage';

/**
 * Common timezones grouped by region for timezone selector
 */
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)', region: 'North America' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)', region: 'North America' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)', region: 'North America' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)', region: 'North America' },
  { value: 'America/Anchorage', label: 'Alaska', region: 'North America' },
  { value: 'Pacific/Honolulu', label: 'Hawaii', region: 'North America' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)', region: 'North America' },
  { value: 'America/Toronto', label: 'Toronto', region: 'North America' },
  { value: 'America/Vancouver', label: 'Vancouver', region: 'North America' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'North America' },
  { value: 'Europe/London', label: 'London', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'Brussels', region: 'Europe' },
  { value: 'Europe/Vienna', label: 'Vienna', region: 'Europe' },
  { value: 'Europe/Warsaw', label: 'Warsaw', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'Mumbai / New Delhi', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'Beijing / Shanghai', region: 'Asia' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia' },
  { value: 'Asia/Bangkok', label: 'Bangkok', region: 'Asia' },
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Australia / Pacific' },
  { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Australia / Pacific' },
  { value: 'Australia/Brisbane', label: 'Brisbane', region: 'Australia / Pacific' },
  { value: 'Australia/Perth', label: 'Perth', region: 'Australia / Pacific' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Australia / Pacific' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'South America' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires', region: 'South America' },
  { value: 'America/Santiago', label: 'Santiago', region: 'South America' },
  { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa / Middle East' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa / Middle East' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem', region: 'Africa / Middle East' },
];

/**
 * Detect the user's current timezone from browser
 * @returns IANA timezone identifier (e.g., 'America/New_York')
 */
export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Failed to detect user timezone, defaulting to America/Los_Angeles:', error);
    return 'America/Los_Angeles'; // Fallback to Pacific time
  }
}

/**
 * Get user's preferred timezone from storage or auto-detect
 * Priority: stored preference → auto-detect → America/Los_Angeles fallback
 * @returns IANA timezone identifier
 */
export function getUserTimezone(): string {
  try {
    // Try to get from stored auth user
    const authUser = RoleBasedStorage.getItem('authUser');
    if (authUser) {
      const user = JSON.parse(authUser);
      if (user.timezonePreference) {
        return user.timezonePreference;
      }
    }
  } catch (error) {
    console.warn('Failed to get user timezone from storage:', error);
  }

  // Fall back to auto-detection
  return detectUserTimezone();
}

/**
 * Get user's time format preference (12h or 24h)
 * @returns '12h' or '24h'
 */
export function getUserTimeFormat(): '12h' | '24h' {
  try {
    const authUser = RoleBasedStorage.getItem('authUser');
    if (authUser) {
      const user = JSON.parse(authUser);
      return user.timeFormatPreference || '12h';
    }
  } catch (error) {
    console.warn('Failed to get time format preference:', error);
  }
  return '12h';
}

/**
 * Format a Date object or ISO string in the user's timezone
 * @param date Date object or ISO string
 * @param options Optional Intl.DateTimeFormat options
 * @param timezone Optional timezone override (defaults to user's preference)
 * @returns Formatted date string
 */
export function formatDateInUserTimezone(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
  timezone?: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const userTimezone = timezone || getUserTimezone();
  const timeFormat = getUserTimeFormat();

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: userTimezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
    ...options,
  };

  return dateObj.toLocaleString('en-US', defaultOptions);
}

/**
 * Format a Date object or ISO string as date only in the user's timezone
 * @param date Date object or ISO string
 * @param timezone Optional timezone override
 * @returns Formatted date string (e.g., "12/25/2023")
 */
export function formatDateOnly(date: Date | string, timezone?: string): string {
  return formatDateInUserTimezone(date, {
    hour: undefined,
    minute: undefined,
  }, timezone);
}

/**
 * Format a Date object or ISO string as time only in the user's timezone
 * @param date Date object or ISO string
 * @param timezone Optional timezone override
 * @returns Formatted time string (e.g., "2:30 PM" or "14:30")
 */
export function formatTimeOnly(date: Date | string, timezone?: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const userTimezone = timezone || getUserTimezone();
  const timeFormat = getUserTimeFormat();

  console.log('⏰ formatTimeOnly - input date:', date);
  console.log('⏰ formatTimeOnly - dateObj:', dateObj);
  console.log('⏰ formatTimeOnly - userTimezone:', userTimezone);
  console.log('⏰ formatTimeOnly - timeFormat:', timeFormat);

  const formatted = dateObj.toLocaleTimeString('en-US', {
    timeZone: userTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });

  console.log('⏰ formatTimeOnly - formatted result:', formatted);

  return formatted;
}

/**
 * Get timezone offset string (e.g., "GMT-5" or "GMT+1")
 * @param timezone IANA timezone identifier
 * @param date Optional date for DST calculation (defaults to now)
 * @returns Offset string (e.g., "GMT-5")
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';
    return timeZoneName;
  } catch (error) {
    console.warn('Failed to get timezone offset:', error);
    return '';
  }
}

/**
 * Get timezone display name with offset
 * @param timezone IANA timezone identifier
 * @returns Display string (e.g., "Pacific Time (GMT-8)")
 */
export function getTimezoneDisplayName(timezone: string): string {
  const tzInfo = COMMON_TIMEZONES.find(tz => tz.value === timezone);
  if (tzInfo) {
    const offset = getTimezoneOffset(timezone);
    return `${tzInfo.label} (${offset})`;
  }

  // For unlisted timezones, return timezone with offset
  const offset = getTimezoneOffset(timezone);
  return `${timezone} (${offset})`;
}

/**
 * Group timezones by region for dropdown
 * @returns Timezones grouped by region
 */
export function getGroupedTimezones(): Record<string, typeof COMMON_TIMEZONES> {
  const grouped: Record<string, typeof COMMON_TIMEZONES> = {};

  COMMON_TIMEZONES.forEach(tz => {
    if (!grouped[tz.region]) {
      grouped[tz.region] = [];
    }
    grouped[tz.region].push(tz);
  });

  return grouped;
}

/**
 * Validate if a string is a valid IANA timezone identifier
 * @param timezone Timezone string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}
