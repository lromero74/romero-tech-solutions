import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { translationService } from './translationService.js';

class SMSService {
  constructor() {
    this.snsClient = new SNSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Rate limiting to prevent SMS spam
    this.sentMessages = new Map(); // phoneNumber -> array of timestamps
    this.maxMessagesPerHour = 5;
    this.maxMessagesPerDay = 20;
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Add +1 if it's a US number without country code
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    // Add + prefix
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);

    // Basic validation for US/international numbers
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(formatted);
  }

  /**
   * Check rate limits for SMS sending
   */
  checkRateLimit(phoneNumber) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    if (!this.sentMessages.has(phoneNumber)) {
      this.sentMessages.set(phoneNumber, []);
    }

    const messages = this.sentMessages.get(phoneNumber);

    // Remove messages older than 24 hours
    const recentMessages = messages.filter(timestamp => now - timestamp < oneDay);
    this.sentMessages.set(phoneNumber, recentMessages);

    // Check hourly limit
    const hourlyMessages = recentMessages.filter(timestamp => now - timestamp < oneHour);
    if (hourlyMessages.length >= this.maxMessagesPerHour) {
      return {
        allowed: false,
        reason: 'Hourly limit exceeded',
        resetTime: Math.min(...hourlyMessages) + oneHour
      };
    }

    // Check daily limit
    if (recentMessages.length >= this.maxMessagesPerDay) {
      return {
        allowed: false,
        reason: 'Daily limit exceeded',
        resetTime: Math.min(...recentMessages) + oneDay
      };
    }

    return { allowed: true };
  }

  /**
   * Record SMS send for rate limiting
   */
  recordSMSSend(phoneNumber) {
    if (!this.sentMessages.has(phoneNumber)) {
      this.sentMessages.set(phoneNumber, []);
    }

    this.sentMessages.get(phoneNumber).push(Date.now());
  }

  /**
   * Send SMS message via AWS SNS
   */
  async sendSMS(phoneNumber, message, options = {}) {
    try {
      // Validate phone number
      if (!this.validatePhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number format');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Check rate limits
      const rateLimitCheck = this.checkRateLimit(formattedPhone);
      if (!rateLimitCheck.allowed) {
        const resetDate = new Date(rateLimitCheck.resetTime);
        throw new Error(`${rateLimitCheck.reason}. Try again after ${resetDate.toLocaleTimeString()}`);
      }

      // Prepare SNS message
      const params = {
        PhoneNumber: formattedPhone,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: options.senderId || 'RomeroTech'
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: options.smsType || 'Transactional'
          }
        }
      };

      console.log(`📱 Sending SMS to ${formattedPhone}: ${message.substring(0, 50)}...`);

      // Send SMS via SNS
      const command = new PublishCommand(params);
      const result = await this.snsClient.send(command);

      // Record send for rate limiting
      this.recordSMSSend(formattedPhone);

      console.log(`✅ SMS sent successfully. MessageId: ${result.MessageId}`);

      return {
        success: true,
        messageId: result.MessageId,
        phoneNumber: formattedPhone
      };

    } catch (error) {
      console.error('❌ Error sending SMS:', error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send MFA code via SMS
   */
  async sendMfaCode(phoneNumber, firstName, mfaCode, userLanguage = 'en') {
    try {
      // Get translated message from database
      const message = await translationService.getTranslation(
        'sms.mfa.message',
        userLanguage,
        { firstName, code: mfaCode }
      );

      return await this.sendSMS(phoneNumber, message, {
        senderId: 'RomeroTech',
        smsType: 'Transactional'
      });

    } catch (error) {
      console.error('❌ Error sending MFA SMS:', error);
      throw error;
    }
  }

  /**
   * Send phone verification code
   */
  async sendPhoneVerification(phoneNumber, firstName, verificationCode, userLanguage = 'en') {
    try {
      // Get translated message from database
      const message = await translationService.getTranslation(
        'sms.phone_verification.message',
        userLanguage,
        { firstName, code: verificationCode }
      );

      return await this.sendSMS(phoneNumber, message, {
        senderId: 'RomeroTech',
        smsType: 'Transactional'
      });

    } catch (error) {
      console.error('❌ Error sending phone verification SMS:', error);
      throw error;
    }
  }

  /**
   * Get SMS sending statistics for a phone number
   */
  getSMSStats(phoneNumber) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    if (!this.sentMessages.has(formattedPhone)) {
      return {
        hourly: { sent: 0, remaining: this.maxMessagesPerHour },
        daily: { sent: 0, remaining: this.maxMessagesPerDay }
      };
    }

    const messages = this.sentMessages.get(formattedPhone);
    const recentMessages = messages.filter(timestamp => now - timestamp < oneDay);
    const hourlyMessages = recentMessages.filter(timestamp => now - timestamp < oneHour);

    return {
      hourly: {
        sent: hourlyMessages.length,
        remaining: Math.max(0, this.maxMessagesPerHour - hourlyMessages.length)
      },
      daily: {
        sent: recentMessages.length,
        remaining: Math.max(0, this.maxMessagesPerDay - recentMessages.length)
      }
    };
  }
}

export const smsService = new SMSService();
export default smsService;