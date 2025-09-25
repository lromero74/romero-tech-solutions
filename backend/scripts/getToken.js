import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function getConfirmationToken() {
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

    const result = await client.query(
      'SELECT confirmation_token, confirmation_expires_at FROM users WHERE email = $1',
      ['louis@romerotechsolutions.com']
    );

    if (result.rows.length > 0) {
      const { confirmation_token, confirmation_expires_at } = result.rows[0];
      console.log('Token:', confirmation_token);
      console.log('Expires:', confirmation_expires_at);
    } else {
      console.log('No user found with that email');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

getConfirmationToken();