import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('📧 Initializing email service...');
console.log('✓ AWS Region:', process.env.AWS_REGION);
console.log('✓ SES From Email:', process.env.SES_FROM_EMAIL);

// Use SES SMTP credentials
const smtpUser = process.env.SES_SMTP_USER || process.env.AWS_ACCESS_KEY_ID;
const smtpPass = process.env.SES_SMTP_PASS || process.env.AWS_SECRET_ACCESS_KEY;

if (!smtpUser || !smtpPass) {
  console.error('❌ No SMTP credentials found');
  process.exit(1);
}

// Create nodemailer transporter using AWS SES SMTP
const transporter = nodemailer.createTransport({
  host: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`,
  port: 587,
  secure: false,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

// Email content
const emailSubject = 'URGENT: Production Builds Stuck in CANCELLING State After October 20 Outage - App d9ln0cda9os0r';

const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    h2 { color: #e63946; }
    h3 { color: #457b9d; margin-top: 20px; }
    .info-box { background-color: #f1f3f5; padding: 15px; border-left: 4px solid #457b9d; margin: 15px 0; }
    .code { font-family: monospace; background-color: #f8f9fa; padding: 2px 6px; border-radius: 3px; }
    ul { margin: 10px 0; }
    li { margin: 5px 0; }
    .signature { margin-top: 30px; border-top: 2px solid #dee2e6; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <p>Hello AWS Amplify Support Team,</p>

    <p>My name is <strong>Louis Romero</strong>, Owner and Operator of <strong>Romero Tech Solutions</strong>. I'm reaching out regarding critical production deployment issues following today's AWS outage in us-east-1.</p>

    <h3>Issue Summary:</h3>
    <p>AWS Amplify builds have been stuck for over 3 hours, blocking all production deployments to our customer-facing application at <a href="https://romerotechsolutions.com">https://romerotechsolutions.com</a>.</p>

    <h3>Technical Details:</h3>
    <div class="info-box">
      <ul>
        <li><strong>App ARN:</strong> <span class="code">arn:aws:amplify:us-east-1:337185442097:apps/d9ln0cda9os0r</span></li>
        <li><strong>App ID:</strong> <span class="code">d9ln0cda9os0r</span></li>
        <li><strong>Branch:</strong> <span class="code">main</span></li>
        <li><strong>Region:</strong> <span class="code">us-east-1</span></li>
      </ul>
    </div>

    <h3>Stuck Jobs:</h3>
    <ul>
      <li><strong>Job 367:</strong> Stuck in "CANCELLING" status since 10:09 AM ET (over 3 hours)</li>
      <li><strong>Job 368:</strong> Stuck in "PENDING" status since 10:55 AM ET, blocked by Job 367</li>
    </ul>

    <h3>Timeline Context:</h3>
    <p>Both jobs started <strong>4+ hours AFTER</strong> AWS declared the October 20 outage "mitigated" at 6:35 AM ET, suggesting incomplete recovery of Amplify build infrastructure.</p>

    <h3>Actions Attempted (All Failed):</h3>
    <ul>
      <li>AWS CLI <span class="code">stop-job</span> command: Returns "job is already being cancelled"</li>
      <li>AWS Console cancel button: Disabled (shows "currently being cancelled")</li>
      <li>AWS CLI <span class="code">start-job</span> command: Returns "branch already has pending or running jobs"</li>
      <li>Toggled auto-build off/on: No effect</li>
    </ul>

    <h3>Business Impact:</h3>
    <p>Latest production code (commit <span class="code">a8a947906f7cab09499334eb8b39d673ab3114c5</span>, version 1.101.76) with critical bug fixes and client-facing improvements cannot be deployed. This is impacting our MSP operations.</p>

    <h3>Request:</h3>
    <p><strong>Could you please manually clear these stuck jobs from your backend systems so production deployments can resume?</strong> This appears to be collateral damage from today's outage that requires backend intervention.</p>

    <p>Thank you for your urgent attention to this matter.</p>

    <div class="signature">
      <p>Best regards,<br>
      <strong>Louis Romero</strong><br>
      Owner &amp; Operator<br>
      Romero Tech Solutions<br>
      <a href="https://romerotechsolutions.com">https://romerotechsolutions.com</a></p>
    </div>
  </div>
</body>
</html>
`;

const emailText = `Hello AWS Amplify Support Team,

My name is Louis Romero, Owner and Operator of Romero Tech Solutions. I'm reaching out regarding critical production deployment issues following today's AWS outage in us-east-1.

Issue Summary:
AWS Amplify builds have been stuck for over 3 hours, blocking all production deployments to our customer-facing application at https://romerotechsolutions.com.

Technical Details:
- App ARN: arn:aws:amplify:us-east-1:337185442097:apps/d9ln0cda9os0r
- App ID: d9ln0cda9os0r
- Branch: main
- Region: us-east-1

Stuck Jobs:
- Job 367: Stuck in "CANCELLING" status since 10:09 AM ET (over 3 hours)
- Job 368: Stuck in "PENDING" status since 10:55 AM ET, blocked by Job 367

Timeline Context:
Both jobs started 4+ hours AFTER AWS declared the October 20 outage "mitigated" at 6:35 AM ET, suggesting incomplete recovery of Amplify build infrastructure.

Actions Attempted (All Failed):
- AWS CLI stop-job command: Returns "job is already being cancelled"
- AWS Console cancel button: Disabled (shows "currently being cancelled")
- AWS CLI start-job command: Returns "branch already has pending or running jobs"
- Toggled auto-build off/on: No effect

Business Impact:
Latest production code (commit a8a947906f7cab09499334eb8b39d673ab3114c5, version 1.101.76) with critical bug fixes and client-facing improvements cannot be deployed. This is impacting our MSP operations.

Request:
Could you please manually clear these stuck jobs from your backend systems so production deployments can resume? This appears to be collateral damage from today's outage that requires backend intervention.

Thank you for your urgent attention to this matter.

Best regards,
Louis Romero
Owner & Operator
Romero Tech Solutions
https://romerotechsolutions.com`;

// Send the email
async function sendSupportEmail() {
  try {
    console.log('\n📤 Sending email to AWS Amplify Support...');

    const mailOptions = {
      from: `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`,
      to: 'aws-amplify-customer@amazon.com',
      cc: 'louis@romerotechsolutions.com',
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('\n✅ Email sent successfully!');
    console.log('   Message ID:', result.messageId);
    console.log('   To:', mailOptions.to);
    console.log('   CC:', mailOptions.cc);
    console.log('   Subject:', emailSubject.substring(0, 60) + '...');
    console.log('\n✓ AWS Amplify support should receive your request shortly.');

  } catch (error) {
    console.error('\n❌ Error sending email:', error.message);
    process.exit(1);
  }
}

// Run the email send
sendSupportEmail();
