import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function updateLogoColumnWithViewHandling() {
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

    console.log('🔍 Checking for views that depend on businesses table...');

    // Get all views that might depend on the businesses table
    const viewsResult = await client.query(`
      SELECT viewname, definition
      FROM pg_views
      WHERE definition LIKE '%businesses%'
    `);

    const views = viewsResult.rows;
    console.log(`Found ${views.length} view(s) that reference the businesses table`);

    // Store view definitions before dropping
    const viewDefinitions = [];
    for (const view of views) {
      console.log(`📋 Storing definition for view: ${view.viewname}`);
      viewDefinitions.push({
        name: view.viewname,
        definition: view.definition
      });

      // Drop the view
      await client.query(`DROP VIEW IF EXISTS ${view.viewname} CASCADE`);
      console.log(`❌ Dropped view: ${view.viewname}`);
    }

    console.log('\n🔄 Updating logo_url column type...');

    // Now update the column type
    await client.query(`
      ALTER TABLE businesses
      ALTER COLUMN logo_url TYPE TEXT USING logo_url::TEXT
    `);
    console.log('✅ Changed logo_url column type to TEXT');

    // Recreate the views
    for (const viewDef of viewDefinitions) {
      console.log(`♻️  Recreating view: ${viewDef.name}`);
      await client.query(`CREATE VIEW ${viewDef.name} AS ${viewDef.definition}`);
      console.log(`✅ Recreated view: ${viewDef.name}`);
    }

    console.log('\n📊 Database schema updated successfully!');
    console.log('   - businesses.logo_url (TEXT) - can now store large image data');
    console.log(`   - ${views.length} view(s) were recreated`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
}

updateLogoColumnWithViewHandling();