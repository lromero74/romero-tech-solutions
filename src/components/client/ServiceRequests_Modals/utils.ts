import { ServiceRequest } from './types';
import { getUserTimezone, getUserTimeFormat } from '../../../utils/timezoneUtils';

/**
 * Format a timestamp to show both local time and UTC
 * @param timestamp - ISO timestamp string
 * @param locale - Locale string for formatting
 * @param timeFormat - '12h' or '24h' format preference (defaults to user's preference)
 */
export const formatTimestampWithUTC = (timestamp: string, locale?: string, timeFormat?: '12h' | '24h'): { local: string; utc: string } => {
  const date = new Date(timestamp);
  const userTimeFormat = timeFormat || getUserTimeFormat();
  const userTimezone = getUserTimezone();
  const use12Hour = userTimeFormat === '12h';

  // Format in user's timezone
  const local = date.toLocaleString(locale, {
    timeZone: userTimezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour
  });

  // Format UTC time
  const utc = date.toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12Hour,
    timeZone: 'UTC'
  });

  return { local, utc };
};

/**
 * Get status color classes based on status string
 */
export const getStatusColor = (status: string, isDarkMode: boolean) => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('cancelled') || statusLower.includes('rejected')) {
    return 'bg-gray-500 text-white';
  } else if (statusLower === 'submitted') {
    return 'bg-blue-600 text-white';
  } else if (statusLower === 'acknowledged') {
    return isDarkMode ? 'bg-orange-500 text-white' : 'bg-orange-500 text-black';
  } else if (statusLower.includes('pending')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
  } else if (statusLower.includes('progress') || statusLower.includes('assigned')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
  } else if (statusLower.includes('completed') || statusLower.includes('resolved')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

/**
 * Get priority color classes based on priority string
 */
export const getPriorityColor = (priority: string) => {
  const priorityLower = priority?.toLowerCase() || '';
  if (priorityLower.includes('high') || priorityLower.includes('urgent')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
  } else if (priorityLower.includes('medium') || priorityLower.includes('normal')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
  } else if (priorityLower.includes('low')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

/**
 * Format file size in human-readable format
 */
export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format file timestamp (converts UTC to user's timezone)
 */
export const formatFileTimestamp = (timestamp: string, locale?: string) => {
  try {
    const dateObj = new Date(timestamp);
    const userTimezone = getUserTimezone();
    const userTimeFormat = getUserTimeFormat();

    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }

    const formattedDate = dateObj.toLocaleDateString('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const formattedTime = dateObj.toLocaleTimeString('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: userTimeFormat === '12h'
    });

    return `${formattedDate} ${formattedTime}`;
  } catch (error) {
    console.error('formatFileTimestamp error:', error);
    return 'Invalid date';
  }
};

/**
 * Format full address from location details
 */
export const formatFullAddress = (locationDetails: ServiceRequest['locationDetails']) => {
  if (!locationDetails) return '';

  const parts = [];
  if (locationDetails.streetAddress1) parts.push(locationDetails.streetAddress1);
  if (locationDetails.streetAddress2) parts.push(locationDetails.streetAddress2);
  if (locationDetails.city) parts.push(locationDetails.city);
  if (locationDetails.state) parts.push(locationDetails.state);
  if (locationDetails.zipCode) parts.push(locationDetails.zipCode);

  return parts.join(', ');
};

/**
 * Generate Google Maps URL from location details
 */
export const getMapUrl = (locationDetails: ServiceRequest['locationDetails']) => {
  if (!locationDetails) return '';
  const address = formatFullAddress(locationDetails);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

/**
 * Format phone number as (###) ###-####
 */
export const formatPhone = (phone: string | null | undefined) => {
  if (!phone) return '';

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Check if we have a valid 10-digit US phone number
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }

  // If not 10 digits, return as-is
  return phone;
};

/**
 * Get locale for date formatting based on language
 */
export const getLocale = (language: string) => {
  return language === 'es' ? 'es-ES' : 'en-US';
};

/**
 * Format date and time (converts UTC to user's timezone)
 */
export const formatDateTime = (
  datetime: string | null,
  fallbackDate?: string | null,
  fallbackTime?: string | null,
  t?: any,
  locale?: string
) => {
  const userTimezone = getUserTimezone();
  const userTimeFormat = getUserTimeFormat();

  // If we have the new combined datetime field (UTC ISO string), use it
  if (datetime) {
    try {
      const dateObj = new Date(datetime);
      if (isNaN(dateObj.getTime())) {
        return t?.('serviceRequests.notScheduled', undefined, 'Not scheduled') || 'Not scheduled';
      }
      const formattedDate = dateObj.toLocaleDateString(locale, { timeZone: userTimezone });
      const formattedTime = dateObj.toLocaleTimeString(locale, {
        timeZone: userTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: userTimeFormat === '12h'
      });
      return `${formattedDate} ${t?.('serviceRequests.at', undefined, 'at') || 'at'} ${formattedTime}`;
    } catch (error) {
      console.error('formatDateTime error:', error);
    }
  }

  // Fallback to old date/time fields for backward compatibility
  if (!fallbackDate) return t?.('serviceRequests.notScheduled', undefined, 'Not scheduled') || 'Not scheduled';
  const dateObj = new Date(fallbackDate);
  const formattedDate = dateObj.toLocaleDateString(locale, { timeZone: userTimezone });
  if (fallbackTime) {
    return `${formattedDate} ${t?.('serviceRequests.at', undefined, 'at') || 'at'} ${fallbackTime}`;
  }
  return formattedDate;
};

/**
 * Check if a service request can be cancelled
 */
export const canCancelRequest = (request: ServiceRequest) => {
  // Cannot cancel if already in final status
  const statusLower = request.status.toLowerCase();
  if (statusLower.includes('completed') || statusLower.includes('cancelled')) {
    console.log(`Cannot cancel ${request.requestNumber}: status is ${request.status}`);
    return false;
  }

  const now = new Date();

  // Use new datetime field if available, otherwise fall back to old fields
  let requestedDateTime: Date;

  if (request.requestedDatetime) {
    requestedDateTime = new Date(request.requestedDatetime);
  } else if (request.requestedDate && request.requestedTimeStart) {
    // Parse the UTC date to get the local date part
    const utcDate = new Date(request.requestedDate);
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    requestedDateTime = new Date(`${year}-${month}-${day}T${request.requestedTimeStart}`);
  } else {
    console.log(`Cannot cancel ${request.requestNumber}: missing date/time`);
    return false;
  }

  if (isNaN(requestedDateTime.getTime())) {
    console.log(`Cannot cancel ${request.requestNumber}: invalid date format`);
    return false;
  }

  if (requestedDateTime > now) {
    console.log(`✅ Can cancel ${request.requestNumber}: scheduled for ${requestedDateTime}`);
    return true;
  } else {
    console.log(`Cannot cancel ${request.requestNumber}: already started (${requestedDateTime} < ${now})`);
    return false;
  }
};

/**
 * Calculate hours until service request starts
 */
export const getHoursUntilStart = (request: ServiceRequest) => {
  const now = new Date();

  // Use new datetime field if available, otherwise fall back to old fields
  let requestedDateTime: Date;

  if (request.requestedDatetime) {
    requestedDateTime = new Date(request.requestedDatetime);
  } else if (request.requestedDate && request.requestedTimeStart) {
    // Parse the UTC date to get the local date part
    const utcDate = new Date(request.requestedDate);
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    requestedDateTime = new Date(`${year}-${month}-${day}T${request.requestedTimeStart}`);
  } else {
    return 0;
  }

  return (requestedDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
};
