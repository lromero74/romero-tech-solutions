import express from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { clientRegistrationService } from '../services/clientRegistrationService.js';
import { query } from '../config/database.js';
import { sessionService } from '../services/sessionService.js';
import { sendNotificationToEmployees } from './pushRoutes.js';

const router = express.Router();

// Validation schema for client registration
const registrationSchema = Joi.object({
  businessName: Joi.string().min(2).max(255).required(),
  businessAddress: Joi.object({
    street: Joi.string().min(5).max(255).required(),
    city: Joi.string().min(2).max(100).required(),
    state: Joi.string().min(2).max(50).required(),
    zipCode: Joi.string().min(5).max(20).required(),
    country: Joi.string().max(50).default('USA')
  }).required(),
  domainEmail: Joi.string().email().required(),
  contactName: Joi.string().min(2).max(255).required(),
  contactEmail: Joi.string().email().required(),
  contactPhone: Joi.string().min(10).max(20).required(),
  jobTitle: Joi.string().max(100).allow('', null),
  serviceAddresses: Joi.array().items(
    Joi.object({
      label: Joi.string().min(1).max(100).required(),
      address: Joi.object({
        street: Joi.string().min(5).max(255).required(),
        city: Joi.string().min(2).max(100).required(),
        state: Joi.string().min(2).max(50).required(),
        zipCode: Joi.string().min(5).max(20).required(),
        country: Joi.string().max(50).default('USA')
      }).required(),
      contactPerson: Joi.string().max(255).allow('', null),
      contactPhone: Joi.string().max(20).allow('', null),
      notes: Joi.string().max(1000).allow('', null)
    })
  ).min(1).required(),
  password: Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required()
});

// Validation schema for email confirmation
const confirmationSchema = Joi.object({
  token: Joi.string().length(64).hex().required(),
  email: Joi.string().email().required()
});

// Validation schema for client login
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(1).required()
});

// POST /api/clients/register - Register new client business
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request received:', JSON.stringify(req.body, null, 2));

    // Validate request body
    const { error, value } = registrationSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    console.log('✅ Validation passed, value:', JSON.stringify(value, null, 2));

    // Validate business domain
    console.log('🔍 Route calling domain validation with:', value.domainEmail);
    const domainValidation = await clientRegistrationService.validateBusinessDomain(value.domainEmail);
    console.log('🔍 Domain validation result:', domainValidation);
    if (!domainValidation.valid) {
      return res.status(400).json({
        success: false,
        message: domainValidation.message
      });
    }

    // Check if email already exists
    const emailExists = await clientRegistrationService.checkEmailExists(value.contactEmail);
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email address already registered'
      });
    }

    // Convert service addresses to expected format
    const serviceAddresses = value.serviceAddresses.map(addr => ({
      label: addr.label,
      street: addr.address.street,
      city: addr.address.city,
      state: addr.address.state,
      zipCode: addr.address.zipCode,
      country: addr.address.country || 'USA',
      contactPerson: addr.contactPerson || null,
      contactPhone: addr.contactPhone || null,
      notes: addr.notes || null
    }));

    // Register client
    const registrationPayload = {
      ...value,
      serviceAddresses
    };
    console.log('🔍 Route sending to service:', JSON.stringify(registrationPayload, null, 2));
    const result = await clientRegistrationService.registerClient(registrationPayload);

    // Send push notification to admin and managers about new client signup
    try {
      const notificationData = {
        title: '🎉 New Client Signup!',
        body: `${value.businessName} has registered as a new client`,
        icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
        badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
        vibrate: [200, 100, 200],
        data: {
          type: 'new_client_signup',
          businessId: result.businessId,
          businessName: value.businessName,
          contactName: value.contactName,
          timestamp: Date.now(),
          url: '/admin/businesses'
        }
      };

      await sendNotificationToEmployees(
        'new_client_signup',
        notificationData,
        'view.businesses.enable'  // Use existing permission for those who can view businesses
      );
      console.log('✅ Push notification sent for new client signup');
    } catch (notificationError) {
      console.error('⚠️ Failed to send push notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        businessId: result.businessId,
        userId: result.userId,
        emailConfirmationSent: result.emailConfirmationSent
      }
    });

  } catch (error) {
    console.error('Client registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
});

// POST /api/clients/confirm-email - Confirm client email
router.post('/confirm-email', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = confirmationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid confirmation token or email',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Confirm email
    const result = await clientRegistrationService.confirmClientEmail(value.token, value.email);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          user: result.user
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Email confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Email confirmation failed'
    });
  }
});

// POST /api/clients/resend-confirmation - Resend confirmation email
router.post('/resend-confirmation', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Validate email format
    const emailSchema = Joi.string().email().required();
    const { error } = emailSchema.validate(email);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Resend confirmation email
    const result = await clientRegistrationService.resendConfirmationEmail(email);

    res.status(200).json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('Resend confirmation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend confirmation email'
    });
  }
});

// GET /api/clients/check-email/:email - Check if email exists
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    // Validate email format
    const emailSchema = Joi.string().email().required();
    const { error } = emailSchema.validate(email);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if email exists
    const exists = await clientRegistrationService.checkEmailExists(email);

    res.status(200).json({
      success: true,
      data: {
        exists,
        message: exists ? 'Email already registered' : 'Email available'
      }
    });

  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check email'
    });
  }
});

// POST /api/clients/validate-domain - Validate business domain
router.post('/validate-domain', async (req, res) => {
  try {
    const { domainEmail } = req.body;

    if (!domainEmail) {
      return res.status(400).json({
        success: false,
        message: 'Domain email is required'
      });
    }

    // Validate domain
    const result = await clientRegistrationService.validateBusinessDomain(domainEmail);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Domain validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Domain validation failed'
    });
  }
});

// POST /api/clients/login - Client authentication
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Client login attempt:', req.body.email);

    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      console.log('❌ Login validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password format'
      });
    }

    const { email, password } = value;

    // Get user from database
    const userResult = await query(`
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        u.business_id,
        u.is_active,
        u.email_verified,
        b.business_name,
        hq.street as primary_street,
        hq.city as primary_city,
        hq.state as primary_state,
        hq.zip_code as primary_zip_code
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      LEFT JOIN service_locations hq ON hq.business_id = b.id AND hq.is_headquarters = true
      WHERE u.email = $1 AND u.role = 'client'
    `, [email]);

    if (userResult.rows.length === 0) {
      console.log('❌ No client user found with email:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User account is deactivated:', email);
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if email is verified
    if (!user.email_verified) {
      console.log('❌ Email not verified:', email);
      return res.status(401).json({
        success: false,
        message: 'Please verify your email address before logging in'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      console.log('❌ Password mismatch for user:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Get user's accessible service locations
    const locationsResult = await query(`
      SELECT
        sl.id,
        sl.address_label,
        sl.street,
        sl.city,
        sl.state,
        sl.zip_code,
        lc.contact_role,
        lc.is_primary_contact
      FROM service_locations sl
      LEFT JOIN location_contacts lc ON sl.id = lc.service_location_id AND lc.user_id = $1
      WHERE sl.business_id = $2 AND sl.is_active = true AND sl.soft_delete = false
    `, [user.id, user.business_id]);

    // Create session
    const session = await sessionService.createSession(
      user.id,
      user.email,
      req.get('User-Agent'),
      req.ip
    );

    // Update last login
    await query(`
      UPDATE users
      SET last_login = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [user.id]);

    console.log('✅ Client login successful:', email);

    // Return successful login response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          business: {
            id: user.business_id,
            name: user.business_name,
            address: {
              street: user.primary_street,
              city: user.primary_city,
              state: user.primary_state,
              zipCode: user.primary_zip_code
            }
          },
          accessibleLocations: locationsResult.rows
        },
        session: {
          token: session.sessionToken,
          expiresAt: session.expiresAt
        }
      }
    });

  } catch (error) {
    console.error('Client login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

export default router;