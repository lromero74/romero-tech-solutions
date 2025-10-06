/**
 * Migration: Approve scheduler.to translation
 * Date: 2025-10-06
 *
 * The scheduler.to translation existed but was not approved,
 * causing it to be filtered out by the API.
 */

import { getPool } from '../config/database.js';

export async function up() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('📝 Approving scheduler.to translation...');

    // Approve the scheduler.to translation for all languages
    const result = await client.query(
      `UPDATE t_translations
       SET is_approved = true
       WHERE key_id IN (
         SELECT id FROM t_translation_keys WHERE key_path = 'scheduler.to'
       )
       AND is_approved = false`
    );

    console.log(`✅ Approved ${result.rowCount} translation(s) for scheduler.to`);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔄 Unapproving scheduler.to translation...');

    // Unapprove the scheduler.to translation
    const result = await client.query(
      `UPDATE t_translations
       SET is_approved = false
       WHERE key_id IN (
         SELECT id FROM t_translation_keys WHERE key_path = 'scheduler.to'
       )`
    );

    console.log(`✅ Unapproved ${result.rowCount} translation(s) for scheduler.to`);

    await client.query('COMMIT');
    console.log('✅ Rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
