import { getPool } from '../config/database.js';

/**
 * Migration: Add Spanish translations for service types
 *
 * Adds Spanish translations for all service types including "Other"
 */

export async function up() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🌐 Adding Spanish translations for service types...');

    // Get language IDs
    const langResult = await client.query(`
      SELECT id, code FROM t_languages WHERE code IN ('en', 'es')
    `);

    const languages = {};
    langResult.rows.forEach(row => {
      languages[row.code] = row.id;
    });

    // Get namespace ID for service types
    const namespaceResult = await client.query(`
      SELECT id FROM t_translation_namespaces WHERE namespace = 'public'
    `);

    if (namespaceResult.rows.length === 0) {
      throw new Error('Public namespace not found');
    }

    const namespaceId = namespaceResult.rows[0].id;

    // Service type translations
    const translations = [
      {
        key: 'serviceTypes.backup-solutions.name',
        en: 'Backup Solutions',
        es: 'Soluciones de Respaldo'
      },
      {
        key: 'serviceTypes.backup-solutions.description',
        en: 'Implement and test backup systems',
        es: 'Implementar y probar sistemas de respaldo'
      },
      {
        key: 'serviceTypes.data-recovery.name',
        en: 'Data Recovery',
        es: 'Recuperación de Datos'
      },
      {
        key: 'serviceTypes.data-recovery.description',
        en: 'Recover lost or corrupted data',
        es: 'Recuperar datos perdidos o corruptos'
      },
      {
        key: 'serviceTypes.email-configuration.name',
        en: 'Email Configuration',
        es: 'Configuración de Correo Electrónico'
      },
      {
        key: 'serviceTypes.email-configuration.description',
        en: 'Setup and troubleshoot email systems',
        es: 'Configurar y solucionar problemas de sistemas de correo electrónico'
      },
      {
        key: 'serviceTypes.hardware-repair.name',
        en: 'Hardware Repair',
        es: 'Reparación de Hardware'
      },
      {
        key: 'serviceTypes.hardware-repair.description',
        en: 'Repair or replace faulty hardware components',
        es: 'Reparar o reemplazar componentes de hardware defectuosos'
      },
      {
        key: 'serviceTypes.network-troubleshooting.name',
        en: 'Network Troubleshooting',
        es: 'Solución de Problemas de Red'
      },
      {
        key: 'serviceTypes.network-troubleshooting.description',
        en: 'Diagnose and resolve network connectivity issues',
        es: 'Diagnosticar y resolver problemas de conectividad de red'
      },
      {
        key: 'serviceTypes.printer-installation.name',
        en: 'Printer Installation',
        es: 'Instalación de Impresoras'
      },
      {
        key: 'serviceTypes.printer-installation.description',
        en: 'Install and configure printers and scanners',
        es: 'Instalar y configurar impresoras y escáneres'
      },
      {
        key: 'serviceTypes.security-assessment.name',
        en: 'Security Assessment',
        es: 'Evaluación de Seguridad'
      },
      {
        key: 'serviceTypes.security-assessment.description',
        en: 'Evaluate and improve security posture',
        es: 'Evaluar y mejorar la postura de seguridad'
      },
      {
        key: 'serviceTypes.software-installation.name',
        en: 'Software Installation',
        es: 'Instalación de Software'
      },
      {
        key: 'serviceTypes.software-installation.description',
        en: 'Install and configure software applications',
        es: 'Instalar y configurar aplicaciones de software'
      },
      {
        key: 'serviceTypes.system-maintenance.name',
        en: 'System Maintenance',
        es: 'Mantenimiento del Sistema'
      },
      {
        key: 'serviceTypes.system-maintenance.description',
        en: 'Routine maintenance and updates',
        es: 'Mantenimiento y actualizaciones de rutina'
      },
      {
        key: 'serviceTypes.wi-fi-setup.name',
        en: 'Wi-Fi Setup',
        es: 'Configuración de Wi-Fi'
      },
      {
        key: 'serviceTypes.wi-fi-setup.description',
        en: 'Configure wireless network access',
        es: 'Configurar acceso a red inalámbrica'
      },
      {
        key: 'serviceTypes.other.name',
        en: 'Other',
        es: 'Otro'
      },
      {
        key: 'serviceTypes.other.description',
        en: 'Other services not listed above',
        es: 'Otros servicios no listados arriba'
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
          [namespaceId, trans.key, `Service type: ${trans.key.split('.').pop()}`, 'service_types']
        );
        keyId = keyResult.rows[0].id;
        console.log(`  ✅ Created translation key: ${trans.key}`);
      } else {
        keyId = keyCheck.rows[0].id;
        console.log(`  ℹ️  Translation key already exists: ${trans.key}`);
      }

      // Check and insert English translation if missing
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

    // Update "Other" service type to have translation keys
    await client.query(`
      UPDATE service_types
      SET name_key = 'serviceTypes.other.name',
          description_key = 'serviceTypes.other.description'
      WHERE name = 'Other' AND (name_key IS NULL OR description_key IS NULL)
    `);
    console.log('  ✅ Updated "Other" service type with translation keys');

    await client.query('COMMIT');
    console.log('✅ Spanish service type translations added successfully');

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

    console.log('🔄 Removing Spanish service type translations...');

    // Get all serviceTypes translation keys
    const keys = await client.query(`
      SELECT id FROM t_translation_keys
      WHERE key_path LIKE 'serviceTypes.%.%'
    `);

    for (const key of keys.rows) {
      // Delete translations
      await client.query(
        'DELETE FROM t_translations WHERE key_id = $1',
        [key.id]
      );
    }

    // Delete translation keys
    await client.query(`
      DELETE FROM t_translation_keys
      WHERE key_path LIKE 'serviceTypes.%.%'
    `);

    // Remove translation keys from "Other" service type
    await client.query(`
      UPDATE service_types
      SET name_key = NULL,
          description_key = NULL
      WHERE name = 'Other'
    `);

    await client.query('COMMIT');
    console.log('✅ Spanish service type translations removed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
