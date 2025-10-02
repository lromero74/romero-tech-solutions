import { getPool } from '../config/database.js';

/**
 * TimezoneService - Handles timezone conversions between UTC and business timezone
 *
 * Key concepts:
 * - Database stores all timestamps in UTC
 * - Business operates in Pacific Time (America/Los_Angeles)
 * - Rate tiers (6AM-8PM) are defined in Pacific Time
 * - Auto handles PST/PDT daylight savings transitions
 */
class TimezoneService {
  constructor() {
    this.businessTimezone = 'America/Los_Angeles'; // Default
    this.initialized = false;
  }

  /**
   * Initialize service by loading business timezone from database
   */
  async init() {
    if (this.initialized) return;

    try {
      const pool = await getPool();
      const result = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'business_timezone'`
      );

      if (result.rows.length > 0) {
        this.businessTimezone = result.rows[0].setting_value;
      }

      this.initialized = true;
      console.log(`⏰ TimezoneService initialized with business timezone: ${this.businessTimezone}`);
    } catch (error) {
      console.warn('⚠️ Could not load business timezone from database, using default:', this.businessTimezone);
      this.initialized = true;
    }
  }

  /**
   * Convert a date string and time string in business timezone to UTC Date object
   *
   * This uses a two-step process:
   * 1. Create a Date object representing the business time as if it were UTC
   * 2. Find out what that time actually is in the business timezone
   * 3. Calculate the offset and adjust
   *
   * @param {string} date - Date string in YYYY-MM-DD format
   * @param {string} time - Time string in HH:MM:SS format
   * @returns {Date} UTC Date object
   */
  businessTimeToUTC(date, time) {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes, seconds = 0] = time.split(':').map(Number);

    // We want: "What UTC time corresponds to ${date} ${time} in business timezone?"
    // Method: Use Date.parse with explicit timezone (not available in vanilla JS)
    // Workaround: Create a formatter that can tell us the UTC offset

    // Step 1: Create a reference date in UTC
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

    // Step 2: Get the timezone offset for this date in business timezone
    // The offset changes based on DST, so we must use the specific date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Format our UTC date AS IF it were in the business timezone
    const parts = formatter.formatToParts(utcDate);
    const formatted = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        formatted[part.type] = parseInt(part.value, 10);
      }
    });

    // Create what the formatter thinks is the business time
    const interpretedDate = new Date(Date.UTC(
      formatted.year,
      formatted.month - 1,
      formatted.day,
      formatted.hour,
      formatted.minute,
      formatted.second
    ));

    // The difference between what we want (utcDate) and what it interpreted (interpretedDate)
    // is the timezone offset
    const offset = interpretedDate.getTime() - utcDate.getTime();

    // Adjust the UTC date by the offset to get the correct UTC time
    return new Date(utcDate.getTime() - offset);
  }

  /**
   * Convert UTC Date to business timezone Date
   * @param {Date} utcDate - UTC Date object
   * @returns {Date} Date object representing same moment in business timezone
   */
  utcToBusinessTime(utcDate) {
    const businessString = utcDate.toLocaleString('en-US', {
      timeZone: this.businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Parse the business timezone string back to a Date object
    // Note: This Date will have UTC internals but represents business time
    const [datePart, timePart] = businessString.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');

    return new Date(year, month - 1, day, hour, minute, second);
  }

  /**
   * Get day of week and time string for a UTC timestamp in business timezone
   * @param {Date} utcTimestamp - UTC Date object
   * @returns {{dayOfWeek: number, timeString: string}} Business timezone day and time
   */
  getBusinessDayAndTime(utcTimestamp) {
    const businessDate = new Date(utcTimestamp.toLocaleString('en-US', {
      timeZone: this.businessTimezone
    }));

    const dayOfWeek = businessDate.getDay();

    // Format time as HH:MM:SS
    const hours = String(businessDate.getHours()).padStart(2, '0');
    const minutes = String(businessDate.getMinutes()).padStart(2, '0');
    const seconds = String(businessDate.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    return { dayOfWeek, timeString };
  }

  /**
   * Get rate tier for a given UTC timestamp
   * @param {Date} utcTimestamp - UTC Date object
   * @returns {Promise<{tierName: string, tierLevel: number, rateMultiplier: number} | null>}
   */
  async getRateTierForUTC(utcTimestamp) {
    await this.init();

    const { dayOfWeek, timeString } = this.getBusinessDayAndTime(utcTimestamp);

    const pool = await getPool();
    const result = await pool.query(`
      SELECT tier_name, tier_level, rate_multiplier
      FROM service_hour_rate_tiers
      WHERE is_active = true
        AND day_of_week = $1
        AND time_start <= $2::time
        AND time_end > $2::time
      ORDER BY tier_level ASC
      LIMIT 1
    `, [dayOfWeek, timeString]);

    if (result.rows.length > 0) {
      return {
        tierName: result.rows[0].tier_name,
        tierLevel: result.rows[0].tier_level,
        rateMultiplier: parseFloat(result.rows[0].rate_multiplier)
      };
    }

    return null;
  }

  /**
   * Create UTC Date from date string, interpreting time as business timezone
   * @param {string} date - Date string (YYYY-MM-DD)
   * @param {number} hours - Hours in business timezone
   * @param {number} minutes - Minutes
   * @param {number} seconds - Seconds
   * @returns {Date} UTC Date object
   */
  createBusinessDate(date, hours, minutes = 0, seconds = 0) {
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return this.businessTimeToUTC(date, timeString);
  }

  /**
   * Get current time in business timezone
   * @returns {Date} Current business time
   */
  now() {
    return this.utcToBusinessTime(new Date());
  }
}

// Export singleton instance
export const timezoneService = new TimezoneService();
export default timezoneService;
