/**
 * Twilio SMS Service
 * Handles SMS notifications for alerts and other system messages
 */

import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// Validate Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromPhoneNumber) {
  console.warn('⚠️ Twilio credentials not fully configured. SMS notifications will not work.');
  console.warn('Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
}

// Initialize Twilio client
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

class TwilioService {
  constructor() {
    this.client = twilioClient;
    this.fromNumber = fromPhoneNumber;
    this.isConfigured = !!this.client;
  }

  /**
   * Send SMS message
   * @param {string} toPhoneNumber - Recipient phone number (E.164 format: +1234567890)
   * @param {string} message - Message body (max 160 chars for single SMS, 1600 for concatenated)
   * @returns {Promise<object>} - Twilio message response with SID
   */
  async sendSMS(toPhoneNumber, message) {
    if (!this.isConfigured) {
      throw new Error('Twilio service is not configured. Check environment variables.');
    }

    if (!toPhoneNumber) {
      throw new Error('Recipient phone number is required');
    }

    if (!message) {
      throw new Error('Message body is required');
    }

    // Validate phone number format (basic check)
    const cleanedNumber = this._normalizePhoneNumber(toPhoneNumber);
    if (!cleanedNumber.match(/^\+\d{10,15}$/)) {
      throw new Error(`Invalid phone number format: ${toPhoneNumber}. Expected E.164 format (e.g., +12345678900)`);
    }

    // Truncate message if too long (Twilio max is 1600 chars for concatenated SMS)
    if (message.length > 1600) {
      console.warn(`⚠️ SMS message truncated from ${message.length} to 1600 characters`);
      message = message.substring(0, 1597) + '...';
    }

    try {
      console.log(`📱 Sending SMS to ${cleanedNumber} (length: ${message.length} chars)`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: cleanedNumber
      });

      console.log(`✅ SMS sent successfully. SID: ${result.sid}`);

      return {
        success: true,
        sid: result.sid,
        status: result.status,
        to: result.to,
        from: result.from,
        dateCreated: result.dateCreated,
        segments: result.numSegments // Number of SMS segments used
      };

    } catch (error) {
      console.error('❌ Twilio SMS send failed:', error);

      // Parse Twilio error
      const errorInfo = {
        success: false,
        error: error.message,
        code: error.code,
        status: error.status
      };

      // Common Twilio error codes
      if (error.code === 21211) {
        errorInfo.userMessage = 'Invalid phone number';
      } else if (error.code === 21408) {
        errorInfo.userMessage = 'Permission denied for geographic region';
      } else if (error.code === 21610) {
        errorInfo.userMessage = 'Phone number is not verified';
      } else if (error.code === 21614) {
        errorInfo.userMessage = 'Invalid phone number format';
      } else {
        errorInfo.userMessage = 'Failed to send SMS';
      }

      throw errorInfo;
    }
  }

  /**
   * Send alert SMS notification
   * @param {string} toPhoneNumber - Recipient phone number
   * @param {string} alertMessage - Pre-formatted alert message (from translationService)
   * @returns {Promise<object>}
   */
  async sendAlertSMS(toPhoneNumber, alertMessage) {
    return await this.sendSMS(toPhoneNumber, alertMessage);
  }

  /**
   * Send bulk SMS to multiple recipients
   * @param {Array<string>} phoneNumbers - Array of recipient phone numbers
   * @param {string} message - Message to send
   * @returns {Promise<object>} - Summary of sent/failed messages
   */
  async sendBulkSMS(phoneNumbers, message) {
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      throw new Error('Phone numbers array is required and must not be empty');
    }

    console.log(`📱 Sending bulk SMS to ${phoneNumbers.length} recipients`);

    const results = {
      total: phoneNumbers.length,
      sent: 0,
      failed: 0,
      details: []
    };

    // Send SMS messages in parallel (Twilio handles rate limiting)
    const promises = phoneNumbers.map(async (phoneNumber) => {
      try {
        const result = await this.sendSMS(phoneNumber, message);
        results.sent++;
        results.details.push({
          phoneNumber,
          success: true,
          sid: result.sid
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          phoneNumber,
          success: false,
          error: error.message || error.userMessage
        });
      }
    });

    await Promise.all(promises);

    console.log(`✅ Bulk SMS complete: ${results.sent} sent, ${results.failed} failed`);

    return results;
  }

  /**
   * Normalize phone number to E.164 format
   * @param {string} phoneNumber - Phone number in various formats
   * @returns {string} - Phone number in E.164 format
   * @private
   */
  _normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except leading +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // If no + prefix and starts with 1 (US), add +
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        cleaned = '+' + cleaned;
      } else if (cleaned.length === 10) {
        // Assume US number (prepend +1)
        cleaned = '+1' + cleaned;
      } else if (cleaned.length > 10) {
        // Assume country code is included
        cleaned = '+' + cleaned;
      }
    }

    return cleaned;
  }

  /**
   * Check if Twilio service is properly configured
   * @returns {boolean}
   */
  isReady() {
    return this.isConfigured;
  }

  /**
   * Get Twilio account info (for diagnostics)
   * @returns {Promise<object>}
   */
  async getAccountInfo() {
    if (!this.isConfigured) {
      throw new Error('Twilio service is not configured');
    }

    try {
      const account = await this.client.api.accounts(accountSid).fetch();
      return {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type
      };
    } catch (error) {
      console.error('❌ Failed to fetch Twilio account info:', error);
      throw error;
    }
  }

  /**
   * Get message delivery status
   * @param {string} messageSid - Twilio message SID
   * @returns {Promise<object>}
   */
  async getMessageStatus(messageSid) {
    if (!this.isConfigured) {
      throw new Error('Twilio service is not configured');
    }

    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (error) {
      console.error(`❌ Failed to fetch message status for ${messageSid}:`, error);
      throw error;
    }
  }

  /**
   * Validate phone number (checks if it's mobile and can receive SMS)
   * @param {string} phoneNumber - Phone number to validate
   * @returns {Promise<object>} - Validation result with carrier info
   */
  async validatePhoneNumber(phoneNumber) {
    if (!this.isConfigured) {
      throw new Error('Twilio service is not configured');
    }

    const cleanedNumber = this._normalizePhoneNumber(phoneNumber);

    try {
      const lookup = await this.client.lookups.v2
        .phoneNumbers(cleanedNumber)
        .fetch({ fields: 'line_type_intelligence' });

      return {
        valid: true,
        phoneNumber: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        nationalFormat: lookup.nationalFormat,
        lineType: lookup.lineTypeIntelligence?.type, // mobile, landline, voip
        carrier: lookup.lineTypeIntelligence?.carrierName
      };
    } catch (error) {
      console.error(`❌ Phone number validation failed for ${cleanedNumber}:`, error);
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const twilioService = new TwilioService();

// Log initialization status
if (twilioService.isReady()) {
  console.log('✅ Twilio SMS service initialized');
  console.log(`📱 From number: ${fromPhoneNumber}`);
} else {
  console.warn('⚠️ Twilio SMS service NOT initialized (missing credentials)');
}
