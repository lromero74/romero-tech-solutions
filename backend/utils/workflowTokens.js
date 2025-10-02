import crypto from 'crypto';
import { getPool } from '../config/database.js';

/**
 * Generate a unique token for service request workflow actions
 * @param {string} serviceRequestId - UUID of the service request
 * @param {string} actionType - 'acknowledge', 'start', or 'close'
 * @param {string} employeeId - UUID of the employee this token is for
 * @param {string} employeeEmail - Email of the employee
 * @param {number} retryAttempt - Current retry attempt number
 * @param {Date|null} expiresAt - Optional expiration time (null for no expiration)
 * @returns {Promise<{token: string, tokenId: string}>}
 */
export async function generateWorkflowToken(
  serviceRequestId,
  actionType,
  employeeId,
  employeeEmail,
  retryAttempt = 0,
  expiresAt = null
) {
  const pool = await getPool();

  // Generate a cryptographically secure random token
  const token = crypto.randomBytes(32).toString('hex');

  try {
    const insertQuery = `
      INSERT INTO service_request_action_tokens (
        service_request_id,
        token,
        action_type,
        employee_id,
        employee_email,
        retry_attempt,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, token
    `;

    const result = await pool.query(insertQuery, [
      serviceRequestId,
      token,
      actionType,
      employeeId,
      employeeEmail,
      retryAttempt,
      expiresAt
    ]);

    console.log(`🔑 Generated ${actionType} token for employee ${employeeEmail} (attempt ${retryAttempt})`);

    return {
      token: result.rows[0].token,
      tokenId: result.rows[0].id
    };
  } catch (error) {
    console.error('Error generating workflow token:', error);
    throw error;
  }
}

/**
 * Validate and use a workflow token
 * @param {string} token - The token to validate
 * @param {string} employeeId - UUID of the employee attempting to use the token
 * @returns {Promise<{isValid: boolean, serviceRequestId?: string, actionType?: string, error?: string}>}
 */
export async function validateAndUseToken(token, employeeId) {
  const pool = await getPool();

  try {
    // Check if token exists and is valid
    const tokenQuery = `
      SELECT
        id,
        service_request_id,
        action_type,
        employee_id,
        is_used,
        is_expired,
        expires_at
      FROM service_request_action_tokens
      WHERE token = $1
    `;

    const tokenResult = await pool.query(tokenQuery, [token]);

    if (tokenResult.rows.length === 0) {
      return { isValid: false, error: 'Invalid token' };
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is already used
    if (tokenData.is_used) {
      return { isValid: false, error: 'Token has already been used' };
    }

    // Check if token is expired (manually marked)
    if (tokenData.is_expired) {
      return { isValid: false, error: 'Token has expired' };
    }

    // Check if token has timed out
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      // Mark as expired
      await pool.query(
        `UPDATE service_request_action_tokens SET is_expired = true, expired_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [tokenData.id]
      );
      return { isValid: false, error: 'Token has expired' };
    }

    // Check if employee matches (unless action is 'close' which any employee can do)
    if (tokenData.action_type !== 'close' && tokenData.employee_id !== employeeId) {
      return { isValid: false, error: 'Token does not belong to this employee' };
    }

    // Mark token as used
    const updateQuery = `
      UPDATE service_request_action_tokens
      SET is_used = true, used_at = CURRENT_TIMESTAMP, used_by_employee_id = $1
      WHERE id = $2
      RETURNING service_request_id, action_type
    `;

    const updateResult = await pool.query(updateQuery, [employeeId, tokenData.id]);

    console.log(`✅ Token validated and marked as used for action: ${tokenData.action_type}`);

    return {
      isValid: true,
      serviceRequestId: updateResult.rows[0].service_request_id,
      actionType: updateResult.rows[0].action_type
    };
  } catch (error) {
    console.error('Error validating token:', error);
    throw error;
  }
}

/**
 * Expire all tokens of a specific type for a service request
 * @param {string} serviceRequestId - UUID of the service request
 * @param {string} actionType - Type of tokens to expire
 * @param {number} retryAttempt - Optional: Only expire tokens from this retry attempt
 */
export async function expireTokens(serviceRequestId, actionType, retryAttempt = null) {
  const pool = await getPool();

  try {
    let query = `
      UPDATE service_request_action_tokens
      SET is_expired = true, expired_at = CURRENT_TIMESTAMP
      WHERE service_request_id = $1
        AND action_type = $2
        AND is_used = false
        AND is_expired = false
    `;

    const params = [serviceRequestId, actionType];

    if (retryAttempt !== null) {
      query += ` AND retry_attempt = $3`;
      params.push(retryAttempt);
    }

    const result = await pool.query(query, params);

    console.log(`🔒 Expired ${result.rowCount} ${actionType} token(s) for service request ${serviceRequestId}`);

    return result.rowCount;
  } catch (error) {
    console.error('Error expiring tokens:', error);
    throw error;
  }
}

/**
 * Generate tokens for multiple employees
 * @param {string} serviceRequestId - UUID of the service request
 * @param {string} actionType - 'acknowledge', 'start', or 'close'
 * @param {Array<{id: string, email: string}>} employees - Array of employee objects
 * @param {number} retryAttempt - Current retry attempt number
 * @param {Date|null} expiresAt - Optional expiration time
 * @returns {Promise<Array<{employeeId: string, employeeEmail: string, token: string, tokenId: string}>>}
 */
export async function generateTokensForEmployees(
  serviceRequestId,
  actionType,
  employees,
  retryAttempt = 0,
  expiresAt = null
) {
  const tokens = [];

  for (const employee of employees) {
    const tokenData = await generateWorkflowToken(
      serviceRequestId,
      actionType,
      employee.id,
      employee.email,
      retryAttempt,
      expiresAt
    );

    tokens.push({
      employeeId: employee.id,
      employeeEmail: employee.email,
      firstName: employee.firstName || employee.first_name,
      token: tokenData.token,
      tokenId: tokenData.tokenId
    });
  }

  return tokens;
}
