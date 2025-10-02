#!/usr/bin/env node

import { getPool } from './config/database.js';

async function verifyTranslations() {
  let pool;

  try {
    console.log('🔍 Verifying service request cost translations...\n');
    pool = await getPool();

    const result = await pool.query(
      `SELECT
         tk.key_path,
         l.code as language_code,
         t.value
       FROM t_translation_keys tk
       JOIN t_translation_namespaces tn ON tk.namespace_id = tn.id
       JOIN t_translations t ON t.key_id = tk.id
       JOIN t_languages l ON t.language_id = l.id
       WHERE tk.key_path LIKE 'serviceRequests.%'
       AND tn.namespace = 'client'
       ORDER BY tk.key_path, l.code`
    );

    if (result.rows.length === 0) {
      console.log('❌ No service request translations found!');
    } else {
      console.log(`✅ Found ${result.rows.length} translations:\n`);
      result.rows.forEach(row => {
        console.log(`  ${row.language_code.toUpperCase()}: ${row.key_path}`);
        console.log(`     → "${row.value}"\n`);
      });
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔐 Database connection closed');
    }
  }
}

verifyTranslations();
