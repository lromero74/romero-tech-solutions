import { getPool } from '../config/database.js';
import { generateTokensForEmployees, expireTokens } from '../utils/workflowTokens.js';
import {
  sendServiceRequestAcknowledgmentEmail,
  sendServiceRequestAcknowledgedClientEmail,
  sendServiceRequestStartLinkEmail,
  sendServiceRequestStartReminderEmail,
  sendServiceRequestStartedClientEmail,
  sendServiceRequestStartedAdminEmail,
  sendServiceRequestCloseLinkEmail,
  sendServiceRequestClosedClientEmail,
  sendServiceRequestClosedAdminEmail
} from './workflowEmailService.js';

/**
 * Get employees by roles for notifications
 */
export async function getEmployeesByRoles(roles) {
  const pool = await getPool();

  const query = `
    SELECT
      e.id,
      e.email,
      e.first_name,
      r.role_name
    FROM employees e
    JOIN employee_roles er ON e.id = er.employee_id
    JOIN roles r ON er.role_id = r.id
    WHERE r.role_name = ANY($1)
      AND e.is_active = true
      AND e.soft_delete = false
    GROUP BY e.id, e.email, e.first_name, r.role_name
  `;

  const result = await pool.query(query, [roles]);
  return result.rows;
}

/**
 * Initialize workflow for a new service request
 */
export async function initializeServiceRequestWorkflow(serviceRequestId, serviceRequestData) {
  console.log(`🔄 Initializing workflow for service request: ${serviceRequestData.requestNumber}`);

  try {
    // Get employees with executive, admin, and technician roles
    const employees = await getEmployeesByRoles(['executive', 'admin', 'technician']);

    if (employees.length === 0) {
      console.warn('⚠️ No employees found with executive, admin, or technician roles');
      return;
    }

    // Generate unique acknowledgment tokens for each employee
    const tokens = await generateTokensForEmployees(
      serviceRequestId,
      'acknowledge',
      employees,
      0, // First attempt
      new Date(Date.now() + 2 * 60 * 1000) // Expires in 2 minutes
    );

    console.log(`📧 Sending acknowledgment emails to ${tokens.length} employees`);

    // Send acknowledgment email to each employee
    for (const tokenData of tokens) {
      await sendServiceRequestAcknowledgmentEmail({
        serviceRequestData,
        employee: {
          email: tokenData.employeeEmail,
          firstName: tokenData.firstName
        },
        acknowledgeToken: tokenData.token
      });
    }

    // Log notifications
    await logNotifications(serviceRequestId, 'service_request_created', tokens, 0);

    console.log(`✅ Workflow initialized for service request ${serviceRequestData.requestNumber}`);
  } catch (error) {
    console.error('❌ Error initializing service request workflow:', error);
    throw error;
  }
}

/**
 * Handle acknowledgment timeout (resend notifications)
 */
export async function handleAcknowledgmentTimeout(serviceRequestId, retryAttempt) {
  const pool = await getPool();

  console.log(`⏰ Handling acknowledgment timeout for service request (attempt ${retryAttempt})`);

  try {
    // Get service request data
    const srQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        u.first_name as client_first_name,
        u.last_name as client_last_name
      FROM service_requests sr
      JOIN users u ON sr.client_id = u.id
      WHERE sr.id = $1
    `;
    const srResult = await pool.query(srQuery, [serviceRequestId]);

    if (srResult.rows.length === 0) {
      console.error('Service request not found');
      return;
    }

    const serviceRequestData = srResult.rows[0];

    // Expire old tokens from previous attempt
    await expireTokens(serviceRequestId, 'acknowledge', retryAttempt - 1);

    // Get employees with executive, admin, and technician roles
    const employees = await getEmployeesByRoles(['executive', 'admin', 'technician']);

    // Generate new tokens
    const tokens = await generateTokensForEmployees(
      serviceRequestId,
      'acknowledge',
      employees,
      retryAttempt,
      new Date(Date.now() + 2 * 60 * 1000) // Expires in 2 minutes
    );

    console.log(`📧 Resending acknowledgment emails to ${tokens.length} employees (attempt ${retryAttempt})`);

    // Resend acknowledgment emails
    for (const tokenData of tokens) {
      await sendServiceRequestAcknowledgmentEmail({
        serviceRequestData: {
          requestNumber: serviceRequestData.request_number,
          title: serviceRequestData.title,
          description: serviceRequestData.description,
          clientName: `${serviceRequestData.client_first_name} ${serviceRequestData.client_last_name}`
        },
        employee: {
          email: tokenData.employeeEmail,
          firstName: tokenData.firstName
        },
        acknowledgeToken: tokenData.token,
        isRetry: true,
        retryAttempt
      });
    }

    // Update workflow state
    await pool.query(`
      UPDATE service_request_workflow_state
      SET
        acknowledgment_reminder_count = $1,
        last_acknowledgment_reminder_sent_at = CURRENT_TIMESTAMP,
        next_scheduled_action_at = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
      WHERE service_request_id = $2
    `, [retryAttempt, serviceRequestId]);

    // Log notifications
    await logNotifications(serviceRequestId, 'acknowledgment_timeout', tokens, retryAttempt);

    console.log(`✅ Acknowledgment timeout handled (attempt ${retryAttempt})`);
  } catch (error) {
    console.error('❌ Error handling acknowledgment timeout:', error);
    throw error;
  }
}

/**
 * Handle service request acknowledgment
 */
export async function handleServiceRequestAcknowledged(serviceRequestId, employeeId) {
  const pool = await getPool();

  console.log(`✅ Service request acknowledged by employee ${employeeId}`);

  try {
    // Update workflow state
    await pool.query(`
      UPDATE service_request_workflow_state
      SET
        current_state = 'acknowledged',
        acknowledged_by_employee_id = $1,
        acknowledged_at = CURRENT_TIMESTAMP,
        next_scheduled_action = 'send_start_reminder',
        next_scheduled_action_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
      WHERE service_request_id = $2
    `, [employeeId, serviceRequestId]);

    // Expire all unused acknowledgment tokens
    await expireTokens(serviceRequestId, 'acknowledge');

    // Get service request and employee data
    const dataQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        u.email as client_email,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        e.id as employee_id,
        e.email as employee_email,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name
      FROM service_requests sr
      JOIN users u ON sr.client_id = u.id
      JOIN employees e ON e.id = $1
      WHERE sr.id = $2
    `;
    const dataResult = await pool.query(dataQuery, [employeeId, serviceRequestId]);
    const data = dataResult.rows[0];

    // 1. Send email to client
    await sendServiceRequestAcknowledgedClientEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title,
        description: data.description
      },
      client: {
        email: data.client_email,
        firstName: data.client_first_name
      },
      employee: {
        firstName: data.employee_first_name,
        lastName: data.employee_last_name
      }
    });

    // 2. Generate start token for acknowledging employee (no expiration)
    const startTokens = await generateTokensForEmployees(
      serviceRequestId,
      'start',
      [{ id: employeeId, email: data.employee_email, first_name: data.employee_first_name }],
      0,
      null // No expiration
    );

    // 3. Send start link to acknowledging employee
    await sendServiceRequestStartLinkEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title,
        description: data.description
      },
      employee: {
        email: data.employee_email,
        firstName: data.employee_first_name
      },
      startToken: startTokens[0].token
    });

    // Log notifications
    await logNotification(serviceRequestId, 'acknowledged', 'client', null, data.client_email);
    await logNotification(serviceRequestId, 'acknowledged', 'employee', employeeId, data.employee_email);

    console.log(`✅ Acknowledgment processed successfully`);
  } catch (error) {
    console.error('❌ Error handling service request acknowledgment:', error);
    throw error;
  }
}

/**
 * Handle start timeout (send reminder)
 */
export async function handleStartTimeout(serviceRequestId, retryAttempt) {
  const pool = await getPool();

  console.log(`⏰ Handling start timeout for service request (attempt ${retryAttempt})`);

  try {
    // Get workflow state and service request data
    const query = `
      SELECT
        ws.acknowledged_by_employee_id,
        sr.request_number,
        sr.title,
        sr.description,
        e.email as employee_email,
        e.first_name as employee_first_name
      FROM service_request_workflow_state ws
      JOIN service_requests sr ON ws.service_request_id = sr.id
      JOIN employees e ON ws.acknowledged_by_employee_id = e.id
      WHERE ws.service_request_id = $1
    `;
    const result = await pool.query(query, [serviceRequestId]);

    if (result.rows.length === 0) {
      console.error('Service request or workflow state not found');
      return;
    }

    const data = result.rows[0];

    // Send reminder email
    await sendServiceRequestStartReminderEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title,
        description: data.description
      },
      employee: {
        email: data.employee_email,
        firstName: data.employee_first_name
      },
      retryAttempt
    });

    // Update workflow state
    await pool.query(`
      UPDATE service_request_workflow_state
      SET
        start_reminder_count = $1,
        last_start_reminder_sent_at = CURRENT_TIMESTAMP,
        next_scheduled_action_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
      WHERE service_request_id = $2
    `, [retryAttempt, serviceRequestId]);

    // Log notification
    await logNotification(
      serviceRequestId,
      'start_timeout',
      'employee',
      data.acknowledged_by_employee_id,
      data.employee_email
    );

    console.log(`✅ Start reminder sent (attempt ${retryAttempt})`);
  } catch (error) {
    console.error('❌ Error handling start timeout:', error);
    throw error;
  }
}

/**
 * Handle service request started
 */
export async function handleServiceRequestStarted(serviceRequestId, employeeId) {
  const pool = await getPool();

  console.log(`🚀 Service request started by employee ${employeeId}`);

  try {
    // Update workflow state
    await pool.query(`
      UPDATE service_request_workflow_state
      SET
        current_state = 'started',
        started_by_employee_id = $1,
        started_at = CURRENT_TIMESTAMP,
        next_scheduled_action = NULL,
        next_scheduled_action_at = NULL
      WHERE service_request_id = $2
    `, [employeeId, serviceRequestId]);

    // Get service request data
    const dataQuery = `
      SELECT
        sr.request_number,
        sr.title,
        sr.description,
        u.email as client_email,
        u.first_name as client_first_name,
        e.email as employee_email,
        e.first_name as employee_first_name
      FROM service_requests sr
      JOIN users u ON sr.client_id = u.id
      JOIN employees e ON e.id = $1
      WHERE sr.id = $2
    `;
    const dataResult = await pool.query(dataQuery, [employeeId, serviceRequestId]);
    const data = dataResult.rows[0];

    // 1. Send email to client
    await sendServiceRequestStartedClientEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title
      },
      client: {
        email: data.client_email,
        firstName: data.client_first_name
      },
      employee: {
        firstName: data.employee_first_name
      }
    });

    // 2. Send email to executives and admins
    const admins = await getEmployeesByRoles(['executive', 'admin']);
    for (const admin of admins) {
      await sendServiceRequestStartedAdminEmail({
        serviceRequestData: {
          requestNumber: data.request_number,
          title: data.title
        },
        admin: {
          email: admin.email,
          firstName: admin.first_name
        },
        employee: {
          firstName: data.employee_first_name
        }
      });
    }

    // 3. Generate close token for employee (no expiration)
    const closeTokens = await generateTokensForEmployees(
      serviceRequestId,
      'close',
      [{ id: employeeId, email: data.employee_email, first_name: data.employee_first_name }],
      0,
      null
    );

    // 4. Send close link to employee
    await sendServiceRequestCloseLinkEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title
      },
      employee: {
        email: data.employee_email,
        firstName: data.employee_first_name
      },
      closeToken: closeTokens[0].token
    });

    // Log notifications
    await logNotification(serviceRequestId, 'started', 'client', null, data.client_email);
    for (const admin of admins) {
      await logNotification(serviceRequestId, 'started', 'employee', admin.id, admin.email);
    }

    console.log(`✅ Service request started notifications sent`);
  } catch (error) {
    console.error('❌ Error handling service request started:', error);
    throw error;
  }
}

/**
 * Handle service request closed
 */
export async function handleServiceRequestClosed(serviceRequestId, employeeId, closeReasonId) {
  const pool = await getPool();

  console.log(`✅ Service request closed by employee ${employeeId}`);

  try {
    // Update workflow state
    await pool.query(`
      UPDATE service_request_workflow_state
      SET
        current_state = 'closed',
        completed_by_employee_id = $1,
        completed_at = CURRENT_TIMESTAMP
      WHERE service_request_id = $2
    `, [employeeId, serviceRequestId]);

    // Get service request data
    const dataQuery = `
      SELECT
        sr.request_number,
        sr.title,
        u.email as client_email,
        u.first_name as client_first_name,
        cr.reason_name as close_reason
      FROM service_requests sr
      JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_request_closure_reasons cr ON cr.id = $1
      WHERE sr.id = $2
    `;
    const dataResult = await pool.query(dataQuery, [closeReasonId, serviceRequestId]);
    const data = dataResult.rows[0];

    // 1. Send email to client
    await sendServiceRequestClosedClientEmail({
      serviceRequestData: {
        requestNumber: data.request_number,
        title: data.title,
        closeReason: data.close_reason
      },
      client: {
        email: data.client_email,
        firstName: data.client_first_name
      }
    });

    // 2. Send email to executives and admins
    const admins = await getEmployeesByRoles(['executive', 'admin']);
    for (const admin of admins) {
      await sendServiceRequestClosedAdminEmail({
        serviceRequestData: {
          requestNumber: data.request_number,
          title: data.title,
          closeReason: data.close_reason
        },
        admin: {
          email: admin.email,
          firstName: admin.first_name
        }
      });
    }

    // Log notifications
    await logNotification(serviceRequestId, 'closed', 'client', null, data.client_email);
    for (const admin of admins) {
      await logNotification(serviceRequestId, 'closed', 'employee', admin.id, admin.email);
    }

    console.log(`✅ Service request closed notifications sent`);
  } catch (error) {
    console.error('❌ Error handling service request closed:', error);
    throw error;
  }
}

/**
 * Log notification to database
 */
async function logNotification(serviceRequestId, triggerEvent, recipientType, employeeId, email) {
  const pool = await getPool();

  try {
    await pool.query(`
      INSERT INTO workflow_notification_log (
        service_request_id,
        trigger_event,
        notification_type,
        recipient_employee_id,
        recipient_email,
        recipient_type
      ) VALUES ($1, $2, 'email', $3, $4, $5)
    `, [serviceRequestId, triggerEvent, employeeId, email, recipientType]);
  } catch (error) {
    console.error('Error logging notification:', error);
  }
}

/**
 * Log multiple notifications
 */
async function logNotifications(serviceRequestId, triggerEvent, tokens, retryAttempt) {
  for (const token of tokens) {
    await logNotification(serviceRequestId, triggerEvent, 'employee', token.employeeId, token.employeeEmail);
  }
}
