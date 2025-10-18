import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * List Software Packages
 * GET /api/deployment/packages
 */
router.get('/packages', authMiddleware, async (req, res) => {
  try {
    const { package_type, is_approved, search, os } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        p.*,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM software_packages p
      LEFT JOIN employees e ON p.created_by = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by package type
    if (package_type) {
      queryText += ` AND p.package_type = $${paramIndex}`;
      params.push(package_type);
      paramIndex++;
    }

    // Filter by approval status
    if (is_approved !== undefined) {
      queryText += ` AND p.is_approved = $${paramIndex}`;
      params.push(is_approved === 'true');
      paramIndex++;
    }

    // Filter by OS
    if (os) {
      queryText += ` AND $${paramIndex} = ANY(p.supported_os)`;
      params.push(os);
      paramIndex++;
    }

    // Search by name/publisher
    if (search) {
      queryText += ` AND (p.package_name ILIKE $${paramIndex} OR p.publisher ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by business access (customers only see public + their own packages)
    if (!isEmployee) {
      queryText += ` AND (p.is_public = true OR p.business_id = $${paramIndex})`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    queryText += ' ORDER BY p.package_name ASC';

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
 * Get Single Package
 * GET /api/deployment/packages/:package_id
 */
router.get('/packages/:package_id', authMiddleware, async (req, res) => {
  try {
    const { package_id } = req.params;

    const result = await query(
      `SELECT
        p.*,
        e.first_name || ' ' || e.last_name as created_by_name
       FROM software_packages p
       LEFT JOIN employees e ON p.created_by = e.id
       WHERE p.id = $1`,
      [package_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
        code: 'PACKAGE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get package error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Software Package
 * POST /api/deployment/packages
 */
router.post('/packages', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      package_name,
      package_version,
      publisher,
      description,
      package_type,
      package_category,
      supported_os,
      source_type,
      source_url,
      checksum_type,
      checksum_value,
      install_command,
      requires_reboot,
      requires_elevated,
      is_approved,
      is_public,
      business_id,
      tags
    } = req.body;

    if (!package_name || !package_type || !source_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: package_name, package_type, source_type',
        code: 'MISSING_FIELDS'
      });
    }

    const packageId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO software_packages (
        id, package_name, package_version, publisher, description, package_type,
        package_category, supported_os, source_type, source_url, checksum_type,
        checksum_value, install_command, requires_reboot, requires_elevated,
        is_approved, is_public, business_id, created_by, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        packageId,
        package_name,
        package_version || null,
        publisher || null,
        description || null,
        package_type,
        package_category || null,
        supported_os || ['windows', 'linux', 'macos'],
        source_type,
        source_url || null,
        checksum_type || 'sha256',
        checksum_value || null,
        install_command || null,
        requires_reboot !== undefined ? requires_reboot : false,
        requires_elevated !== undefined ? requires_elevated : true,
        is_approved !== undefined ? is_approved : false,
        is_public !== undefined ? is_public : false,
        business_id || null,
        employeeId,
        tags || null
      ]
    );

    console.log(`✅ Software package created: ${package_name} (${packageId})`);

    res.json({
      success: true,
      message: 'Package created successfully',
      data: { package_id: packageId }
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
 * Get Single Deployment Schedule (Maintenance Window)
 * GET /api/deployment/schedules/:schedule_id
 */
router.get('/schedules/:schedule_id', authMiddleware, async (req, res) => {
  try {
    const { schedule_id } = req.params;

    const result = await query(
      `SELECT
        ds.*,
        e.first_name || ' ' || e.last_name as created_by_name
       FROM deployment_schedules ds
       LEFT JOIN employees e ON ds.created_by = e.id
       WHERE ds.id = $1`,
      [schedule_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found',
        code: 'SCHEDULE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Deployment Schedules (Maintenance Windows)
 * GET /api/deployment/schedules
 */
router.get('/schedules', authMiddleware, async (req, res) => {
  try {
    const { business_id, is_active } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        ds.*,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM deployment_schedules ds
      LEFT JOIN employees e ON ds.created_by = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by business
    if (!isEmployee) {
      queryText += ` AND ds.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
      paramIndex++;
    } else if (business_id) {
      queryText += ` AND ds.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    // Filter by active status
    if (is_active !== undefined) {
      queryText += ` AND ds.is_active = $${paramIndex}`;
      params.push(is_active === 'true');
      paramIndex++;
    }

    queryText += ' ORDER BY ds.created_at DESC';

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
      message: 'Failed to fetch deployment schedules',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Deployment Schedule
 * POST /api/deployment/schedules
 */
router.post('/schedules', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      schedule_name,
      description,
      business_id,
      schedule_type,
      start_time,
      end_time,
      day_of_week,
      window_duration_minutes,
      is_active
    } = req.body;

    if (!schedule_name || !schedule_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: schedule_name, schedule_type',
        code: 'MISSING_FIELDS'
      });
    }

    const scheduleId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO deployment_schedules (
        id, schedule_name, description, business_id, schedule_type, start_time,
        end_time, day_of_week, window_duration_minutes, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        scheduleId,
        schedule_name,
        description || null,
        business_id || null,
        schedule_type,
        start_time || null,
        end_time || null,
        day_of_week || null,
        window_duration_minutes || 120,
        employeeId,
        is_active !== undefined ? is_active : true
      ]
    );

    console.log(`✅ Deployment schedule created: ${schedule_name} (${scheduleId})`);

    res.json({
      success: true,
      message: 'Schedule created successfully',
      data: { schedule_id: scheduleId }
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create schedule',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Package Deployments
 * GET /api/deployment/deployments
 */
router.get('/deployments', authMiddleware, async (req, res) => {
  try {
    const { package_id, agent_id, deployment_status, limit = 100 } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        pd.*,
        p.package_name,
        p.package_version,
        ad.device_name as agent_name,
        b.business_name,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM package_deployments pd
      LEFT JOIN software_packages p ON pd.package_id = p.id
      LEFT JOIN agent_devices ad ON pd.agent_device_id = ad.id
      LEFT JOIN businesses b ON pd.business_id = b.id
      LEFT JOIN employees e ON pd.created_by = e.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by package
    if (package_id) {
      queryText += ` AND pd.package_id = $${paramIndex}`;
      params.push(package_id);
      paramIndex++;
    }

    // Filter by agent
    if (agent_id) {
      queryText += ` AND pd.agent_device_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }

    // Filter by status
    if (deployment_status) {
      queryText += ` AND pd.deployment_status = $${paramIndex}`;
      params.push(deployment_status);
      paramIndex++;
    }

    // RBAC: customers only see their business's deployments
    if (!isEmployee) {
      queryText += ` AND (pd.business_id = $${paramIndex} OR pd.agent_device_id IN (
        SELECT id FROM agent_devices WHERE business_id = $${paramIndex}
      ))`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    queryText += ` ORDER BY pd.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

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
 * Create Package Deployment
 * POST /api/deployment/deployments
 */
router.post('/deployments', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      deployment_name,
      package_id,
      deployment_scope,
      agent_device_id,
      business_id,
      install_mode,
      allow_reboot,
      scheduled_for,
      maintenance_window_id
    } = req.body;

    if (!package_id || !deployment_scope) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: package_id, deployment_scope',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate deployment scope
    if (deployment_scope === 'single_agent' && !agent_device_id) {
      return res.status(400).json({
        success: false,
        message: 'agent_device_id required for single_agent deployment',
        code: 'MISSING_AGENT_ID'
      });
    }

    if (deployment_scope === 'business' && !business_id) {
      return res.status(400).json({
        success: false,
        message: 'business_id required for business deployment',
        code: 'MISSING_BUSINESS_ID'
      });
    }

    const deploymentId = uuidv4();
    const employeeId = req.user.id;

    await query(
      `INSERT INTO package_deployments (
        id, deployment_name, package_id, deployment_scope, agent_device_id,
        business_id, install_mode, allow_reboot, scheduled_for,
        maintenance_window_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        deploymentId,
        deployment_name || null,
        package_id,
        deployment_scope,
        agent_device_id || null,
        business_id || null,
        install_mode || 'silent',
        allow_reboot !== undefined ? allow_reboot : false,
        scheduled_for || null,
        maintenance_window_id || null,
        employeeId
      ]
    );

    console.log(`✅ Package deployment created: ${deploymentId} for package ${package_id}`);

    res.json({
      success: true,
      message: 'Deployment created successfully',
      data: { deployment_id: deploymentId }
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
 * Get Deployment History
 * GET /api/deployment/history
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { deployment_id, agent_id, status, limit = 100 } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        dh.*,
        p.package_name,
        p.package_version,
        ad.device_name as agent_name
      FROM deployment_history dh
      LEFT JOIN software_packages p ON dh.package_id = p.id
      LEFT JOIN agent_devices ad ON dh.agent_device_id = ad.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by deployment
    if (deployment_id) {
      queryText += ` AND dh.deployment_id = $${paramIndex}`;
      params.push(deployment_id);
      paramIndex++;
    }

    // Filter by agent
    if (agent_id) {
      queryText += ` AND dh.agent_device_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }

    // Filter by status
    if (status) {
      queryText += ` AND dh.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // RBAC: customers only see their business's history
    if (!isEmployee) {
      queryText += ` AND dh.agent_device_id IN (
        SELECT id FROM agent_devices WHERE business_id = $${paramIndex}
      )`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    queryText += ` ORDER BY dh.started_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        history: result.rows,
        count: result.rows.length
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

export default router;
