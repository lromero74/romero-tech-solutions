#!/usr/bin/env node
import { getPool } from '../config/database.js';

/**
 * Create email_verifications table for storing email verification codes
 * during the simplified client registration process
 */

async function createEmailVerificationsTable() {
  const pool = await getPool();

  try {
    console.log('🔧 Creating email_verifications table...');

    // Create the email_verifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        user_data JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create unique index on email (only one active verification per email)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_email
      ON email_verifications(email)
    `);

    // Create index on expires_at for cleanup operations
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at
      ON email_verifications(expires_at)
    `);

    // Create index on verification_code for fast lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_code
      ON email_verifications(verification_code)
    `);

    // Add updated_at trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_email_verifications_updated_at ON email_verifications
    `);

    await pool.query(`
      CREATE TRIGGER update_email_verifications_updated_at
        BEFORE UPDATE ON email_verifications
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);

    console.log('✅ Email verifications table created successfully');

    // Test the table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'email_verifications'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });

    console.log('\n🎉 Email verifications table setup complete!');

  } catch (error) {
    console.error('❌ Error creating email_verifications table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createEmailVerificationsTable().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { createEmailVerificationsTable };