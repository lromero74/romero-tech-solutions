import { query } from './config/database.js';

async function testJSONBStorage() {
  try {
    console.log('Testing JSONB storage with different methods...');

    const testData = {businessName: 'Test Business', language: 'en'};
    console.log('Original object:', testData);
    console.log('JSON.stringify result:', JSON.stringify(testData));

    // Clean up any existing test records
    await query('DELETE FROM email_verifications WHERE email LIKE $1', ['jsonb-test%@test.com']);

    // Method 1: Direct object (let PostgreSQL handle conversion)
    console.log('\nMethod 1: Direct object');
    try {
      await query(
        'INSERT INTO email_verifications (email, verification_code, expires_at, user_data) VALUES ($1, $2, $3, $4)',
        ['jsonb-test1@test.com', '123456', new Date(), testData]
      );
      const result1 = await query('SELECT user_data FROM email_verifications WHERE email = $1', ['jsonb-test1@test.com']);
      console.log('Stored:', result1.rows[0].user_data);
      console.log('Type:', typeof result1.rows[0].user_data);
      console.log('Can access businessName:', result1.rows[0].user_data?.businessName);
    } catch (error) {
      console.log('Method 1 failed:', error.message);
    }

    // Method 2: JSON.stringify
    console.log('\nMethod 2: JSON.stringify');
    try {
      await query(
        'INSERT INTO email_verifications (email, verification_code, expires_at, user_data) VALUES ($1, $2, $3, $4)',
        ['jsonb-test2@test.com', '123456', new Date(), JSON.stringify(testData)]
      );
      const result2 = await query('SELECT user_data FROM email_verifications WHERE email = $1', ['jsonb-test2@test.com']);
      console.log('Stored:', result2.rows[0].user_data);
      console.log('Type:', typeof result2.rows[0].user_data);
      console.log('Can access businessName:', result2.rows[0].user_data?.businessName);
    } catch (error) {
      console.log('Method 2 failed:', error.message);
    }

    // Method 3: Test the current storeEmailVerificationCode function
    console.log('\nMethod 3: Using emailVerificationUtils function');
    try {
      const { storeEmailVerificationCode } = await import('./utils/emailVerificationUtils.js');
      await storeEmailVerificationCode('jsonb-test3@test.com', '123456', 15, testData);

      const result3 = await query('SELECT user_data FROM email_verifications WHERE email = $1', ['jsonb-test3@test.com']);
      console.log('Stored:', result3.rows[0].user_data);
      console.log('Type:', typeof result3.rows[0].user_data);
      console.log('Can access businessName:', result3.rows[0].user_data?.businessName);
    } catch (error) {
      console.log('Method 3 failed:', error.message);
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testJSONBStorage();