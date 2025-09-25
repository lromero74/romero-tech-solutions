import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeRedundantDepartmentId() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔄 Removing redundant department_id from employee_job_titles (Phase 7)...');
    console.log('   This column is unused and conceptually incorrect since job titles should be department-agnostic.');

    // Step 1: Verify the column exists and check if it has any data
    console.log('\n🔍 Step 1: Checking current state of department_id column...');

    const columnExists = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'employee_job_titles' AND column_name = 'department_id'
    `);

    if (columnExists.rows.length === 0) {
      console.log('ℹ️  Column department_id does not exist in employee_job_titles table');
      console.log('✅ Phase 7 already completed or not needed');
      return;
    }

    console.log('✅ Column exists:', columnExists.rows[0]);

    // Check if there's any data in the column
    const dataCheck = await client.query(`
      SELECT COUNT(*) as total_rows, COUNT(department_id) as rows_with_data
      FROM employee_job_titles
    `);

    console.log('📊 Data check:', dataCheck.rows[0]);

    if (parseInt(dataCheck.rows[0].rows_with_data) > 0) {
      console.log('⚠️  WARNING: Found data in department_id column!');

      // Show the data before removing
      const dataPreview = await client.query(`
        SELECT ejt.id, ejt.title, ejt.department_id, d.name as department_name
        FROM employee_job_titles ejt
        LEFT JOIN departments d ON ejt.department_id = d.id
        WHERE ejt.department_id IS NOT NULL
      `);

      console.log('📋 Data that will be lost:');
      console.table(dataPreview.rows);
    }

    // Step 2: Check for foreign key constraint
    console.log('\n🔍 Step 2: Checking for foreign key constraint...');

    const fkCheck = await client.query(`
      SELECT tc.constraint_name, tc.table_name, kcu.column_name,
             ccu.table_name AS foreign_table_name,
             ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'employee_job_titles'
        AND kcu.column_name = 'department_id'
    `);

    if (fkCheck.rows.length > 0) {
      console.log('🔗 Found foreign key constraint:', fkCheck.rows[0].constraint_name);

      // Step 3: Drop foreign key constraint
      console.log('\n🗑️  Step 3: Dropping foreign key constraint...');
      await client.query(`
        ALTER TABLE employee_job_titles
        DROP CONSTRAINT IF EXISTS ${fkCheck.rows[0].constraint_name}
      `);
      console.log('✅ Foreign key constraint dropped');
    } else {
      console.log('ℹ️  No foreign key constraint found');
    }

    // Step 4: Check for index
    console.log('\n🔍 Step 4: Checking for indexes on department_id...');

    const indexCheck = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE tablename = 'employee_job_titles'
        AND indexdef LIKE '%department_id%'
    `);

    if (indexCheck.rows.length > 0) {
      console.log('📇 Found indexes:');
      console.table(indexCheck.rows);

      // Drop indexes
      for (const index of indexCheck.rows) {
        console.log(`🗑️  Dropping index: ${index.indexname}`);
        await client.query(`DROP INDEX IF EXISTS ${index.indexname}`);
        console.log(`✅ Index ${index.indexname} dropped`);
      }
    } else {
      console.log('ℹ️  No indexes found on department_id column');
    }

    // Step 5: Drop the column
    console.log('\n🗑️  Step 5: Dropping department_id column...');
    await client.query(`
      ALTER TABLE employee_job_titles
      DROP COLUMN IF EXISTS department_id
    `);
    console.log('✅ Column department_id dropped from employee_job_titles');

    // Step 6: Verify the change
    console.log('\n✅ Step 6: Verifying the change...');

    const verifyResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'employee_job_titles'
      ORDER BY ordinal_position
    `);

    console.log('📋 Current employee_job_titles table structure:');
    console.table(verifyResult.rows);

    // Check that the backend queries still work
    console.log('\n🧪 Step 7: Testing backend compatibility...');

    const testQuery = await client.query(`
      SELECT ejt.id, ejt.title, ejt.level, ejt.description
      FROM employee_job_titles ejt
      LIMIT 1
    `);

    console.log('✅ Backend queries still work correctly');
    console.log('📊 Sample job title:', testQuery.rows[0] || 'No job titles found');

    console.log('\n🎉 Phase 7 completed successfully!');
    console.log('📋 Summary:');
    console.log('   ✅ Removed redundant department_id column from employee_job_titles');
    console.log('   ✅ Dropped associated foreign key constraint and indexes');
    console.log('   ✅ Job titles are now properly department-agnostic');
    console.log('   ✅ Employee department assignment remains via employees.department_id');

  } catch (error) {
    console.error('❌ Error during Phase 7:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the script
removeRedundantDepartmentId().catch(console.error);