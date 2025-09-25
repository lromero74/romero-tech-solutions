import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixUserStatus() {
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

    // Set user to inactive so the stored procedure can find them
    const result = await client.query(`
      UPDATE users
      SET is_active = FALSE
      WHERE email = $1
      RETURNING email, email_verified, is_active
    `, ['louis@romerotechsolutions.com']);

    if (result.rowCount > 0) {
      const user = result.rows[0];
      console.log('✅ User status updated:');
      console.log('   Email:', user.email);
      console.log('   Email verified:', user.email_verified);
      console.log('   Is active:', user.is_active);
      console.log('\n🔗 Now you can test the confirmation URL:');
      console.log('http://localhost:5174/confirm-email?token=ff066a82ff6f0a12b6a7dd7b251961deccdb9ed60fb5c7b1389cb632845ecd2a&email=louis%40romerotechsolutions.com');
    } else {
      console.log('❌ No user updated');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

fixUserStatus();