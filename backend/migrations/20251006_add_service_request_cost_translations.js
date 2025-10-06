import { getPool } from '../config/database.js';

/**
 * Migration: Add missing service request cost estimate translations
 *
 * Adds translation keys and values for:
 * - costEstimate
 * - subtotal
 * - firstHourComp
 * - totalDiscount
 */

export async function up() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌐 Adding service request cost estimate translation keys...');

    // Get namespace ID for 'client'
    const namespaceResult = await client.query(`
      SELECT id FROM t_translation_namespaces WHERE namespace = 'client'
    `);

    if (namespaceResult.rows.length === 0) {
      throw new Error('Client namespace not found');
    }

    const namespaceId = namespaceResult.rows[0].id;

    // Get language IDs
    const langResult = await client.query(`
      SELECT id, code FROM t_languages WHERE code IN ('en', 'es')
    `);

    const languages = {};
    langResult.rows.forEach(row => {
      languages[row.code] = row.id;
    });

    // Translation keys and values to add
    const translations = [
      {
        key: 'serviceRequests.costEstimate',
        en: 'Cost Estimate',
        es: 'Estimación de Costo'
      },
      {
        key: 'serviceRequests.subtotal',
        en: 'subtotal',
        es: 'subtotal'
      },
      {
        key: 'serviceRequests.firstHourComp',
        en: 'First Hour Comp (New Client)',
        es: 'Bonificación Primera Hora (Cliente Nuevo)'
      },
      {
        key: 'serviceRequests.totalDiscount',
        en: 'Total Discount',
        es: 'Descuento Total'
      }
    ];

    for (const trans of translations) {
      // Check if key already exists
      const keyCheck = await client.query(
        'SELECT id FROM t_translation_keys WHERE key_path = $1',
        [trans.key]
      );

      let keyId;
      if (keyCheck.rows.length === 0) {
        // Insert new translation key
        const keyResult = await client.query(
          `INSERT INTO t_translation_keys (namespace_id, key_path, description, context)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [namespaceId, trans.key, `Service request cost estimate: ${trans.key.split('.').pop()}`, 'service_requests']
        );
        keyId = keyResult.rows[0].id;
        console.log(`  ✅ Created translation key: ${trans.key}`);
      } else {
        keyId = keyCheck.rows[0].id;
        console.log(`  ℹ️  Translation key already exists: ${trans.key}`);
      }

      // Insert English translation
      const enCheck = await client.query(
        'SELECT id FROM t_translations WHERE key_id = $1 AND language_id = $2',
        [keyId, languages.en]
      );

      if (enCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO t_translations (key_id, language_id, value, is_approved)
           VALUES ($1, $2, $3, true)`,
          [keyId, languages.en, trans.en]
        );
        console.log(`    ✅ Added English translation: "${trans.en}"`);
      } else {
        console.log(`    ℹ️  English translation already exists`);
      }

      // Insert Spanish translation
      const esCheck = await client.query(
        'SELECT id FROM t_translations WHERE key_id = $1 AND language_id = $2',
        [keyId, languages.es]
      );

      if (esCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO t_translations (key_id, language_id, value, is_approved)
           VALUES ($1, $2, $3, true)`,
          [keyId, languages.es, trans.es]
        );
        console.log(`    ✅ Added Spanish translation: "${trans.es}"`);
      } else {
        console.log(`    ℹ️  Spanish translation already exists`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Service request cost estimate translations added successfully');

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

    console.log('🔄 Removing service request cost estimate translation keys...');

    const keysToRemove = [
      'serviceRequests.costEstimate',
      'serviceRequests.subtotal',
      'serviceRequests.firstHourComp',
      'serviceRequests.totalDiscount'
    ];

    for (const key of keysToRemove) {
      // Delete translations first (foreign key constraint)
      await client.query(`
        DELETE FROM t_translations
        WHERE key_id IN (
          SELECT id FROM t_translation_keys WHERE key_path = $1
        )
      `, [key]);

      // Delete translation key
      const result = await client.query(
        'DELETE FROM t_translation_keys WHERE key_path = $1',
        [key]
      );

      if (result.rowCount > 0) {
        console.log(`  ✅ Removed translation key: ${key}`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Service request cost estimate translations removed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
