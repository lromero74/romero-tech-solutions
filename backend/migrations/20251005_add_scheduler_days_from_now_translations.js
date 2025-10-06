/**
 * Migration: Add translation keys for scheduler "Days from now" feature
 * Date: 2025-10-05
 */

import { getPool } from '../config/database.js';

export async function up() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌐 Adding scheduler days-from-now translation keys...');

    // Get the namespace ID for 'scheduler' or create it
    let namespaceResult = await client.query(
      `SELECT id FROM t_translation_namespaces WHERE namespace = 'scheduler'`
    );

    let namespaceId;
    if (namespaceResult.rows.length === 0) {
      const newNamespace = await client.query(
        `INSERT INTO t_translation_namespaces (namespace, description, created_at)
         VALUES ('scheduler', 'Scheduler component translations', NOW())
         RETURNING id`
      );
      namespaceId = newNamespace.rows[0].id;
      console.log('✅ Created scheduler namespace');
    } else {
      namespaceId = namespaceResult.rows[0].id;
      console.log('✅ Found existing scheduler namespace');
    }

    // Get language IDs
    const enLangResult = await client.query(
      `SELECT id FROM t_languages WHERE code = 'en'`
    );
    const esLangResult = await client.query(
      `SELECT id FROM t_languages WHERE code = 'es'`
    );

    if (enLangResult.rows.length === 0 || esLangResult.rows.length === 0) {
      throw new Error('English or Spanish language not found in database');
    }

    const enLangId = enLangResult.rows[0].id;
    const esLangId = esLangResult.rows[0].id;

    // Translation keys to add with English and Spanish values
    const translations = [
      {
        key_path: 'scheduler.minDaysFromNow',
        description: 'Label for minimum days from now selector',
        default_value: 'Days from now:',
        en: 'Days from now:',
        es: 'Días desde hoy:'
      },
      {
        key_path: 'scheduler.daysFromNow.today',
        description: 'Option for today (0 days)',
        default_value: 'Today',
        en: 'Today',
        es: 'Hoy'
      },
      {
        key_path: 'scheduler.daysFromNow.tomorrow',
        description: 'Option for tomorrow (1 day)',
        default_value: 'Tomorrow',
        en: 'Tomorrow',
        es: 'Mañana'
      },
      {
        key_path: 'scheduler.daysFromNow.2days',
        description: 'Option for 2 days from now',
        default_value: '2 days',
        en: '2 days',
        es: '2 días'
      },
      {
        key_path: 'scheduler.daysFromNow.3days',
        description: 'Option for 3 days from now',
        default_value: '3 days',
        en: '3 days',
        es: '3 días'
      },
      {
        key_path: 'scheduler.daysFromNow.5days',
        description: 'Option for 5 days from now',
        default_value: '5 days',
        en: '5 days',
        es: '5 días'
      },
      {
        key_path: 'scheduler.daysFromNow.1week',
        description: 'Option for 1 week from now',
        default_value: '1 week',
        en: '1 week',
        es: '1 semana'
      },
      {
        key_path: 'scheduler.daysFromNow.2weeks',
        description: 'Option for 2 weeks from now',
        default_value: '2 weeks',
        en: '2 weeks',
        es: '2 semanas'
      },
      {
        key_path: 'scheduler.daysFromNow.1month',
        description: 'Option for 1 month from now',
        default_value: '1 month',
        en: '1 month',
        es: '1 mes'
      },
      {
        key_path: 'scheduler.timeFormat',
        description: 'Label for time format toggle',
        default_value: 'Time:',
        en: 'Time:',
        es: 'Hora:'
      }
    ];

    for (const trans of translations) {
      // Check if key already exists
      const existingKey = await client.query(
        `SELECT id FROM t_translation_keys WHERE key_path = $1`,
        [trans.key_path]
      );

      let keyId;
      if (existingKey.rows.length === 0) {
        // Insert new translation key
        const keyResult = await client.query(
          `INSERT INTO t_translation_keys (namespace_id, key_path, description, default_value, is_active, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())
           RETURNING id`,
          [namespaceId, trans.key_path, trans.description, trans.default_value]
        );
        keyId = keyResult.rows[0].id;
        console.log(`✅ Created translation key: ${trans.key_path}`);
      } else {
        keyId = existingKey.rows[0].id;
        console.log(`ℹ️  Translation key already exists: ${trans.key_path}`);
      }

      // Insert English translation
      const existingEnTrans = await client.query(
        `SELECT id FROM t_translations WHERE key_id = $1 AND language_id = $2`,
        [keyId, enLangId]
      );

      if (existingEnTrans.rows.length === 0) {
        await client.query(
          `INSERT INTO t_translations (key_id, language_id, value, is_approved, created_at)
           VALUES ($1, $2, $3, true, NOW())`,
          [keyId, enLangId, trans.en]
        );
        console.log(`  ✅ Added English translation for ${trans.key_path}`);
      } else {
        console.log(`  ℹ️  English translation already exists for ${trans.key_path}`);
      }

      // Insert Spanish translation
      const existingEsTrans = await client.query(
        `SELECT id FROM t_translations WHERE key_id = $1 AND language_id = $2`,
        [keyId, esLangId]
      );

      if (existingEsTrans.rows.length === 0) {
        await client.query(
          `INSERT INTO t_translations (key_id, language_id, value, is_approved, created_at)
           VALUES ($1, $2, $3, true, NOW())`,
          [keyId, esLangId, trans.es]
        );
        console.log(`  ✅ Added Spanish translation for ${trans.key_path}`);
      } else {
        console.log(`  ℹ️  Spanish translation already exists for ${trans.key_path}`);
      }
    }

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

    console.log('🔄 Removing scheduler days-from-now translation keys...');

    const keyPaths = [
      'scheduler.minDaysFromNow',
      'scheduler.daysFromNow.today',
      'scheduler.daysFromNow.tomorrow',
      'scheduler.daysFromNow.2days',
      'scheduler.daysFromNow.3days',
      'scheduler.daysFromNow.5days',
      'scheduler.daysFromNow.1week',
      'scheduler.daysFromNow.2weeks',
      'scheduler.daysFromNow.1month'
    ];

    for (const keyPath of keyPaths) {
      // Get the key ID
      const keyResult = await client.query(
        `SELECT id FROM t_translation_keys WHERE key_path = $1`,
        [keyPath]
      );

      if (keyResult.rows.length > 0) {
        const keyId = keyResult.rows[0].id;

        // Delete translations
        await client.query(
          `DELETE FROM t_translations WHERE key_id = $1`,
          [keyId]
        );

        // Delete key
        await client.query(
          `DELETE FROM t_translation_keys WHERE id = $1`,
          [keyId]
        );

        console.log(`✅ Removed translation key: ${keyPath}`);
      }
    }

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
