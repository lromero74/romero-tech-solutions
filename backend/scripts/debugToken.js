import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function debugTokenComparison() {
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

    const inputToken = 'ff066a82ff6f0a12b6a7dd7b251961deccdb9ed60fb5c7b1389cb632845ecd2a';
    const email = 'louis@romerotechsolutions.com';

    // Check what's in the database for this user
    const userCheck = await client.query(`
      SELECT
        id,
        email,
        email_verified,
        confirmation_token,
        confirmation_expires_at,
        LENGTH(confirmation_token) as token_length,
        confirmation_expires_at > NOW() as token_not_expired
      FROM users
      WHERE email = $1
    `, [email]);

    if (userCheck.rows.length === 0) {
      console.log('❌ No user found with email:', email);
      return;
    }

    const user = userCheck.rows[0];
    console.log('🔍 User data:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Email verified:', user.email_verified);
    console.log('   Token in DB:', user.confirmation_token);
    console.log('   Token length:', user.token_length);
    console.log('   Token expires:', user.confirmation_expires_at);
    console.log('   Token not expired:', user.token_not_expired);

    console.log('\n🔍 Input token:', inputToken);
    console.log('   Input length:', inputToken.length);

    // Test direct token comparison
    const tokenMatch = await client.query(`
      SELECT
        $1 = confirmation_token as tokens_match,
        confirmation_token = $1 as reverse_match
      FROM users
      WHERE email = $2
    `, [inputToken, email]);

    if (tokenMatch.rows.length > 0) {
      console.log('\n🔍 Token comparison:');
      console.log('   Tokens match:', tokenMatch.rows[0].tokens_match);
      console.log('   Reverse match:', tokenMatch.rows[0].reverse_match);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

debugTokenComparison();