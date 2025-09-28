import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function deleteUserAccount() {
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

    // Start transaction
    await client.query('BEGIN');

    const email = 'louis@romerotechsolutions.com';

    // First, get the user and business info
    const userResult = await client.query(`
      SELECT u.id as user_id, u.business_id, b.business_name
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.email = $1
    `, [email]);

    if (userResult.rows.length === 0) {
      console.log('ℹ️  No user found with email:', email);
      await client.query('ROLLBACK');
      return;
    }

    const { user_id, business_id, business_name } = userResult.rows[0];
    console.log('🔍 Found user:');
    console.log('   User ID:', user_id);
    console.log('   Business ID:', business_id);
    console.log('   Business Name:', business_name);

    // Delete service addresses first (foreign key constraint)
    if (business_id) {
      const serviceAddressResult = await client.query(`
        DELETE FROM service_addresses
        WHERE business_id = $1
      `, [business_id]);
      console.log('🗑️  Deleted', serviceAddressResult.rowCount, 'service addresses');
    }

    // Delete user
    const userDeleteResult = await client.query(`
      DELETE FROM users
      WHERE id = $1
    `, [user_id]);
    console.log('🗑️  Deleted user:', userDeleteResult.rowCount, 'row(s)');

    // Delete business
    if (business_id) {
      const businessDeleteResult = await client.query(`
        DELETE FROM businesses
        WHERE id = $1
      `, [business_id]);
      console.log('🗑️  Deleted business:', businessDeleteResult.rowCount, 'row(s)');
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n✅ Account deletion complete!');
    console.log('📧 You can now register', email, 'fresh');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

deleteUserAccount();