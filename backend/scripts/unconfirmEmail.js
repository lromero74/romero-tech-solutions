import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const { Client } = pg;

async function unconfirmEmail() {
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

    // Generate a new confirmation token
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Update the user to be unconfirmed with a new token
    const result = await client.query(
      `UPDATE users
       SET email_verified = FALSE,
           confirmation_token = $1,
           confirmation_expires_at = $2
       WHERE email = $3`,
      [newToken, expiresAt, 'louis@romerotechsolutions.com']
    );

    if (result.rowCount > 0) {
      console.log('✅ Email unconfirmed successfully!');
      console.log('📧 Email:', 'louis@romerotechsolutions.com');
      console.log('🔑 New token:', newToken);
      console.log('⏰ Expires:', expiresAt);
      console.log('\n🔗 Test confirmation URL:');
      console.log(`http://localhost:5174/confirm-email?token=${newToken}&email=${encodeURIComponent('louis@romerotechsolutions.com')}`);
    } else {
      console.log('❌ No user found with that email');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

unconfirmEmail();