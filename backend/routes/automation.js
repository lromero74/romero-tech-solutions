import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import { policySchedulerService } from '../services/policySchedulerService.js';

const router = express.Router();

/**
 * Get Script Categories
 * GET /api/automation/categories
 */
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM script_categories ORDER BY sort_order ASC`,
      []
    );

    res.json({
      success: true,
      data: {
        categories: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get script categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch script categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Automation Scripts
 * GET /api/automation/scripts
 */
router.get('/scripts', authMiddleware, async (req, res) => {
  try {
    const { category_id, script_type, is_builtin, search } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        s.*,
        sc.category_name,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM automation_scripts s
      LEFT JOIN script_categories sc ON s.script_category_id = sc.id
      LEFT JOIN employees e ON s.created_by = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by category
    if (category_id) {
      queryText += ` AND s.script_category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }

    // Filter by script type
    if (script_type) {
      queryText += ` AND s.script_type = $${paramIndex}`;
      params.push(script_type);
      paramIndex++;
    }

    // Filter by builtin status
    if (is_builtin !== undefined) {
      queryText += ` AND s.is_builtin = $${paramIndex}`;
      params.push(is_builtin === 'true');
      paramIndex++;
    }

    // Search by name/description
    if (search) {
      queryText += ` AND (s.script_name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by business access (customers only see public + their own scripts)
    if (!isEmployee) {
      queryText += ` AND (s.is_public = true OR s.business_id = $${paramIndex})`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    queryText += ' ORDER BY s.created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        scripts: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('List automation scripts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation scripts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Single Script
 * GET /api/automation/scripts/:script_id
 */
router.get('/scripts/:script_id', authMiddleware, async (req, res) => {
  try {
    const { script_id } = req.params;

    const result = await query(
      `SELECT
        s.*,
        sc.category_name,
        e.first_name || ' ' || e.last_name as created_by_name
       FROM automation_scripts s
       LEFT JOIN script_categories sc ON s.script_category_id = sc.id
       LEFT JOIN employees e ON s.created_by = e.id
       WHERE s.id = $1`,
      [script_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Script not found',
        code: 'SCRIPT_NOT_FOUND'
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
 * Create Automation Script
 * POST /api/automation/scripts
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
      is_public,
      business_id,
      tags
    } = req.body;

    if (!script_name || !script_type || !script_content) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: script_name, script_type, script_content',
        code: 'MISSING_FIELDS'
      });
    }

    const scriptId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO automation_scripts (
        id, script_name, description, script_category_id, script_type,
        script_content, script_parameters, supported_os, timeout_seconds,
        requires_elevated, is_destructive, requires_approval, is_public,
        business_id, created_by, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        scriptId,
        script_name,
        description || null,
        script_category_id || null,
        script_type,
        script_content,
        script_parameters ? JSON.stringify(script_parameters) : null,
        supported_os || ['linux', 'macos', 'windows'],
        timeout_seconds || 300,
        requires_elevated || false,
        is_destructive || false,
        requires_approval || false,
        is_public !== undefined ? is_public : true,
        business_id || null,
        employeeId,
        tags || null
      ]
    );

    console.log(`✅ Automation script created: ${script_name} (${scriptId})`);

    res.json({
      success: true,
      message: 'Script created successfully',
      data: { script_id: scriptId }
    });
  } catch (error) {
    console.error('Create automation script error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create script',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Single Automation Policy
 * GET /api/automation/policies/:policy_id
 */
router.get('/policies/:policy_id', authMiddleware, async (req, res) => {
  try {
    const { policy_id } = req.params;

    const result = await query(
      `SELECT
        p.*,
        s.script_name,
        e.first_name || ' ' || e.last_name as created_by_name,
        b.business_name
       FROM automation_policies p
       LEFT JOIN automation_scripts s ON p.script_id = s.id
       LEFT JOIN employees e ON p.created_by = e.id
       LEFT JOIN businesses b ON p.business_id = b.id
       WHERE p.id = $1`,
      [policy_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found',
        code: 'POLICY_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Automation Policies
 * GET /api/automation/policies
 */
router.get('/policies', authMiddleware, async (req, res) => {
  try {
    const { business_id, enabled, policy_type } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        p.*,
        s.script_name,
        e.first_name || ' ' || e.last_name as created_by_name,
        b.business_name
      FROM automation_policies p
      LEFT JOIN automation_scripts s ON p.script_id = s.id
      LEFT JOIN employees e ON p.created_by = e.id
      LEFT JOIN businesses b ON p.business_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by business
    if (!isEmployee) {
      queryText += ` AND p.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
      paramIndex++;
    } else if (business_id) {
      queryText += ` AND p.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    // Filter by enabled status
    if (enabled !== undefined) {
      queryText += ` AND p.enabled = $${paramIndex}`;
      params.push(enabled === 'true');
      paramIndex++;
    }

    // Filter by policy type
    if (policy_type) {
      queryText += ` AND p.policy_type = $${paramIndex}`;
      params.push(policy_type);
      paramIndex++;
    }

    queryText += ' ORDER BY p.created_at DESC';

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
 * Create Automation Policy
 * POST /api/automation/policies
 */
router.post('/policies', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      policy_name,
      description,
      policy_type,
      business_id,
      script_id,
      script_parameters,
      execution_mode,
      schedule_cron,
      run_on_assignment,
      enabled
    } = req.body;

    if (!policy_name || !policy_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: policy_name, policy_type',
        code: 'MISSING_FIELDS'
      });
    }

    const policyId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO automation_policies (
        id, policy_name, description, policy_type, business_id, created_by,
        script_id, script_parameters, execution_mode, schedule_cron,
        run_on_assignment, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        policyId,
        policy_name,
        description || null,
        policy_type,
        business_id || null,
        employeeId,
        script_id || null,
        script_parameters ? JSON.stringify(script_parameters) : null,
        execution_mode || 'manual',
        schedule_cron || null,
        run_on_assignment !== undefined ? run_on_assignment : false,
        enabled !== undefined ? enabled : true
      ]
    );

    console.log(`✅ Automation policy created: ${policy_name} (${policyId})`);

    res.json({
      success: true,
      message: 'Policy created successfully',
      data: { policy_id: policyId }
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
 * Get Policies Assigned to Business
 * GET /api/automation/businesses/:business_id/policies
 *
 * Shows all policies assigned to a specific business
 */
router.get('/businesses/:business_id/policies', authMiddleware, async (req, res) => {
  try {
    const { business_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    // RBAC: customers can only view their own business
    if (!isEmployee && req.user.business_id !== business_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get all policies assigned to this business
    const result = await query(
      `SELECT
        p.id,
        p.policy_name,
        p.description,
        p.policy_type,
        p.execution_mode,
        p.schedule_cron,
        p.run_on_assignment,
        p.enabled,
        s.script_name,
        s.supported_os,
        pa.id as assignment_id,
        pa.assigned_at,
        e.first_name || ' ' || e.last_name as assigned_by_name,
        (
          SELECT COUNT(*)
          FROM agent_devices ad
          WHERE ad.business_id = $1
            AND ad.soft_delete = false
            AND ad.status IN ('online', 'offline')
            AND (
              s.supported_os IS NULL
              OR s.supported_os = '{}'
              OR ad.os_type = ANY(s.supported_os)
            )
        ) as compatible_agents_count,
        (
          SELECT COUNT(*)
          FROM agent_devices ad
          WHERE ad.business_id = $1
            AND ad.soft_delete = false
            AND ad.status IN ('online', 'offline')
        ) as total_agents_count
       FROM policy_assignments pa
       INNER JOIN automation_policies p ON pa.policy_id = p.id
       LEFT JOIN automation_scripts s ON p.script_id = s.id
       LEFT JOIN employees e ON pa.assigned_by = e.id
       WHERE pa.business_id = $1
       ORDER BY pa.assigned_at DESC`,
      [business_id]
    );

    res.json({
      success: true,
      data: {
        policies: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get business policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business policies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Policy Assignments
 * GET /api/automation/policies/:policy_id/assignments
 */
router.get('/policies/:policy_id/assignments', authMiddleware, async (req, res) => {
  try {
    const { policy_id } = req.params;

    const result = await query(
      `SELECT
        pa.*,
        ad.device_name as agent_name,
        ad.device_type,
        b.business_name,
        e.first_name || ' ' || e.last_name as assigned_by_name
       FROM policy_assignments pa
       LEFT JOIN agent_devices ad ON pa.agent_device_id = ad.id
       LEFT JOIN businesses b ON pa.business_id = b.id
       LEFT JOIN employees e ON pa.assigned_by = e.id
       WHERE pa.policy_id = $1
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
 * Assign Policy to Agent/Business
 * POST /api/automation/policies/:policy_id/assignments
 */
router.post('/policies/:policy_id/assignments', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const { agent_device_id, business_id } = req.body;

    if (!agent_device_id && !business_id) {
      return res.status(400).json({
        success: false,
        message: 'Either agent_device_id or business_id is required',
        code: 'MISSING_TARGET'
      });
    }

    // Variable to store compatibility stats for business assignments
    let compatibilityStats = null;

    // Validate OS compatibility
    if (agent_device_id) {
      // Direct agent assignment - block if incompatible
      const compatibilityCheck = await query(
        `SELECT
          ad.device_name,
          ad.os_type,
          s.script_name,
          s.supported_os
         FROM agent_devices ad
         CROSS JOIN automation_policies p
         LEFT JOIN automation_scripts s ON p.script_id = s.id
         WHERE ad.id = $1 AND p.id = $2`,
        [agent_device_id, policy_id]
      );

      if (compatibilityCheck.rows.length > 0) {
        const check = compatibilityCheck.rows[0];
        const supportedOS = check.supported_os;

        // Check OS compatibility if script has OS restrictions
        if (supportedOS && supportedOS.length > 0 && !supportedOS.includes(check.os_type)) {
          return res.status(400).json({
            success: false,
            message: `OS incompatibility: Agent "${check.device_name}" runs ${check.os_type}, but script "${check.script_name}" only supports: ${supportedOS.join(', ')}`,
            code: 'OS_INCOMPATIBLE',
            data: {
              agent_os: check.os_type,
              supported_os: supportedOS
            }
          });
        }
      }
    } else if (business_id) {
      // Business assignment - show compatibility statistics
      const compatibilityStats = await query(
        `SELECT
          COUNT(*) as total_agents,
          COUNT(CASE WHEN (
            s.supported_os IS NULL
            OR s.supported_os = '{}'
            OR ad.os_type = ANY(s.supported_os)
          ) THEN 1 END) as compatible_agents,
          COUNT(CASE WHEN (
            s.supported_os IS NOT NULL
            AND s.supported_os != '{}'
            AND NOT (ad.os_type = ANY(s.supported_os))
          ) THEN 1 END) as incompatible_agents,
          s.script_name,
          s.supported_os,
          array_agg(DISTINCT ad.os_type) as business_os_types
         FROM agent_devices ad
         CROSS JOIN automation_policies p
         LEFT JOIN automation_scripts s ON p.script_id = s.id
         WHERE ad.business_id = $1
           AND p.id = $2
           AND ad.soft_delete = false
           AND ad.status IN ('online', 'offline')
         GROUP BY s.script_name, s.supported_os`,
        [business_id, policy_id]
      );

      if (compatibilityStats.rows.length > 0) {
        const stats = compatibilityStats.rows[0];

        // Warn if no compatible agents
        if (stats.compatible_agents === '0') {
          return res.status(400).json({
            success: false,
            message: `No compatible agents: Business has ${stats.total_agents} agent(s) with OS types [${stats.business_os_types.join(', ')}], but script "${stats.script_name}" only supports: ${stats.supported_os.join(', ')}`,
            code: 'NO_COMPATIBLE_AGENTS',
            data: {
              total_agents: parseInt(stats.total_agents),
              compatible_agents: 0,
              incompatible_agents: parseInt(stats.incompatible_agents),
              business_os_types: stats.business_os_types,
              supported_os: stats.supported_os
            }
          });
        }

        // Log compatibility info
        console.log(`📊 Business assignment compatibility: ${stats.compatible_agents}/${stats.total_agents} compatible agents` +
                   (stats.incompatible_agents !== '0' ? ` (${stats.incompatible_agents} incompatible will be skipped)` : '') +
                   ' (applies to all current and future compatible agents in this business)');
      }
    }

    const assignmentId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO policy_assignments (
        id, policy_id, agent_device_id, business_id, assigned_by
      ) VALUES ($1, $2, $3, $4, $5)`,
      [assignmentId, policy_id, agent_device_id || null, business_id || null, employeeId]
    );

    console.log(`✅ Policy assigned: ${policy_id} to ${agent_device_id || business_id}`);

    // Handle immediate execution if run_on_assignment flag is set
    const executionResult = await policySchedulerService.handlePolicyAssignment(policy_id, assignmentId);

    // Prepare response data
    const responseData = {
      assignment_id: assignmentId,
      execution: executionResult
    };

    // Add compatibility info for business assignments
    let successMessage = 'Policy assigned successfully';
    if (business_id && compatibilityStats && compatibilityStats.rows.length > 0) {
      const stats = compatibilityStats.rows[0];
      responseData.compatibility = {
        total_agents: parseInt(stats.total_agents),
        compatible_agents: parseInt(stats.compatible_agents),
        incompatible_agents: parseInt(stats.incompatible_agents),
        business_os_types: stats.business_os_types,
        supported_os: stats.supported_os
      };

      // Update message to reflect compatibility
      const compatCount = parseInt(stats.compatible_agents);
      const incompatCount = parseInt(stats.incompatible_agents);
      successMessage = `Policy assigned to business (applies to ${compatCount} compatible agent${compatCount !== 1 ? 's' : ''}` +
                      (incompatCount > 0 ? `, ${incompatCount} incompatible agent${incompatCount !== 1 ? 's' : ''} will be skipped` : '') +
                      `, and all future compatible agents)`;
    }

    res.json({
      success: true,
      message: successMessage,
      data: responseData
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
 * Remove Policy Assignment
 * DELETE /api/automation/policies/:policy_id/assignments/:assignment_id
 */
router.delete('/policies/:policy_id/assignments/:assignment_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id, assignment_id } = req.params;

    // Verify assignment exists and belongs to this policy
    const checkResult = await query(
      `SELECT id, agent_device_id, business_id
       FROM policy_assignments
       WHERE id = $1 AND policy_id = $2`,
      [assignment_id, policy_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
        code: 'ASSIGNMENT_NOT_FOUND'
      });
    }

    // Delete the assignment
    await query(
      `DELETE FROM policy_assignments WHERE id = $1`,
      [assignment_id]
    );

    const assignment = checkResult.rows[0];
    const target = assignment.agent_device_id ? `agent ${assignment.agent_device_id}` : `business ${assignment.business_id}`;
    console.log(`✅ Policy assignment removed: ${policy_id} from ${target}`);

    res.json({
      success: true,
      message: 'Policy assignment removed successfully'
    });
  } catch (error) {
    console.error('Remove policy assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove policy assignment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Execute Policy Manually
 * POST /api/automation/policies/:policy_id/execute
 */
router.post('/policies/:policy_id/execute', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const employeeId = req.user.id;

    // Execute policy manually
    const result = await policySchedulerService.executePolicy(policy_id, 'manual', employeeId);

    res.json(result);
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
 * Update Automation Policy
 * PUT /api/automation/policies/:policy_id
 */
router.put('/policies/:policy_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;
    const {
      policy_name,
      description,
      policy_type,
      business_id,
      script_id,
      script_parameters,
      execution_mode,
      schedule_cron,
      run_on_assignment,
      enabled
    } = req.body;

    await query(
      `UPDATE automation_policies
       SET policy_name = COALESCE($2, policy_name),
           description = COALESCE($3, description),
           policy_type = COALESCE($4, policy_type),
           business_id = COALESCE($5, business_id),
           script_id = COALESCE($6, script_id),
           script_parameters = COALESCE($7, script_parameters),
           execution_mode = COALESCE($8, execution_mode),
           schedule_cron = COALESCE($9, schedule_cron),
           run_on_assignment = COALESCE($10, run_on_assignment),
           enabled = COALESCE($11, enabled),
           updated_at = NOW()
       WHERE id = $1`,
      [
        policy_id,
        policy_name,
        description,
        policy_type,
        business_id,
        script_id,
        script_parameters ? JSON.stringify(script_parameters) : null,
        execution_mode,
        schedule_cron,
        run_on_assignment,
        enabled
      ]
    );

    // Reload schedule if this is a scheduled policy
    await policySchedulerService.reloadPolicySchedule(policy_id);

    console.log(`✅ Policy updated: ${policy_id}`);

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

/**
 * Delete Automation Policy
 * DELETE /api/automation/policies/:policy_id
 */
router.delete('/policies/:policy_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { policy_id } = req.params;

    // Unschedule if it's a scheduled policy
    policySchedulerService.unschedulePolicy(policy_id);

    // Soft delete or hard delete based on requirements
    await query(
      `DELETE FROM automation_policies WHERE id = $1`,
      [policy_id]
    );

    console.log(`✅ Policy deleted: ${policy_id}`);

    res.json({
      success: true,
      message: 'Policy deleted successfully'
    });
  } catch (error) {
    console.error('Delete policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Policy Execution History
 * GET /api/automation/executions
 */
router.get('/executions', authMiddleware, async (req, res) => {
  try {
    const { policy_id, agent_id, status, limit = 100 } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        peh.*,
        p.policy_name,
        s.script_name,
        ad.device_name as agent_name,
        e.first_name || ' ' || e.last_name as triggered_by_name
      FROM policy_execution_history peh
      LEFT JOIN automation_policies p ON peh.policy_id = p.id
      LEFT JOIN automation_scripts s ON peh.script_id = s.id
      LEFT JOIN agent_devices ad ON peh.agent_device_id = ad.id
      LEFT JOIN employees e ON peh.triggered_by_employee_id = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by policy
    if (policy_id) {
      queryText += ` AND peh.policy_id = $${paramIndex}`;
      params.push(policy_id);
      paramIndex++;
    }

    // Filter by agent
    if (agent_id) {
      queryText += ` AND peh.agent_device_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }

    // Filter by status
    if (status) {
      queryText += ` AND peh.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // RBAC: customers only see their business's executions
    if (!isEmployee) {
      queryText += ` AND peh.agent_device_id IN (
        SELECT id FROM agent_devices WHERE business_id = $${paramIndex}
      )`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    queryText += ` ORDER BY peh.started_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        executions: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get executions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch execution history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
