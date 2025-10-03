import { getPool } from './config/database.js';

async function addTranslations() {
  const pool = await getPool();
  
  try {
    console.log('Adding Trusted Devices translation keys...');
    
    // Get the client namespace ID
    const namespaceResult = await pool.query(`
      SELECT id FROM t_translation_namespaces WHERE namespace = 'client'
    `);
    
    if (namespaceResult.rows.length === 0) {
      console.error('Client namespace not found');
      process.exit(1);
    }
    
    const namespaceId = namespaceResult.rows[0].id;
    
    // Get language IDs
    const languageResult = await pool.query(`
      SELECT id, code FROM t_languages WHERE is_active = true
    `);
    
    const languages = languageResult.rows.reduce((acc, row) => {
      acc[row.code] = row.id;
      return acc;
    }, {});
    
    // Translation data
    const translations = [
      {
        key: 'settings.tabs.trustedDevices',
        en: 'Trusted Devices',
        es: 'Dispositivos Confiables'
      }
    ];
    
    for (const translation of translations) {
      console.log(`Adding translation key: ${translation.key}`);
      
      // Check if key already exists
      const existingKey = await pool.query(`
        SELECT id FROM t_translation_keys
        WHERE key_path = $1 AND namespace_id = $2
      `, [translation.key, namespaceId]);
      
      let keyId;
      if (existingKey.rows.length > 0) {
        keyId = existingKey.rows[0].id;
        console.log(`  Key already exists, using existing key ID: ${keyId}`);
      } else {
        // Insert new key
        const keyResult = await pool.query(`
          INSERT INTO t_translation_keys (namespace_id, key_path, is_active, created_at, updated_at)
          VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [namespaceId, translation.key]);
        
        keyId = keyResult.rows[0].id;
        console.log(`  Created new key with ID: ${keyId}`);
      }
      
      // Add translations for each language
      for (const [langCode, text] of Object.entries(translation)) {
        if (langCode === 'key') continue;
        
        const languageId = languages[langCode];
        if (!languageId) {
          console.log(`  Skipping language: ${langCode} (not found)`);
          continue;
        }
        
        // Check if translation already exists
        const existingTranslation = await pool.query(`
          SELECT id FROM t_translations
          WHERE key_id = $1 AND language_id = $2
        `, [keyId, languageId]);
        
        if (existingTranslation.rows.length > 0) {
          // Update existing translation
          await pool.query(`
            UPDATE t_translations
            SET value = $1, updated_at = CURRENT_TIMESTAMP
            WHERE key_id = $2 AND language_id = $3
          `, [text, keyId, languageId]);
          console.log(`  Updated ${langCode}: ${text}`);
        } else {
          // Insert new translation
          await pool.query(`
            INSERT INTO t_translations (key_id, language_id, value, is_approved, created_at, updated_at)
            VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [keyId, languageId, text]);
          console.log(`  Added ${langCode}: ${text}`);
        }
      }
    }
    
    console.log('\n✅ Trusted Devices translation keys added successfully!');
    
  } catch (error) {
    console.error('Error adding translations:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addTranslations();
