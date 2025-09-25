import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkUserActiveStatus() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        email,
        email_verified,
        is_active,
        confirmation_token,
        confirmation_expires_at > NOW() as token_not_expired
      FROM users
      WHERE email = $1
    `, ['louis@romerotechsolutions.com']);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('👤 User status:');
      console.log('   Email:', user.email);
      console.log('   Email verified:', user.email_verified);
      console.log('   Is active:', user.is_active);
      console.log('   Has token:', user.confirmation_token ? 'Yes' : 'No');
      console.log('   Token not expired:', user.token_not_expired);

      console.log('\n🔍 Stored procedure conditions:');
      console.log('   email = p_email:', true);
      console.log('   confirmation_token = p_token:', user.confirmation_token ? 'Yes' : 'No');
      console.log('   email_verified = FALSE:', user.email_verified === false);
      console.log('   is_active = FALSE:', user.is_active === false);
      console.log('   ✅ All conditions met:',
        user.confirmation_token &&
        user.email_verified === false &&
        user.is_active === false &&
        user.token_not_expired
      );
    } else {
      console.log('❌ No user found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkUserActiveStatus();