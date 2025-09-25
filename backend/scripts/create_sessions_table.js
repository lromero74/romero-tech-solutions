import { query, closePool } from '../config/database.js';

async function createSessionsTable() {
  try {
    console.log('🔧 Creating sessions table for login tracking...\n');

    // Create sessions table to track active user sessions
    console.log('📝 Creating sessions table...');
    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        session_token VARCHAR(512) NOT NULL UNIQUE,
        user_agent TEXT,
        ip_address VARCHAR(45),
        login_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Sessions table created successfully');

    // Create indexes for performance
    console.log('📝 Creating indexes...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, expires_at);
    `);

    console.log('✅ Indexes created successfully');

    // Create a stored procedure to clean up expired sessions
    console.log('📝 Creating cleanup function...');
    await query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
      RETURNS INTEGER AS $$
      DECLARE
        cleaned_count INTEGER;
      BEGIN
        UPDATE user_sessions
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true AND expires_at < CURRENT_TIMESTAMP;

        GET DIAGNOSTICS cleaned_count = ROW_COUNT;
        RETURN cleaned_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Cleanup function created successfully');

    // Verify the table structure
    console.log('\n🔍 Verifying table structure...');
    const result = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_sessions'
      ORDER BY ordinal_position;
    `);

    console.log('📋 Sessions table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });

    console.log('\n🎉 Session tracking system is ready!');
    console.log('💡 Features:');
    console.log('   - Real-time login status tracking');
    console.log('   - Automatic session expiration (24 hours)');
    console.log('   - Session cleanup functionality');
    console.log('   - IP address and user agent tracking');
    console.log('   - Optimized database indexes');

  } catch (error) {
    console.error('❌ Error creating sessions table:', error);
  } finally {
    await closePool();
  }
}

createSessionsTable();