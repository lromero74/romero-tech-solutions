import express from 'express';
import { query } from '../../config/database.js';
import { sessionService } from '../../services/sessionService.js';

const router = express.Router();

// GET /employees/:id/full - Get single employee with full data (for selective refresh)
router.get('/employees/:id/full', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Fetching full data for employee ID: ${id}`);

    // Get single employee with all related data
    const employeeResult = await query(`
      SELECT
        e.id,
        e.email,
        e.first_name,
        e.last_name,
        e.middle_initial,
        e.preferred_name,
        COALESCE(
          array_agg(r.name ORDER BY r.sort_order) FILTER (WHERE r.name IS NOT NULL),
          ARRAY[]::text[]
        ) as roles,
        pr.pronoun_set as pronouns,
        pr.display_name as pronouns_display,
        e.employee_number,
        jt.title as job_title,
        jt.level as job_title_level,
        d.name as department_detailed,
        e.hire_date,
        es.status_name as employee_status,
        es.display_name as employee_status_display,
        e.phone,
        ep.file_url as profile_photo_url,
        ep.position_x as photo_position_x,
        ep.position_y as photo_position_y,
        ep.scale_factor as photo_scale,
        ep.background_color as photo_background_color,
        ws.status_name as working_status,
        ws.display_name as working_status_display,
        ws.color_code as working_status_color,
        ws.is_available_for_work,
        e.is_active,
        e.is_on_vacation,
        e.is_out_sick,
        e.is_on_other_leave,
        COALESCE(e.soft_delete, false) as soft_delete,
        a.street as address_street,
        a.street_2 as address_street_2,
        a.city as address_city,
        a.state as address_state,
        a.zip_code as address_zip_code,
        a.country as address_country,
        ec.first_name as emergency_contact_first_name,
        ec.last_name as emergency_contact_last_name,
        ec.relationship as emergency_contact_relationship,
        ec.phone as emergency_contact_phone,
        ec.email as emergency_contact_email,
        e.created_at,
        e.updated_at
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_addresses a ON e.id = a.employee_id AND a.is_primary = true
      LEFT JOIN employee_emergency_contacts ec ON e.id = ec.employee_id AND ec.is_primary = true
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employee_job_titles jt ON e.job_title_id = jt.id
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      LEFT JOIN employee_pronouns pr ON e.pronouns_id = pr.id
      LEFT JOIN employee_photos ep ON e.id = ep.employee_id AND ep.is_primary = true AND ep.photo_type = 'profile'
      LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
      WHERE e.id = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.middle_initial, e.preferred_name,
               pr.pronoun_set, pr.display_name, e.employee_number, jt.title, jt.level,
               d.name, e.hire_date, es.status_name, es.display_name, e.phone,
               ep.file_url, ep.position_x, ep.position_y, ep.scale_factor, ep.background_color,
               ws.status_name, ws.display_name, ws.color_code, ws.is_available_for_work,
               e.is_active, e.is_on_vacation, e.is_out_sick, e.is_on_other_leave, e.soft_delete,
               a.street, a.street_2, a.city, a.state, a.zip_code, a.country,
               ec.first_name, ec.last_name, ec.relationship, ec.phone, ec.email,
               e.created_at, e.updated_at
    `, [id]);

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const employee = employeeResult.rows[0];

    // Get login status for this employee
    const loginStatusMap = await sessionService.getUsersLoginStatus([employee.id]);

    // Format employee data
    const employeeData = {
      id: employee.id,
      firstName: employee.first_name,
      lastName: employee.last_name,
      middleInitial: employee.middle_initial,
      preferredName: employee.preferred_name,
      pronouns: employee.pronouns,
      email: employee.email,
      roles: employee.roles || [],
      employeeNumber: employee.employee_number,
      jobTitle: employee.job_title,
      department: employee.department_detailed,
      hireDate: employee.hire_date ? employee.hire_date.toISOString().split('T')[0] : null,
      employeeStatus: employee.employee_status,
      phone: employee.phone,
      photo: employee.profile_photo_url,
      photoPositionX: employee.photo_position_x,
      photoPositionY: employee.photo_position_y,
      photoScale: employee.photo_scale,
      photoBackgroundColor: employee.photo_background_color,
      workingStatus: employee.working_status,
      workingStatusDisplay: employee.working_status_display,
      workingStatusColor: employee.working_status_color,
      isAvailableForWork: employee.is_available_for_work,
      isActive: employee.is_active,
      isOnVacation: employee.is_on_vacation,
      isOutSick: employee.is_out_sick,
      isOnOtherLeave: employee.is_on_other_leave,
      softDelete: employee.soft_delete || false,
      userType: 'employee',
      address: (employee.address_street || employee.address_city) ? {
        street: employee.address_street,
        street2: employee.address_street_2,
        city: employee.address_city,
        state: employee.address_state,
        zipCode: employee.address_zip_code,
        country: employee.address_country
      } : null,
      emergencyContact: (employee.emergency_contact_first_name || employee.emergency_contact_last_name) ? {
        firstName: employee.emergency_contact_first_name,
        lastName: employee.emergency_contact_last_name,
        relationship: employee.emergency_contact_relationship,
        phone: employee.emergency_contact_phone,
        email: employee.emergency_contact_email
      } : null,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
      // Real-time login status
      isLoggedIn: loginStatusMap[employee.id]?.isLoggedIn || false,
      activeSessions: loginStatusMap[employee.id]?.activeSessions || 0,
      lastActivity: loginStatusMap[employee.id]?.lastActivity || null,
      isRecentlyActive: loginStatusMap[employee.id]?.isRecentlyActive || false
    };

    console.log(`✅ Retrieved full data for employee: ${employee.first_name} ${employee.last_name}`);

    res.status(200).json({
      success: true,
      data: employeeData
    });

  } catch (error) {
    console.error('❌ Error fetching single employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /employees-login-status-light - Lightweight endpoint for real-time login status
router.get('/employees-login-status-light', async (req, res) => {
  try {
    console.log('🔍 Fetching lightweight employee login status...');

    // Get only essential employee data
    const employeesResult = await query(`
      SELECT
        e.id,
        e.email,
        e.first_name,
        e.last_name,
        e.preferred_name,
        e.is_active,
        ws.status_name as working_status,
        ws.display_name as working_status_display,
        ws.color_code as working_status_color
      FROM employees e
      LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
      ORDER BY e.first_name, e.last_name
    `);

    const employees = employeesResult.rows;
    console.log(`📋 Found ${employees.length} employees (lightweight)`);

    if (employees.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No employees found'
      });
    }

    // Get login status for all employees
    const employeeIds = employees.map(emp => emp.id);
    const loginStatusMap = await sessionService.getUsersLoginStatus(employeeIds);

    console.log(`🔐 Retrieved login status for ${Object.keys(loginStatusMap).length} employees (lightweight)`);

    // Combine employee data with login status
    const employeesWithStatus = employees.map(employee => ({
      ...employee,
      isLoggedIn: loginStatusMap[employee.id]?.isLoggedIn || false,
      lastActivity: loginStatusMap[employee.id]?.lastActivity || null,
      isRecentlyActive: loginStatusMap[employee.id]?.isRecentlyActive || false
    }));

    res.status(200).json({
      success: true,
      data: employeesWithStatus,
      message: `Retrieved ${employeesWithStatus.length} employees with login status`
    });

  } catch (error) {
    console.error('❌ Error fetching lightweight employee login status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee login status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /employees-login-status - Get all employees with their real-time login status
router.get('/employees-login-status', async (req, res) => {
  try {
    console.log('🔍 Fetching employees with real-time login status...');

    // Get all employees from the database (including inactive ones for admin management)
    const employeesResult = await query(`
      SELECT
        e.id,
        e.email,
        e.first_name,
        e.last_name,
        e.middle_initial,
        e.preferred_name,
        COALESCE(
          array_agg(r.name ORDER BY r.sort_order) FILTER (WHERE r.name IS NOT NULL),
          ARRAY[]::text[]
        ) as roles,
        pr.pronoun_set as pronouns,
        pr.display_name as pronouns_display,
        e.employee_number,
        jt.title as job_title,
        jt.level as job_title_level,
        d.name as department_detailed,
        e.hire_date,
        es.status_name as employee_status,
        es.display_name as employee_status_display,
        e.phone,
        ep.file_url as profile_photo_url,
        ep.position_x as photo_position_x,
        ep.position_y as photo_position_y,
        ep.scale_factor as photo_scale,
        ep.background_color as photo_background_color,
        ws.status_name as working_status,
        ws.display_name as working_status_display,
        ws.color_code as working_status_color,
        ws.is_available_for_work,
        e.is_active,
        e.is_on_vacation,
        e.is_out_sick,
        e.is_on_other_leave,
        COALESCE(e.soft_delete, false) as soft_delete,
        a.street as address_street,
        a.street_2 as address_street_2,
        a.city as address_city,
        a.state as address_state,
        a.zip_code as address_zip_code,
        a.country as address_country,
        ec.first_name as emergency_contact_first_name,
        ec.last_name as emergency_contact_last_name,
        ec.relationship as emergency_contact_relationship,
        ec.phone as emergency_contact_phone,
        ec.email as emergency_contact_email,
        e.created_at,
        e.updated_at
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_addresses a ON e.id = a.employee_id AND a.is_primary = true
      LEFT JOIN employee_emergency_contacts ec ON e.id = ec.employee_id AND ec.is_primary = true
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employee_job_titles jt ON e.job_title_id = jt.id
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      LEFT JOIN employee_pronouns pr ON e.pronouns_id = pr.id
      LEFT JOIN employee_photos ep ON e.id = ep.employee_id AND ep.is_primary = true AND ep.photo_type = 'profile'
      LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.middle_initial, e.preferred_name,
               pr.pronoun_set, pr.display_name, e.employee_number, jt.title, jt.level,
               d.name, e.hire_date, es.status_name, es.display_name, e.phone,
               ep.file_url, ep.position_x, ep.position_y, ep.scale_factor, ep.background_color,
               ws.status_name, ws.display_name, ws.color_code, ws.is_available_for_work,
               e.is_active, e.is_on_vacation, e.is_out_sick, e.is_on_other_leave, e.soft_delete,
               a.street, a.street_2, a.city, a.state, a.zip_code, a.country,
               ec.first_name, ec.last_name, ec.relationship, ec.phone, ec.email,
               e.created_at, e.updated_at
      ORDER BY e.first_name, e.last_name
    `);

    const employees = employeesResult.rows;
    console.log(`📋 Found ${employees.length} employees`);

    if (employees.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No employees found'
      });
    }

    // Get login status for all employees
    const employeeIds = employees.map(emp => emp.id);
    const loginStatusMap = await sessionService.getUsersLoginStatus(employeeIds);

    console.log(`🔐 Retrieved login status for ${Object.keys(loginStatusMap).length} employees`);

    // Combine employee data with login status
    const employeesWithLoginStatus = employees.map(employee => ({
      id: employee.id,
      firstName: employee.first_name,
      lastName: employee.last_name,
      middleInitial: employee.middle_initial,
      preferredName: employee.preferred_name,
      pronouns: employee.pronouns,
      email: employee.email,
      role: employee.role,
      roles: employee.roles || [],
      employeeNumber: employee.employee_number,
      jobTitle: employee.job_title,
      department: employee.department_detailed,
      hireDate: employee.hire_date ? employee.hire_date.toISOString().split('T')[0] : null,
      employeeStatus: employee.employee_status,
      phone: employee.phone,
      photo: employee.profile_photo_url,
      photoPositionX: employee.photo_position_x,
      photoPositionY: employee.photo_position_y,
      photoScale: employee.photo_scale,
      photoBackgroundColor: employee.photo_background_color,
      workingStatus: employee.working_status,
      workingStatusDisplay: employee.working_status_display,
      workingStatusColor: employee.working_status_color,
      isAvailableForWork: employee.is_available_for_work,
      isActive: employee.is_active,
      isOnVacation: employee.is_on_vacation,
      isOutSick: employee.is_out_sick,
      isOnOtherLeave: employee.is_on_other_leave,
      softDelete: employee.soft_delete || false,
      userType: 'employee',
      address: (employee.address_street || employee.address_street_2 || employee.address_city || employee.address_state || employee.address_zip_code || employee.address_country) ? {
        street: employee.address_street,
        street2: employee.address_street_2,
        city: employee.address_city,
        state: employee.address_state,
        zipCode: employee.address_zip_code,
        country: employee.address_country
      } : null,
      emergencyContact: (employee.emergency_contact_first_name || employee.emergency_contact_last_name) ? {
        firstName: employee.emergency_contact_first_name,
        lastName: employee.emergency_contact_last_name,
        relationship: employee.emergency_contact_relationship,
        phone: employee.emergency_contact_phone,
        email: employee.emergency_contact_email
      } : null,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
      // Real-time login status from session service
      isLoggedIn: loginStatusMap[employee.id]?.isLoggedIn || false,
      activeSessions: loginStatusMap[employee.id]?.activeSessions || 0,
      lastActivity: loginStatusMap[employee.id]?.lastActivity || null,
      isRecentlyActive: loginStatusMap[employee.id]?.isRecentlyActive || false
    }));

    // Log summary
    const loggedInCount = employeesWithLoginStatus.filter(emp => emp.isLoggedIn).length;
    const recentlyActiveCount = employeesWithLoginStatus.filter(emp => emp.isRecentlyActive).length;

    console.log(`📊 Login Status Summary:`);
    console.log(`   - Total Employees: ${employees.length}`);
    console.log(`   - Currently Logged In: ${loggedInCount}`);
    console.log(`   - Recently Active (5min): ${recentlyActiveCount}`);

    res.status(200).json({
      success: true,
      data: employeesWithLoginStatus,
      metadata: {
        totalEmployees: employees.length,
        loggedInCount: loggedInCount,
        recentlyActiveCount: recentlyActiveCount,
        lastUpdated: new Date().toISOString()
      },
      message: 'Employees with login status retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching employees with login status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees with login status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /working-statuses - Get all working statuses
router.get('/working-statuses', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, status_name, display_name, description, color_code, is_available_for_work, sort_order
      FROM employee_working_statuses
      WHERE is_active = true
      ORDER BY sort_order, display_name
    `);

    res.status(200).json({
      success: true,
      data: {
        workingStatuses: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching working statuses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch working statuses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /employees/:employeeId/working-status - Update employee working status
router.put('/employees/:employeeId/working-status', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { workingStatusId } = req.body;

    // Validate that the working status exists
    const statusCheck = await query(`
      SELECT id, status_name, display_name FROM employee_working_statuses
      WHERE id = $1 AND is_active = true
    `, [workingStatusId]);

    if (statusCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid working status ID'
      });
    }

    const status = statusCheck.rows[0];

    // Determine employment status based on working status
    // If employee is on vacation, out sick, or on other leave → set to suspended
    // If employee returns to available → set back to active
    let employmentStatusUpdate = '';
    let employmentStatusMessage = '';

    const unavailableStatuses = ['on_vacation', 'out_sick', 'on_other_leave'];

    if (unavailableStatuses.includes(status.status_name)) {
      // Get suspended status ID
      const suspendedStatus = await query(`
        SELECT id FROM employee_employment_statuses WHERE status_name = 'suspended'
      `);

      if (suspendedStatus.rows.length > 0) {
        employmentStatusUpdate = `, employee_status_id = '${suspendedStatus.rows[0].id}'`;
        employmentStatusMessage = ' Employment status automatically set to Suspended.';
        console.log(`📋 Employee ${employeeId} working status changed to ${status.status_name}, automatically suspending employment`);
      }
    } else if (status.status_name === 'available') {
      // Get active status ID
      const activeStatus = await query(`
        SELECT id FROM employee_employment_statuses WHERE status_name = 'active'
      `);

      if (activeStatus.rows.length > 0) {
        employmentStatusUpdate = `, employee_status_id = '${activeStatus.rows[0].id}'`;
        employmentStatusMessage = ' Employment status automatically set to Active.';
        console.log(`📋 Employee ${employeeId} working status changed to available, automatically activating employment`);
      }
    }

    // Update the employee's working status (and potentially employment status)
    const result = await query(`
      UPDATE employees
      SET working_status_id = $1${employmentStatusUpdate}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, first_name, last_name
    `, [workingStatusId, employeeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const employee = result.rows[0];

    res.status(200).json({
      success: true,
      message: `Working status updated to ${status.display_name}.${employmentStatusMessage}`,
      data: {
        employee: {
          id: employee.id,
          email: employee.email,
          name: `${employee.first_name} ${employee.last_name}`,
          workingStatus: {
            id: workingStatusId,
            name: status.status_name,
            displayName: status.display_name
          }
        }
      }
    });

  } catch (error) {
    console.error('Error updating working status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update working status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;