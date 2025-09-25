import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeEmployeePronouns() {
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

    console.log('🏷️ Starting Employee Pronouns Normalization (Phase 5C)...');
    console.log('   Moving pronouns data to normalized employee_pronouns table');

    // Step 1: Create employee_pronouns table
    console.log('\n📋 Step 1: Creating employee_pronouns table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_pronouns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pronoun_set VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        subject_pronoun VARCHAR(20) NOT NULL,
        object_pronoun VARCHAR(20) NOT NULL,
        possessive_adjective VARCHAR(20) NOT NULL,
        possessive_pronoun VARCHAR(20) NOT NULL,
        reflexive_pronoun VARCHAR(20) NOT NULL,
        example_sentence VARCHAR(255),
        is_common BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_pronouns_set ON employee_pronouns(pronoun_set);
      CREATE INDEX IF NOT EXISTS idx_employee_pronouns_common ON employee_pronouns(is_common) WHERE is_common = true;
      CREATE INDEX IF NOT EXISTS idx_employee_pronouns_sort_order ON employee_pronouns(sort_order);
    `);

    console.log('✅ Employee pronouns table created with indexes');

    // Step 2: Analyze existing pronouns data
    console.log('\n📊 Step 2: Analyzing existing pronouns data...');
    const pronounsAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN pronouns IS NOT NULL AND pronouns != '' THEN 1 END) as with_pronouns,
        COUNT(DISTINCT pronouns) as unique_pronouns
      FROM employees
    `);

    const stats = pronounsAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   🏷️ With pronouns: ${stats.with_pronouns}`);
    console.log(`   🔢 Unique pronouns: ${stats.unique_pronouns}`);

    // Get unique pronouns values
    const uniquePronouns = await client.query(`
      SELECT DISTINCT
        pronouns,
        COUNT(*) as employee_count
      FROM employees
      WHERE pronouns IS NOT NULL AND pronouns != ''
      GROUP BY pronouns
      ORDER BY employee_count DESC
    `);

    console.log('\n📋 Found pronouns to create:');
    uniquePronouns.rows.forEach((pronoun, index) => {
      console.log(`   ${index + 1}. ${pronoun.pronouns} (${pronoun.employee_count} employees)`);
    });

    // Step 3: Create comprehensive pronoun records
    console.log('\n🔄 Step 3: Creating comprehensive pronoun records...');

    const pronounDefinitions = [
      // Current pronouns from data plus comprehensive set
      {
        set: 'he/him/his',
        display: 'He/Him/His',
        subject: 'he',
        object: 'him',
        possessiveAdj: 'his',
        possessivePron: 'his',
        reflexive: 'himself',
        example: 'He went to his office to finish his work by himself.',
        isCommon: true,
        order: 1
      },
      {
        set: 'she/her/hers',
        display: 'She/Her/Hers',
        subject: 'she',
        object: 'her',
        possessiveAdj: 'her',
        possessivePron: 'hers',
        reflexive: 'herself',
        example: 'She went to her office to finish her work by herself.',
        isCommon: true,
        order: 2
      },
      {
        set: 'they/them/theirs',
        display: 'They/Them/Theirs',
        subject: 'they',
        object: 'them',
        possessiveAdj: 'their',
        possessivePron: 'theirs',
        reflexive: 'themselves',
        example: 'They went to their office to finish their work by themselves.',
        isCommon: true,
        order: 3
      },
      {
        set: 'ze/zir/zirs',
        display: 'Ze/Zir/Zirs',
        subject: 'ze',
        object: 'zir',
        possessiveAdj: 'zir',
        possessivePron: 'zirs',
        reflexive: 'zirself',
        example: 'Ze went to zir office to finish zir work by zirself.',
        isCommon: false,
        order: 4
      },
      {
        set: 'xe/xem/xyrs',
        display: 'Xe/Xem/Xyrs',
        subject: 'xe',
        object: 'xem',
        possessiveAdj: 'xyr',
        possessivePron: 'xyrs',
        reflexive: 'xemself',
        example: 'Xe went to xyr office to finish xyr work by xemself.',
        isCommon: false,
        order: 5
      },
      {
        set: 'it/its',
        display: 'It/Its',
        subject: 'it',
        object: 'it',
        possessiveAdj: 'its',
        possessivePron: 'its',
        reflexive: 'itself',
        example: 'It went to its office to finish its work by itself.',
        isCommon: false,
        order: 6
      },
      {
        set: 'prefer name',
        display: 'Prefer Name Only',
        subject: '[name]',
        object: '[name]',
        possessiveAdj: '[name]\'s',
        possessivePron: '[name]\'s',
        reflexive: '[name]',
        example: '[Name] went to [Name]\'s office to finish [Name]\'s work.',
        isCommon: false,
        order: 7
      }
    ];

    let pronounCount = 0;
    const pronounMap = new Map();

    for (const pronounDef of pronounDefinitions) {
      // Insert pronoun set
      const insertResult = await client.query(`
        INSERT INTO employee_pronouns (
          pronoun_set, display_name, subject_pronoun, object_pronoun,
          possessive_adjective, possessive_pronoun, reflexive_pronoun,
          example_sentence, is_common, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (pronoun_set) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP,
          display_name = EXCLUDED.display_name,
          subject_pronoun = EXCLUDED.subject_pronoun,
          object_pronoun = EXCLUDED.object_pronoun,
          possessive_adjective = EXCLUDED.possessive_adjective,
          possessive_pronoun = EXCLUDED.possessive_pronoun,
          reflexive_pronoun = EXCLUDED.reflexive_pronoun
        RETURNING id, pronoun_set
      `, [
        pronounDef.set,
        pronounDef.display,
        pronounDef.subject,
        pronounDef.object,
        pronounDef.possessiveAdj,
        pronounDef.possessivePron,
        pronounDef.reflexive,
        pronounDef.example,
        pronounDef.isCommon,
        pronounDef.order
      ]);

      pronounMap.set(pronounDef.set, insertResult.rows[0].id);
      console.log(`   ✅ Created/Updated pronoun set: ${pronounDef.display} (${pronounDef.set})`);
      pronounCount++;
    }

    console.log(`✅ Created/Updated ${pronounCount} pronoun sets`);

    // Step 4: Add pronouns_id column to employees table
    console.log('\n🔧 Step 4: Adding pronouns_id column to employees table...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS pronouns_id UUID REFERENCES employee_pronouns(id)
    `);

    // Create index for the foreign key
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_pronouns_id ON employees(pronouns_id);
    `);

    console.log('✅ Added pronouns_id column with foreign key constraint');

    // Step 5: Migrate existing pronouns data
    console.log('\n🔄 Step 5: Migrating existing pronouns references...');
    const migrationResult = await client.query(`
      UPDATE employees
      SET pronouns_id = ep.id
      FROM employee_pronouns ep
      WHERE ep.pronoun_set = employees.pronouns
      AND employees.pronouns IS NOT NULL
      AND employees.pronouns != ''
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee pronouns references`);

    // Step 6: Verify migration
    console.log('\n🔍 Step 6: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.pronouns as old_pronouns,
        ep.pronoun_set as new_pronouns,
        ep.display_name,
        ep.subject_pronoun,
        ep.object_pronoun,
        ep.example_sentence
      FROM employees e
      LEFT JOIN employee_pronouns ep ON e.pronouns_id = ep.id
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Pronouns migration results for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
      console.log(`      Old: ${row.old_pronouns || 'null'}`);
      console.log(`      New: ${row.display_name || 'No pronouns specified'} (${row.new_pronouns || 'N/A'})`);
      if (row.subject_pronoun) {
        console.log(`      Example: ${row.example_sentence || 'N/A'}`);
      }
    });

    // Step 7: Show created pronoun sets
    const finalPronouns = await client.query(`
      SELECT
        ep.pronoun_set,
        ep.display_name,
        ep.subject_pronoun,
        ep.object_pronoun,
        ep.possessive_adjective,
        ep.is_common,
        COUNT(e.id) as employee_count
      FROM employee_pronouns ep
      LEFT JOIN employees e ON ep.id = e.pronouns_id
      GROUP BY ep.id, ep.pronoun_set, ep.display_name, ep.subject_pronoun, ep.object_pronoun, ep.possessive_adjective, ep.is_common
      ORDER BY ep.sort_order
    `);

    console.log('\n📋 Final pronoun sets created:');
    finalPronouns.rows.forEach((pronoun, index) => {
      const commonFlag = pronoun.is_common ? '⭐' : '  ';
      console.log(`   ${commonFlag} ${index + 1}. ${pronoun.display_name} (${pronoun.pronoun_set}) - ${pronoun.employee_count} employees`);
      console.log(`      Subject: ${pronoun.subject_pronoun}, Object: ${pronoun.object_pronoun}, Possessive: ${pronoun.possessive_adjective}`);
    });

    console.log('\n🎉 Employee pronouns normalization completed successfully!');
    console.log('   ✅ Created normalized employee_pronouns table');
    console.log('   ✅ Created comprehensive pronoun sets with grammar rules');
    console.log('   ✅ Added pronouns_id foreign key to employees table');
    console.log('   ✅ Migrated existing pronouns data');
    console.log('   ✅ Added example sentences for proper usage');
    console.log('\n🚨 IMPORTANT: Do not drop pronouns column from employees table yet!');
    console.log('   Backend code must be updated to use employee_pronouns table first.');

  } catch (error) {
    console.error('❌ Error during employee pronouns normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeEmployeePronouns();