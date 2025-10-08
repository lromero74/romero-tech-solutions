import { query, transaction } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { sendConfirmationEmail } from './emailService.js';

class ClientRegistrationService {
  /**
   * Register a new client business and primary contact
   */
  async registerClient(registrationData) {
    try {
      console.log('🔍 Service received registration data:', JSON.stringify(registrationData, null, 2));

      const {
        businessName,
        businessAddress,
        domainEmail,
        contactName,
        contactEmail,
        contactPhone,
        jobTitle = null,
        timezonePreference = null,
        serviceAddresses,
        password
      } = registrationData;

      console.log('🔍 Destructured values:', {
        businessName, domainEmail, contactEmail, contactName, contactPhone,
        businessAddress: !!businessAddress, serviceAddresses: !!serviceAddresses
      });

      // Validate business domain email
      if (!this.validateEmailDomainMatch(contactEmail, domainEmail)) {
        throw new Error('Contact email must use the business domain');
      }

      // Check if email already exists
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        [contactEmail]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email address already registered');
      }

      // Generate confirmation token and expiration
      const confirmationToken = this.generateSecureToken();
      const confirmationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Use transaction to ensure data consistency
      const result = await transaction(async (client) => {
        // Call the stored procedure to register business and user
        const registrationResult = await client.query(`
          SELECT * FROM register_client_business($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          businessName,
          domainEmail,
          businessAddress.street,
          businessAddress.city,
          businessAddress.state,
          businessAddress.zipCode,
          businessAddress.country || 'USA',
          contactName,
          contactEmail,
          contactPhone,
          jobTitle,
          null, // cognito_id will be set after Cognito user creation
          passwordHash,
          confirmationToken,
          confirmationExpires
        ]);

        const { business_id, user_id, success, message } = registrationResult.rows[0];

        if (!success) {
          throw new Error(message);
        }

        // Add service addresses
        if (serviceAddresses && serviceAddresses.length > 0) {
          const addressesResult = await client.query(`
            SELECT * FROM add_service_addresses($1, $2)
          `, [
            business_id,
            JSON.stringify(serviceAddresses)
          ]);

          if (!addressesResult.rows[0].success) {
            throw new Error(`Failed to add service addresses: ${addressesResult.rows[0].message}`);
          }
        }

        // Update user timezone preference if provided
        if (timezonePreference) {
          await client.query(`
            UPDATE users
            SET timezone_preference = $1
            WHERE id = $2
          `, [timezonePreference, user_id]);
          console.log(`✅ Set timezone preference for new user: ${timezonePreference}`);
        }

        return {
          businessId: business_id,
          userId: user_id,
          confirmationToken
        };
      });

      // Send confirmation email
      const confirmationUrl = `${process.env.FRONTEND_URL}/confirm-email?token=${confirmationToken}&email=${encodeURIComponent(contactEmail)}`;

      await sendConfirmationEmail({
        toEmail: contactEmail,
        businessName,
        contactName,
        confirmationUrl
      });

      return {
        success: true,
        message: 'Registration successful! Please check your email to confirm your account.',
        businessId: result.businessId,
        userId: result.userId,
        emailConfirmationSent: true
      };

    } catch (error) {
      console.error('Error registering client:', error);
      throw new Error(error.message || 'Registration failed');
    }
  }

  /**
   * Confirm client email and activate account
   */
  async confirmClientEmail(token, email) {
    try {
      // Call stored procedure to confirm email
      const result = await query(`
        SELECT * FROM confirm_client_email($1, $2)
      `, [token, email]);

      const { user_id, business_id, success, message } = result.rows[0];

      if (!success) {
        return {
          success: false,
          message: message
        };
      }

      // Get user information for return
      const userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, b.business_name
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        WHERE u.id = $1
      `, [user_id]);

      const user = userResult.rows[0];

      return {
        success: true,
        message: 'Email confirmed successfully! Your account is now active.',
        user: {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`.trim(),
          role: user.role,
          businessName: user.business_name
        }
      };

    } catch (error) {
      console.error('Error confirming email:', error);
      return {
        success: false,
        message: 'Email confirmation failed'
      };
    }
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail(email) {
    try {
      // Get user and business information
      const result = await query(`
        SELECT u.id, u.first_name, u.last_name, u.confirmation_token, u.confirmation_expires_at, b.business_name
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        WHERE u.email = $1 AND u.email_verified = FALSE
      `, [email]);

      if (result.rows.length === 0) {
        throw new Error('User not found or email already confirmed');
      }

      const user = result.rows[0];

      // Check if token is still valid (not expired)
      const now = new Date();
      const tokenExpires = new Date(user.confirmation_expires_at);

      let confirmationToken = user.confirmation_token;

      // Generate new token if current one is expired
      if (tokenExpires < now) {
        confirmationToken = this.generateSecureToken();
        const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await query(`
          UPDATE users
          SET confirmation_token = $1, confirmation_expires_at = $2
          WHERE email = $3
        `, [confirmationToken, newExpires, email]);
      }

      // Resend email
      const confirmationUrl = `${process.env.FRONTEND_URL}/confirm-email?token=${confirmationToken}&email=${encodeURIComponent(email)}`;

      await sendConfirmationEmail({
        toEmail: email,
        businessName: user.business_name,
        contactName: `${user.first_name} ${user.last_name}`.trim(),
        confirmationUrl
      });

      return {
        success: true,
        message: 'Confirmation email resent successfully!'
      };

    } catch (error) {
      console.error('Error resending confirmation email:', error);
      throw new Error(error.message || 'Failed to resend confirmation email');
    }
  }

  /**
   * Check if email is already registered
   */
  async checkEmailExists(email) {
    try {
      const result = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
    }
  }

  /**
   * Validate business domain
   */
  async validateBusinessDomain(domainEmail) {
    console.log('🔍 Async validateBusinessDomain called with:', domainEmail);

    // Basic validation
    if (!domainEmail || !domainEmail.includes('@') || !domainEmail.includes('.')) {
      console.log('❌ Invalid email format:', domainEmail);
      return {
        valid: false,
        message: 'Invalid email domain format'
      };
    }

    // Check if it's a business domain (not free email providers)
    const domain = domainEmail.split('@')[1].toLowerCase();
    const freeEmailProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
    ];

    if (freeEmailProviders.includes(domain)) {
      return {
        valid: false,
        message: 'Please use your business domain email address'
      };
    }

    return {
      valid: true
    };
  }

  /**
   * Validate that contact email matches business domain
   */
  validateEmailDomainMatch(contactEmail, domainEmail) {
    if (!contactEmail || !domainEmail) {
      console.error('validateEmailDomainMatch: Missing parameters', { contactEmail, domainEmail });
      return false;
    }

    const contactDomain = contactEmail.split('@')[1];
    const businessDomain = domainEmail.split('@')[1];
    return contactDomain === businessDomain;
  }

  /**
   * Generate secure confirmation token
   */
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }
}

export const clientRegistrationService = new ClientRegistrationService();
export default clientRegistrationService;