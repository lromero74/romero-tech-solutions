import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixUsersTable() {
  const client = new Client({
    host: '34.228.181.68',
    port: 5432,
    database: 'romerotechsolutions',
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔍 Connecting to romerotechsolutions database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Add missing columns to users table and create the view correctly
    console.log('📝 Adding missing columns to users table...');
    const updateUsersSQL = `
      -- Add columns for client business relationship (if they don't exist)
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'users' AND column_name = 'business_id') THEN
              ALTER TABLE users ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'users' AND column_name = 'is_primary_contact') THEN
              ALTER TABLE users ADD COLUMN is_primary_contact BOOLEAN DEFAULT false;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'users' AND column_name = 'confirmation_token') THEN
              ALTER TABLE users ADD COLUMN confirmation_token VARCHAR(255) UNIQUE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'users' AND column_name = 'confirmation_expires_at') THEN
              ALTER TABLE users ADD COLUMN confirmation_expires_at TIMESTAMP WITH TIME ZONE;
          END IF;
      END $$;

      -- Create additional indexes
      CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
      CREATE INDEX IF NOT EXISTS idx_users_is_primary_contact ON users(is_primary_contact);
      CREATE INDEX IF NOT EXISTS idx_users_confirmation_token ON users(confirmation_token);
    `;

    await client.query(updateUsersSQL);
    console.log('✅ Users table columns updated successfully!');

    // Create the view with correct column names
    console.log('📝 Creating v_client_users_with_business view...');
    const createViewSQL = `
      CREATE OR REPLACE VIEW v_client_users_with_business AS
      SELECT
          u.id as user_id,
          u.cognito_user_id,
          u.email,
          u.email_verified,
          u.first_name,
          u.last_name,
          u.phone,
          u.is_primary_contact,
          u.created_at as user_created_at,
          u.updated_at as user_updated_at,
          u.last_login,
          u.is_active,
          b.id as business_id,
          b.business_name,
          b.domain_email,
          b.business_street,
          b.business_city,
          b.business_state,
          b.business_zip_code,
          b.business_country,
          b.logo_url,
          b.created_at as business_created_at,
          b.updated_at as business_updated_at
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.role = 'client';
    `;

    await client.query(createViewSQL);
    console.log('✅ View created successfully!');

    // Verify the final users table structure
    console.log('🔍 Checking final users table structure...');
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('📋 Final users table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check views
    console.log('\n🔍 Checking database views...');
    const viewsResult = await client.query(`
      SELECT table_name as view_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Database views:');
    if (viewsResult.rows.length === 0) {
      console.log('  (No views found)');
    } else {
      viewsResult.rows.forEach(row => {
        console.log(`  - ${row.view_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Error fixing users table:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the script
fixUsersTable().then(() => {
  console.log('🎉 Users table fix completed!');
  process.exit(0);
});