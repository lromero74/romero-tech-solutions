import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { query, getPool } from '../config/database.js';

dotenv.config();

// Create nodemailer transporter using AWS SES SMTP interface
// This approach is compatible and doesn't require AWS SDK v2/v3
console.log('📧 Email service initialization:', {
  hasAwsKeyId: !!process.env.AWS_ACCESS_KEY_ID,
  hasAwsSecret: !!process.env.AWS_SECRET_ACCESS_KEY,
  hasSesSmtpUser: !!process.env.SES_SMTP_USER,
  hasSesSmtpPass: !!process.env.SES_SMTP_PASS,
  awsRegion: process.env.AWS_REGION,
  sesHost: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`
});

// Use SES SMTP credentials if available, otherwise fall back to AWS credentials
const smtpUser = process.env.SES_SMTP_USER || process.env.AWS_ACCESS_KEY_ID;
const smtpPass = process.env.SES_SMTP_PASS || process.env.AWS_SECRET_ACCESS_KEY;

if (!smtpUser || !smtpPass) {
  console.warn('⚠️  No SMTP credentials found. Set SES_SMTP_USER/SES_SMTP_PASS or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY');
}

const transporter = nodemailer.createTransport({
  host: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`,
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

// Helper function to fetch email translations from database
async function getEmailTranslations(language = 'en', pattern = 'email.%') {
  try {
    const result = await query(`
      SELECT tk.key_path, t.value
      FROM t_translation_keys tk
      JOIN t_translations t ON tk.id = t.key_id
      JOIN t_languages l ON t.language_id = l.id
      WHERE l.code = $1 AND tk.key_path LIKE $2
    `, [language, pattern]);

    const translations = {};
    result.rows.forEach(row => {
      translations[row.key_path] = row.value;
    });

    return translations;
  } catch (error) {
    console.error('Failed to fetch email translations:', error);
    // Return fallback English translations based on pattern
    if (pattern.includes('mfa')) {
      return {
        'email.mfa.body.requestMessage': 'We received a request to {{action}}. To {{action}}, please use the verification code below.',
        'email.mfa.body.codeInstructions': 'Enter the following 6-digit verification code to complete your {{purpose}}:',
        'email.mfa.body.codeLabel': 'Your Verification Code:',
        'email.mfa.body.securityTitle': 'Security Information:',
        'email.mfa.body.securityExpiry': 'This code expires in 10 minutes',
        'email.mfa.body.securitySingleUse': 'This code can only be used once',
        'email.mfa.body.securityNoShare': 'Never share this code with anyone',
        'email.mfa.body.securityContact': 'If you did not request this {{purpose}}, please contact us immediately',
        'email.mfa.body.troubleMessage': 'Having trouble? Contact our support team at {{phone}} or {{email}}',
        'email.mfa.footer.questionsLabel': 'Questions? Contact us:',
        'email.mfa.footer.copyright': '© 2025 Romero Tech Solutions. All rights reserved.',
        'email.mfa.footer.serviceArea': 'Serving Escondido, CA and surrounding areas.'
      };
    }
    // Return fallback translations for other email types
    return {
      'email.serviceRequest.subject': 'Service Request Confirmed: {{requestNumber}}',
      'email.serviceRequest.tagline': 'Service Request Confirmation',
      'email.serviceRequest.greeting': 'Hello {{firstName}},',
      'email.serviceRequest.confirmationMessage': 'Thank you for your service request! We have received and confirmed your request. Our team will review it and contact you shortly with next steps.',
      'email.passwordReset.subject': 'Password Reset - Romero Tech Solutions',
      'email.passwordReset.tagline': 'Password Reset Request',
      'email.passwordReset.greeting': 'Hello {{userName}},',
      'email.passwordReset.requestMessage': 'We received a request to reset the password for your account. If you did not make this request, please ignore this email and your password will remain unchanged.',
      'email.registration.subject': 'Welcome to Romero Tech Solutions - Confirm Your Email',
      'email.registration.tagline': 'Professional IT Support',
      'email.registration.greeting': 'Hello {{contactName}},'
    };
  }
}

// Helper function to get user's preferred language
async function getUserLanguage(userEmail) {
  try {
    const result = await query(`
      SELECT language_preference
      FROM users
      WHERE email = $1
    `, [userEmail]);

    return result.rows.length > 0 ? result.rows[0].language_preference || 'en' : 'en';
  } catch (error) {
    console.error('Failed to get user language preference:', error);
    return 'en'; // Default to English
  }
}

// Helper function to replace placeholders in translation strings
function interpolateTranslation(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  return result;
}

class EmailService {
  /**
   * Send email confirmation after client registration
   */
  async sendConfirmationEmail({ toEmail, businessName, contactName, confirmationUrl }) {
    try {
      console.log('🔍 Starting email send process...');
      console.log('📧 Email config:', {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        hasAwsCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        awsRegion: process.env.AWS_REGION
      });

      const emailTemplate = this.generateConfirmationEmailContent(
        businessName,
        contactName,
        confirmationUrl
      );

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      };

      console.log('📨 Attempting to send email with nodemailer...');
      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Confirmation email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Confirmation email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending confirmation email:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: error.stack
      });

      // Check if this is an AWS SES verification error
      if (error.code === 'MessageRejected' && error.message.includes('Email address is not verified')) {
        console.error('🚨 AWS SES EMAIL VERIFICATION ISSUE DETECTED:');
        console.error(`   The sender email address ${process.env.SES_FROM_EMAIL} is not verified in AWS SES.`);
        console.error('   To fix this:');
        console.error('   1. Log in to AWS Console → SES → Verified identities');
        console.error(`   2. Add and verify ${process.env.SES_FROM_EMAIL}`);
        console.error('   3. Check email for verification link');
        console.error('   4. Or request production access to send to any email');

        throw new Error(`EMAIL_VERIFICATION_REQUIRED: AWS SES sender email not verified. Please verify ${process.env.SES_FROM_EMAIL} in AWS SES console.`);
      }

      throw new Error(`Failed to send confirmation email: ${error.message}`);
    }
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail({ toEmail, businessName, contactName, confirmationUrl }) {
    return this.sendConfirmationEmail({ toEmail, businessName, contactName, confirmationUrl });
  }

  /**
   * Generate email confirmation template
   */
  generateConfirmationEmailContent(businessName, contactName, confirmationUrl) {
    const subject = `Welcome to Romero Tech Solutions - Confirm Your Email`;

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
            .welcome-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .cta-button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; text-align: center; }
            .cta-button:hover { background: #2563eb; }
            .features { margin: 20px 0; }
            .features ul { list-style: none; padding: 0; }
            .features li { padding: 8px 0; padding-left: 25px; position: relative; }
            .features li:before { content: "✓"; position: absolute; left: 0; color: #10b981; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            .link-fallback { color: #3b82f6; word-break: break-all; font-size: 12px; }
            .contact-info { margin-top: 20px; }
            .contact-info p { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
              </div>
              <div class="logo">Romero Tech Solutions</div>
              <div class="tagline">Professional IT Support</div>
            </div>

            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${contactName},</h2>

              <p style="margin-bottom: 15px;">
                Thank you for registering <strong>${businessName}</strong> with Romero Tech Solutions!
                We're excited to help you with your technology needs.
              </p>

              <p style="margin-bottom: 20px;">
                To complete your registration and access your client portal, please confirm your email address
                by clicking the button below:
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmationUrl}" class="cta-button" style="color: white;">
                  Confirm Email Address
                </a>
              </div>

              <div class="welcome-box">
                <h3 style="color: #047857; margin-bottom: 10px; margin-top: 0;">What's Next?</h3>
                <div class="features">
                  <ul>
                    <li>Confirm your email address</li>
                    <li>Log in to your client portal</li>
                    <li>Submit service requests</li>
                    <li>Track your support tickets</li>
                    <li>Access your service history</li>
                    <li>Manage multiple service locations</li>
                    <li>Communicate directly with technicians</li>
                  </ul>
                </div>
              </div>

              <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                If the button doesn't work, you can copy and paste this link into your browser:
                <br><span class="link-fallback">${confirmationUrl}</span>
              </p>
            </div>

            <div class="footer">
              <div class="contact-info">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Welcome to Romero Tech Solutions - Confirm Your Email

Hello ${contactName},

Thank you for registering ${businessName} with Romero Tech Solutions! We're excited to help you with your technology needs.

To complete your registration and access your client portal, please confirm your email address by visiting this link:

${confirmationUrl}

What's Next:
✓ Confirm your email address
✓ Log in to your client portal
✓ Submit service requests
✓ Track your support tickets
✓ Access your service history
✓ Manage multiple service locations
✓ Communicate directly with technicians

Questions? Contact us:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.

If you're having trouble with the link, copy and paste this URL into your browser:
${confirmationUrl}
    `;

    return { subject, html, text };
  }

  /**
   * Send password reset email with code
   */
  async sendPasswordResetEmail(toEmail, userName, resetCode) {
    try {
      console.log('🔐 Sending password reset email to:', toEmail);

      // Get user's preferred language and email translations
      const userLanguage = await getUserLanguage(toEmail);
      const translations = await getEmailTranslations(userLanguage, 'email.passwordReset.%');

      const subject = interpolateTranslation(
        translations['email.passwordReset.subject'] || 'Password Reset - Romero Tech Solutions',
        {}
      );

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
              .reset-code { background: #1e293b; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
              .code { font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 4px; }
              .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">Password Reset Request</div>
              </div>

              <div class="content">
                <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${userName},</h2>

                <p style="margin-bottom: 15px;">
                  We received a request to reset the password for your account. If you did not make this request,
                  please ignore this email and your password will remain unchanged.
                </p>

                <p style="margin-bottom: 20px;">
                  To reset your password, use the following 6-digit code in the password reset form:
                </p>

                <div class="reset-code">
                  <div style="margin-bottom: 10px; font-size: 14px;">Your Reset Code:</div>
                  <div class="code">${resetCode}</div>
                </div>

                <div class="warning-box">
                  <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ Security Notice:</p>
                  <ul style="margin: 10px 0 0 0; color: #92400e;">
                    <li>This code expires in 15 minutes</li>
                    <li>This code can only be used once</li>
                    <li>If you didn't request this, please ignore this email</li>
                  </ul>
                </div>

                <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                  If you're having trouble or did not request this password reset, please contact us immediately at
                  <strong>(619) 940-5550</strong> or <strong>info@romerotechsolutions.com</strong>
                </p>
              </div>

              <div class="footer">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `
Password Reset - Romero Tech Solutions

Hello ${userName},

We received a request to reset the password for your account. If you did not make this request, please ignore this email and your password will remain unchanged.

To reset your password, use the following 6-digit code in the password reset form:

RESET CODE: ${resetCode}

SECURITY NOTICE:
- This code expires in 15 minutes
- This code can only be used once
- If you didn't request this, please ignore this email

If you're having trouble or did not request this password reset, please contact us immediately:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.
      `;

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        subject: subject,
        text: text,
        html: html
      };

      console.log('📨 Attempting to send password reset email...');
      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Password reset email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  /**
   * Send admin login MFA email with code
   */
  async sendAdminLoginMfaEmail(toEmail, userName, mfaCode) {
    try {
      console.log('🔐 Sending admin login MFA email to:', toEmail);

      const subject = 'Admin Login Verification - Romero Tech Solutions';

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
              .mfa-code { background: #1e293b; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
              .code { font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 4px; }
              .security-box { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">Admin Login Verification</div>
              </div>

              <div class="content">
                <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${userName},</h2>

                <p style="margin-bottom: 15px;">
                  Someone is attempting to log in to the admin dashboard for your account. If this was you,
                  please use the verification code below to complete your login.
                </p>

                <p style="margin-bottom: 20px;">
                  To complete your admin login, enter the following 6-digit verification code:
                </p>

                <div class="mfa-code">
                  <div style="margin-bottom: 10px; font-size: 14px;">Your Verification Code:</div>
                  <div class="code">${mfaCode}</div>
                </div>

                <div class="security-box">
                  <p style="margin: 0; font-weight: bold; color: #0c4a6e;">🔒 Security Notice:</p>
                  <ul style="margin: 10px 0 0 0; color: #0c4a6e;">
                    <li>This code expires in 5 minutes</li>
                    <li>This code can only be used once</li>
                    <li>If you didn't request this login, please ignore this email and consider changing your password</li>
                    <li>Never share this code with anyone</li>
                  </ul>
                </div>

                <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                  If you're having trouble or did not request this login, please contact us immediately at
                  <strong>(619) 940-5550</strong> or <strong>info@romerotechsolutions.com</strong>
                </p>
              </div>

              <div class="footer">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `
Admin Login Verification - Romero Tech Solutions

Hello ${userName},

Someone is attempting to log in to the admin dashboard for your account. If this was you, please use the verification code below to complete your login.

To complete your admin login, enter the following 6-digit verification code:

VERIFICATION CODE: ${mfaCode}

SECURITY NOTICE:
- This code expires in 5 minutes
- This code can only be used once
- If you didn't request this login, please ignore this email and consider changing your password
- Never share this code with anyone

If you're having trouble or did not request this login, please contact us immediately:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.
      `;

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        subject: subject,
        text: text,
        html: html
      };

      console.log('📨 Attempting to send admin login MFA email...');
      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Admin login MFA email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Admin login MFA email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending admin login MFA email:', error);
      throw new Error(`Failed to send admin login MFA email: ${error.message}`);
    }
  }

  /**
   * Send client MFA verification email with professional styling using database translations
   */
  async sendClientMfaEmail(toEmail, firstName, mfaCode, codeType = 'setup', language = 'en') {
    try {
      console.log('🔐 Sending client MFA email to:', toEmail);

      // Fetch translations from database
      const translations = await getEmailTranslations(language);

      const isLogin = codeType === 'login';

      // Get existing MFA translations for subject and greeting
      const text = {
        subject: isLogin
          ? (language === 'es' ? 'Código de Verificación de Acceso - Romero Tech Solutions' : 'Login Verification Code - Romero Tech Solutions')
          : (language === 'es' ? 'Código de Verificación MFA - Romero Tech Solutions' : 'MFA Setup Verification Code - Romero Tech Solutions'),
        title: isLogin
          ? (language === 'es' ? 'Verificación de Acceso' : 'Login Verification')
          : (language === 'es' ? 'Verificación de Configuración MFA' : 'MFA Setup Verification'),
        greeting: language === 'es' ? `Hola ${firstName || 'Cliente Estimado'},` : `Hello ${firstName || 'Valued Client'},`,
        purpose: isLogin
          ? (language === 'es' ? 'verificación de acceso' : 'login verification')
          : (language === 'es' ? 'configuración de MFA' : 'MFA setup'),
        action: isLogin
          ? (language === 'es' ? 'completar su acceso' : 'complete your login')
          : (language === 'es' ? 'habilitar MFA en su cuenta' : 'enable MFA on your account')
      };

      // Create interpolation variables
      const variables = {
        action: text.action,
        purpose: text.purpose,
        phone: '(619) 940-5550',
        email: 'info@romerotechsolutions.com'
      };

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${text.subject}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #059669, #3b82f6); padding: 30px 20px; border-radius: 8px; color: #333; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; color: #333; }
              .tagline { font-size: 14px; opacity: 0.9; color: #333; }
              .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
              .mfa-code { background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
              .code { font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 4px; }
              .security-box { background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">${text.title}</div>
              </div>

              <div class="content">
                <h2 style="color: #059669; margin-bottom: 15px;">${text.greeting}</h2>

                <p style="margin-bottom: 15px;">
                  ${interpolateTranslation(translations['email.mfa.body.requestMessage'], variables)}
                </p>

                <p style="margin-bottom: 20px;">
                  ${interpolateTranslation(translations['email.mfa.body.codeInstructions'], variables)}
                </p>

                <div class="mfa-code">
                  <div style="margin-bottom: 10px; font-size: 14px;">
                    ${translations['email.mfa.body.codeLabel']}
                  </div>
                  <div class="code">${mfaCode}</div>
                </div>

                <div class="security-box">
                  <p style="margin: 0; font-weight: bold; color: #166534;">
                    🔒 ${translations['email.mfa.body.securityTitle']}
                  </p>
                  <ul style="margin: 10px 0 0 0; color: #166534;">
                    <li>${translations['email.mfa.body.securityExpiry']}</li>
                    <li>${translations['email.mfa.body.securitySingleUse']}</li>
                    <li>${translations['email.mfa.body.securityNoShare']}</li>
                    <li>${interpolateTranslation(translations['email.mfa.body.securityContact'], variables)}</li>
                  </ul>
                </div>

                <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                  ${interpolateTranslation(translations['email.mfa.body.troubleMessage'], variables)}
                </p>
              </div>

              <div class="footer">
                <p><strong>${translations['email.mfa.footer.questionsLabel']}</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  ${translations['email.mfa.footer.copyright']}<br>
                  ${translations['email.mfa.footer.serviceArea']}
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
${text.subject}

${text.greeting}

${interpolateTranslation(translations['email.mfa.body.requestMessage'], variables)}

${translations['email.mfa.body.codeLabel']} ${mfaCode}

${translations['email.mfa.body.securityTitle']}
• ${translations['email.mfa.body.securityExpiry']}
• ${translations['email.mfa.body.securitySingleUse']}
• ${translations['email.mfa.body.securityNoShare']}
• ${interpolateTranslation(translations['email.mfa.body.securityContact'], variables)}

${interpolateTranslation(translations['email.mfa.body.troubleMessage'], variables)}

${translations['email.mfa.footer.questionsLabel']}
📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com

${translations['email.mfa.footer.copyright']}
${translations['email.mfa.footer.serviceArea']}
      `;

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        subject: text.subject,
        html: html,
        text: textContent
      };

      const result = await transporter.sendMail(mailOptions);

      console.log('✅ Client MFA email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Client MFA email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending client MFA email:', error);
      throw new Error(`Failed to send client MFA email: ${error.message}`);
    }
  }

  /**
   * Send general notification email
   */
  async sendNotificationEmail({ toEmail, subject, message, businessName = null }) {
    try {
      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: toEmail,
        subject: subject,
        text: message,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e293b, #3b82f6); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
              <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 120px; height: auto; margin-bottom: 10px;" />
              <h1 style="margin: 0; font-size: 24px;">Romero Tech Solutions</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Professional IT Support</p>
            </div>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px;">
              ${businessName ? `<p><strong>Business:</strong> ${businessName}</p>` : ''}
              <div style="white-space: pre-line;">${message}</div>
            </div>
            <div style="text-align: center; margin-top: 20px; color: #64748b; font-size: 12px;">
              <p>© 2025 Romero Tech Solutions | (619) 940-5550 | info@romerotechsolutions.com</p>
            </div>
          </div>
        `
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Notification email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending notification email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send service request notification to technicians with acknowledgment links
   */
  async sendServiceRequestNotificationToTechnicians({ serviceRequestData, technicians, serviceRequestId }) {
    try {
      console.log('📧 Sending service request notifications to', technicians.length, 'active technicians');

      const { requestNumber, title, description, businessName, clientName,
              serviceLocation, urgencyLevel, priorityLevel, serviceType,
              scheduledDate, scheduledTime, contactName, contactPhone, contactEmail,
              serviceLocationDetails } = serviceRequestData;

      const subject = `New Service Request: ${requestNumber} - ${title}`;

      // Create acknowledgment tokens for each technician and prepare emails
      const pool = await getPool();
      const emailPromises = technicians.map(async (technician) => {
        // Generate unique acknowledgment token for this technician
        const acknowledgmentToken = crypto.randomBytes(32).toString('hex');

        // Create acknowledgment record in database
        try {
          await pool.query(`
            INSERT INTO service_request_acknowledgments (
              service_request_id,
              employee_id,
              acknowledgment_token,
              created_at
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          `, [serviceRequestId, technician.id, acknowledgmentToken]);

          console.log(`🔐 Created acknowledgment token for ${technician.firstName} - Token: ${acknowledgmentToken.substring(0, 8)}...`);
        } catch (tokenError) {
          console.error(`❌ Error creating acknowledgment token for ${technician.firstName}:`, tokenError);
          throw tokenError;
        }

        // Generate acknowledgment URL
        const acknowledgmentUrl = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/service-request-workflow/acknowledge/${acknowledgmentToken}`;

        console.log(`📧 Sending notification to ${technician.firstName} with acknowledgment link`);

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
                .request-header { background: #3b82f6; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; }
                .request-number { font-size: 20px; font-weight: bold; font-family: monospace; }
                .details-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 15px 0; }
                .detail-label { font-weight: bold; color: #374151; }
                .detail-value { color: #111827; }
                .urgent-notice { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .high-priority { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
                .action-note { background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .acknowledge-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 15px 0; font-size: 16px; }
                .acknowledge-button:hover { background: #2563eb; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div style="text-align: center; margin-bottom: 10px;">
                    <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                  </div>
                  <div class="logo">Romero Tech Solutions</div>
                  <div class="tagline">New Service Request Alert</div>
                </div>

                <div class="content">
                  <h2 style="color: #1e293b; margin-bottom: 15px;">Hello ${technician.firstName},</h2>

                  <p style="margin-bottom: 15px;">
                    A new service request has been submitted and requires technician attention.
                  </p>

                  <div class="request-header">
                    <div style="margin-bottom: 5px; font-size: 14px;">Service Request Number:</div>
                    <div class="request-number">${requestNumber}</div>
                  </div>

                  ${urgencyLevel === 'Urgent' ? `
                    <div class="urgent-notice">
                      <p style="margin: 0; font-weight: bold; color: #92400e;">⚠️ URGENT REQUEST</p>
                      <p style="margin: 5px 0 0 0; color: #92400e;">This service request requires immediate attention.</p>
                    </div>
                  ` : ''}

                  ${priorityLevel === 'High' ? `
                    <div class="high-priority">
                      <p style="margin: 0; font-weight: bold; color: #dc2626;">🔴 HIGH PRIORITY</p>
                      <p style="margin: 5px 0 0 0; color: #dc2626;">This service request has high priority.</p>
                    </div>
                  ` : ''}

                  <div class="details-grid">
                    <div class="detail-label">Title:</div>
                    <div class="detail-value"><strong>${title}</strong></div>

                    <div class="detail-label">Description:</div>
                    <div class="detail-value">${description}</div>

                    <div class="detail-label">Business:</div>
                    <div class="detail-value">${businessName}</div>

                    <div class="detail-label">Client:</div>
                    <div class="detail-value">${clientName}</div>

                    <div class="detail-label">Service Location:</div>
                    <div class="detail-value">
                      ${serviceLocationDetails ? `
                        <div style="margin-bottom: 8px;">
                          <strong>${serviceLocationDetails.location_name || serviceLocation}</strong>
                        </div>
                        ${serviceLocationDetails.street_address_1 || serviceLocationDetails.street ? `
                          <div style="margin-bottom: 5px;">
                            <a href="https://maps.google.com/?q=${encodeURIComponent(
                              `${serviceLocationDetails.street_address_1 || serviceLocationDetails.street}${serviceLocationDetails.street_address_2 ? ' ' + serviceLocationDetails.street_address_2 : ''}, ${serviceLocationDetails.city || ''}, ${serviceLocationDetails.state || ''} ${serviceLocationDetails.zip_code || ''}`
                            )}"
                               style="color: #3b82f6; text-decoration: none;"
                               target="_blank">
                              📍 ${serviceLocationDetails.street_address_1 || serviceLocationDetails.street}
                              ${serviceLocationDetails.street_address_2 ? ', ' + serviceLocationDetails.street_address_2 : ''}
                              <br>
                              ${serviceLocationDetails.city || ''}, ${serviceLocationDetails.state || ''} ${serviceLocationDetails.zip_code || ''}
                            </a>
                          </div>
                        ` : ''}
                        ${serviceLocationDetails.contact_phone ? `
                          <div style="margin-bottom: 5px;">
                            <a href="tel:${serviceLocationDetails.contact_phone}"
                               style="color: #16a34a; text-decoration: none;">
                              📞 ${serviceLocationDetails.contact_phone}
                            </a>
                            ${serviceLocationDetails.contact_person ? ` (${serviceLocationDetails.contact_person})` : ''}
                          </div>
                        ` : ''}
                        ${serviceLocationDetails.contact_email ? `
                          <div style="margin-bottom: 5px;">
                            <a href="mailto:${serviceLocationDetails.contact_email}"
                               style="color: #3b82f6; text-decoration: none;">
                              ✉️ ${serviceLocationDetails.contact_email}
                            </a>
                          </div>
                        ` : ''}
                        ${serviceLocationDetails.notes ? `
                          <div style="margin-top: 8px; font-size: 14px; color: #64748b; font-style: italic;">
                            Note: ${serviceLocationDetails.notes}
                          </div>
                        ` : ''}
                      ` : serviceLocation}
                    </div>

                    ${serviceType ? `
                      <div class="detail-label">Service Type:</div>
                      <div class="detail-value">${serviceType}</div>
                    ` : ''}

                    <div class="detail-label">Urgency Level:</div>
                    <div class="detail-value">${urgencyLevel}</div>

                    <div class="detail-label">Priority Level:</div>
                    <div class="detail-value">${priorityLevel}</div>

                    ${scheduledDate ? `
                      <div class="detail-label">Requested Date:</div>
                      <div class="detail-value">${scheduledDate}</div>
                    ` : ''}

                    ${scheduledTime ? `
                      <div class="detail-label">Requested Time:</div>
                      <div class="detail-value">${scheduledTime}</div>
                    ` : ''}

                    <div class="detail-label">Primary Contact:</div>
                    <div class="detail-value">${contactName}</div>

                    <div class="detail-label">Contact Phone:</div>
                    <div class="detail-value"><a href="tel:${contactPhone}" style="color: #3b82f6;">${contactPhone}</a></div>

                    <div class="detail-label">Contact Email:</div>
                    <div class="detail-value"><a href="mailto:${contactEmail}" style="color: #3b82f6;">${contactEmail}</a></div>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${acknowledgmentUrl}" class="acknowledge-button">
                      ✅ ACKNOWLEDGE SERVICE REQUEST
                    </a>
                  </div>

                  <div class="action-note">
                    <p style="margin: 0; font-weight: bold; color: #166534;">📋 Action Required:</p>
                    <p style="margin: 10px 0 0 0; color: #166534;">
                      Click the "Acknowledge Service Request" button above to confirm that you have received this service request.
                      You will then receive a follow-up email with a link to start working on the request.
                    </p>
                  </div>

                  <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                    <strong>Note:</strong> Only the first technician to acknowledge this request will be able to work on it.
                    Other technicians will be notified that it has already been acknowledged.
                  </p>

                  <p style="color: #64748b; font-size: 12px; margin-top: 15px;">
                    If the button doesn't work, you can copy and paste this link into your browser:<br>
                    <span style="word-break: break-all; color: #3b82f6;">${acknowledgmentUrl}</span>
                  </p>
                </div>

                <div class="footer">
                  <p><strong>Questions? Contact us:</strong></p>
                  <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                  <p style="margin-top: 15px;">
                    © 2025 Romero Tech Solutions. All rights reserved.<br>
                    Serving Escondido, CA and surrounding areas.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `;

        const text = `
New Service Request: ${requestNumber} - ${title}

Hello ${technician.firstName},

A new service request has been submitted and requires technician attention.

SERVICE REQUEST DETAILS:
Request Number: ${requestNumber}
Title: ${title}
Description: ${description}
Business: ${businessName}
Client: ${clientName}
Service Location: ${serviceLocationDetails ?
          `${serviceLocationDetails.location_name || serviceLocation}${serviceLocationDetails.street_address_1 || serviceLocationDetails.street ?
            `\n  Address: ${serviceLocationDetails.street_address_1 || serviceLocationDetails.street}${serviceLocationDetails.street_address_2 ? ' ' + serviceLocationDetails.street_address_2 : ''}, ${serviceLocationDetails.city || ''}, ${serviceLocationDetails.state || ''} ${serviceLocationDetails.zip_code || ''}` : ''}${serviceLocationDetails.contact_phone ?
            `\n  Site Contact Phone: ${serviceLocationDetails.contact_phone}${serviceLocationDetails.contact_person ? ' (' + serviceLocationDetails.contact_person + ')' : ''}` : ''}${serviceLocationDetails.contact_email ?
            `\n  Site Contact Email: ${serviceLocationDetails.contact_email}` : ''}${serviceLocationDetails.notes ?
            `\n  Note: ${serviceLocationDetails.notes}` : ''}` : serviceLocation}
${serviceType ? `Service Type: ${serviceType}` : ''}
Urgency Level: ${urgencyLevel}
Priority Level: ${priorityLevel}
${scheduledDate ? `Requested Date: ${scheduledDate}` : ''}
${scheduledTime ? `Requested Time: ${scheduledTime}` : ''}

CONTACT INFORMATION:
Primary Contact: ${contactName}
Contact Phone: ${contactPhone}
Contact Email: ${contactEmail}

${urgencyLevel === 'Urgent' ? 'URGENT REQUEST - This service request requires immediate attention.' : ''}
${priorityLevel === 'High' ? 'HIGH PRIORITY - This service request has high priority.' : ''}

NEXT STEPS:
- Review the service request details
- Contact the client within 1 hour to confirm receipt
- Schedule the service appointment
- Update the service request status in the system

To view and manage this service request, please log in to the technician portal.

Questions? Contact us:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.
        `;

        const mailOptions = {
          from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
          to: technician.email,
          subject: subject,
          text: text,
          html: html
        };

        return transporter.sendMail(mailOptions);
      });

      const results = await Promise.allSettled(emailPromises);

      // Log results
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          console.log(`✅ Service request notification sent to ${technicians[index].email}:`, result.value.messageId);
        } else {
          failureCount++;
          console.error(`❌ Failed to send notification to ${technicians[index].email}:`, result.reason);
        }
      });

      console.log(`📊 Service request notification summary: ${successCount} sent, ${failureCount} failed`);

      return {
        success: true,
        totalTechnicians: technicians.length,
        successCount,
        failureCount,
        message: `Service request notifications sent to ${successCount}/${technicians.length} technicians`
      };

    } catch (error) {
      console.error('❌ Error sending service request notifications to technicians:', error);
      throw new Error(`Failed to send technician notifications: ${error.message}`);
    }
  }

  /**
   * Send service request confirmation email to client
   */
  async sendServiceRequestConfirmationToClient({ serviceRequestData, clientData }) {
    try {
      console.log('📧 Sending service request confirmation to client:', clientData.email);

      const { requestNumber, title, description, serviceLocation,
              scheduledDate, scheduledTime, contactName, contactPhone } = serviceRequestData;

      const subject = `Service Request Confirmed: ${requestNumber}`;

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
              .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #059669, #3b82f6); color: white; padding: 30px 20px; border-radius: 8px; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
              .tagline { font-size: 14px; opacity: 0.9; }
              .content { background: #f8fafc; border-radius: 8px; padding: 25px; margin-bottom: 20px; }
              .confirmation-box { background: #dcfce7; border-left: 4px solid #16a34a; padding: 20px; margin: 20px 0; border-radius: 4px; }
              .request-number { font-size: 18px; font-weight: bold; font-family: monospace; color: #059669; }
              .details-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 15px 0; }
              .detail-label { font-weight: bold; color: #374151; }
              .detail-value { color: #111827; }
              .response-promise { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">Service Request Confirmation</div>
              </div>

              <div class="content">
                <h2 style="color: #059669; margin-bottom: 15px;">Hello ${clientData.firstName},</h2>

                <div class="confirmation-box">
                  <p style="margin: 0; font-weight: bold; color: #166534;">✅ Your service request has been successfully submitted!</p>
                  <p style="margin: 10px 0 0 0; color: #166534;">
                    Request Number: <span class="request-number">${requestNumber}</span>
                  </p>
                </div>

                <p style="margin-bottom: 15px;">
                  Thank you for choosing Romero Tech Solutions for your technology needs. We have received
                  your service request and our team has been notified.
                </p>

                <div class="details-grid">
                  <div class="detail-label">Service Title:</div>
                  <div class="detail-value"><strong>${title}</strong></div>

                  <div class="detail-label">Description:</div>
                  <div class="detail-value">${description}</div>

                  <div class="detail-label">Service Location:</div>
                  <div class="detail-value">${serviceLocation}</div>

                  ${scheduledDate ? `
                    <div class="detail-label">Requested Date:</div>
                    <div class="detail-value">${scheduledDate}</div>
                  ` : ''}

                  ${scheduledTime ? `
                    <div class="detail-label">Requested Time:</div>
                    <div class="detail-value">${scheduledTime}</div>
                  ` : ''}

                  <div class="detail-label">Primary Contact:</div>
                  <div class="detail-value">${contactName}</div>

                  <div class="detail-label">Contact Phone:</div>
                  <div class="detail-value">${contactPhone}</div>
                </div>

                <div class="response-promise">
                  <p style="margin: 0; font-weight: bold; color: #0c4a6e;">🕐 Response Commitment:</p>
                  <p style="margin: 10px 0 0 0; color: #0c4a6e;">
                    A qualified technician will contact you within <strong>1 hour</strong> to discuss your
                    service request and schedule an appointment.
                  </p>
                </div>

                <p style="margin-bottom: 15px;">
                  You can track the status of your service request by logging into your client portal
                  or by referencing your request number <strong>${requestNumber}</strong> when contacting us.
                </p>

                <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                  If you have any questions or need to update your request, please contact us at
                  <strong>(619) 940-5550</strong> or <strong>info@romerotechsolutions.com</strong>
                </p>
              </div>

              <div class="footer">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `
Service Request Confirmed: ${requestNumber}

Hello ${clientData.firstName},

✅ Your service request has been successfully submitted!
Request Number: ${requestNumber}

Thank you for choosing Romero Tech Solutions for your technology needs. We have received your service request and our team has been notified.

SERVICE REQUEST DETAILS:
Service Title: ${title}
Description: ${description}
Service Location: ${serviceLocationDetails ?
          `${serviceLocationDetails.location_name || serviceLocation}${serviceLocationDetails.street_address_1 || serviceLocationDetails.street ?
            `\n  Address: ${serviceLocationDetails.street_address_1 || serviceLocationDetails.street}${serviceLocationDetails.street_address_2 ? ' ' + serviceLocationDetails.street_address_2 : ''}, ${serviceLocationDetails.city || ''}, ${serviceLocationDetails.state || ''} ${serviceLocationDetails.zip_code || ''}` : ''}${serviceLocationDetails.contact_phone ?
            `\n  Site Contact Phone: ${serviceLocationDetails.contact_phone}${serviceLocationDetails.contact_person ? ' (' + serviceLocationDetails.contact_person + ')' : ''}` : ''}${serviceLocationDetails.contact_email ?
            `\n  Site Contact Email: ${serviceLocationDetails.contact_email}` : ''}${serviceLocationDetails.notes ?
            `\n  Note: ${serviceLocationDetails.notes}` : ''}` : serviceLocation}
${scheduledDate ? `Requested Date: ${scheduledDate}` : ''}
${scheduledTime ? `Requested Time: ${scheduledTime}` : ''}
Primary Contact: ${contactName}
Contact Phone: ${contactPhone}

RESPONSE COMMITMENT:
A qualified technician will contact you within 1 HOUR to discuss your service request and schedule an appointment.

You can track the status of your service request by logging into your client portal or by referencing your request number ${requestNumber} when contacting us.

If you have any questions or need to update your request, please contact us:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.
      `;

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: clientData.email,
        subject: subject,
        text: text,
        html: html
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Service request confirmation sent to client:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Service request confirmation email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending service request confirmation to client:', error);
      throw new Error(`Failed to send client confirmation: ${error.message}`);
    }
  }

  /**
   * Send service request creation notification
   * Sends to: creator (client) and all employees with admin, executive, or technician roles
   */
  async sendServiceRequestCreationNotification({ serviceRequest, clientData }) {
    try {
      console.log('📧 Sending service request creation notifications...');

      const pool = await getPool();

      // Get employees with admin, executive, or technician roles
      const employeesQuery = `
        SELECT DISTINCT e.id, e.email, e.first_name, e.last_name, r.name as role
        FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN roles r ON er.role_id = r.id
        WHERE r.name IN ('admin', 'executive', 'technician')
        AND e.is_active = true
        AND r.is_active = true
      `;
      const employeesResult = await pool.query(employeesQuery);
      const employees = employeesResult.rows;

      console.log(`📬 Found ${employees.length} employees to notify`);

      const subject = `New Service Request Created: ${serviceRequest.requestNumber}`;

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
              .request-number { background: #3b82f6; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; font-size: 20px; font-weight: bold; }
              .details-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 15px 0; }
              .detail-label { font-weight: bold; color: #374151; }
              .detail-value { color: #111827; }
              .contact-box { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">New Service Request</div>
              </div>

              <div class="content">
                <h2 style="color: #1e293b; margin-bottom: 15px;">Service Request Created</h2>

                <div class="request-number">
                  ${serviceRequest.requestNumber}
                </div>

                <div class="details-grid">
                  <div class="detail-label">Title:</div>
                  <div class="detail-value"><strong>${serviceRequest.title}</strong></div>

                  <div class="detail-label">Description:</div>
                  <div class="detail-value">${serviceRequest.description}</div>

                  <div class="detail-label">Service Location:</div>
                  <div class="detail-value">${serviceRequest.locationName || 'Not specified'}</div>

                  ${serviceRequest.requestedDate ? `
                    <div class="detail-label">Requested Date:</div>
                    <div class="detail-value">${new Date(serviceRequest.requestedDate).toLocaleDateString()}</div>
                  ` : ''}

                  ${serviceRequest.requestedTimeStart ? `
                    <div class="detail-label">Requested Time:</div>
                    <div class="detail-value">${serviceRequest.requestedTimeStart} - ${serviceRequest.requestedTimeEnd || ''}</div>
                  ` : ''}

                  <div class="detail-label">Status:</div>
                  <div class="detail-value">${serviceRequest.status}</div>
                </div>

                <div class="contact-box">
                  <p style="margin: 0; font-weight: bold; color: #0c4a6e;">📞 Created By:</p>
                  <p style="margin: 10px 0 0 0; color: #0c4a6e;">
                    <strong>${clientData.firstName} ${clientData.lastName}</strong><br>
                    📧 <a href="mailto:${clientData.email}" style="color: #0ea5e9;">${clientData.email}</a><br>
                    ${clientData.phone ? `📱 <a href="tel:${clientData.phone}" style="color: #0ea5e9;">${clientData.phone}</a>` : ''}
                  </p>
                </div>
              </div>

              <div class="footer">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `
New Service Request Created: ${serviceRequest.requestNumber}

Title: ${serviceRequest.title}
Description: ${serviceRequest.description}
Service Location: ${serviceRequest.locationName || 'Not specified'}
${serviceRequest.requestedDate ? `Requested Date: ${new Date(serviceRequest.requestedDate).toLocaleDateString()}` : ''}
${serviceRequest.requestedTimeStart ? `Requested Time: ${serviceRequest.requestedTimeStart} - ${serviceRequest.requestedTimeEnd || ''}` : ''}
Status: ${serviceRequest.status}

Created By:
${clientData.firstName} ${clientData.lastName}
Email: ${clientData.email}
${clientData.phone ? `Phone: ${clientData.phone}` : ''}

Questions? Contact us:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
      `;

      // Send to client (creator)
      const clientPromise = transporter.sendMail({
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: clientData.email,
        subject: subject,
        text: text,
        html: html
      });

      // Send to all employees
      const employeePromises = employees.map(employee =>
        transporter.sendMail({
          from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
          to: employee.email,
          subject: subject,
          text: text,
          html: html
        })
      );

      const results = await Promise.allSettled([clientPromise, ...employeePromises]);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Service request creation notifications: ${successCount} sent, ${failureCount} failed`);

      return {
        success: true,
        totalRecipients: results.length,
        successCount,
        failureCount
      };

    } catch (error) {
      console.error('❌ Error sending service request creation notifications:', error);
      throw error;
    }
  }

  /**
   * Send note addition notification
   * Sends to: service request creator and all employees with admin, executive, or technician roles
   */
  async sendNoteAdditionNotification({ serviceRequest, note, noteCreator, clientData }) {
    try {
      console.log('📧 Sending note addition notifications...');

      const pool = await getPool();

      // Get employees with admin, executive, or technician roles
      const employeesQuery = `
        SELECT DISTINCT e.id, e.email, e.first_name, e.last_name, r.name as role
        FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN roles r ON er.role_id = r.id
        WHERE r.name IN ('admin', 'executive', 'technician')
        AND e.is_active = true
        AND r.is_active = true
      `;
      const employeesResult = await pool.query(employeesQuery);
      const employees = employeesResult.rows;

      console.log(`📬 Found ${employees.length} employees to notify about note`);

      const subject = `New Note Added to Service Request: ${serviceRequest.requestNumber}`;

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
              .request-number { background: #3b82f6; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; font-size: 18px; font-weight: bold; }
              .note-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
              .note-header { font-size: 12px; color: #92400e; margin-bottom: 10px; }
              .note-text { color: #78350f; white-space: pre-wrap; }
              .contact-box { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="text-align: center; margin-bottom: 10px;">
                  <img src="https://romerotechsolutions.com/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png" alt="Romero Tech Solutions Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;" />
                </div>
                <div class="logo">Romero Tech Solutions</div>
                <div class="tagline">New Note Added</div>
              </div>

              <div class="content">
                <h2 style="color: #1e293b; margin-bottom: 15px;">Note Added to Service Request</h2>

                <div class="request-number">
                  ${serviceRequest.requestNumber}: ${serviceRequest.title}
                </div>

                <div class="note-box">
                  <div class="note-header">
                    <strong>${noteCreator.name}</strong> • ${noteCreator.email} • ${new Date(note.createdAt).toLocaleString()}
                  </div>
                  <div class="note-text">${note.noteText}</div>
                </div>

                <div class="contact-box">
                  <p style="margin: 0; font-weight: bold; color: #0c4a6e;">📞 Note Added By:</p>
                  <p style="margin: 10px 0 0 0; color: #0c4a6e;">
                    <strong>${noteCreator.name}</strong><br>
                    📧 <a href="mailto:${noteCreator.email}" style="color: #0ea5e9;">${noteCreator.email}</a><br>
                    ${noteCreator.phone ? `📱 <a href="tel:${noteCreator.phone}" style="color: #0ea5e9;">${noteCreator.phone}</a>` : ''}
                  </p>
                </div>

                <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                  Service Request: ${serviceRequest.requestNumber}<br>
                  Location: ${serviceRequest.locationName || 'Not specified'}<br>
                  Status: ${serviceRequest.status}
                </p>
              </div>

              <div class="footer">
                <p><strong>Questions? Contact us:</strong></p>
                <p>📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com</p>
                <p style="margin-top: 15px;">
                  © 2025 Romero Tech Solutions. All rights reserved.<br>
                  Serving Escondido, CA and surrounding areas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `
New Note Added to Service Request: ${serviceRequest.requestNumber}

Service Request: ${serviceRequest.requestNumber}: ${serviceRequest.title}

NOTE:
${noteCreator.name} • ${noteCreator.email} • ${new Date(note.createdAt).toLocaleString()}
${note.noteText}

Note Added By:
${noteCreator.name}
Email: ${noteCreator.email}
${noteCreator.phone ? `Phone: ${noteCreator.phone}` : ''}

Service Request Details:
Request Number: ${serviceRequest.requestNumber}
Location: ${serviceRequest.locationName || 'Not specified'}
Status: ${serviceRequest.status}

Questions? Contact us:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
      `;

      // Send to client (service request creator)
      const clientPromise = transporter.sendMail({
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: clientData.email,
        subject: subject,
        text: text,
        html: html
      });

      // Send to all employees
      const employeePromises = employees.map(employee =>
        transporter.sendMail({
          from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
          to: employee.email,
          subject: subject,
          text: text,
          html: html
        })
      );

      const results = await Promise.allSettled([clientPromise, ...employeePromises]);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Note addition notifications: ${successCount} sent, ${failureCount} failed`);

      return {
        success: true,
        totalRecipients: results.length,
        successCount,
        failureCount
      };

    } catch (error) {
      console.error('❌ Error sending note addition notifications:', error);
      throw error;
    }
  }

  /**
   * Generic email sending method for custom emails
   * @param {Object} params - Email parameters
   * @param {string} params.to - Recipient email address
   * @param {string} params.subject - Email subject
   * @param {string} params.html - HTML email body
   * @param {string} [params.text] - Plain text email body (optional)
   * @returns {Promise<Object>} Email sending result
   */
  async sendEmail({ to, subject, html, text = null }) {
    try {
      console.log('🔍 Starting generic email send process...');
      console.log('📧 Email config:', {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: to,
        subject: subject
      });

      const mailOptions = {
        from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
        to: to,
        subject: subject,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version if not provided
        html: html
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);

      return {
        success: true,
        messageId: result.messageId,
        message: 'Email sent successfully'
      };

    } catch (error) {
      console.error('❌ Error sending email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

export const emailService = new EmailService();

// Export individual functions for convenience
export const sendConfirmationEmail = (params) => emailService.sendConfirmationEmail(params);
export const sendNotificationEmail = (params) => emailService.sendNotificationEmail(params);
export const sendEmail = (params) => emailService.sendEmail(params);
export const sendServiceRequestNotificationToTechnicians = (params) => emailService.sendServiceRequestNotificationToTechnicians(params);
export const sendServiceRequestConfirmationToClient = (params) => emailService.sendServiceRequestConfirmationToClient(params);
export const sendServiceRequestCreationNotification = (params) => emailService.sendServiceRequestCreationNotification(params);
export const sendNoteAdditionNotification = (params) => emailService.sendNoteAdditionNotification(params);

export default emailService;