import express from 'express';
import {
  registerTrustedDevice,
  checkTrustedDevice,
  getUserTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  extendTrustedDevice,
  shouldRequireMFA,
  getTrustedDeviceStats,
  updateTrustedDeviceName
} from '../utils/trustedDeviceUtils.js';

const router = express.Router();

/**
 * POST /api/trusted-devices/register
 * Register a new trusted device for the current user
 */
router.post('/register', async (req, res) => {
  try {
    const {
      deviceFingerprint,
      deviceName,
      deviceInfo,
      isSharedDevice = false,
      trustDurationDays = 30
    } = req.body;

    if (!deviceFingerprint || !deviceName || !deviceInfo) {
      return res.status(400).json({
        success: false,
        message: 'Device fingerprint, name, and info are required'
      });
    }

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Prevent registration on shared devices
    if (isSharedDevice) {
      return res.status(400).json({
        success: false,
        message: 'Trusted device registration is not allowed on shared devices'
      });
    }

    const trustedDevice = await registerTrustedDevice(
      userId,
      userType,
      deviceFingerprint,
      deviceName,
      deviceInfo,
      isSharedDevice,
      trustDurationDays
    );

    res.json({
      success: true,
      message: 'Device registered as trusted successfully',
      data: {
        id: trustedDevice.id,
        deviceName: trustedDevice.device_name,
        expiresAt: trustedDevice.expires_at,
        isSharedDevice: trustedDevice.is_shared_device
      }
    });

  } catch (error) {
    console.error('Error registering trusted device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register trusted device'
    });
  }
});

/**
 * POST /api/trusted-devices/check
 * Check if current device is trusted for the user
 */
router.post('/check', async (req, res) => {
  try {
    const { deviceFingerprint } = req.body;

    if (!deviceFingerprint) {
      return res.status(400).json({
        success: false,
        message: 'Device fingerprint is required'
      });
    }

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const trustedDevice = await checkTrustedDevice(userId, userType, deviceFingerprint);

    if (trustedDevice) {
      res.json({
        success: true,
        trusted: true,
        data: {
          deviceName: trustedDevice.device_name,
          lastUsed: trustedDevice.last_used,
          expiresAt: trustedDevice.expires_at,
          isSharedDevice: trustedDevice.is_shared_device
        }
      });
    } else {
      res.json({
        success: true,
        trusted: false,
        message: 'Device is not trusted'
      });
    }

  } catch (error) {
    console.error('Error checking trusted device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check trusted device'
    });
  }
});

/**
 * POST /api/trusted-devices/mfa-required
 * Determine if MFA is required based on device trust and risk factors
 */
router.post('/mfa-required', async (req, res) => {
  try {
    const { deviceFingerprint, action, newLocation } = req.body;

    if (!deviceFingerprint) {
      return res.status(400).json({
        success: false,
        message: 'Device fingerprint is required'
      });
    }

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const riskFactors = {
      action,
      ipAddress: req.ip,
      newLocation
    };

    const mfaDecision = await shouldRequireMFA(userId, userType, deviceFingerprint, riskFactors);

    res.json({
      success: true,
      requireMFA: mfaDecision.requireMFA,
      reasons: mfaDecision.reasons,
      riskLevel: mfaDecision.riskLevel,
      trustedDevice: mfaDecision.trustedDevice ? {
        deviceName: mfaDecision.trustedDevice.device_name,
        isSharedDevice: mfaDecision.trustedDevice.is_shared_device
      } : null
    });

  } catch (error) {
    console.error('Error determining MFA requirement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to determine MFA requirement',
      requireMFA: true // Default to requiring MFA on error
    });
  }
});

/**
 * GET /api/trusted-devices
 * Get all trusted devices for the current user
 */
router.get('/', async (req, res) => {
  try {
    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const includeRevoked = req.query.includeRevoked === 'true';
    const devices = await getUserTrustedDevices(userId, userType, includeRevoked);

    // Format devices for frontend
    const formattedDevices = devices.map(device => ({
      id: device.id,
      deviceName: device.device_name,
      deviceInfo: JSON.parse(device.device_info),
      isSharedDevice: device.is_shared_device,
      lastUsed: device.last_used,
      expiresAt: device.expires_at,
      revoked: device.revoked,
      revokedAt: device.revoked_at,
      createdAt: device.created_at
    }));

    res.json({
      success: true,
      data: formattedDevices
    });

  } catch (error) {
    console.error('Error getting trusted devices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trusted devices'
    });
  }
});

/**
 * DELETE /api/trusted-devices/:deviceId
 * Revoke a specific trusted device
 */
router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const success = await revokeTrustedDevice(deviceId, userId, userType);

    if (success) {
      res.json({
        success: true,
        message: 'Trusted device revoked successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Trusted device not found'
      });
    }

  } catch (error) {
    console.error('Error revoking trusted device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke trusted device'
    });
  }
});

/**
 * DELETE /api/trusted-devices
 * Revoke all trusted devices for the current user
 */
router.delete('/', async (req, res) => {
  try {
    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const revokedCount = await revokeAllTrustedDevices(userId, userType);

    res.json({
      success: true,
      message: `${revokedCount} trusted devices revoked successfully`,
      revokedCount
    });

  } catch (error) {
    console.error('Error revoking all trusted devices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke trusted devices'
    });
  }
});

/**
 * PUT /api/trusted-devices/:deviceId/extend
 * Extend expiration of a trusted device
 */
router.put('/:deviceId/extend', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { additionalDays = 30 } = req.body;

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const newExpiresAt = await extendTrustedDevice(deviceId, userId, userType, additionalDays);

    if (newExpiresAt) {
      res.json({
        success: true,
        message: 'Trusted device expiration extended successfully',
        data: {
          expiresAt: newExpiresAt
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Trusted device not found'
      });
    }

  } catch (error) {
    console.error('Error extending trusted device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend trusted device'
    });
  }
});

/**
 * PUT /api/trusted-devices/:deviceId/rename
 * Update device name for a trusted device
 */
router.put('/:deviceId/rename', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { deviceName } = req.body;

    if (!deviceName || deviceName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Device name is required'
      });
    }

    // Get user info from session
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;

    // Determine user type based on email domain
    const userType = userEmail && userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const success = await updateTrustedDeviceName(deviceId, userId, userType, deviceName.trim());

    if (success) {
      res.json({
        success: true,
        message: 'Device name updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Trusted device not found'
      });
    }

  } catch (error) {
    console.error('Error updating trusted device name:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update device name'
    });
  }
});

/**
 * GET /api/trusted-devices/stats
 * Get trusted device statistics (admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    // Check if user is admin
    const userRole = req.session.role;
    const userRoles = req.session.roles || [];

    if (userRole !== 'admin' && !userRoles.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const stats = await getTrustedDeviceStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting trusted device stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trusted device statistics'
    });
  }
});

export default router;