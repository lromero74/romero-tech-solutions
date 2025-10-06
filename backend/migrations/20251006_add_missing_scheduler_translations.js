/**
 * Migration: Add missing scheduler translation keys
 * Date: 2025-10-06
 *
 * Adds translations that were being used in the code but didn't exist in the database
 */

import { getPool } from '../config/database.js';

export async function up() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌐 Adding missing scheduler translation keys...');

    // Get the namespace ID for 'scheduler'
    const namespaceResult = await client.query(
      `SELECT id FROM t_translation_namespaces WHERE namespace = 'scheduler'`
    );

    if (namespaceResult.rows.length === 0) {
      throw new Error('Scheduler namespace not found in database');
    }

    const namespaceId = namespaceResult.rows[0].id;

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
        key_path: 'scheduler.cancel',
        description: 'Cancel button text',
        default_value: 'Cancel',
        en: 'Cancel',
        es: 'Cancelar'
      },
      {
        key_path: 'scheduler.close',
        description: 'Close button aria-label',
        default_value: 'Close scheduler',
        en: 'Close scheduler',
        es: 'Cerrar programador'
      },
      {
        key_path: 'scheduler.switchTo12Hour',
        description: 'Switch to 12-hour format tooltip',
        default_value: 'Switch to 12-hour format',
        en: 'Switch to 12-hour format',
        es: 'Cambiar a formato de 12 horas'
      },
      {
        key_path: 'scheduler.switchTo24Hour',
        description: 'Switch to 24-hour format tooltip',
        default_value: 'Switch to 24-hour format',
        en: 'Switch to 24-hour format',
        es: 'Cambiar a formato de 24 horas'
      },
      {
        key_path: 'scheduler.subtotal',
        description: 'Subtotal label in cost breakdown',
        default_value: 'Subtotal',
        en: 'Subtotal',
        es: 'Subtotal'
      },
      {
        key_path: 'scheduler.firstHourComp',
        description: 'First hour complimentary label',
        default_value: 'First Hour Comp (New Client)',
        en: 'First Hour Comp (New Client)',
        es: 'Primera Hora Gratis (Cliente Nuevo)'
      },
      {
        key_path: 'scheduler.totalDiscount',
        description: 'Total discount label',
        default_value: 'Total Discount',
        en: 'Total Discount',
        es: 'Descuento Total'
      },
      {
        key_path: 'scheduler.noSlotsAvailable',
        description: 'No available slots found message',
        default_value: 'No available slots found for the selected criteria',
        en: 'No available slots found for the selected criteria',
        es: 'No se encontraron espacios disponibles para los criterios seleccionados'
      },
      {
        key_path: 'scheduler.autoSuggestError',
        description: 'Auto-suggest error message',
        default_value: 'Error finding available slots',
        en: 'Error finding available slots',
        es: 'Error al buscar espacios disponibles'
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

    console.log('🔄 Removing missing scheduler translation keys...');

    const keyPaths = [
      'scheduler.cancel',
      'scheduler.close',
      'scheduler.switchTo12Hour',
      'scheduler.switchTo24Hour',
      'scheduler.subtotal',
      'scheduler.firstHourComp',
      'scheduler.totalDiscount',
      'scheduler.noSlotsAvailable',
      'scheduler.autoSuggestError'
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
