import { query, getPool } from '../config/database.js';
import { sendEmail } from './emailService.js';

/**
 * Email Verification Cleanup Service
 * Handles cleanup of expired verification records and sends follow-up emails
 */
class VerificationCleanupService {
  constructor() {
    this.cleanupInterval = null;
    this.CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
    this.EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 minutes after expiry
  }

  /**
   * Start the background cleanup service
   */
  start() {
    if (this.cleanupInterval) {
      console.log('⚠️ Verification cleanup service already running');
      return;
    }

    console.log('🧹 Starting email verification cleanup service...');

    // Run immediately on start
    this.performCleanup();

    // Then run every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    console.log(`✅ Verification cleanup service started (runs every ${this.CLEANUP_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the background cleanup service
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Verification cleanup service stopped');
    }
  }

  /**
   * Perform cleanup of expired verification records
   */
  async performCleanup() {
    try {
      console.log('🔍 Running email verification cleanup...');

      // Find expired verification records (20+ minutes old and unused)
      const cutoffTime = new Date(Date.now() - (20 * 60 * 1000)); // 20 minutes ago

      const expiredRecords = await query(`
        SELECT
          email,
          user_data,
          created_at,
          expires_at
        FROM email_verifications
        WHERE used = false
          AND created_at < $1
          AND expires_at < NOW()
        ORDER BY created_at ASC
      `, [cutoffTime]);

      if (expiredRecords.rows.length === 0) {
        console.log('✨ No expired verification records to clean up');
        return;
      }

      console.log(`🧹 Found ${expiredRecords.rows.length} expired verification record(s) to clean up`);

      // Process each expired record
      for (const record of expiredRecords.rows) {
        await this.processExpiredRecord(record);
      }

      // Delete all processed expired records
      const deletedCount = await query(`
        DELETE FROM email_verifications
        WHERE used = false
          AND created_at < $1
          AND expires_at < NOW()
      `, [cutoffTime]);

      console.log(`✅ Cleanup complete: processed ${expiredRecords.rows.length} records, deleted ${deletedCount.rowCount} database entries`);

    } catch (error) {
      console.error('❌ Error during verification cleanup:', error);
    }
  }

  /**
   * Process a single expired verification record
   */
  async processExpiredRecord(record) {
    try {
      const { email, user_data, created_at, expires_at } = record;
      const userData = user_data ? JSON.parse(user_data) : {};
      const businessName = userData.businessName || 'Your Business';
      const language = userData.language || 'en';

      console.log(`📧 Sending follow-up email to ${email} for business: ${businessName}`);

      // Send follow-up email
      await this.sendFollowUpEmail(email, businessName, language);

      console.log(`✅ Follow-up email sent to ${email}`);

    } catch (error) {
      console.error(`❌ Error processing expired record for ${record.email}:`, error);
    }
  }

  /**
   * Send follow-up email for expired verification
   */
  async sendFollowUpEmail(email, businessName, language = 'en') {
    const isSpanish = language === 'es';

    const subject = isSpanish
      ? 'Su registro no se completó - Romero Tech Solutions'
      : 'Your registration was not completed - Romero Tech Solutions';

    const emailContent = this.generateFollowUpEmailContent(businessName, isSpanish);

    await sendEmail({
      to: email,
      subject,
      html: emailContent,
      text: this.stripHtml(emailContent)
    });
  }

  /**
   * Generate follow-up email HTML content
   */
  generateFollowUpEmailContent(businessName, isSpanish = false) {
    if (isSpanish) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Registro Incompleto</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Romero Tech Solutions</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Servicios Profesionales de TI</p>
          </div>

          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #667eea; margin-top: 0;">Hola ${businessName},</h2>

            <p>Notamos que comenzaste a registrarte para nuestros servicios de gestión de TI, pero el proceso de verificación no se completó.</p>

            <div style="background: #f8f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #667eea;">¿Qué pasó?</h3>
              <p style="margin-bottom: 0;">El código de verificación por correo electrónico expiró después de 15 minutos por razones de seguridad. No te preocupes, ¡es fácil comenzar de nuevo!</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://www.romerotechsolutions.com/clogin"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-weight: bold;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                Intentar Registrarme Otra Vez
              </a>
            </div>

            <h3 style="color: #667eea;">¿Por qué elegir Romero Tech Solutions?</h3>
            <ul style="color: #555;">
              <li>✅ <strong>30+ años de experiencia</strong> en ciberseguridad y gestión de TI</li>
              <li>✅ <strong>Soporte 24/7</strong> para tu tranquilidad</li>
              <li>✅ <strong>Soluciones personalizadas</strong> para empresas como la tuya</li>
              <li>✅ <strong>Experiencia comprobada</strong> con empresas Fortune 500</li>
            </ul>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7; margin: 20px 0;">
              <p style="margin: 0; color: #856404;"><strong>💡 Consejo:</strong> Revisa tu carpeta de spam/correo no deseado para futuros correos de verificación de no-reply@romerotechsolutions.com</p>
            </div>

            <p>Si tienes alguna pregunta o necesitas ayuda, no dudes en responder a este correo.</p>

            <p style="margin-top: 30px;">
              Atentamente,<br>
              <strong>El equipo de Romero Tech Solutions</strong>
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p>Romero Tech Solutions | Servicios Profesionales de Gestión de TI</p>
            <p>Este es un mensaje automático del sistema de registro.</p>
          </div>
        </body>
        </html>
      `;
    } else {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Registration Incomplete</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Romero Tech Solutions</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Professional IT Services</p>
          </div>

          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #667eea; margin-top: 0;">Hello ${businessName},</h2>

            <p>We noticed you started registering for our IT managed services, but the verification process wasn't completed.</p>

            <div style="background: #f8f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #667eea;">What happened?</h3>
              <p style="margin-bottom: 0;">The email verification code expired after 15 minutes for security reasons. Don't worry - it's easy to start again!</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://www.romerotechsolutions.com/clogin"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-weight: bold;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                Try Registering Again
              </a>
            </div>

            <h3 style="color: #667eea;">Why choose Romero Tech Solutions?</h3>
            <ul style="color: #555;">
              <li>✅ <strong>30+ years of experience</strong> in cybersecurity and IT management</li>
              <li>✅ <strong>24/7 support</strong> for your peace of mind</li>
              <li>✅ <strong>Custom solutions</strong> tailored to businesses like yours</li>
              <li>✅ <strong>Proven track record</strong> with Fortune 500 companies</li>
            </ul>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7; margin: 20px 0;">
              <p style="margin: 0; color: #856404;"><strong>💡 Tip:</strong> Check your spam/junk folder for future verification emails from no-reply@romerotechsolutions.com</p>
            </div>

            <p>If you have any questions or need assistance, please don't hesitate to reply to this email.</p>

            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>The Romero Tech Solutions Team</strong>
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p>Romero Tech Solutions | Professional IT Management Services</p>
            <p>This is an automated message from our registration system.</p>
          </div>
        </body>
        </html>
      `;
    }
  }

  /**
   * Strip HTML tags for plain text email
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats() {
    try {
      const stats = await query(`
        SELECT
          COUNT(*) as total_pending,
          COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_count,
          COUNT(CASE WHEN created_at < NOW() - INTERVAL '20 minutes' AND expires_at < NOW() THEN 1 END) as cleanup_eligible
        FROM email_verifications
        WHERE used = false
      `);

      return stats.rows[0] || { total_pending: 0, expired_count: 0, cleanup_eligible: 0 };
    } catch (error) {
      console.error('Error getting cleanup stats:', error);
      return { total_pending: 0, expired_count: 0, cleanup_eligible: 0 };
    }
  }
}

// Export singleton instance
export const verificationCleanupService = new VerificationCleanupService();
export default verificationCleanupService;