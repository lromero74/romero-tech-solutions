import { getPool } from './config/database.js';

async function addTranslations() {
  const pool = await getPool();
  
  try {
    console.log('Adding all Trusted Devices translation keys...');
    
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
      { key: 'settings.tabs.trustedDevices', en: 'Trusted Devices', es: 'Dispositivos Confiables' },
      { key: 'trustedDevices.title', en: 'Trusted Devices', es: 'Dispositivos Confiables' },
      { key: 'trustedDevices.description', en: 'Manage devices that have been authorized for secure access to your account. You can revoke access from any device at any time.', es: 'Gestiona los dispositivos autorizados para acceder de forma segura a tu cuenta. Puedes revocar el acceso de cualquier dispositivo en cualquier momento.' },
      { key: 'trustedDevices.loading', en: 'Loading trusted devices...', es: 'Cargando dispositivos confiables...' },
      { key: 'trustedDevices.refresh', en: 'Refresh', es: 'Actualizar' },
      { key: 'trustedDevices.noDevices', en: 'No Trusted Devices', es: 'Sin Dispositivos Confiables' },
      { key: 'trustedDevices.noDevicesDescription', en: 'You have not authorized any devices yet. When you log in from a new device and choose to trust it, it will appear here.', es: 'Aún no has autorizado ningún dispositivo. Cuando inicies sesión desde un dispositivo nuevo y elijas confiar en él, aparecerá aquí.' },
      { key: 'trustedDevices.registered', en: 'Registered', es: 'Registrado' },
      { key: 'trustedDevices.lastUsed', en: 'Last Used', es: 'Último Uso' },
      { key: 'trustedDevices.expires', en: 'Expires', es: 'Expira' },
      { key: 'trustedDevices.activeUntil', en: 'Active until', es: 'Activo hasta' },
      { key: 'trustedDevices.sharedDevice', en: 'Shared Device', es: 'Dispositivo Compartido' },
      { key: 'trustedDevices.revoke', en: 'Revoke Access', es: 'Revocar Acceso' },
      { key: 'trustedDevices.revokeTitle', en: 'Revoke Device Access', es: 'Revocar Acceso del Dispositivo' },
      { key: 'trustedDevices.revokeMessage', en: 'Are you sure you want to revoke access for {deviceName}? You will need to verify this device again on your next login.', es: '¿Estás seguro de que deseas revocar el acceso de {deviceName}? Deberás verificar este dispositivo nuevamente en tu próximo inicio de sesión.' },
      { key: 'trustedDevices.revokeButton', en: 'Revoke Access', es: 'Revocar Acceso' },
      { key: 'trustedDevices.cancel', en: 'Cancel', es: 'Cancelar' },
      { key: 'trustedDevices.errorLoad', en: 'Failed to load trusted devices', es: 'Error al cargar dispositivos confiables' },
      { key: 'trustedDevices.errorRevoke', en: 'Failed to revoke device access', es: 'Error al revocar acceso del dispositivo' },
      { key: 'trustedDevices.locationUnknown', en: 'Unknown Location', es: 'Ubicación Desconocida' },
      { key: 'trustedDevices.unknownPlatform', en: 'Unknown Platform', es: 'Plataforma Desconocida' },
      { key: 'trustedDevices.deviceInfoNotAvailable', en: 'Device information not available', es: 'Información del dispositivo no disponible' },
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
    
    console.log('\n✅ All Trusted Devices translation keys added successfully!');
    
  } catch (error) {
    console.error('Error adding translations:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addTranslations();
