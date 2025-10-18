/**
 * Software Deployment API Routes
 * Phase 1 - RMM Feature Implementation
 *
 * Provides endpoints for software package deployment,
 * patch management, and maintenance windows.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/admin/software/packages
 * List all available software packages
 */
router.get('/packages', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { category, os, approved_only = 'true' } = req.query;

    let queryText = `
      SELECT * FROM software_packages
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (category) {
      queryText += ` AND package_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (os) {
      queryText += ` AND $${paramIndex} = ANY(supported_os)`;
      params.push(os);
      paramIndex++;
    }

    if (approved_only === 'true') {
      queryText += ' AND is_approved = true';
    }

    queryText += ' ORDER BY package_name ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        packages: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch software packages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/software/packages
 * Add a new software package to the catalog
 */
router.post('/packages', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      package_name,
      package_version,
      publisher,
      description,
      package_type,
      supported_os,
      source_type,
      source_url,
      checksum_value,
      install_command,
      requires_reboot,
      package_size_mb
    } = req.body;

    if (!package_name || !package_type || !source_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: package_name, package_type, source_type'
      });
    }

    const result = await query(
      `INSERT INTO software_packages (
        id, package_name, package_version, publisher, description,
        package_type, supported_os, source_type, source_url,
        checksum_value, install_command, requires_reboot,
        package_size_mb, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        uuidv4(),
        package_name,
        package_version,
        publisher,
        description,
        package_type,
        supported_os || ['linux', 'macos', 'windows'],
        source_type,
        source_url,
        checksum_value,
        install_command,
        requires_reboot || false,
        package_size_mb,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Package added to catalog',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create package error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create package',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/software/deploy
 * Create a new deployment job
 */
router.post('/deploy', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      package_id,
      deployment_scope, // single_agent, business, all_agents
      agent_device_id,
      business_id,
      scheduled_for,
      allow_reboot,
      requires_approval
    } = req.body;

    if (!package_id || !deployment_scope) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: package_id, deployment_scope'
      });
    }

    // Validate scope parameters
    if (deployment_scope === 'single_agent' && !agent_device_id) {
      return res.status(400).json({
        success: false,
        message: 'agent_device_id required for single_agent deployment'
      });
    }

    if (deployment_scope === 'business' && !business_id) {
      return res.status(400).json({
        success: false,
        message: 'business_id required for business deployment'
      });
    }

    const deploymentId = uuidv4();

    const result = await query(
      `INSERT INTO package_deployments (
        id, package_id, deployment_scope, agent_device_id, business_id,
        scheduled_for, allow_reboot, requires_approval, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        deploymentId,
        package_id,
        deployment_scope,
        agent_device_id,
        business_id,
        scheduled_for || new Date(),
        allow_reboot || false,
        requires_approval || false,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Deployment job created',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create deployment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create deployment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/software/deployments
 * List all deployment jobs
 */
router.get('/deployments', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { status, business_id } = req.query;

    let queryText = `
      SELECT d.*, p.package_name, p.package_version, p.package_type
      FROM package_deployments d
      LEFT JOIN software_packages p ON d.package_id = p.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      queryText += ` AND d.deployment_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (business_id) {
      queryText += ` AND d.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    queryText += ' ORDER BY d.created_at DESC LIMIT 100';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        deployments: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List deployments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deployments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/software/deployments/:deployment_id/history
 * Get deployment history for a specific deployment job
 */
router.get('/deployments/:deployment_id/history', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { deployment_id } = req.params;

    const result = await query(
      `SELECT h.*, ad.device_name, ad.os_type
       FROM deployment_history h
       LEFT JOIN agent_devices ad ON h.agent_device_id = ad.id
       WHERE h.deployment_id = $1
       ORDER BY h.started_at DESC`,
      [deployment_id]
    );

    res.json({
      success: true,
      data: {
        history: result.rows,
        count: result.rows.length,
        success_count: result.rows.filter(h => h.status === 'completed').length,
        failure_count: result.rows.filter(h => h.status === 'failed').length
      }
    });
  } catch (error) {
    console.error('Get deployment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deployment history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/software/deployments/:deployment_id/cancel
 * Cancel a pending deployment
 */
router.post('/deployments/:deployment_id/cancel', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { deployment_id } = req.params;

    await query(
      `UPDATE package_deployments
       SET deployment_status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND deployment_status IN ('pending', 'scheduled')`,
      [deployment_id]
    );

    res.json({
      success: true,
      message: 'Deployment cancelled'
    });
  } catch (error) {
    console.error('Cancel deployment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel deployment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/software/schedules
 * List all maintenance windows
 */
router.get('/schedules', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id } = req.query;

    let queryText = `SELECT * FROM deployment_schedules WHERE 1=1`;
    const params = [];

    if (business_id) {
      queryText += ' AND business_id = $1';
      params.push(business_id);
    }

    queryText += ' ORDER BY schedule_name ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        schedules: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List schedules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance windows',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/software/schedules
 * Create a new maintenance window
 */
router.post('/schedules', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      schedule_name,
      business_id,
      schedule_type,
      start_time,
      end_time,
      recurring_pattern,
      day_of_week
    } = req.body;

    if (!schedule_name || !business_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: schedule_name, business_id'
      });
    }

    const result = await query(
      `INSERT INTO deployment_schedules (
        id, schedule_name, business_id, schedule_type,
        start_time, end_time, recurring_pattern, day_of_week, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        uuidv4(),
        schedule_name,
        business_id,
        schedule_type || 'recurring',
        start_time,
        end_time,
        recurring_pattern,
        day_of_week,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Maintenance window created',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create maintenance window',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
