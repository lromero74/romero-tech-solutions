import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeEmployeePhotos() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();

    console.log('📸 Starting Employee Photos Normalization (Phase 5D)...');
    console.log('   Moving photo data from employees table to normalized employee_photos table');

    // Step 1: Create employee_photos table
    console.log('\n📋 Step 1: Creating employee_photos table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        photo_type VARCHAR(30) NOT NULL DEFAULT 'profile',
        file_url TEXT,
        filename VARCHAR(255),
        original_filename VARCHAR(255),
        file_size INTEGER,
        mime_type VARCHAR(100),
        width INTEGER,
        height INTEGER,
        position_x NUMERIC(5,2) DEFAULT 50.00,
        position_y NUMERIC(5,2) DEFAULT 50.00,
        scale_factor NUMERIC(5,2) DEFAULT 100.00,
        is_primary BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        upload_source VARCHAR(50) DEFAULT 'admin_portal',
        uploaded_by UUID,
        processing_status VARCHAR(20) DEFAULT 'completed',
        alt_text VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_photos_employee_id ON employee_photos(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_photos_type ON employee_photos(photo_type);
      CREATE INDEX IF NOT EXISTS idx_employee_photos_primary ON employee_photos(is_primary) WHERE is_primary = true;
      CREATE INDEX IF NOT EXISTS idx_employee_photos_active ON employee_photos(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_employee_photos_upload_date ON employee_photos(created_at);
      CREATE INDEX IF NOT EXISTS idx_employee_photos_filename ON employee_photos(filename);
    `);

    // Create unique constraint to ensure only one primary photo per employee per type
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_photos_unique_primary
      ON employee_photos(employee_id, photo_type)
      WHERE is_primary = true AND is_active = true
    `);

    console.log('✅ Employee photos table created with indexes and constraints');

    // Step 2: Analyze existing photo data
    console.log('\n📊 Step 2: Analyzing existing photo data...');
    const photoAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN profile_photo_url IS NOT NULL AND profile_photo_url != '' THEN 1 END) as with_photo_url,
        COUNT(CASE WHEN profile_photo_filename IS NOT NULL AND profile_photo_filename != '' THEN 1 END) as with_filename,
        COUNT(CASE WHEN photo_position_x IS NOT NULL THEN 1 END) as with_position_x,
        COUNT(CASE WHEN photo_position_y IS NOT NULL THEN 1 END) as with_position_y,
        COUNT(CASE WHEN photo_scale IS NOT NULL THEN 1 END) as with_scale
      FROM employees
    `);

    const stats = photoAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   📸 With photo URL: ${stats.with_photo_url}`);
    console.log(`   📁 With filename: ${stats.with_filename}`);
    console.log(`   📍 With position X: ${stats.with_position_x}`);
    console.log(`   📍 With position Y: ${stats.with_position_y}`);
    console.log(`   🔍 With scale: ${stats.with_scale}`);

    // Get detailed photo data
    const photoData = await client.query(`
      SELECT
        id,
        first_name,
        last_name,
        profile_photo_url,
        profile_photo_filename,
        photo_position_x,
        photo_position_y,
        photo_scale
      FROM employees
      WHERE profile_photo_url IS NOT NULL
         OR profile_photo_filename IS NOT NULL
         OR photo_position_x IS NOT NULL
         OR photo_position_y IS NOT NULL
         OR photo_scale IS NOT NULL
      ORDER BY first_name, last_name
    `);

    console.log('\n📋 Found employees with photo data:');
    photoData.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.first_name} ${emp.last_name}`);
      console.log(`      URL: ${emp.profile_photo_url || 'null'}`);
      console.log(`      Filename: ${emp.profile_photo_filename || 'null'}`);
      console.log(`      Position: (${emp.photo_position_x || 'null'}, ${emp.photo_position_y || 'null'})`);
      console.log(`      Scale: ${emp.photo_scale || 'null'}%`);
    });

    // Step 3: Migrate photo data
    console.log('\n🔄 Step 3: Migrating photo data to employee_photos table...');

    let migratedCount = 0;
    for (const emp of photoData.rows) {
      // Only migrate if there's actual photo data
      if (emp.profile_photo_url || emp.profile_photo_filename) {

        // Extract file extension from URL or filename for mime type detection
        let mimeType = 'image/jpeg'; // default
        let originalFilename = null;

        const photoRef = emp.profile_photo_url || emp.profile_photo_filename;
        if (photoRef) {
          const ext = photoRef.toLowerCase().split('.').pop();
          originalFilename = emp.profile_photo_filename || photoRef.split('/').pop();

          switch (ext) {
            case 'jpg':
            case 'jpeg':
              mimeType = 'image/jpeg';
              break;
            case 'png':
              mimeType = 'image/png';
              break;
            case 'gif':
              mimeType = 'image/gif';
              break;
            case 'webp':
              mimeType = 'image/webp';
              break;
            default:
              mimeType = 'image/jpeg';
          }
        }

        // Create alt text
        const altText = `Profile photo of ${emp.first_name} ${emp.last_name}`;

        // Insert photo record
        const insertResult = await client.query(`
          INSERT INTO employee_photos (
            employee_id, photo_type, file_url, filename, original_filename,
            mime_type, position_x, position_y, scale_factor,
            is_primary, is_active, upload_source, alt_text
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `, [
          emp.id,
          'profile',
          emp.profile_photo_url,
          emp.profile_photo_filename,
          originalFilename,
          mimeType,
          emp.photo_position_x || 50.00,
          emp.photo_position_y || 50.00,
          emp.photo_scale || 100.00,
          true, // is_primary
          true, // is_active
          'migrated_from_employees',
          altText
        ]);

        console.log(`   ✅ Migrated photo for ${emp.first_name} ${emp.last_name}`);
        migratedCount++;
      }
    }

    console.log(`✅ Migrated ${migratedCount} employee photos`);

    // Step 4: Verify migration
    console.log('\n🔍 Step 4: Verifying photo migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.profile_photo_url as old_url,
        e.profile_photo_filename as old_filename,
        ep.file_url as new_url,
        ep.filename as new_filename,
        ep.position_x,
        ep.position_y,
        ep.scale_factor,
        ep.mime_type,
        ep.alt_text
      FROM employees e
      LEFT JOIN employee_photos ep ON e.id = ep.employee_id AND ep.is_primary = true AND ep.photo_type = 'profile'
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Photo migration results for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
      console.log(`      Old URL: ${row.old_url || 'null'}`);
      console.log(`      New URL: ${row.new_url || 'No photo migrated'}`);
      console.log(`      Old Filename: ${row.old_filename || 'null'}`);
      console.log(`      New Filename: ${row.new_filename || 'null'}`);
      if (row.new_url) {
        console.log(`      Position: (${row.position_x}, ${row.position_y}), Scale: ${row.scale_factor}%`);
        console.log(`      Type: ${row.mime_type}, Alt: ${row.alt_text}`);
      }
    });

    // Step 5: Show photo statistics
    console.log('\n📊 Step 5: Photo statistics...');
    const photoStats = await client.query(`
      SELECT
        photo_type,
        COUNT(*) as total_photos,
        COUNT(CASE WHEN is_primary = true THEN 1 END) as primary_photos,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_photos,
        COUNT(DISTINCT employee_id) as employees_with_photos
      FROM employee_photos
      GROUP BY photo_type
      ORDER BY photo_type
    `);

    console.log('📋 Photo statistics by type:');
    photoStats.rows.forEach((stat, index) => {
      console.log(`   ${index + 1}. ${stat.photo_type}: ${stat.total_photos} total, ${stat.primary_photos} primary, ${stat.active_photos} active`);
      console.log(`      Covers ${stat.employees_with_photos} employees`);
    });

    // Step 6: Create helper view for easy photo access
    console.log('\n🔧 Step 6: Creating helper view for photo access...');
    await client.query(`
      CREATE OR REPLACE VIEW v_employee_primary_photos AS
      SELECT
        e.id as employee_id,
        e.first_name,
        e.last_name,
        ep.id as photo_id,
        ep.file_url,
        ep.filename,
        ep.position_x,
        ep.position_y,
        ep.scale_factor,
        ep.mime_type,
        ep.alt_text,
        ep.created_at as photo_uploaded_at
      FROM employees e
      LEFT JOIN employee_photos ep ON e.id = ep.employee_id
        AND ep.is_primary = true
        AND ep.is_active = true
        AND ep.photo_type = 'profile'
    `);

    console.log('✅ Created v_employee_primary_photos view for easy access');

    console.log('\n🎉 Employee photos normalization completed successfully!');
    console.log('   ✅ Created normalized employee_photos table');
    console.log('   ✅ Created comprehensive photo metadata structure');
    console.log('   ✅ Migrated existing photo data with positioning and scaling');
    console.log('   ✅ Added support for multiple photos per employee');
    console.log('   ✅ Created unique constraints for primary photos');
    console.log('   ✅ Added helper view for easy photo access');
    console.log('   ✅ Supports audit trail and upload tracking');
    console.log('\n🚨 IMPORTANT: Do not drop photo columns from employees table yet!');
    console.log('   Backend code must be updated to use employee_photos table first.');

  } catch (error) {
    console.error('❌ Error during employee photos normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeEmployeePhotos();