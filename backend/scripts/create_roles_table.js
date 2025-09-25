import { query, closePool } from '../config/database.js';

async function createRolesTable() {
  try {
    console.log('🔄 Creating roles table...');

    // Create the roles table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        text_color VARCHAR(20) NOT NULL DEFAULT '#000000',
        background_color VARCHAR(20) NOT NULL DEFAULT '#f3f4f6',
        border_color VARCHAR(20) NOT NULL DEFAULT '#d1d5db',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await query(createTableQuery);
    console.log('✅ Roles table created successfully');

    // Insert default roles
    console.log('🔄 Inserting default roles...');

    const insertRolesQuery = `
      INSERT INTO roles (name, display_name, description, text_color, background_color, border_color, sort_order)
      VALUES
        ('admin', 'Administrator', 'Full system access and user management', '#dc2626', '#fef2f2', '#fecaca', 1),
        ('technician', 'Technician', 'Technical service provider', '#2563eb', '#eff6ff', '#bfdbfe', 2),
        ('sales', 'Sales', 'Sales and customer relations', '#059669', '#ecfdf5', '#a7f3d0', 3)
      ON CONFLICT (name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        text_color = EXCLUDED.text_color,
        background_color = EXCLUDED.background_color,
        border_color = EXCLUDED.border_color,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP
    `;

    await query(insertRolesQuery);
    console.log('✅ Default roles inserted successfully');

    // Create indexes
    const createIndexesQuery = `
      CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
      CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles(is_active);
      CREATE INDEX IF NOT EXISTS idx_roles_sort_order ON roles(sort_order);
    `;

    await query(createIndexesQuery);
    console.log('✅ Indexes created successfully');

    // Verify the data
    const verifyQuery = `SELECT * FROM roles ORDER BY sort_order`;
    const result = await query(verifyQuery);

    console.log('\n📋 Roles created:');
    result.rows.forEach(role => {
      console.log(`  ${role.name}: ${role.display_name} (${role.text_color} on ${role.background_color})`);
    });

    console.log(`\nTotal roles: ${result.rows.length}`);

  } catch (error) {
    console.error('❌ Error creating roles table:', error);
    throw error;
  } finally {
    await closePool();
  }
}

createRolesTable();