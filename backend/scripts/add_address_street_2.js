import { query, closePool } from '../config/database.js';

async function addAddressStreet2Column() {
  try {
    console.log('🔄 Adding address_street_2 column to employees table...');

    // Check if column already exists
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employees'
        AND column_name = 'address_street_2'
    `;

    const existingColumn = await query(checkColumnQuery);

    if (existingColumn.rows.length > 0) {
      console.log('⚠️ Column address_street_2 already exists');
      return;
    }

    // Add the new column
    const addColumnQuery = `
      ALTER TABLE employees
      ADD COLUMN address_street_2 VARCHAR(255)
    `;

    await query(addColumnQuery);
    console.log('✅ Successfully added address_street_2 column to employees table');

    // Verify the column was added
    const verifyQuery = `
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employees'
        AND column_name = 'address_street_2'
    `;

    const result = await query(verifyQuery);
    console.log('📋 Column details:', result.rows[0]);

  } catch (error) {
    console.error('❌ Error adding address_street_2 column:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run the migration
addAddressStreet2Column()
  .then(() => {
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });