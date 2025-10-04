#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up } from './migrations/20250103_grant_manager_admin_permissions.js';

async function main() {
  try {
    const pool = await getPool();
    await up(pool);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
