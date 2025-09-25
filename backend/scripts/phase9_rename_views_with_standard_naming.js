import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function renameViewsWithStandardNaming() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔄 Renaming database views with standard naming convention (Phase 9)...');
    console.log('   Using "v_" prefix to clearly identify views vs tables');

    // Step 1: Check existing views
    console.log('\n🔍 Step 1: Checking existing views...');

    const existingViews = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Current views:');
    console.table(existingViews.rows);

    // Step 2: Rename client_users_with_business → v_client_users_with_business
    console.log('\n🔄 Step 2: Renaming client_users_with_business → v_client_users_with_business...');

    const clientViewExists = existingViews.rows.some(row => row.table_name === 'client_users_with_business');

    if (clientViewExists) {
      // Drop and recreate with new name
      await client.query('DROP VIEW IF EXISTS v_client_users_with_business CASCADE');

      await client.query(`
        CREATE VIEW v_client_users_with_business AS
        SELECT
          u.id AS user_id,
          u.cognito_user_id,
          u.email,
          u.email_verified,
          u.first_name,
          u.last_name,
          u.phone,
          u.is_primary_contact,
          u.created_at AS user_created_at,
          u.updated_at AS user_updated_at,
          u.last_login,
          u.is_active,
          b.id AS business_id,
          b.business_name,
          b.domain_email,
          b.business_street,
          b.business_city,
          b.business_state,
          b.business_zip_code,
          b.business_country,
          b.logo_url,
          b.created_at AS business_created_at,
          b.updated_at AS business_updated_at
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        WHERE u.role = 'client'
      `);

      console.log('✅ Created v_client_users_with_business view');

      // Drop old view
      await client.query('DROP VIEW IF EXISTS client_users_with_business CASCADE');
      console.log('✅ Dropped old client_users_with_business view');
    } else {
      console.log('ℹ️  client_users_with_business view not found');
    }

    // Step 3: Rename employee_primary_photos → v_employee_primary_photos
    console.log('\n🔄 Step 3: Renaming employee_primary_photos → v_employee_primary_photos...');

    const photoViewExists = existingViews.rows.some(row => row.table_name === 'employee_primary_photos');

    if (photoViewExists) {
      // Drop and recreate with new name
      await client.query('DROP VIEW IF EXISTS v_employee_primary_photos CASCADE');

      await client.query(`
        CREATE VIEW v_employee_primary_photos AS
        SELECT
          e.id as employee_id,
          e.first_name,
          e.last_name,
          e.email,
          ep.id as photo_id,
          ep.file_url,
          ep.position_x,
          ep.position_y,
          ep.scale_factor,
          ep.created_at as photo_created_at
        FROM employees e
        LEFT JOIN employee_photos ep ON e.id = ep.employee_id
        WHERE ep.is_primary = true AND ep.photo_type = 'profile'
      `);

      console.log('✅ Created v_employee_primary_photos view');

      // Drop old view
      await client.query('DROP VIEW IF EXISTS employee_primary_photos CASCADE');
      console.log('✅ Dropped old employee_primary_photos view');
    } else {
      console.log('ℹ️  employee_primary_photos view not found');
    }

    // Step 4: Verify the changes
    console.log('\n✅ Step 4: Verifying the changes...');

    const updatedViews = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Updated views:');
    console.table(updatedViews.rows);

    // Step 5: Test the views work correctly
    console.log('\n🧪 Step 5: Testing views...');

    if (updatedViews.rows.some(row => row.table_name === 'v_client_users_with_business')) {
      const clientViewTest = await client.query('SELECT COUNT(*) as count FROM v_client_users_with_business');
      console.log(`✅ v_client_users_with_business: ${clientViewTest.rows[0].count} client users`);
    }

    if (updatedViews.rows.some(row => row.table_name === 'v_employee_primary_photos')) {
      const photoViewTest = await client.query('SELECT COUNT(*) as count FROM v_employee_primary_photos');
      console.log(`✅ v_employee_primary_photos: ${photoViewTest.rows[0].count} employees with primary photos`);
    }

    console.log('\n🎉 Phase 9 completed successfully!');
    console.log('📋 Summary:');
    console.log('   ✅ Renamed views to use standard "v_" prefix');
    console.log('   ✅ client_users_with_business → v_client_users_with_business');
    console.log('   ✅ employee_primary_photos → v_employee_primary_photos');
    console.log('   ✅ Views are now clearly distinguishable from tables');
    console.log('   ℹ️  No code changes needed (views were not being used in API)');

  } catch (error) {
    console.error('❌ Error during Phase 9:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the script
renameViewsWithStandardNaming().catch(console.error);