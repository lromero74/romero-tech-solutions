/**
 * Policy Automation API Routes
 * Phase 1 - RMM Feature Implementation
 *
 * Provides endpoints for policy-based automation,
 * script library management, and automated remediation.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';

const router = express.Router();

// ============================================================================
// SCRIPT LIBRARY ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/automation/scripts
 * List all automation scripts
 */
router.get('/scripts', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { category, script_type, is_builtin, business_id } = req.query;

    let queryText = `
      SELECT s.*, sc.category_name
      FROM automation_scripts s
      LEFT JOIN script_categories sc ON s.script_category_id = sc.id
      WHERE (s.is_public = true OR s.business_id = $1 OR s.business_id IS NULL)
    `;

    const params = [req.user.business_id || null];
    let paramIndex = 2;

    if (category) {
      queryText += ` AND sc.category_name = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (script_type) {
      queryText += ` AND s.script_type = $${paramIndex}`;
      params.push(script_type);
      paramIndex++;
    }

    if (is_builtin !== undefined) {
      queryText += ` AND s.is_builtin = $${paramIndex}`;
      params.push(is_builtin === 'true');
      paramIndex++;
    }

    queryText += ' ORDER BY s.script_name ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        scripts: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List scripts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scripts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/automation/scripts/:script_id
 * Get detailed information about a specific script
 */
router.get('/scripts/:script_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { script_id } = req.params;

    const result = await query(
      `SELECT s.*, sc.category_name
       FROM automation_scripts s
       LEFT JOIN script_categories sc ON s.script_category_id = sc.id
       WHERE s.id = $1`,
      [script_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Script not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get script error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch script',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/automation/scripts
 * Create a new automation script
 */
router.post('/scripts', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      script_name,
      description,
      script_category_id,
      script_type,
      script_content,
      script_parameters,
      supported_os,
      timeout_seconds,
      requires_elevated,
      is_destructive,
      requires_approval,
      tags
    } = req.body;

    if (!script_name || !script_type || !script_content) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: script_name, script_type, script_content'
      });
    }

    const result = await query(
      `INSERT INTO automation_scripts (
        id, script_name, description, script_category_id, script_type,
        script_content, script_parameters, supported_os, timeout_seconds,
        requires_elevated, is_destructive, requires_approval, tags,
        created_by, business_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        uuidv4(),
        script_name,
        description,
        script_category_id,
        script_type,
        script_content,
        script_parameters ? JSON.stringify(script_parameters) : null,
        supported_os || ['linux', 'macos', 'windows'],
        timeout_seconds || 300,
        requires_elevated || false,
        is_destructive || false,
        requires_approval || false,
        tags || [],
        req.user.id,
        req.user.business_id || null
      ]
    );

    res.json({
      success: true,
      message: 'Script created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create script error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create script',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/automation/script-categories
 * List all script categories
 */
router.get('/script-categories', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM script_categories ORDER BY sort_order ASC'
    );

    res.json({
      success: true,
      data: {
        categories: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch script categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// POLICY MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/automation/policies
 * List all automation policies
 */
router.get('/policies', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id, policy_type, enabled } = req.query;

    let queryText = `
      SELECT p.*, s.script_name
      FROM automation_policies p
      LEFT JOIN automation_scripts s ON p.script_id = s.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (business_id) {
      queryText += ` AND p.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    if (policy_type) {
      queryText += ` AND p.policy_type = $${paramIndex}`;
      params.push(policy_type);
      paramIndex++;
    }

    if (enabled !== undefined) {
      queryText += ` AND p.enabled = $${paramIndex}`;
      params.push(enabled === 'true');
      paramIndex++;
    }

    queryText += ' ORDER BY p.policy_name ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        policies: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/automation/policies
 * Create a new automation policy
 */
router.post('/policies', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      policy_name,
      description,
      business_id,
      policy_type,
      script_id,
      script_parameters,
      execution_mode,
      schedule_cron,
      run_on_assignment,
      notify_on_failure,
      compliance_category
    } = req.body;

    if (!policy_name || !business_id || !policy_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: policy_name, business_id, policy_type'
      });
    }

    const result = await query(
      `INSERT INTO automation_policies (
        id, policy_name, description, business_id, policy_type,
        script_id, script_parameters, execution_mode, schedule_cron,
        run_on_assignment, notify_on_failure, compliance_category,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        uuidv4(),
        policy_name,
        description,
        business_id,
        policy_type,
        script_id,
        script_parameters ? JSON.stringify(script_parameters) : null,
        execution_mode || 'manual',
        schedule_cron,
        run_on_assignment || false,
        notify_on_failure !== undefined ? notify_on_failure : true,
        compliance_category,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'Policy created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PATCH /api/admin/automation/policies/:policy_id
 * Update a policy (toggle enabled, update schedule, etc.)
 */
router.patch('/policies/:policy_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const { enabled, schedule_cron, execution_mode } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex}`);
      values.push(enabled);
      paramIndex++;
    }

    if (schedule_cron !== undefined) {
      updates.push(`schedule_cron = $${paramIndex}`);
      values.push(schedule_cron);
      paramIndex++;
    }

    if (execution_mode !== undefined) {
      updates.push(`execution_mode = $${paramIndex}`);
      values.push(execution_mode);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');
    values.push(policy_id);

    await query(
      `UPDATE automation_policies
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}`,
      values
    );

    res.json({
      success: true,
      message: 'Policy updated successfully'
    });
  } catch (error) {
    console.error('Update policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// POLICY ASSIGNMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/admin/automation/policies/:policy_id/assign
 * Assign a policy to agents or business
 */
router.post('/policies/:policy_id/assign', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const { agent_device_id, business_id, run_immediately } = req.body;

    if (!agent_device_id && !business_id) {
      return res.status(400).json({
        success: false,
        message: 'Must specify either agent_device_id or business_id'
      });
    }

    const result = await query(
      `INSERT INTO policy_assignments (
        id, policy_id, agent_device_id, business_id, assigned_by
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (policy_id, agent_device_id, business_id) DO UPDATE
      SET is_active = true, assigned_at = NOW()
      RETURNING *`,
      [uuidv4(), policy_id, agent_device_id, business_id, req.user.id]
    );

    // TODO: If run_immediately is true, trigger policy execution

    res.json({
      success: true,
      message: 'Policy assigned successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Assign policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/automation/policies/:policy_id/assignments
 * Get all assignments for a policy
 */
router.get('/policies/:policy_id/assignments', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;

    const result = await query(
      `SELECT pa.*, ad.device_name, b.business_name
       FROM policy_assignments pa
       LEFT JOIN agent_devices ad ON pa.agent_device_id = ad.id
       LEFT JOIN businesses b ON pa.business_id = b.id
       WHERE pa.policy_id = $1 AND pa.is_active = true
       ORDER BY pa.assigned_at DESC`,
      [policy_id]
    );

    res.json({
      success: true,
      data: {
        assignments: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get policy assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy assignments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/automation/policies/:policy_id/execute
 * Manually trigger policy execution
 */
router.post('/policies/:policy_id/execute', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const { agent_device_id } = req.body;

    // TODO: Implement actual policy execution logic
    // This would send the script to the agent via the command system

    res.json({
      success: true,
      message: 'Policy execution initiated',
      data: {
        policy_id,
        agent_device_id,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Execute policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/automation/execution-history
 * Get policy execution history
 */
router.get('/execution-history', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id, agent_device_id, status, limit = 100 } = req.query;

    let queryText = `
      SELECT peh.*, p.policy_name, ad.device_name
      FROM policy_execution_history peh
      LEFT JOIN automation_policies p ON peh.policy_id = p.id
      LEFT JOIN agent_devices ad ON peh.agent_device_id = ad.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (policy_id) {
      queryText += ` AND peh.policy_id = $${paramIndex}`;
      params.push(policy_id);
      paramIndex++;
    }

    if (agent_device_id) {
      queryText += ` AND peh.agent_device_id = $${paramIndex}`;
      params.push(agent_device_id);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND peh.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ` ORDER BY peh.started_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(queryText, params);

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
    console.error('Get execution history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch execution history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/automation/templates
 * List available policy templates
 */
router.get('/templates', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { category } = req.query;

    let queryText = 'SELECT * FROM policy_templates WHERE is_public = true';
    const params = [];

    if (category) {
      queryText += ' AND category = $1';
      params.push(category);
    }

    queryText += ' ORDER BY usage_count DESC, template_name ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        templates: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy templates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
