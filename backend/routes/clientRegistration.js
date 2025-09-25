import express from 'express';
import Joi from 'joi';
import { clientRegistrationService } from '../services/clientRegistrationService.js';

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

export default router;