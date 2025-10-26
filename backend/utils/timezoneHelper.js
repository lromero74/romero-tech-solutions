/**
 * Timezone Helper Utilities
 *
 * Handles conversion between local timezones and UTC for alert subscriptions.
 * All times are stored in UTC in the database and converted for display.
 */

import { query } from '../config/database.js';

/**
 * Convert local time string to UTC time
 * @param {string} timeString - Local time in HH:MM format (e.g., "14:30")
 * @param {string} timezone - IANA timezone (e.g., "America/Los_Angeles")
 * @returns {string} UTC time in HH:MM format
 */
function convertLocalTimeToUTC(timeString, timezone) {
  if (!timeString) return null;

  try {
    // Create a date in the user's timezone (using arbitrary date)
    const dateStr = `2000-01-01T${timeString}:00`;
    const localDate = new Date(dateStr);

    // Get the timezone offset for the specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Parse the local time to get offset
    const parts = formatter.formatToParts(localDate);
    const localHour = parseInt(parts.find(p => p.type === 'hour').value);
    const localMinute = parseInt(parts.find(p => p.type === 'minute').value);

    // Get UTC time by using toLocaleString with UTC timezone
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Create date object from local time in specified timezone
    const testDate = new Date(`2000-01-01T${timeString}`);
    const offsetMs = getTimezoneOffset(timezone, testDate);

    // Adjust for timezone offset
    const utcDate = new Date(testDate.getTime() - offsetMs);
    const utcHours = String(utcDate.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(utcDate.getUTCMinutes()).padStart(2, '0');

    return `${utcHours}:${utcMinutes}`;
  } catch (error) {
    console.error(`Error converting local time to UTC: ${error.message}`);
    return timeString; // Return original on error
  }
}

/**
 * Convert UTC time string to local time
 * @param {string} utcTimeString - UTC time in HH:MM format (e.g., "22:30")
 * @param {string} timezone - IANA timezone (e.g., "America/New_York")
 * @returns {string} Local time in HH:MM format
 */
function convertUTCToLocalTime(utcTimeString, timezone) {
  if (!utcTimeString) return null;

  try {
    // Create a UTC date object
    const utcDate = new Date(`2000-01-01T${utcTimeString}:00Z`);

    // Format in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(utcDate);
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;

    return `${hour}:${minute}`;
  } catch (error) {
    console.error(`Error converting UTC to local time: ${error.message}`);
    return utcTimeString; // Return original on error
  }
}

/**
 * Get timezone offset in milliseconds for a given timezone and date
 * @param {string} timezone - IANA timezone
 * @param {Date} date - Date to calculate offset for (handles DST)
 * @returns {number} Offset in milliseconds
 */
function getTimezoneOffset(timezone, date = new Date()) {
  // Get UTC time
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  // Get time in target timezone
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  // Calculate difference
  return tzDate.getTime() - utcDate.getTime();
}

/**
 * Validate timezone string
 * @param {string} timezone - IANA timezone to validate
 * @returns {boolean} True if valid
 */
function validateTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return false;

  try {
    // Try to use the timezone in Intl.DateTimeFormat
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get user's timezone preference from database
 * @param {string} userId - User or employee ID
 * @param {string} userType - 'employee' or 'client'
 * @returns {Promise<string>} Timezone string or default
 */
async function getUserTimezone(userId, userType = 'employee') {
  try {
    const table = userType === 'employee' ? 'employees' : 'users';
    const result = await query(
      `SELECT timezone_preference FROM ${table} WHERE id = $1`,
      [userId]
    );

    if (result.rows.length > 0 && result.rows[0].timezone_preference) {
      return result.rows[0].timezone_preference;
    }

    // Default to Pacific if not set
    return 'America/Los_Angeles';
  } catch (error) {
    console.error(`Error getting user timezone: ${error.message}`);
    return 'America/Los_Angeles'; // Fallback default
  }
}

/**
 * Save user's timezone preference to database
 * @param {string} userId - User or employee ID
 * @param {string} timezone - IANA timezone to save
 * @param {string} userType - 'employee' or 'client'
 * @returns {Promise<boolean>} Success status
 */
async function saveUserTimezone(userId, timezone, userType = 'employee') {
  if (!validateTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  try {
    const table = userType === 'employee' ? 'employees' : 'users';
    await query(
      `UPDATE ${table} SET timezone_preference = $1 WHERE id = $2`,
      [timezone, userId]
    );
    return true;
  } catch (error) {
    console.error(`Error saving user timezone: ${error.message}`);
    throw error;
  }
}

/**
 * List of common timezones for UI selection
 * @returns {Array} Array of timezone objects with value and label
 */
function getCommonTimezones() {
  return [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Phoenix', label: 'Arizona (no DST)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
    { value: 'UTC', label: 'UTC' }
  ];
}

/**
 * Format timezone for display (removes underscores, etc.)
 * @param {string} timezone - IANA timezone
 * @returns {string} Formatted timezone name
 */
function formatTimezoneDisplay(timezone) {
  if (!timezone) return 'Unknown';

  // Find in common timezones list
  const common = getCommonTimezones().find(tz => tz.value === timezone);
  if (common) return common.label;

  // Otherwise, format the IANA string
  return timezone
    .replace('America/', '')
    .replace('Europe/', '')
    .replace('Asia/', '')
    .replace('Pacific/', '')
    .replace('_', ' ');
}

/**
 * Check if quiet hours are currently active for a user
 * @param {string} quietHoursStartUTC - Start time in UTC (HH:MM)
 * @param {string} quietHoursEndUTC - End time in UTC (HH:MM)
 * @returns {boolean} True if currently in quiet hours
 */
function isInQuietHours(quietHoursStartUTC, quietHoursEndUTC) {
  if (!quietHoursStartUTC || !quietHoursEndUTC) return false;

  const now = new Date();
  const currentUTCHour = now.getUTCHours();
  const currentUTCMinute = now.getUTCMinutes();
  const currentTime = currentUTCHour * 60 + currentUTCMinute; // Minutes since midnight

  const [startHour, startMin] = quietHoursStartUTC.split(':').map(Number);
  const [endHour, endMin] = quietHoursEndUTC.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle quiet hours that span midnight
  if (startTime > endTime) {
    // e.g., 22:00 - 06:00 (spans midnight)
    return currentTime >= startTime || currentTime < endTime;
  } else {
    // e.g., 01:00 - 06:00 (same day)
    return currentTime >= startTime && currentTime < endTime;
  }
}

export {
  convertLocalTimeToUTC,
  convertUTCToLocalTime,
  validateTimezone,
  getUserTimezone,
  saveUserTimezone,
  getCommonTimezones,
  formatTimezoneDisplay,
  isInQuietHours,
  getTimezoneOffset
};
