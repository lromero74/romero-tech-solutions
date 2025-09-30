import { query } from '../config/database.js';

/**
 * Trusted Device Management Utilities
 * Functions for managing trusted device registration and validation
 */

/**
 * Register a new trusted device for a user
 * @param {string} userId - User ID
 * @param {string} userType - User type ('employee' or 'client')
 * @param {string} deviceFingerprint - Device fingerprint hash
 * @param {string} deviceName - Human-readable device name
 * @param {Object} deviceInfo - Device information object
 * @param {boolean} isSharedDevice - Whether device is shared/public
 * @param {number} trustDurationDays - Days to trust device (default: 30)
 * @returns {Promise<Object>} Created trusted device record
 */
export async function registerTrustedDevice(
  userId,
  userType,
  deviceFingerprint,
  deviceName,
  deviceInfo,
  isSharedDevice = false,
  trustDurationDays = 30
) {
  try {
    const expiresAt = new Date(Date.now() + (trustDurationDays * 24 * 60 * 60 * 1000));

    // Use UPSERT to handle existing devices gracefully
    const result = await query(`
      INSERT INTO trusted_devices (
        user_id, user_type, device_fingerprint, device_name,
        device_info, is_shared_device, expires_at, revoked, revoked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NULL)
      ON CONFLICT (user_id, user_type, device_fingerprint)
      DO UPDATE SET
        device_name = EXCLUDED.device_name,
        device_info = EXCLUDED.device_info,
        is_shared_device = EXCLUDED.is_shared_device,
        expires_at = EXCLUDED.expires_at,
        revoked = FALSE,
        revoked_at = NULL,
        last_used = CURRENT_TIMESTAMP,
        created_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      userId,
      userType,
      deviceFingerprint,
      deviceName,
      JSON.stringify(deviceInfo),
      isSharedDevice,
      expiresAt
    ]);

    console.log(`🔐 Trusted device registered for ${userType} ${userId}: ${deviceName} (expires: ${expiresAt.toISOString()})`);
    return result.rows[0];

  } catch (error) {
    console.error('Error registering trusted device:', error);
    throw new Error('Failed to register trusted device');
  }
}

/**
 * Check if a device is trusted for a user
 * @param {string} userId - User ID
 * @param {string} userType - User type ('employee' or 'client')
 * @param {string} deviceFingerprint - Device fingerprint hash
 * @returns {Promise<Object|null>} Trusted device record if valid, null if not trusted
 */
export async function checkTrustedDevice(userId, userType, deviceFingerprint) {
  try {
    console.log(`🔍 Checking trusted device: userId=${userId}, userType=${userType}, fingerprint=${deviceFingerprint.substring(0, 20)}...`);

    const result = await query(`
      SELECT id, device_name, device_info, is_shared_device,
             last_used, expires_at, created_at
      FROM trusted_devices
      WHERE user_id = $1
        AND user_type = $2
        AND device_fingerprint = $3
        AND revoked = FALSE
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, userType, deviceFingerprint]);

    console.log(`📊 Trusted device query returned ${result.rows.length} rows`);

    if (result.rows.length === 0) {
      console.log(`🔓 No trusted device found for userId=${userId}, userType=${userType}`);
      return null; // Device not trusted
    }

    const trustedDevice = result.rows[0];

    // Update last_used timestamp
    await query(`
      UPDATE trusted_devices
      SET last_used = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [trustedDevice.id]);

    console.log(`✅ Trusted device verified for ${userType} ${userId}: ${trustedDevice.device_name}`);
    return trustedDevice;

  } catch (error) {
    console.error('Error checking trusted device:', error);
    throw new Error('Failed to check trusted device');
  }
}

/**
 * Get all trusted devices for a user
 * @param {string} userId - User ID
 * @param {string} userType - User type ('employee' or 'client')
 * @param {boolean} includeRevoked - Include revoked devices (default: false)
 * @returns {Promise<Array>} Array of trusted device records
 */
export async function getUserTrustedDevices(userId, userType, includeRevoked = false) {
  try {
    const whereClause = includeRevoked
      ? 'WHERE user_id = $1 AND user_type = $2'
      : 'WHERE user_id = $1 AND user_type = $2 AND revoked = FALSE';

    const result = await query(`
      SELECT id, device_fingerprint, device_name, device_info,
             is_shared_device, last_used, expires_at, revoked,
             revoked_at, created_at
      FROM trusted_devices
      ${whereClause}
      ORDER BY created_at DESC
    `, [userId, userType]);

    return result.rows;

  } catch (error) {
    console.error('Error getting user trusted devices:', error);
    throw new Error('Failed to get trusted devices');
  }
}

/**
 * Revoke a trusted device
 * @param {string} deviceId - Trusted device ID
 * @param {string} userId - User ID (for authorization)
 * @param {string} userType - User type (for authorization)
 * @returns {Promise<boolean>} True if revoked successfully
 */
export async function revokeTrustedDevice(deviceId, userId, userType) {
  try {
    const result = await query(`
      UPDATE trusted_devices
      SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND user_type = $3
      RETURNING device_name
    `, [deviceId, userId, userType]);

    if (result.rows.length === 0) {
      return false; // Device not found or not owned by user
    }

    console.log(`🚫 Trusted device revoked for ${userType} ${userId}: ${result.rows[0].device_name}`);
    return true;

  } catch (error) {
    console.error('Error revoking trusted device:', error);
    throw new Error('Failed to revoke trusted device');
  }
}

/**
 * Revoke all trusted devices for a user
 * @param {string} userId - User ID
 * @param {string} userType - User type ('employee' or 'client')
 * @returns {Promise<number>} Number of devices revoked
 */
export async function revokeAllTrustedDevices(userId, userType) {
  try {
    const result = await query(`
      UPDATE trusted_devices
      SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND user_type = $2 AND revoked = FALSE
    `, [userId, userType]);

    console.log(`🚫 All trusted devices revoked for ${userType} ${userId}: ${result.rowCount} devices`);
    return result.rowCount;

  } catch (error) {
    console.error('Error revoking all trusted devices:', error);
    throw new Error('Failed to revoke all trusted devices');
  }
}

/**
 * Clean up expired trusted devices (maintenance function)
 * @returns {Promise<number>} Number of expired devices cleaned up
 */
export async function cleanupExpiredTrustedDevices() {
  try {
    const result = await query(`
      UPDATE trusted_devices
      SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
      WHERE expires_at < CURRENT_TIMESTAMP AND revoked = FALSE
    `);

    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} expired trusted devices`);
    }

    return result.rowCount;

  } catch (error) {
    console.error('Error cleaning up expired trusted devices:', error);
    return 0;
  }
}

/**
 * Extend trusted device expiration
 * @param {string} deviceId - Trusted device ID
 * @param {string} userId - User ID (for authorization)
 * @param {string} userType - User type (for authorization)
 * @param {number} additionalDays - Additional days to extend (default: 30)
 * @returns {Promise<Date|null>} New expiration date if successful
 */
export async function extendTrustedDevice(deviceId, userId, userType, additionalDays = 30) {
  try {
    const newExpiresAt = new Date(Date.now() + (additionalDays * 24 * 60 * 60 * 1000));

    const result = await query(`
      UPDATE trusted_devices
      SET expires_at = $4
      WHERE id = $1 AND user_id = $2 AND user_type = $3 AND revoked = FALSE
      RETURNING device_name, expires_at
    `, [deviceId, userId, userType, newExpiresAt]);

    if (result.rows.length === 0) {
      return null; // Device not found or not owned by user
    }

    console.log(`⏰ Trusted device extended for ${userType} ${userId}: ${result.rows[0].device_name} (new expiry: ${newExpiresAt.toISOString()})`);
    return result.rows[0].expires_at;

  } catch (error) {
    console.error('Error extending trusted device:', error);
    throw new Error('Failed to extend trusted device');
  }
}

/**
 * Determine if MFA should be required based on trusted device status and risk factors
 * @param {string} userId - User ID
 * @param {string} userType - User type ('employee' or 'client')
 * @param {string} deviceFingerprint - Device fingerprint hash
 * @param {Object} riskFactors - Additional risk factors
 * @param {string} riskFactors.action - Action being performed
 * @param {string} riskFactors.ipAddress - Client IP address
 * @param {boolean} riskFactors.newLocation - Whether this is a new location
 * @returns {Promise<Object>} MFA requirement decision with reasons
 */
export async function shouldRequireMFA(userId, userType, deviceFingerprint, riskFactors = {}) {
  try {
    const trustedDevice = await checkTrustedDevice(userId, userType, deviceFingerprint);

    const decision = {
      requireMFA: true,
      reasons: [],
      trustedDevice: trustedDevice,
      riskLevel: 'medium'
    };

    // Check trusted device status
    if (!trustedDevice) {
      decision.reasons.push('Device not registered as trusted');
    } else if (trustedDevice.is_shared_device) {
      decision.reasons.push('Shared/public device - always require MFA');
    } else {
      // Device is trusted and not shared
      decision.requireMFA = false;
      decision.riskLevel = 'low';
    }

    // Risk-based authentication factors
    if (riskFactors.action === 'destructive') {
      decision.requireMFA = true;
      decision.reasons.push('Destructive action requires MFA');
      decision.riskLevel = 'high';
    }

    if (riskFactors.newLocation) {
      decision.requireMFA = true;
      decision.reasons.push('Login from new location');
      decision.riskLevel = 'high';
    }

    // Admin users always require MFA for sensitive actions
    if (userType === 'employee' && riskFactors.action?.includes('admin')) {
      decision.requireMFA = true;
      decision.reasons.push('Administrative action requires MFA');
      decision.riskLevel = 'high';
    }

    console.log(`🔐 MFA decision for ${userType} ${userId}: ${decision.requireMFA ? 'REQUIRED' : 'SKIPPED'} (${decision.reasons.join(', ') || 'Trusted device'})`);
    return decision;

  } catch (error) {
    console.error('Error determining MFA requirement:', error);
    // Default to requiring MFA on error for security
    return {
      requireMFA: true,
      reasons: ['Error checking trusted device - defaulting to MFA required'],
      trustedDevice: null,
      riskLevel: 'high'
    };
  }
}

/**
 * Get trusted device statistics for monitoring
 * @returns {Promise<Object>} Statistics about trusted devices
 */
export async function getTrustedDeviceStats() {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE revoked = FALSE) as active_devices,
        COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP AND revoked = FALSE) as expired_devices,
        COUNT(*) FILTER (WHERE is_shared_device = TRUE) as shared_devices,
        COUNT(DISTINCT user_id) as users_with_trusted_devices
      FROM trusted_devices
    `);

    return result.rows[0];

  } catch (error) {
    console.error('Error getting trusted device stats:', error);
    return {
      total_devices: 0,
      active_devices: 0,
      expired_devices: 0,
      shared_devices: 0,
      users_with_trusted_devices: 0
    };
  }
}

/**
 * Update device name for a trusted device
 * @param {string} deviceId - Trusted device ID
 * @param {string} userId - User ID (for authorization)
 * @param {string} userType - User type (for authorization)
 * @param {string} newDeviceName - New device name
 * @returns {Promise<boolean>} True if updated successfully
 */
export async function updateTrustedDeviceName(deviceId, userId, userType, newDeviceName) {
  try {
    const result = await query(`
      UPDATE trusted_devices
      SET device_name = $4
      WHERE id = $1 AND user_id = $2 AND user_type = $3
      RETURNING device_name
    `, [deviceId, userId, userType, newDeviceName]);

    if (result.rows.length === 0) {
      return false; // Device not found or not owned by user
    }

    console.log(`✏️ Trusted device renamed for ${userType} ${userId}: ${newDeviceName}`);
    return true;

  } catch (error) {
    console.error('Error updating trusted device name:', error);
    throw new Error('Failed to update trusted device name');
  }
}