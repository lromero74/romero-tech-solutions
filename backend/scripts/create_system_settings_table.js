import { query } from '../config/database.js';

async function createSystemSettingsTable() {
  try {
    // Create system_settings table
    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        setting_type VARCHAR(100) NOT NULL DEFAULT 'general',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ system_settings table created successfully');

    // Insert default session configuration
    await query(`
      INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (setting_key) DO NOTHING
    `, [
      'session_config',
      JSON.stringify({
        timeout: 15,
        warningTime: 2
      }),
      'security',
      'Session timeout configuration in minutes'
    ]);

    console.log('✅ Default session configuration inserted');

  } catch (error) {
    console.error('❌ Error creating system_settings table:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createSystemSettingsTable()
    .then(() => {
      console.log('🎉 System settings table setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { createSystemSettingsTable };