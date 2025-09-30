import express from 'express';
import crypto from 'crypto';
import { getPool } from '../config/database.js';
import { sendEmail } from '../services/emailService.js';

const router = express.Router();

/**
 * POST /api/service-request-workflow/acknowledge/:token
 * Handle service request acknowledgment via unique token
 */
router.post('/acknowledge/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await getPool();

    console.log(`📋 Processing acknowledgment for token: ${token}`);

    // Find the acknowledgment record and related data
    const acknowledgmentQuery = `
      SELECT
        sra.id as acknowledgment_id,
        sra.service_request_id,
        sra.employee_id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.client_id,
        sr.business_id,
        sr.acknowledged_by_employee_id,
        sr.acknowledged_at,
        e.first_name as technician_first_name,
        e.last_name as technician_last_name,
        e.email as technician_email,
        b.business_name,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email
      FROM service_request_acknowledgments sra
      JOIN service_requests sr ON sra.service_request_id = sr.id
      JOIN employees e ON sra.employee_id = e.id
      JOIN businesses b ON sr.business_id = b.id
      JOIN users c ON sr.client_id = c.id
      WHERE sra.acknowledgment_token = $1 AND sr.soft_delete = false
    `;

    const result = await pool.query(acknowledgmentQuery, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid acknowledgment token or service request not found'
      });
    }

    const acknowledgment = result.rows[0];

    // Check if service request is already acknowledged
    if (acknowledgment.acknowledged_by_employee_id) {
      // Get the technician who already acknowledged
      const acknowledgedByQuery = `
        SELECT first_name, last_name, email
        FROM employees
        WHERE id = $1
      `;
      const acknowledgedByResult = await pool.query(acknowledgedByQuery, [acknowledgment.acknowledged_by_employee_id]);
      const acknowledgedBy = acknowledgedByResult.rows[0];

      // Send email to current technician informing them it's already acknowledged
      const subject = `Service Request ${acknowledgment.request_number} Already Acknowledged`;
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #3b82f6); color: white; padding: 30px 20px; border-radius: 8px; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
              .tagline { font-size: 14px; opacity: 0.9; }
              .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
              .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">Service Request Already Acknowledged</div>
              </div>
              <div class="content">
                <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${acknowledgment.technician_first_name},</h2>
                <div class="warning-box">
                  <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ Service Request Already Acknowledged</p>
                  <p style="margin: 5px 0 0 0; color: #92400e;">
                    Service Request ${acknowledgment.request_number} has already been acknowledged by
                    ${acknowledgedBy.first_name} ${acknowledgedBy.last_name} at ${new Date(acknowledgment.acknowledged_at).toLocaleString()}.
                  </p>
                </div>
                <p><strong>Request Details:</strong></p>
                <p><strong>Title:</strong> ${acknowledgment.title}</p>
                <p><strong>Business:</strong> ${acknowledgment.business_name}</p>
                <p><strong>Client:</strong> ${acknowledgment.client_first_name} ${acknowledgment.client_last_name}</p>
                <p>Thank you for your prompt response. Please check for other pending service requests.</p>
              </div>
              <div class="footer">
                <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
                <p>Serving Escondido, CA and surrounding areas.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      // Send the notification email
      await sendEmail({
        to: acknowledgment.technician_email,
        subject,
        html,
        text: `Service Request ${acknowledgment.request_number} has already been acknowledged by ${acknowledgedBy.first_name} ${acknowledgedBy.last_name} at ${new Date(acknowledgment.acknowledged_at).toLocaleString()}.`
      });

      return res.status(200).json({
        success: false,
        message: `Service request has already been acknowledged by ${acknowledgedBy.first_name} ${acknowledgedBy.last_name}`,
        acknowledgedBy: {
          name: `${acknowledgedBy.first_name} ${acknowledgedBy.last_name}`,
          acknowledgedAt: acknowledgment.acknowledged_at
        }
      });
    }

    // Acknowledge the service request
    const updateQuery = `
      UPDATE service_requests
      SET
        acknowledged_by_employee_id = $1,
        acknowledged_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING acknowledged_at
    `;

    const updateResult = await pool.query(updateQuery, [acknowledgment.employee_id, acknowledgment.service_request_id]);
    const acknowledgedAt = updateResult.rows[0].acknowledged_at;

    // Add a note to the service request
    const noteQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(noteQuery, [
      acknowledgment.service_request_id,
      `Service request acknowledged by ${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name}`,
      'status_change',
      'employee',
      acknowledgment.employee_id,
      `${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name}`,
      true
    ]);

    console.log(`✅ Service request ${acknowledgment.request_number} acknowledged by ${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name}`);

    // Send confirmation email to client
    const clientSubject = `Service Request ${acknowledgment.request_number} Acknowledged`;
    const clientHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${clientSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #3b82f6); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .success-box { background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Service Request Update</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${acknowledgment.client_first_name},</h2>
              <div class="success-box">
                <p style="margin: 0; font-weight: bold; color: #166534;">✅ Service Request Acknowledged</p>
                <p style="margin: 5px 0 0 0; color: #166534;">
                  Your service request ${acknowledgment.request_number} has been acknowledged by our technician
                  ${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name}.
                </p>
              </div>
              <p><strong>Request Details:</strong></p>
              <p><strong>Title:</strong> ${acknowledgment.title}</p>
              <p><strong>Business:</strong> ${acknowledgment.business_name}</p>
              <p><strong>Acknowledged At:</strong> ${new Date(acknowledgedAt).toLocaleString()}</p>
              <p>Our technician will contact you shortly to schedule the service or provide additional information about next steps.</p>
              <p>If you have any questions, please don't hesitate to contact us at (619) 940-5550.</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send client notification
    await sendEmail({
      to: acknowledgment.client_email,
      subject: clientSubject,
      html: clientHtml,
      text: `Your service request ${acknowledgment.request_number} has been acknowledged by our technician ${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name} at ${new Date(acknowledgedAt).toLocaleString()}.`
    });

    // Generate assignment token for the technician who acknowledged
    const assignmentToken = crypto.randomBytes(32).toString('hex');

    // Create assignment record
    const assignmentQuery = `
      INSERT INTO service_request_assignments (
        service_request_id,
        employee_id,
        assignment_token,
        created_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      RETURNING id
    `;

    await pool.query(assignmentQuery, [
      acknowledgment.service_request_id,
      acknowledgment.employee_id,
      assignmentToken
    ]);

    // Send "start service" email to the acknowledging technician
    const startSubject = `Ready to Start Service Request ${acknowledgment.request_number}`;
    const startUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/service-request-workflow/start/${assignmentToken}`;

    const startHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${startSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #3b82f6); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .action-button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .action-button:hover { background: #15803d; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Ready to Start Service</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${acknowledgment.technician_first_name},</h2>
              <p>You have successfully acknowledged service request ${acknowledgment.request_number}. When you're ready to begin work on this service request, please click the button below:</p>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${startUrl}" class="action-button">🚀 START SERVICE REQUEST</a>
              </div>

              <p><strong>Request Summary:</strong></p>
              <p><strong>Title:</strong> ${acknowledgment.title}</p>
              <p><strong>Description:</strong> ${acknowledgment.description}</p>
              <p><strong>Business:</strong> ${acknowledgment.business_name}</p>
              <p><strong>Client:</strong> ${acknowledgment.client_first_name} ${acknowledgment.client_last_name}</p>

              <p>Clicking the "Start Service Request" button will:</p>
              <ul>
                <li>Mark the service request as started in our system</li>
                <li>Record the start time</li>
                <li>Notify the client that work has begun</li>
                <li>Assign you as the primary technician for this request</li>
              </ul>

              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #3b82f6;">${startUrl}</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send start service email to technician
    await sendEmail({
      to: acknowledgment.technician_email,
      subject: startSubject,
      html: startHtml,
      text: `You have successfully acknowledged service request ${acknowledgment.request_number}. To start work on this request, visit: ${startUrl}`
    });

    res.status(200).json({
      success: true,
      message: 'Service request acknowledged successfully',
      data: {
        requestNumber: acknowledgment.request_number,
        acknowledgedBy: `${acknowledgment.technician_first_name} ${acknowledgment.technician_last_name}`,
        acknowledgedAt,
        startToken: assignmentToken
      }
    });

  } catch (error) {
    console.error('❌ Error processing acknowledgment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process acknowledgment'
    });
  }
});

/**
 * POST /api/service-request-workflow/start/:token
 * Handle service request start via assignment token
 */
router.post('/start/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await getPool();

    console.log(`🚀 Processing start request for token: ${token}`);

    // Find the assignment record and related data
    const assignmentQuery = `
      SELECT
        sra.id as assignment_id,
        sra.service_request_id,
        sra.employee_id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.client_id,
        sr.business_id,
        sr.current_status,
        sr.last_start_time,
        e.first_name as technician_first_name,
        e.last_name as technician_last_name,
        e.email as technician_email,
        b.business_name,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email
      FROM service_request_assignments sra
      JOIN service_requests sr ON sra.service_request_id = sr.id
      JOIN employees e ON sra.employee_id = e.id
      JOIN businesses b ON sr.business_id = b.id
      JOIN users c ON sr.client_id = c.id
      WHERE sra.assignment_token = $1 AND sr.soft_delete = false
    `;

    const result = await pool.query(assignmentQuery, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid assignment token or service request not found'
      });
    }

    const assignment = result.rows[0];

    // Check if service request is already in progress by this technician
    if (assignment.current_status === 'in_progress' && assignment.last_start_time) {
      return res.status(200).json({
        success: false,
        message: `Service request is already in progress since ${new Date(assignment.last_start_time).toLocaleString()}`,
        alreadyStarted: true,
        startedAt: assignment.last_start_time
      });
    }

    const startTime = new Date();

    // Update service request status and start time
    const updateQuery = `
      UPDATE service_requests
      SET
        current_status = 'in_progress',
        last_start_time = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING last_start_time
    `;

    const updateResult = await pool.query(updateQuery, [startTime, assignment.service_request_id]);
    const actualStartTime = updateResult.rows[0].last_start_time;

    // Create time entry record
    const timeEntryQuery = `
      INSERT INTO service_request_time_entries (
        service_request_id,
        technician_id,
        start_time,
        work_description,
        work_type,
        is_billable,
        is_on_site,
        is_remote,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    await pool.query(timeEntryQuery, [
      assignment.service_request_id,
      assignment.employee_id,
      actualStartTime,
      `Service work started by ${assignment.technician_first_name} ${assignment.technician_last_name}`,
      'service_work',
      true, // is_billable - default to true
      false, // is_on_site - will be updated later if needed
      true, // is_remote - default to true, can be updated
      assignment.employee_id
    ]);

    // Add a note to the service request
    const noteQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(noteQuery, [
      assignment.service_request_id,
      `Service work started by ${assignment.technician_first_name} ${assignment.technician_last_name} at ${actualStartTime.toLocaleString()}`,
      'status_change',
      'employee',
      assignment.employee_id,
      `${assignment.technician_first_name} ${assignment.technician_last_name}`,
      true
    ]);

    console.log(`✅ Service request ${assignment.request_number} started by ${assignment.technician_first_name} ${assignment.technician_last_name}`);

    // Send confirmation email to client
    const clientSubject = `Service Work Started - Request ${assignment.request_number}`;
    const clientHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${clientSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #3b82f6); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .progress-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Service Work In Progress</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${assignment.client_first_name},</h2>
              <div class="progress-box">
                <p style="margin: 0; font-weight: bold; color: #1e40af;">🚀 Service Work Started</p>
                <p style="margin: 5px 0 0 0; color: #1e40af;">
                  Our technician ${assignment.technician_first_name} ${assignment.technician_last_name} has started work on
                  your service request ${assignment.request_number} at ${new Date(actualStartTime).toLocaleString()}.
                </p>
              </div>
              <p><strong>Request Details:</strong></p>
              <p><strong>Title:</strong> ${assignment.title}</p>
              <p><strong>Business:</strong> ${assignment.business_name}</p>
              <p><strong>Started At:</strong> ${new Date(actualStartTime).toLocaleString()}</p>
              <p>Our technician is now actively working on your request. You will receive another notification when the work is completed.</p>
              <p>If you have any questions, please don't hesitate to contact us at (619) 940-5550.</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send client notification
    await sendEmail({
      to: assignment.client_email,
      subject: clientSubject,
      html: clientHtml,
      text: `Your service request ${assignment.request_number} work has been started by our technician ${assignment.technician_first_name} ${assignment.technician_last_name} at ${new Date(actualStartTime).toLocaleString()}.`
    });

    // Generate stop token for this work session
    const stopToken = crypto.randomBytes(32).toString('hex');

    // Create stop assignment record
    const stopAssignmentQuery = `
      INSERT INTO service_request_assignments (
        service_request_id,
        employee_id,
        assignment_token,
        assignment_type,
        created_at
      ) VALUES ($1, $2, $3, 'stop', CURRENT_TIMESTAMP)
      RETURNING id
    `;

    await pool.query(stopAssignmentQuery, [
      assignment.service_request_id,
      assignment.employee_id,
      stopToken
    ]);

    // Send stop link email to technician
    const stopSubject = `Service Request ${assignment.request_number} - Click to Stop Work`;
    const stopUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/service-request-workflow/stop/${stopToken}`;

    const stopHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${stopSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #dc2626); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .action-button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .action-button:hover { background: #b91c1c; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Click to Stop Work</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${assignment.technician_first_name},</h2>
              <p>You have successfully started work on service request ${assignment.request_number}. When you finish this work session, click the button below to stop the timer:</p>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${stopUrl}" class="action-button">⏹️ STOP WORK SESSION</a>
              </div>

              <p><strong>Work Session Started:</strong> ${new Date(actualStartTime).toLocaleString()}</p>
              <p><strong>Request:</strong> ${assignment.title}</p>
              <p><strong>Business:</strong> ${assignment.business_name}</p>

              <p>Clicking the "Stop Work Session" button will:</p>
              <ul>
                <li>Record the end time for this work session</li>
                <li>Calculate the duration for this session</li>
                <li>Add a note to the service request</li>
                <li>Allow you to start another work session later if needed</li>
              </ul>

              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #3b82f6;">${stopUrl}</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send stop email to technician
    await sendEmail({
      to: assignment.technician_email,
      subject: stopSubject,
      html: stopHtml,
      text: `You have started work on service request ${assignment.request_number} at ${new Date(actualStartTime).toLocaleString()}. To stop this work session, visit: ${stopUrl}`
    });

    res.status(200).json({
      success: true,
      message: 'Service request work started successfully',
      data: {
        requestNumber: assignment.request_number,
        startedBy: `${assignment.technician_first_name} ${assignment.technician_last_name}`,
        startedAt: actualStartTime,
        stopToken: stopToken
      }
    });

  } catch (error) {
    console.error('❌ Error processing start request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service request work'
    });
  }
});

/**
 * POST /api/service-request-workflow/stop/:token
 * Handle service request stop via assignment token
 */
router.post('/stop/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await getPool();

    console.log(`⏹️ Processing stop request for token: ${token}`);

    // Find the assignment record for the stop token
    const assignmentQuery = `
      SELECT
        sra.id as assignment_id,
        sra.service_request_id,
        sra.employee_id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.client_id,
        sr.business_id,
        sr.current_status,
        sr.last_start_time,
        e.first_name as technician_first_name,
        e.last_name as technician_last_name,
        e.email as technician_email,
        b.business_name,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email
      FROM service_request_assignments sra
      JOIN service_requests sr ON sra.service_request_id = sr.id
      JOIN employees e ON sra.employee_id = e.id
      JOIN businesses b ON sr.business_id = b.id
      JOIN users c ON sr.client_id = c.id
      WHERE sra.assignment_token = $1 AND sra.assignment_type = 'stop' AND sr.soft_delete = false
    `;

    const result = await pool.query(assignmentQuery, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid stop token or service request not found'
      });
    }

    const assignment = result.rows[0];

    // Check if service request is not currently in progress
    if (assignment.current_status !== 'in_progress' || !assignment.last_start_time) {
      return res.status(400).json({
        success: false,
        message: 'Service request is not currently in progress',
        currentStatus: assignment.current_status
      });
    }

    const stopTime = new Date();
    const startTime = new Date(assignment.last_start_time);
    const durationMinutes = Math.round((stopTime - startTime) / (1000 * 60)); // Duration in minutes

    // Update the time entry with end time and duration
    const updateTimeEntryQuery = `
      UPDATE service_request_time_entries
      SET
        end_time = $1,
        duration_minutes = $2,
        work_description = work_description || ' (Duration: ' || $2 || ' minutes)',
        updated_at = CURRENT_TIMESTAMP
      WHERE service_request_id = $3 AND technician_id = $4 AND end_time IS NULL
      RETURNING id
    `;

    const timeEntryResult = await pool.query(updateTimeEntryQuery, [
      stopTime,
      durationMinutes,
      assignment.service_request_id,
      assignment.employee_id
    ]);

    if (timeEntryResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active work session found to stop'
      });
    }

    // Calculate total work duration for this service request
    const totalDurationQuery = `
      SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM service_request_time_entries
      WHERE service_request_id = $1 AND duration_minutes IS NOT NULL
    `;

    const totalDurationResult = await pool.query(totalDurationQuery, [assignment.service_request_id]);
    const totalDuration = totalDurationResult.rows[0].total_minutes;

    // Update service request status and clear last_start_time
    const updateServiceRequestQuery = `
      UPDATE service_requests
      SET
        current_status = 'acknowledged',
        last_start_time = NULL,
        total_work_duration_minutes = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(updateServiceRequestQuery, [totalDuration, assignment.service_request_id]);

    // Add a note to the service request
    const noteQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const sessionNote = `Work session completed by ${assignment.technician_first_name} ${assignment.technician_last_name}. Duration: ${durationMinutes} minutes (${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m). Total work time: ${Math.floor(totalDuration/60)}h ${totalDuration%60}m.`;

    await pool.query(noteQuery, [
      assignment.service_request_id,
      sessionNote,
      'status_change',
      'employee',
      assignment.employee_id,
      `${assignment.technician_first_name} ${assignment.technician_last_name}`,
      true
    ]);

    console.log(`✅ Work session stopped for ${assignment.request_number}: ${durationMinutes} minutes. Total: ${totalDuration} minutes`);

    // Send completion email to client
    const clientSubject = `Work Session Completed - Request ${assignment.request_number}`;
    const clientHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${clientSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #059669); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .completion-box { background: #dcfce7; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .time-summary { background: #ede9fe; border-radius: 8px; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Work Session Completed</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${assignment.client_first_name},</h2>
              <div class="completion-box">
                <p style="margin: 0; font-weight: bold; color: #166534;">⏹️ Work Session Completed</p>
                <p style="margin: 5px 0 0 0; color: #166534;">
                  Our technician ${assignment.technician_first_name} ${assignment.technician_last_name} has completed a work session on
                  your service request ${assignment.request_number}.
                </p>
              </div>

              <div class="time-summary">
                <h3 style="color: #6b21a8; margin: 0 0 10px 0;">Time Summary</h3>
                <p style="margin: 5px 0;"><strong>This Session:</strong> ${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m</p>
                <p style="margin: 5px 0;"><strong>Total Work Time:</strong> ${Math.floor(totalDuration/60)}h ${totalDuration%60}m</p>
                <p style="margin: 5px 0;"><strong>Started:</strong> ${startTime.toLocaleString()}</p>
                <p style="margin: 5px 0;"><strong>Completed:</strong> ${stopTime.toLocaleString()}</p>
              </div>

              <p><strong>Request Details:</strong></p>
              <p><strong>Title:</strong> ${assignment.title}</p>
              <p><strong>Business:</strong> ${assignment.business_name}</p>

              <p>This work session has been completed. Our technician may start additional work sessions if needed, and you will receive notifications for each session.</p>
              <p>If you have any questions, please don't hesitate to contact us at (619) 940-5550.</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send client notification
    await sendEmail({
      to: assignment.client_email,
      subject: clientSubject,
      html: clientHtml,
      text: `Work session completed on your service request ${assignment.request_number} by ${assignment.technician_first_name} ${assignment.technician_last_name}. Session duration: ${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m. Total work time: ${Math.floor(totalDuration/60)}h ${totalDuration%60}m.`
    });

    // Generate new start token for potential future sessions
    const newStartToken = crypto.randomBytes(32).toString('hex');

    // Create new start assignment record
    const newStartAssignmentQuery = `
      INSERT INTO service_request_assignments (
        service_request_id,
        employee_id,
        assignment_token,
        assignment_type,
        created_at
      ) VALUES ($1, $2, $3, 'start', CURRENT_TIMESTAMP)
      RETURNING id
    `;

    await pool.query(newStartAssignmentQuery, [
      assignment.service_request_id,
      assignment.employee_id,
      newStartToken
    ]);

    // Send new start option email to technician
    const restartSubject = `Work Session Completed - ${assignment.request_number}`;
    const restartUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/service-request-workflow/start/${newStartToken}`;

    const restartHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${restartSubject}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #059669); color: white; padding: 30px 20px; border-radius: 8px; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .tagline { font-size: 14px; opacity: 0.9; }
            .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
            .action-button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; }
            .action-button:hover { background: #15803d; }
            .time-summary { background: #ede9fe; border-radius: 8px; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://www.romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Work Session Completed</div>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${assignment.technician_first_name},</h2>
              <p>✅ Your work session on service request ${assignment.request_number} has been successfully completed and recorded.</p>

              <div class="time-summary">
                <h3 style="color: #6b21a8; margin: 0 0 10px 0;">Session Summary</h3>
                <p style="margin: 5px 0;"><strong>Session Duration:</strong> ${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m</p>
                <p style="margin: 5px 0;"><strong>Total Work Time:</strong> ${Math.floor(totalDuration/60)}h ${totalDuration%60}m</p>
                <p style="margin: 5px 0;"><strong>Started:</strong> ${startTime.toLocaleString()}</p>
                <p style="margin: 5px 0;"><strong>Completed:</strong> ${stopTime.toLocaleString()}</p>
              </div>

              <p>If you need to continue working on this service request, you can start a new work session:</p>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${restartUrl}" class="action-button">🚀 START NEW WORK SESSION</a>
              </div>

              <p><strong>Request:</strong> ${assignment.title}</p>
              <p><strong>Business:</strong> ${assignment.business_name}</p>
              <p><strong>Client:</strong> ${assignment.client_first_name} ${assignment.client_last_name}</p>

              <p>Starting a new session will create a separate time entry, allowing for accurate tracking of multiple work periods.</p>

              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #3b82f6;">${restartUrl}</p>
            </div>
            <div class="footer">
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
              <p>Serving Escondido, CA and surrounding areas.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send restart option email to technician
    await sendEmail({
      to: assignment.technician_email,
      subject: restartSubject,
      html: restartHtml,
      text: `Work session completed on service request ${assignment.request_number}. Duration: ${Math.floor(durationMinutes/60)}h ${durationMinutes%60}m. To start a new work session, visit: ${restartUrl}`
    });

    res.status(200).json({
      success: true,
      message: 'Work session stopped successfully',
      data: {
        requestNumber: assignment.request_number,
        stoppedBy: `${assignment.technician_first_name} ${assignment.technician_last_name}`,
        stoppedAt: stopTime,
        sessionDurationMinutes: durationMinutes,
        totalDurationMinutes: totalDuration,
        newStartToken: newStartToken
      }
    });

  } catch (error) {
    console.error('❌ Error processing stop request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop service request work'
    });
  }
});

export default router;