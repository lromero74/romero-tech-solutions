import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkBusinessColumns() {
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

    console.log('🔍 Checking businesses table columns...\n');

    const result = await client.query(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'businesses'
      ORDER BY ordinal_position
    `);

    console.log('Businesses table structure:');
    console.log('============================');

    result.rows.forEach(column => {
      let type = column.data_type;
      if (column.character_maximum_length) {
        type += `(${column.character_maximum_length})`;
      }
      console.log(`${column.column_name}: ${type} ${column.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${column.column_default ? `DEFAULT ${column.column_default}` : ''}`);
    });

    // Check specifically for any VARCHAR(500) columns
    const varchar500 = result.rows.filter(col =>
      col.data_type === 'character varying' &&
      col.character_maximum_length === 500
    );

    if (varchar500.length > 0) {
      console.log('\n⚠️  Found VARCHAR(500) columns that might be too small for base64 images:');
      varchar500.forEach(col => {
        console.log(`  - ${col.column_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkBusinessColumns();