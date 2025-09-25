import { emailService } from '../services/emailService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testEmail() {
  console.log('🔍 Testing email service...');

  try {
    // Test sending a confirmation email
    const testParams = {
      toEmail: 'louis@romerotechsolutions.com', // Send to your verified email
      businessName: 'Test Business Inc',
      contactName: 'Test User',
      confirmationUrl: 'http://localhost:5173/confirm-email?token=test123&email=test@example.com'
    };

    console.log('📧 Sending test confirmation email...');
    console.log('   To:', testParams.toEmail);
    console.log('   From:', process.env.SES_FROM_EMAIL);
    console.log('   Business:', testParams.businessName);

    const result = await emailService.sendConfirmationEmail(testParams);

    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', result.messageId);
    console.log('   Status:', result.success ? 'SUCCESS' : 'FAILED');
    console.log('   Message:', result.message);

    console.log('\n📬 Check your email inbox for the confirmation email!');

  } catch (error) {
    console.error('❌ Email test failed:', error.message);

    if (error.message.includes('Email address not verified')) {
      console.log('   Make sure both sender and recipient emails are verified in SES');
    }
    if (error.message.includes('MessageRejected')) {
      console.log('   Check your SES sending limits and verified identities');
    }
  }
}

testEmail().then(() => {
  console.log('\n🎉 Email test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Email test failed:', error);
  process.exit(1);
});