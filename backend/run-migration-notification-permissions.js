#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up, down } from './migrations/20251004_add_notification_permissions.js';

async function runMigration() {
  try {
    console.log('🚀 Running notification permissions migration...');

    const pool = await getPool();
    const action = process.argv[2];

    if (action === 'down') {
      console.log('📊 Rolling back notification permissions...');
      await down(pool);
      console.log('✅ Notification permissions rolled back successfully!');
    } else {
      console.log('📊 Creating notification permissions...');
      await up(pool);
      console.log('✅ Notification permissions created successfully!');
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