import { query } from './config/database.js';

const englishLangId = '3760eb9f-af6a-4037-920e-68769dcd17d3';

const updates = [
  { key: 'schedule.urgency.normal', value: 'Normal Service' },
  { key: 'schedule.urgency.prime', value: 'Premium Service' },
  { key: 'schedule.urgency.emergency', value: 'Emergency Service' }
];

async function updateTranslations() {
  console.log('🔄 Updating English translations for urgency levels...');

  for (const update of updates) {
    console.log(`Updating ${update.key} to '${update.value}'`);
    const result = await query(
      'UPDATE t_translations SET value = $1 WHERE key_path = $2 AND language_id = $3',
      [update.value, update.key, englishLangId]
    );
    console.log(`✅ Updated: ${result.rowCount} row(s) affected`);
  }

  console.log('✨ English translations updated successfully');
  process.exit(0);
}

updateTranslations().catch(console.error);