import { query, closePool } from '../config/database.js';

async function fixPhotoFieldSize() {
  try {
    console.log('🔧 Fixing profile_photo_url field size constraint...\n');

    // Increase profile_photo_url size from VARCHAR(500) to TEXT
    // This allows for large base64 data URLs
    console.log('📝 Expanding profile_photo_url field size...');
    await query(`
      ALTER TABLE employees
      ALTER COLUMN profile_photo_url TYPE TEXT;
    `);

    console.log('✅ Successfully expanded profile_photo_url field to TEXT');

    // Verify the change
    console.log('\n🔍 Verifying field size change...');
    const result = await query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'profile_photo_url'
    `);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`✅ profile_photo_url is now: ${row.data_type}`);
      if (row.character_maximum_length) {
        console.log(`   Character limit: ${row.character_maximum_length}`);
      } else {
        console.log('   Character limit: unlimited (TEXT field)');
      }
    }

    console.log('\n🎉 Photo field size constraint has been fixed!');
    console.log('💾 The profile_photo_url field can now store large base64 image data.');

  } catch (error) {
    console.error('❌ Error fixing photo field size:', error);
  } finally {
    await closePool();
  }
}

fixPhotoFieldSize();