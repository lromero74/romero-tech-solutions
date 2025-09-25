import { query } from '../config/database.js';

async function addOtherLeaveColumn() {
  console.log('🔧 Adding is_on_other_leave column to employees table...');

  try {
    // Add is_on_other_leave column
    console.log('Adding is_on_other_leave column...');
    await query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS is_on_other_leave BOOLEAN DEFAULT false
    `);
    console.log('✅ is_on_other_leave column added successfully');

    // Verify the column was added
    const result = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'employees'
      AND column_name IN ('is_on_vacation', 'is_out_sick', 'is_on_other_leave')
      ORDER BY ordinal_position
    `);

    console.log('📋 Current leave status columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });

    console.log('✅ Database migration completed successfully');
  } catch (error) {
    console.error('❌ Error adding other leave column:', error);
    throw error;
  }
}

// Run the migration
addOtherLeaveColumn()
  .then(() => {
    console.log('🎉 Migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });