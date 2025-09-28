import twilio from 'twilio';
import translationService from './translationService.js';

class TwilioSmsService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

    console.log('🔧 TwilioSmsService initialized');
    console.log(`📱 From Number: ${this.fromNumber}`);
  }

  async sendSMS(to, message, options = {}) {
    try {
      console.log(`📱 Sending SMS via Twilio to ${to}`);
      console.log(`📨 Message: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to,
        ...options
      });

      console.log(`✅ Twilio SMS sent successfully. SID: ${result.sid}`);
      console.log(`📊 Status: ${result.status}`);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        provider: 'twilio'
      };
    } catch (error) {
      console.error('❌ Twilio SMS error:', error);
      throw new Error(`Twilio SMS failed: ${error.message}`);
    }
  }

  async sendMfaCode(phoneNumber, firstName, mfaCode, userLanguage = 'en') {
    try {
      console.log(`🚀 TwilioSmsService.sendMfaCode called:`);
      console.log(`  📱 Phone: ${phoneNumber}`);
      console.log(`  👤 Name: ${firstName}`);
      console.log(`  🔑 Code: ${mfaCode}`);
      console.log(`  🌐 Language: ${userLanguage}`);

      // Get translated message from database (reuse existing translation system)
      const message = await translationService.getTranslation(
        'sms.mfa.message',
        userLanguage,
        { firstName, code: mfaCode }
      );

      console.log(`📝 Translated message: ${message}`);

      return await this.sendSMS(phoneNumber, message);
    } catch (error) {
      console.error('❌ Error sending MFA SMS via Twilio:', error);
      throw error;
    }
  }

  // Test method to verify Twilio connection
  async testConnection() {
    try {
      console.log('🧪 Testing Twilio connection...');

      // Validate account by fetching account info
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();

      console.log(`✅ Twilio connection successful`);
      console.log(`📋 Account: ${account.friendlyName}`);
      console.log(`💰 Status: ${account.status}`);

      return {
        success: true,
        account: {
          sid: account.sid,
          friendlyName: account.friendlyName,
          status: account.status
        }
      };
    } catch (error) {
      console.error('❌ Twilio connection test failed:', error);
      throw new Error(`Twilio connection failed: ${error.message}`);
    }
  }
}

export default new TwilioSmsService();