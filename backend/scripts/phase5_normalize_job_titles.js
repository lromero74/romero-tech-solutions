import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeJobTitles() {
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

    console.log('🏢 Starting Job Titles Normalization (Phase 5A)...');
    console.log('   Moving job title data from employees table to normalized employee_job_titles table');

    // Step 1: Create employee_job_titles table
    console.log('\n📋 Step 1: Creating employee_job_titles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_job_titles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        level INTEGER DEFAULT 1,
        department_id UUID REFERENCES departments(id),
        salary_min NUMERIC(10,2),
        salary_max NUMERIC(10,2),
        is_active BOOLEAN DEFAULT true,
        requires_degree BOOLEAN DEFAULT false,
        years_experience_min INTEGER DEFAULT 0,
        years_experience_max INTEGER,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_job_titles_title ON employee_job_titles(title);
      CREATE INDEX IF NOT EXISTS idx_employee_job_titles_active ON employee_job_titles(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_employee_job_titles_level ON employee_job_titles(level);
      CREATE INDEX IF NOT EXISTS idx_employee_job_titles_department ON employee_job_titles(department_id);
      CREATE INDEX IF NOT EXISTS idx_employee_job_titles_sort_order ON employee_job_titles(sort_order);
    `);

    console.log('✅ Employee job titles table created with indexes');

    // Step 2: Analyze existing job title data
    console.log('\n📊 Step 2: Analyzing existing job title data...');
    const jobTitleAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN job_title IS NOT NULL AND job_title != '' THEN 1 END) as with_job_title,
        COUNT(DISTINCT job_title) as unique_job_titles
      FROM employees
    `);

    const stats = jobTitleAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   🏢 With job title: ${stats.with_job_title}`);
    console.log(`   🔢 Unique job titles: ${stats.unique_job_titles}`);

    // Get unique job title values
    const uniqueJobTitles = await client.query(`
      SELECT DISTINCT
        job_title,
        COUNT(*) as employee_count
      FROM employees
      WHERE job_title IS NOT NULL AND job_title != ''
      GROUP BY job_title
      ORDER BY employee_count DESC
    `);

    console.log('\n📋 Found job titles to create:');
    uniqueJobTitles.rows.forEach((title, index) => {
      console.log(`   ${index + 1}. ${title.job_title} (${title.employee_count} employees)`);
    });

    // Step 3: Create job title records
    console.log('\n🔄 Step 3: Creating job title records...');
    let jobTitleCount = 0;
    const jobTitleMap = new Map();

    for (const titleRow of uniqueJobTitles.rows) {
      const jobTitle = titleRow.job_title;

      // Determine level based on title (basic heuristics)
      let level = 1;
      let salaryMin = null;
      let salaryMax = null;
      let requiresDegree = false;
      let yearsExpMin = 0;

      if (jobTitle.toLowerCase().includes('president') || jobTitle.toLowerCase().includes('ceo')) {
        level = 10;
        salaryMin = 150000;
        salaryMax = 500000;
        requiresDegree = true;
        yearsExpMin = 10;
      } else if (jobTitle.toLowerCase().includes('director') || jobTitle.toLowerCase().includes('vp')) {
        level = 8;
        salaryMin = 120000;
        salaryMax = 250000;
        requiresDegree = true;
        yearsExpMin = 8;
      } else if (jobTitle.toLowerCase().includes('manager') || jobTitle.toLowerCase().includes('lead')) {
        level = 6;
        salaryMin = 80000;
        salaryMax = 150000;
        requiresDegree = true;
        yearsExpMin = 5;
      } else if (jobTitle.toLowerCase().includes('senior')) {
        level = 5;
        salaryMin = 70000;
        salaryMax = 120000;
        requiresDegree = false;
        yearsExpMin = 3;
      } else if (jobTitle.toLowerCase().includes('junior')) {
        level = 2;
        salaryMin = 40000;
        salaryMax = 65000;
        requiresDegree = false;
        yearsExpMin = 0;
      }

      // Insert job title
      const insertResult = await client.query(`
        INSERT INTO employee_job_titles (
          title, description, level, salary_min, salary_max,
          is_active, requires_degree, years_experience_min, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (title) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP,
          level = EXCLUDED.level,
          salary_min = EXCLUDED.salary_min,
          salary_max = EXCLUDED.salary_max
        RETURNING id, title
      `, [
        jobTitle,
        `${jobTitle} position`,
        level,
        salaryMin,
        salaryMax,
        true,
        requiresDegree,
        yearsExpMin,
        jobTitleCount
      ]);

      jobTitleMap.set(jobTitle, insertResult.rows[0].id);
      console.log(`   ✅ Created/Updated job title: ${jobTitle} (Level ${level})`);
      jobTitleCount++;
    }

    console.log(`✅ Created/Updated ${jobTitleCount} job titles`);

    // Step 4: Add job_title_id column to employees table
    console.log('\n🔧 Step 4: Adding job_title_id column to employees table...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES employee_job_titles(id)
    `);

    // Create index for the foreign key
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_job_title_id ON employees(job_title_id);
    `);

    console.log('✅ Added job_title_id column with foreign key constraint');

    // Step 5: Migrate existing job title data
    console.log('\n🔄 Step 5: Migrating existing job title references...');
    const migrationResult = await client.query(`
      UPDATE employees
      SET job_title_id = jt.id
      FROM employee_job_titles jt
      WHERE jt.title = employees.job_title
      AND employees.job_title IS NOT NULL
      AND employees.job_title != ''
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee job title references`);

    // Step 6: Verify migration
    console.log('\n🔍 Step 6: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.job_title as old_job_title,
        jt.title as new_job_title,
        jt.level,
        jt.salary_min,
        jt.salary_max
      FROM employees e
      LEFT JOIN employee_job_titles jt ON e.job_title_id = jt.id
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Job title migration results for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
      console.log(`      Old: ${row.old_job_title || 'null'}`);
      console.log(`      New: ${row.new_job_title || 'No job title assigned'} (Level ${row.level || 'N/A'})`);
      if (row.salary_min || row.salary_max) {
        console.log(`      Salary Range: $${row.salary_min || 'N/A'} - $${row.salary_max || 'N/A'}`);
      }
    });

    // Step 7: Show created job titles
    const finalJobTitles = await client.query(`
      SELECT
        jt.title,
        jt.level,
        jt.salary_min,
        jt.salary_max,
        jt.requires_degree,
        jt.years_experience_min,
        COUNT(e.id) as employee_count
      FROM employee_job_titles jt
      LEFT JOIN employees e ON jt.id = e.job_title_id
      GROUP BY jt.id, jt.title, jt.level, jt.salary_min, jt.salary_max, jt.requires_degree, jt.years_experience_min
      ORDER BY jt.sort_order, jt.level DESC, jt.title
    `);

    console.log('\n📋 Final job titles created:');
    finalJobTitles.rows.forEach((title, index) => {
      console.log(`   ${index + 1}. ${title.title} - ${title.employee_count} employees`);
      console.log(`      Level: ${title.level}, Experience: ${title.years_experience_min}+ years`);
      console.log(`      Salary: $${title.salary_min || 'N/A'} - $${title.salary_max || 'N/A'}`);
      console.log(`      Degree Required: ${title.requires_degree ? 'Yes' : 'No'}`);
    });

    console.log('\n🎉 Job titles normalization completed successfully!');
    console.log('   ✅ Created normalized employee_job_titles table');
    console.log('   ✅ Created performance indexes');
    console.log('   ✅ Added job_title_id foreign key to employees table');
    console.log('   ✅ Migrated existing job title data with metadata');
    console.log('   ✅ Added salary ranges and experience requirements');
    console.log('\n🚨 IMPORTANT: Do not drop job_title column from employees table yet!');
    console.log('   Backend code must be updated to use employee_job_titles table first.');

  } catch (error) {
    console.error('❌ Error during job titles normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeJobTitles();