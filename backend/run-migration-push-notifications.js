#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up, down } from './migrations/20251004_add_push_subscriptions_table.js';

async function runMigration() {
  try {
    console.log('🚀 Running push notifications migration...');

    const pool = await getPool();
    const action = process.argv[2];

    if (action === 'down') {
      console.log('📊 Rolling back push notifications tables...');
      await down(pool);
      console.log('✅ Push notifications tables rolled back successfully!');
    } else {
      console.log('📊 Creating push notifications tables...');
      await up(pool);

      // Verify tables were created
      console.log('\n🔍 Verifying tables creation...');

      const tableCheck = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('push_subscriptions', 'push_notification_preferences')
      `);

      console.log('📋 Tables created:');
      tableCheck.rows.forEach(row => {
        console.log(`  ✅ ${row.table_name}`);
      });

      if (tableCheck.rows.length === 2) {
        console.log('\n🎉 Push notifications migration completed successfully!');
      } else {
        console.log('\n⚠️ Warning: Not all tables were created. Please check the migration.');
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigration();