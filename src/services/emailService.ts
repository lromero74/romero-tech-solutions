import { EmailConfirmationRequest, EmailConfirmationResponse } from '../types/database';

class EmailService {
  private apiBaseUrl = '/api'; // TODO: Update with actual API base URL

  /**
   * Send email confirmation after client registration
   */
  async sendConfirmationEmail(email: string, token: string): Promise<{ success: boolean; message: string }> {
    try {
      // TODO: Implement actual API call
      console.log('Sending confirmation email:', { email, token });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock successful response
      return {
        success: true,
        message: 'Confirmation email sent successfully'
      };
    } catch (error: unknown) {
      console.error('Error sending confirmation email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send confirmation email';
      throw new Error(errorMessage);
    }
  }

  /**
   * Confirm email address using token
   */
  async confirmEmail(request: EmailConfirmationRequest): Promise<EmailConfirmationResponse> {
    try {
      // TODO: Implement actual API call
      console.log('Confirming email:', request);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock successful response
      return {
        success: true,
        message: 'Email confirmed successfully',
        user: {
          id: '123',
          email: request.email,
          role: 'client',
          name: 'Test User'
        }
      };
    } catch (error: unknown) {
      console.error('Error confirming email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm email';
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // TODO: Implement actual API call
      console.log('Resending confirmation email:', { email });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        message: 'Confirmation email resent successfully'
      };
    } catch (error: unknown) {
      console.error('Error resending confirmation email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend confirmation email';
      throw new Error(errorMessage);
    }
  }

  /**
   * Generate email confirmation template
   */
  generateConfirmationEmailContent(
    businessName: string,
    contactName: string,
    confirmationUrl: string
  ): { subject: string; html: string; text: string } {
    const subject = `Welcome to Romero Tech Solutions - Confirm Your Email`;

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin-bottom: 10px;">Welcome to Romero Tech Solutions</h1>
              <p style="color: #64748b; font-size: 18px;">Professional IT Support</p>
            </div>

            <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
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
                <a href="${confirmationUrl}"
                   style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none;
                          border-radius: 6px; font-weight: bold; display: inline-block;">
                  Confirm Email Address
                </a>
              </div>

              <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
                If the button doesn't work, you can copy and paste this link into your browser:
                <br><a href="${confirmationUrl}" style="color: #2563eb; word-break: break-all;">${confirmationUrl}</a>
              </p>
            </div>

            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 20px;">
              <h3 style="color: #047857; margin-bottom: 10px;">What's Next?</h3>
              <ul style="color: #065f46; margin: 0; padding-left: 20px;">
                <li>Confirm your email address</li>
                <li>Log in to your client portal</li>
                <li>Submit service requests</li>
                <li>Track your support tickets</li>
                <li>Access your service history</li>
              </ul>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 14px; margin-bottom: 10px;">
                Questions? Contact us at:
              </p>
              <p style="color: #2563eb; font-weight: bold;">
                📞 (619) 940-5550 | ✉️ info@romerotechsolutions.com
              </p>
              <p style="color: #64748b; font-size: 12px; margin-top: 20px;">
                © 2025 Romero Tech Solutions. All rights reserved.<br>
                Serving Escondido, CA and surrounding areas.
              </p>
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
- Confirm your email address
- Log in to your client portal
- Submit service requests
- Track your support tickets
- Access your service history

Questions? Contact us at:
Phone: (619) 940-5550
Email: info@romerotechsolutions.com

© 2025 Romero Tech Solutions. All rights reserved.
Serving Escondido, CA and surrounding areas.
    `;

    return { subject, html, text };
  }

  /**
   * Validate business domain email
   */
  validateBusinessDomain(email: string, domainEmail: string): boolean {
    const emailDomain = email.split('@')[1];
    const businessDomain = domainEmail.split('@')[1];
    return emailDomain === businessDomain;
  }

  /**
   * Generate secure confirmation token
   */
  generateConfirmationToken(): string {
    // Generate a secure random token
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(expiresAt: string): boolean {
    return new Date() > new Date(expiresAt);
  }
}

export const emailService = new EmailService();