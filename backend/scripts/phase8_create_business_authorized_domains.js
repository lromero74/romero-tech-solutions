import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createBusinessAuthorizedDomains() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔄 Creating business authorized domains system (Phase 8)...');
    console.log('   This will normalize email domain restrictions for businesses.');

    // Step 1: Check if table already exists
    console.log('\n🔍 Step 1: Checking if business_authorized_domains table exists...');

    const tableExists = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'business_authorized_domains'
    `);

    if (tableExists.rows.length > 0) {
      console.log('ℹ️  Table business_authorized_domains already exists');

      // Show current structure
      const currentStructure = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'business_authorized_domains'
        ORDER BY ordinal_position
      `);

      console.log('📋 Current table structure:');
      console.table(currentStructure.rows);

      const dataCount = await client.query('SELECT COUNT(*) as count FROM business_authorized_domains');
      console.log(`📊 Current data: ${dataCount.rows[0].count} authorized domains`);

      console.log('⚠️  Table already exists. Skipping creation...');
      return;
    }

    // Step 2: Create business_authorized_domains table
    console.log('\n🏗️  Step 2: Creating business_authorized_domains table...');

    await client.query(`
      CREATE TABLE business_authorized_domains (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        domain VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id, domain)
      )
    `);

    console.log('✅ Created business_authorized_domains table');

    // Step 3: Create indexes
    console.log('\n📇 Step 3: Creating indexes...');

    await client.query(`
      CREATE INDEX idx_business_authorized_domains_business_id ON business_authorized_domains(business_id);
    `);

    await client.query(`
      CREATE INDEX idx_business_authorized_domains_domain ON business_authorized_domains(domain);
    `);

    await client.query(`
      CREATE INDEX idx_business_authorized_domains_active ON business_authorized_domains(is_active);
    `);

    console.log('✅ Created indexes for business_authorized_domains');

    // Step 4: Migrate existing domain_email data from businesses table
    console.log('\n📦 Step 4: Migrating existing domain_email data...');

    // Get existing businesses with domain_email
    const existingBusinesses = await client.query(`
      SELECT id, business_name, domain_email
      FROM businesses
      WHERE domain_email IS NOT NULL AND domain_email != ''
    `);

    console.log(`📊 Found ${existingBusinesses.rows.length} businesses with domain_email to migrate`);

    if (existingBusinesses.rows.length > 0) {
      console.log('📋 Businesses to migrate:');
      console.table(existingBusinesses.rows.map(b => ({
        business_name: b.business_name,
        domain_email: b.domain_email
      })));

      // Extract domain from email and insert into authorized domains
      for (const business of existingBusinesses.rows) {
        try {
          // Extract domain from email (everything after @)
          const emailParts = business.domain_email.split('@');
          if (emailParts.length === 2) {
            const domain = emailParts[1].toLowerCase().trim();

            await client.query(`
              INSERT INTO business_authorized_domains (business_id, domain, description, is_active)
              VALUES ($1, $2, $3, true)
              ON CONFLICT (business_id, domain) DO NOTHING
            `, [
              business.id,
              domain,
`Migrated from domain_email field - ${business.business_name}`
            ]);

            console.log(`  ✅ Added domain "${domain}" for ${business.business_name}`);
          } else {
            console.log(`  ⚠️  Invalid email format for ${business.business_name}: ${business.domain_email}`);
          }
        } catch (error) {
          console.log(`  ❌ Error migrating ${business.business_name}: ${error.message}`);
        }
      }

      console.log('✅ Migration completed');
    }

    // Step 5: Add some example additional domains for testing
    console.log('\n🧪 Step 5: Adding example additional domains for testing...');

    // Add additional domains for Romero Tech Solutions
    const romeroBusinesses = await client.query(`
      SELECT id, business_name
      FROM businesses
      WHERE business_name ILIKE '%romero%'
    `);

    for (const business of romeroBusinesses.rows) {
      // Add some additional example domains
      const additionalDomains = ['gmail.com', 'yahoo.com'];

      for (const domain of additionalDomains) {
        await client.query(`
          INSERT INTO business_authorized_domains (business_id, domain, description, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (business_id, domain) DO NOTHING
        `, [
          business.id,
          domain,
`Additional authorized domain for ${business.business_name}`
        ]);
      }

      console.log(`  ✅ Added additional domains for ${business.business_name}`);
    }

    // Step 6: Verify the results
    console.log('\n✅ Step 6: Verifying the results...');

    const finalResults = await client.query(`
      SELECT
        b.business_name,
        bad.domain,
        bad.description,
        bad.is_active,
        bad.created_at
      FROM businesses b
      JOIN business_authorized_domains bad ON b.id = bad.business_id
      WHERE bad.is_active = true
      ORDER BY b.business_name, bad.domain
    `);

    console.log('📋 Final authorized domains:');
    console.table(finalResults.rows);

    // Step 7: Show usage example
    console.log('\n📚 Step 7: Usage examples...');

    console.log('\n Example query to find businesses for a client email:');
    console.log(`
    SELECT DISTINCT b.id, b.business_name
    FROM businesses b
    JOIN business_authorized_domains bad ON b.id = bad.business_id
    WHERE bad.domain = 'romerotechsolutions.com'
      AND bad.is_active = true
      AND b.is_active = true
    `);

    const exampleQuery = await client.query(`
      SELECT DISTINCT b.id, b.business_name
      FROM businesses b
      JOIN business_authorized_domains bad ON b.id = bad.business_id
      WHERE bad.domain = 'romerotechsolutions.com'
        AND bad.is_active = true
        AND b.is_active = true
    `);

    console.log('📊 Example result for romerotechsolutions.com:');
    console.table(exampleQuery.rows);

    console.log('\n🎉 Phase 8 completed successfully!');
    console.log('📋 Summary:');
    console.log('   ✅ Created business_authorized_domains table with proper constraints');
    console.log('   ✅ Added indexes for performance');
    console.log('   ✅ Migrated existing domain_email data');
    console.log('   ✅ Added example additional domains for testing');
    console.log('   ✅ Businesses can now have multiple authorized email domains');
    console.log('   ✅ Ready for client business assignment based on email domain matching');

  } catch (error) {
    console.error('❌ Error during Phase 8:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the script
createBusinessAuthorizedDomains().catch(console.error);