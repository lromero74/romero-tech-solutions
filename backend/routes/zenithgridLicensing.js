/**
 * ZenithGrid software licensing -- public activation/heartbeat endpoints.
 *
 * First slice of Phase 3 of ZenithGrid's executable-licensing PRP
 * (zenith-grid repo, docs/PRPs/executable-licensing.md). RTS is the
 * integrated license server -- no separate licensing service.
 *
 * Modeled on routes/agents.js's /trial/heartbeat: unauthenticated device
 * check-in with structured `code` fields on every error response, so a
 * machine client (the zenithgrid binary, not a browser) can branch on it
 * without parsing prose.
 *
 * Schema: backend/migrations/20260703_zenithgrid_licensing.sql
 * Requires ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY in .env (ES256 PEM
 * private key, with literal \n escapes -- see getSigningPrivateKey()).
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../config/database.js';

const router = express.Router();

const LICENSE_TOKEN_TTL = '24h';

// Maps a license's `status` column to the structured error `code` a
// non-active status should report. 'active' is handled separately.
const STATUS_ERROR_CODES = {
  suspended: 'LICENSE_SUSPENDED',
  revoked: 'LICENSE_REVOKED',
  expired: 'LICENSE_EXPIRED',
};

function getSigningPrivateKey() {
  const key = process.env.ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY;
  if (!key) {
    throw new Error('ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY is not configured');
  }
  // .env stores the PEM on one line with literal \n escapes -- standard
  // Node convention for multi-line secrets in a single env var.
  return key.replace(/\\n/g, '\n');
}

function signLicenseToken({ license_id, plan_name, expires_at, hardware_fingerprint }) {
  return jwt.sign(
    {
      license_id,
      plan_name,
      expires_at,
      hardware_fingerprint,
      issued_at: new Date().toISOString(),
    },
    getSigningPrivateKey(),
    { algorithm: 'ES256', expiresIn: LICENSE_TOKEN_TTL }
  );
}

/**
 * Checks a license row's status/expiry and returns a structured error
 * response descriptor, or null if the license is currently usable.
 */
function licenseStatusError(license) {
  if (license.status !== 'active') {
    return {
      status: 403,
      body: {
        success: false,
        message: `License is ${license.status}`,
        code: STATUS_ERROR_CODES[license.status] || 'LICENSE_INACTIVE',
      },
    };
  }
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return {
      status: 403,
      body: { success: false, message: 'License has expired', code: 'LICENSE_EXPIRED' },
    };
  }
  return null;
}

/**
 * POST /api/public/zenithgrid/activate
 *
 * Binds a hardware fingerprint to a license, deactivating any previously
 * active device (one device per license). Returns a signed token the
 * client verifies locally.
 */
router.post('/activate', async (req, res) => {
  try {
    const { license_key, hardware_fingerprint, device_name, os_type } = req.body;

    if (!license_key || !hardware_fingerprint) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: license_key, hardware_fingerprint',
        code: 'MISSING_FIELDS',
      });
    }

    const licenseResult = await query(
      `SELECT id, status, expires_at, plan_name FROM zenithgrid_licenses WHERE license_key = $1`,
      [license_key]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'License key not found',
        code: 'LICENSE_NOT_FOUND',
      });
    }
    const license = licenseResult.rows[0];

    const statusError = licenseStatusError(license);
    if (statusError) {
      return res.status(statusError.status).json(statusError.body);
    }

    await transaction(async (client) => {
      // Deactivate the previous device (if any) before activating the new
      // one -- required to satisfy the one-active-activation-per-license
      // partial unique index in the same transaction as the insert.
      await client.query(
        `UPDATE zenithgrid_license_activations SET deactivated_at = NOW()
          WHERE license_id = $1 AND deactivated_at IS NULL`,
        [license.id]
      );
      await client.query(
        `INSERT INTO zenithgrid_license_activations
           (license_id, hardware_fingerprint, device_name, os_type)
         VALUES ($1, $2, $3, $4)`,
        [license.id, hardware_fingerprint, device_name || null, os_type || null]
      );
    });

    const token = signLicenseToken({
      license_id: license.id,
      plan_name: license.plan_name,
      expires_at: license.expires_at,
      hardware_fingerprint,
    });

    console.log(`✅ ZenithGrid license activated: ${license_key} -> ${hardware_fingerprint.slice(0, 8)}...`);

    res.json({
      success: true,
      message: 'License activated',
      data: { token, plan_name: license.plan_name, expires_at: license.expires_at },
    });
  } catch (error) {
    console.error('❌ ZenithGrid license activation error:', error);
    res.status(500).json({
      success: false,
      message: 'Activation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/public/zenithgrid/heartbeat
 *
 * Periodic check-in from an already-activated device. Refreshes the
 * signed token (the token itself is short-lived to force this refresh).
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { license_key, hardware_fingerprint } = req.body;

    if (!license_key || !hardware_fingerprint) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: license_key, hardware_fingerprint',
        code: 'MISSING_FIELDS',
      });
    }

    const result = await query(
      `SELECT l.id, l.status, l.expires_at, l.plan_name,
              a.id AS activation_id, a.hardware_fingerprint AS active_fingerprint
         FROM zenithgrid_licenses l
         LEFT JOIN zenithgrid_license_activations a
           ON a.license_id = l.id AND a.deactivated_at IS NULL
        WHERE l.license_key = $1`,
      [license_key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'License key not found',
        code: 'LICENSE_NOT_FOUND',
      });
    }
    const license = result.rows[0];

    const statusError = licenseStatusError(license);
    if (statusError) {
      return res.status(statusError.status).json(statusError.body);
    }

    if (!license.activation_id) {
      return res.status(404).json({
        success: false,
        message: 'No active activation for this license -- activate first',
        code: 'NOT_ACTIVATED',
      });
    }
    if (license.active_fingerprint !== hardware_fingerprint) {
      return res.status(409).json({
        success: false,
        message: 'This license is active on a different device',
        code: 'FINGERPRINT_MISMATCH',
      });
    }

    await query(
      `UPDATE zenithgrid_license_activations SET last_heartbeat_at = NOW() WHERE id = $1`,
      [license.activation_id]
    );

    const token = signLicenseToken({
      license_id: license.id,
      plan_name: license.plan_name,
      expires_at: license.expires_at,
      hardware_fingerprint,
    });

    res.json({
      success: true,
      message: 'Heartbeat received',
      data: { token, plan_name: license.plan_name, expires_at: license.expires_at },
    });
  } catch (error) {
    console.error('❌ ZenithGrid license heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Heartbeat failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
