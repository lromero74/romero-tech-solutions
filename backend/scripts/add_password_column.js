import { query, testConnection, closePool } from '../config/database.js';
import bcrypt from 'bcryptjs';

async function addPasswordColumn() {
  try {
    console.log('🔍 Testing database connection...');
    const isConnected = await testConnection();

    if (!isConnected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    console.log('🔄 Adding password_hash column to users table...');

    // Add the password_hash column
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);

    console.log('✅ password_hash column added successfully');

    // Check if louis@romerotechsolutions.com exists without password
    const userCheck = await query(`
      SELECT id, email, password_hash
      FROM users
      WHERE email = $1
    `, ['louis@romerotechsolutions.com']);

    if (userCheck.rows.length > 0) {
      const user = userCheck.rows[0];
      console.log(`🔍 Found user: ${user.email}`);

      if (!user.password_hash) {
        console.log('🔄 User has no password hash, adding default password...');

        // Hash the password from the test file
        const defaultPassword = 'TestPassword123!';
        const passwordHash = await bcrypt.hash(defaultPassword, 12);

        await query(`
          UPDATE users
          SET password_hash = $1
          WHERE email = $2
        `, [passwordHash, 'louis@romerotechsolutions.com']);

        console.log('✅ Password hash added for louis@romerotechsolutions.com');
      } else {
        console.log('✅ User already has password hash');
      }
    } else {
      console.log('⚠️  User louis@romerotechsolutions.com not found in database');
    }

    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await closePool();
  }
}

addPasswordColumn();