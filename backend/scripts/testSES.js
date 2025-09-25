import { SESClient, GetSendQuotaCommand, ListIdentitiesCommand, GetSendStatisticsCommand } from '@aws-sdk/client-ses';
import dotenv from 'dotenv';

dotenv.config();

async function testSES() {
  console.log('🔍 Testing AWS SES configuration...');

  // Configure AWS SES using SDK v3
  const sesClient = new SESClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  console.log('AWS Config:', {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 5)}***` : 'undefined',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? '***configured***' : 'undefined'
  });

  try {
    // Test 1: Get SES sending quota
    console.log('\n📝 Test 1: Getting SES sending quota...');
    const quotaCommand = new GetSendQuotaCommand({});
    const quota = await sesClient.send(quotaCommand);
    console.log('✅ SES Quota:', {
      Max24HourSend: quota.Max24HourSend,
      MaxSendRate: quota.MaxSendRate,
      SentLast24Hours: quota.SentLast24Hours
    });

    // Test 2: List verified identities (email addresses/domains)
    console.log('\n📝 Test 2: Listing verified email identities...');
    const identitiesCommand = new ListIdentitiesCommand({});
    const identities = await sesClient.send(identitiesCommand);
    console.log('✅ Verified identities:', identities.Identities);

    if (identities.Identities.length === 0) {
      console.log('⚠️  No verified email addresses found.');
      console.log('   You need to verify an email address in AWS SES console first.');
      console.log('   Go to: https://console.aws.amazon.com/ses/');
      console.log('   Click "Verified identities" → "Create identity" → Enter your email');
    }

    // Test 3: Check sending statistics
    console.log('\n📝 Test 3: Getting send statistics...');
    const statsCommand = new GetSendStatisticsCommand({});
    const stats = await sesClient.send(statsCommand);
    console.log('✅ Send statistics:', stats.SendDataPoints?.length || 0, 'data points');

  } catch (error) {
    console.error('❌ SES Test failed:', error.message);
    if (error.code === 'InvalidUserPool.NotFound') {
      console.log('   Check your AWS credentials and region');
    }
    if (error.code === 'UnauthorizedOperation') {
      console.log('   Check that your IAM user has SES permissions');
    }
  }
}

testSES().then(() => {
  console.log('\n🎉 SES test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ SES test failed:', error);
  process.exit(1);
});