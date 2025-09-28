import { query, testConnection, closePool } from '../config/database.js';

async function updateUserRole() {
  try {
    console.log('🔍 Testing database connection...');
    const isConnected = await testConnection();

    if (!isConnected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    console.log('🔄 Updating louis@romerotechsolutions.com role to admin...');

    // Update the user role to admin
    const result = await query(`
      UPDATE users
      SET role = $1
      WHERE email = $2
    `, ['admin', 'louis@romerotechsolutions.com']);

    if (result.rowCount > 0) {
      console.log('✅ Successfully updated user role to admin');

      // Verify the update
      const userCheck = await query(`
        SELECT id, email, role, first_name, last_name
        FROM users
        WHERE email = $1
      `, ['louis@romerotechsolutions.com']);

      if (userCheck.rows.length > 0) {
        const user = userCheck.rows[0];
        console.log('📋 Updated user details:');
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Name: ${user.first_name} ${user.last_name}`);
        console.log(`   ID: ${user.id}`);
      }
    } else {
      console.log('⚠️  No user found with email louis@romerotechsolutions.com');
    }

    console.log('✅ Role update completed successfully');

  } catch (error) {
    console.error('❌ Role update failed:', error);
  } finally {
    await closePool();
  }
}

updateUserRole();