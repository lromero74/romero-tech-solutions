import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { query } from '../config/database.js';

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
async function getEmailTranslations(language = 'en') {
  try {
    const result = await query(`
      SELECT tk.key_path, t.value
      FROM t_translation_keys tk
      JOIN t_translations t ON tk.id = t.key_id
      JOIN t_languages l ON t.language_id = l.id
      WHERE l.code = $1 AND tk.key_path LIKE 'email.mfa.%'
    `, [language]);

    const translations = {};
    result.rows.forEach(row => {
      translations[row.key_path] = row.value;
    });

    return translations;
  } catch (error) {
    console.error('Failed to fetch email translations:', error);
    // Return fallback English translations
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

      const subject = 'Password Reset - Romero Tech Solutions';

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
}

export const emailService = new EmailService();

// Export individual functions for convenience
export const sendConfirmationEmail = (params) => emailService.sendConfirmationEmail(params);
export const sendNotificationEmail = (params) => emailService.sendNotificationEmail(params);

export default emailService;