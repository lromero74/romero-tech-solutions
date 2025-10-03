import { getPool } from './config/database.js';

async function addTranslations() {
  const pool = await getPool();
  
  try {
    console.log('Adding invoice translation keys...');
    
    const namespaceResult = await pool.query(`
      SELECT id FROM t_translation_namespaces WHERE namespace = 'client'
    `);
    
    if (namespaceResult.rows.length === 0) {
      console.error('Client namespace not found');
      process.exit(1);
    }
    
    const namespaceId = namespaceResult.rows[0].id;
    
    const languageResult = await pool.query(`
      SELECT id, code FROM t_languages WHERE is_active = true
    `);
    
    const languages = languageResult.rows.reduce((acc, row) => {
      acc[row.code] = row.id;
      return acc;
    }, {});
    
    const translations = [
      { key: 'invoices.title', en: 'Invoices', es: 'Facturas' },
      { key: 'invoices.errorLoading', en: 'Error loading invoices', es: 'Error al cargar facturas' },
      { key: 'invoices.tryAgain', en: 'Try Again', es: 'Intentar de Nuevo' },
      { key: 'invoices.noInvoices', en: 'No invoices found', es: 'No se encontraron facturas' },
      { key: 'invoices.noInvoicesYet', en: 'You have no invoices at this time.', es: 'No tienes facturas en este momento.' },
      { key: 'invoices.noFilteredInvoices', en: 'No {{status}} invoices at this time.', es: 'No hay facturas {{status}} en este momento.' },
      { key: 'invoices.invoiceNumber', en: 'Invoice #{{number}}', es: 'Factura #{{number}}' },
      { key: 'invoices.issued', en: 'Issued', es: 'Emitida' },
      { key: 'invoices.due', en: 'Due', es: 'Vence' },
      { key: 'invoices.paid', en: 'Paid', es: 'Pagada' },
      { key: 'invoices.method', en: 'Method', es: 'Método' },
      { key: 'invoices.viewDetails', en: 'View Details', es: 'Ver Detalles' },
      { key: 'invoices.payNow', en: 'Pay Now', es: 'Pagar Ahora' },
      { key: 'invoices.status.paid', en: 'Paid', es: 'Pagada' },
      { key: 'invoices.status.due', en: 'Due', es: 'Pendiente' },
      { key: 'invoices.status.pending', en: 'Pending', es: 'Pendiente' },
      { key: 'invoices.status.failed', en: 'Failed', es: 'Fallida' },
      { key: 'invoices.status.overdue', en: 'Overdue', es: 'Vencida' },
      { key: 'invoices.status.comped', en: 'Comped', es: 'Cortesía' },
      { key: 'invoices.filter.all', en: 'All', es: 'Todas' },
      { key: 'invoices.filter.due', en: 'Due', es: 'Pendientes' },
      { key: 'invoices.filter.paid', en: 'Paid', es: 'Pagadas' },
      { key: 'invoices.filter.overdue', en: 'Overdue', es: 'Vencidas' },
      { key: 'invoices.filter.failed', en: 'Failed', es: 'Fallidas' },
    ];
    
    for (const translation of translations) {
      console.log(`Adding translation key: ${translation.key}`);
      
      const existingKey = await pool.query(`
        SELECT id FROM t_translation_keys
        WHERE key_path = $1 AND namespace_id = $2
      `, [translation.key, namespaceId]);
      
      let keyId;
      if (existingKey.rows.length > 0) {
        keyId = existingKey.rows[0].id;
        console.log(`  Key already exists, using existing key ID: ${keyId}`);
      } else {
        const keyResult = await pool.query(`
          INSERT INTO t_translation_keys (namespace_id, key_path, is_active, created_at, updated_at)
          VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [namespaceId, translation.key]);
        
        keyId = keyResult.rows[0].id;
        console.log(`  Created new key with ID: ${keyId}`);
      }
      
      for (const [langCode, text] of Object.entries(translation)) {
        if (langCode === 'key') continue;
        
        const languageId = languages[langCode];
        if (!languageId) {
          console.log(`  Skipping language: ${langCode} (not found)`);
          continue;
        }
        
        const existingTranslation = await pool.query(`
          SELECT id FROM t_translations
          WHERE key_id = $1 AND language_id = $2
        `, [keyId, languageId]);
        
        if (existingTranslation.rows.length > 0) {
          await pool.query(`
            UPDATE t_translations
            SET value = $1, updated_at = CURRENT_TIMESTAMP
            WHERE key_id = $2 AND language_id = $3
          `, [text, keyId, languageId]);
          console.log(`  Updated ${langCode}: ${text}`);
        } else {
          await pool.query(`
            INSERT INTO t_translations (key_id, language_id, value, is_approved, created_at, updated_at)
            VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [keyId, languageId, text]);
          console.log(`  Added ${langCode}: ${text}`);
        }
      }
    }
    
    console.log('\n✅ Invoice translation keys added successfully!');
    
  } catch (error) {
    console.error('Error adding translations:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addTranslations();
