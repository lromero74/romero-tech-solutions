import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createUsersTable() {
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

    // Create the users table based on what the update script expects
    console.log('📝 Creating users table...');
    const createUsersSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_user_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        email_verified BOOLEAN DEFAULT false,
        role VARCHAR(50) NOT NULL DEFAULT 'client',
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        phone VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_users_cognito_user_id ON users(cognito_user_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

      -- Create updated_at trigger function if it doesn't exist
      CREATE OR REPLACE FUNCTION update_users_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger
      DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;
      CREATE TRIGGER trigger_update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_users_updated_at();

      -- Add some sample data validation constraints
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('client', 'technician', 'admin', 'sales'));
    `;

    await client.query(createUsersSQL);
    console.log('✅ Users table created successfully!');

    // Now run the update script
    console.log('📝 Running users table update script...');
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

      -- Create view for client users with business information
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
          b.business_address,
          b.business_phone,
          b.business_website,
          b.tax_id,
          b.created_at as business_created_at,
          b.updated_at as business_updated_at
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.role = 'client';
    `;

    await client.query(updateUsersSQL);
    console.log('✅ Users table updated successfully!');

    // Verify the table structure
    console.log('🔍 Checking users table structure...');
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('📋 Users table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

  } catch (error) {
    console.error('❌ Error creating users table:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
createUsersTable().then(() => {
  console.log('🎉 Users table setup completed!');
  process.exit(0);
});