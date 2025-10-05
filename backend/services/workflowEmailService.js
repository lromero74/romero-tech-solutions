import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Base URL for action links (from environment or default)
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Generate email footer with branding
 */
function getEmailFooter() {
  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
      <p>This is an automated notification from Romero Tech Solutions.</p>
      <p>Please do not reply to this email. For assistance, contact your administrator.</p>
      <p>&copy; ${new Date().getFullYear()} Romero Tech Solutions. All rights reserved.</p>
    </div>
  `;
}

/**
 * Send acknowledgment email to employees
 */
export async function sendServiceRequestAcknowledgmentEmail({
  serviceRequestData,
  employee,
  acknowledgeToken,
  isRetry = false,
  retryAttempt = 0
}) {
  const acknowledgeUrl = `${BASE_URL}/employee/service-requests/acknowledge/${acknowledgeToken}`;

  const subject = isRetry
    ? `⚠️ REMINDER: Service Request #${serviceRequestData.requestNumber} Needs Acknowledgment (Attempt ${retryAttempt})`
    : `🔔 New Service Request #${serviceRequestData.requestNumber} - Action Required`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">
          ${isRetry ? '⚠️ REMINDER: ' : ''}New Service Request
        </h1>

        ${isRetry ? `
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
            <strong style="color: #92400e;">This is reminder #${retryAttempt}</strong>
            <p style="margin: 5px 0 0 0; color: #78350f;">This service request has not been acknowledged yet. Please take action immediately.</p>
          </div>
        ` : ''}

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Service Request #${serviceRequestData.requestNumber}</h2>

          <div style="margin: 15px 0;">
            <strong style="color: #4b5563;">Title:</strong>
            <p style="margin: 5px 0;">${serviceRequestData.title}</p>
          </div>

          <div style="margin: 15px 0;">
            <strong style="color: #4b5563;">Description:</strong>
            <p style="margin: 5px 0;">${serviceRequestData.description || 'No description provided'}</p>
          </div>

          <div style="margin: 15px 0;">
            <strong style="color: #4b5563;">Client:</strong>
            <p style="margin: 5px 0;">${serviceRequestData.clientName}</p>
          </div>
        </div>

        <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
          <strong style="color: #1e40af;">Action Required:</strong>
          <p style="margin: 10px 0; color: #1e3a8a;">
            Click the button below to acknowledge this service request and take ownership.
            ${isRetry ? ' If not acknowledged soon, this reminder will be sent again.' : ''}
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${acknowledgeUrl}"
             style="background-color: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
            Acknowledge & Take Ownership
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Or copy and paste this link: <a href="${acknowledgeUrl}" style="color: #3b82f6;">${acknowledgeUrl}</a>
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: employee.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Acknowledgment email sent to ${employee.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending acknowledgment email to ${employee.email}:`, error);
    throw error;
  }
}

/**
 * Send notification to client when service request is acknowledged
 */
export async function sendServiceRequestAcknowledgedClientEmail({
  serviceRequestData,
  client,
  employee
}) {
  const subject = `✅ Service Request #${serviceRequestData.requestNumber} Acknowledged`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Acknowledged</h1>

        <p style="font-size: 16px;">Hello ${client.firstName},</p>

        <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #065f46;">Good News!</strong>
          <p style="margin: 10px 0 0 0; color: #047857;">
            ${employee.firstName} ${employee.lastName} has acknowledged your service request and will begin work shortly.
          </p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Service Request #${serviceRequestData.requestNumber}</h2>
          <p style="margin: 10px 0;"><strong>Title:</strong> ${serviceRequestData.title}</p>
        </div>

        <p style="color: #4b5563;">
          You will receive another notification when work on your service request begins.
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: client.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Acknowledged notification sent to client ${client.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending acknowledged notification to client:`, error);
    throw error;
  }
}

/**
 * Send start link to acknowledging employee
 */
export async function sendServiceRequestStartLinkEmail({
  serviceRequestData,
  employee,
  startToken
}) {
  const startUrl = `${BASE_URL}/employee/service-requests/start/${startToken}`;

  const subject = `🚀 Ready to Start? Service Request #${serviceRequestData.requestNumber}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Ready to Start Work</h1>

        <p style="font-size: 16px;">Hello ${employee.firstName},</p>

        <p style="color: #4b5563;">
          You've successfully acknowledged service request #${serviceRequestData.requestNumber}.
          When you're ready to begin work, click the button below.
        </p>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
          <p style="color: #6b7280;">${serviceRequestData.description || ''}</p>
        </div>

        <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
          <p style="margin: 0; color: #1e3a8a;">
            <strong>Note:</strong> Starting early won't affect the charge to the client.
            Their billing begins at the scheduled time.
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${startUrl}"
             style="background-color: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
            Start Service Request
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Or copy and paste this link: <a href="${startUrl}" style="color: #3b82f6;">${startUrl}</a>
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: employee.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Start link sent to ${employee.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending start link:`, error);
    throw error;
  }
}

/**
 * Send reminder to start service request
 */
export async function sendServiceRequestStartReminderEmail({
  serviceRequestData,
  employee,
  retryAttempt
}) {
  const subject = `⏰ Reminder: Start Service Request #${serviceRequestData.requestNumber} (Attempt ${retryAttempt})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">⏰ Reminder: Start Service Request</h1>

        <p style="font-size: 16px;">Hello ${employee.firstName},</p>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #92400e;">Reminder #${retryAttempt}</strong>
          <p style="margin: 5px 0 0 0; color: #78350f;">
            You acknowledged service request #${serviceRequestData.requestNumber} but haven't started it yet.
          </p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
          <p style="color: #6b7280;">${serviceRequestData.description || ''}</p>
        </div>

        <p style="color: #4b5563;">
          Please check your previous email for the start link, or contact your administrator if you need assistance.
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: employee.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Start reminder sent to ${employee.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending start reminder:`, error);
    throw error;
  }
}

/**
 * Notify client when service request is started
 */
export async function sendServiceRequestStartedClientEmail({
  serviceRequestData,
  client,
  employee
}) {
  const subject = `🚀 Service Request #${serviceRequestData.requestNumber} Started`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Work Has Begun!</h1>

        <p style="font-size: 16px;">Hello ${client.firstName},</p>

        <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #1e40af;">Status Update</strong>
          <p style="margin: 10px 0 0 0; color: #1e3a8a;">
            ${employee.firstName} has started working on your service request.
          </p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Service Request #${serviceRequestData.requestNumber}</h2>
          <p style="margin: 10px 0;"><strong>Title:</strong> ${serviceRequestData.title}</p>
        </div>

        <p style="color: #4b5563;">
          You will receive another notification when the work is completed.
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: client.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Started notification sent to client ${client.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending started notification to client:`, error);
    throw error;
  }
}

/**
 * Notify admins when service request is started
 */
export async function sendServiceRequestStartedAdminEmail({
  serviceRequestData,
  admin,
  employee
}) {
  const subject = `🚀 Service Request #${serviceRequestData.requestNumber} Started by ${employee.firstName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Started</h1>

        <p style="font-size: 16px;">Hello ${admin.firstName},</p>

        <p style="color: #4b5563;">
          ${employee.firstName} has started working on service request #${serviceRequestData.requestNumber}.
        </p>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
          <p style="color: #6b7280;"><strong>Request #:</strong> ${serviceRequestData.requestNumber}</p>
        </div>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: admin.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Started notification sent to admin ${admin.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending started notification to admin:`, error);
    throw error;
  }
}

/**
 * Send close link to employee
 */
export async function sendServiceRequestCloseLinkEmail({
  serviceRequestData,
  employee,
  closeToken
}) {
  const closeUrl = `${BASE_URL}/employee/service-requests/close/${closeToken}`;

  const subject = `✅ Complete Service Request #${serviceRequestData.requestNumber}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Ready to Complete?</h1>

        <p style="font-size: 16px;">Hello ${employee.firstName},</p>

        <p style="color: #4b5563;">
          When you've finished working on service request #${serviceRequestData.requestNumber},
          use the button below to close it and provide completion details.
        </p>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${closeUrl}"
             style="background-color: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
            Complete Service Request
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Or copy and paste this link: <a href="${closeUrl}" style="color: #3b82f6;">${closeUrl}</a>
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: employee.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Close link sent to ${employee.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending close link:`, error);
    throw error;
  }
}

/**
 * Notify client when service request is closed
 */
export async function sendServiceRequestClosedClientEmail({
  serviceRequestData,
  client
}) {
  const subject = `✅ Service Request #${serviceRequestData.requestNumber} Completed`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Completed!</h1>

        <p style="font-size: 16px;">Hello ${client.firstName},</p>

        <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #065f46;">Great News!</strong>
          <p style="margin: 10px 0 0 0; color: #047857;">
            Your service request has been completed.
          </p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Service Request #${serviceRequestData.requestNumber}</h2>
          <p style="margin: 10px 0;"><strong>Title:</strong> ${serviceRequestData.title}</p>
          ${serviceRequestData.closeReason ? `<p style="margin: 10px 0;"><strong>Status:</strong> ${serviceRequestData.closeReason}</p>` : ''}
        </div>

        <p style="color: #4b5563;">
          Thank you for choosing Romero Tech Solutions. If you have any questions or concerns,
          please don't hesitate to contact us.
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: client.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Closed notification sent to client ${client.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending closed notification to client:`, error);
    throw error;
  }
}

/**
 * Notify admins when service request is closed
 */
export async function sendServiceRequestClosedAdminEmail({
  serviceRequestData,
  admin
}) {
  const subject = `✅ Service Request #${serviceRequestData.requestNumber} Closed`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Closed</h1>

        <p style="font-size: 16px;">Hello ${admin.firstName},</p>

        <p style="color: #4b5563;">
          Service request #${serviceRequestData.requestNumber} has been closed.
        </p>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
          <p style="color: #6b7280;"><strong>Request #:</strong> ${serviceRequestData.requestNumber}</p>
          ${serviceRequestData.closeReason ? `<p style="color: #6b7280;"><strong>Closure Reason:</strong> ${serviceRequestData.closeReason}</p>` : ''}
        </div>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: admin.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Closed notification sent to admin ${admin.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending closed notification to admin:`, error);
    throw error;
  }
}

/**
 * Notify client when service request is cancelled
 */
export async function sendServiceRequestCancelledClientEmail({
  serviceRequestData,
  client,
  cancelledBy
}) {
  const subject = `❌ Service Request #${serviceRequestData.requestNumber} Cancelled`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Cancelled</h1>

        <p style="font-size: 16px;">Hello ${client.firstName},</p>

        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <strong style="color: #991b1b;">Request Cancelled</strong>
          <p style="margin: 10px 0 0 0; color: #7f1d1d;">
            Your service request has been cancelled ${cancelledBy ? `by ${cancelledBy}` : ''}.
          </p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Service Request #${serviceRequestData.requestNumber}</h2>
          <p style="margin: 10px 0;"><strong>Title:</strong> ${serviceRequestData.title}</p>
          ${serviceRequestData.cancelReason ? `<p style="margin: 10px 0;"><strong>Reason:</strong> ${serviceRequestData.cancelReason}</p>` : ''}
        </div>

        <p style="color: #4b5563;">
          If you have any questions about this cancellation, please contact us.
        </p>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: client.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Cancelled notification sent to client ${client.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending cancelled notification to client:`, error);
    throw error;
  }
}

/**
 * Notify admin/executives when service request is cancelled
 */
export async function sendServiceRequestCancelledAdminEmail({
  serviceRequestData,
  admin,
  cancelledBy
}) {
  const subject = `❌ Service Request #${serviceRequestData.requestNumber} Cancelled`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
        <h1 style="color: #1f2937; margin: 0 0 20px 0;">Service Request Cancelled</h1>

        <p style="font-size: 16px;">Hello ${admin.firstName},</p>

        <p style="color: #4b5563;">
          Service request #${serviceRequestData.requestNumber} has been cancelled ${cancelledBy ? `by ${cancelledBy}` : ''}.
        </p>

        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #3b82f6; margin-top: 0;">${serviceRequestData.title}</h2>
          <p style="color: #6b7280;"><strong>Request #:</strong> ${serviceRequestData.requestNumber}</p>
          <p style="color: #6b7280;"><strong>Client:</strong> ${serviceRequestData.clientName}</p>
          ${serviceRequestData.cancelReason ? `<p style="color: #6b7280;"><strong>Cancellation Reason:</strong> ${serviceRequestData.cancelReason}</p>` : ''}
        </div>

        ${getEmailFooter()}
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Romero Tech Solutions" <${process.env.SMTP_USER}>`,
    to: admin.email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Cancelled notification sent to admin ${admin.email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error sending cancelled notification to admin:`, error);
    throw error;
  }
}
