import express from 'express';
import { passwordComplexityService } from '../../services/passwordComplexityService.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

// GET /password-complexity - Get current password complexity requirements
router.get('/password-complexity', async (req, res) => {
  try {
    const requirements = await passwordComplexityService.getPasswordComplexityRequirements();

    res.status(200).json({
      success: true,
      requirements
    });
  } catch (error) {
    console.error('Error fetching password complexity requirements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch password complexity requirements',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /password-complexity - Update password complexity requirements
router.put('/password-complexity', async (req, res) => {
  try {
    const { requirements } = req.body;

    if (!requirements) {
      return res.status(400).json({
        success: false,
        message: 'Password complexity requirements are required'
      });
    }

    // Validate requirements structure
    const requiredFields = ['minLength', 'requireUppercase', 'requireLowercase', 'requireNumbers', 'requireSpecialCharacters'];
    for (const field of requiredFields) {
      if (requirements[field] === undefined || requirements[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Field '${field}' is required`
        });
      }
    }

    // Validate min length
    if (typeof requirements.minLength !== 'number' || requirements.minLength < 1 || requirements.minLength > 256) {
      return res.status(400).json({
        success: false,
        message: 'minLength must be a number between 1 and 256'
      });
    }

    // Validate max length if provided
    if (requirements.maxLength !== null && requirements.maxLength !== undefined) {
      if (typeof requirements.maxLength !== 'number' || requirements.maxLength < requirements.minLength || requirements.maxLength > 256) {
        return res.status(400).json({
          success: false,
          message: 'maxLength must be a number between minLength and 256'
        });
      }
    }

    // Get user ID from session (assuming it's available in req.user from middleware)
    const userId = req.user?.id || null;

    const updatedRequirements = await passwordComplexityService.updatePasswordComplexityRequirements(requirements, userId);

    // Broadcast password policy update to all admin clients
    websocketService.broadcastEntityUpdate('passwordPolicy', 'global', 'updated', { passwordPolicy: updatedRequirements });

    res.status(200).json({
      success: true,
      message: 'Password complexity requirements updated successfully',
      requirements: updatedRequirements
    });
  } catch (error) {
    console.error('Error updating password complexity requirements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password complexity requirements',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /password-complexity - Create new password complexity requirements
router.post('/password-complexity', async (req, res) => {
  try {
    const { requirements } = req.body;

    if (!requirements) {
      return res.status(400).json({
        success: false,
        message: 'Password complexity requirements are required'
      });
    }

    // Validate requirements structure
    const requiredFields = ['minLength', 'requireUppercase', 'requireLowercase', 'requireNumbers', 'requireSpecialCharacters'];
    for (const field of requiredFields) {
      if (requirements[field] === undefined || requirements[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Field '${field}' is required`
        });
      }
    }

    // Get user ID from session
    const userId = req.user?.id || null;

    const newRequirements = await passwordComplexityService.createPasswordComplexityRequirements(requirements, userId);

    // Broadcast password policy creation to all admin clients
    websocketService.broadcastEntityUpdate('passwordPolicy', 'global', 'created', { passwordPolicy: newRequirements });

    res.status(201).json({
      success: true,
      message: 'Password complexity requirements created successfully',
      requirements: newRequirements
    });
  } catch (error) {
    console.error('Error creating password complexity requirements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create password complexity requirements',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;