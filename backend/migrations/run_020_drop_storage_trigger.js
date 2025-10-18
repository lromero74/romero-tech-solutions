import { query } from '../config/database.js';

/**
 * Migration 020: Drop asset_storage_devices trigger
 *
 * The trigger update_asset_updated_at() references a non-existent 'updated_at' column.
 * The table uses 'last_scanned_at' instead, which is already managed by application code.
 * This trigger causes errors and is unnecessary.
 */

export async function up() {
  console.log('Running migration 020: Drop asset_storage_devices trigger');

  try {
    // Drop the trigger on asset_storage_devices
    // The trigger tries to set 'updated_at' which doesn't exist (table uses 'last_scanned_at')
    // Application code already handles last_scanned_at in INSERT/UPDATE queries
    await query(`
      DROP TRIGGER IF EXISTS asset_storage_updated_at ON asset_storage_devices;
    `);
    console.log('✓ Dropped trigger: asset_storage_updated_at on asset_storage_devices');

    // Also drop the trigger on asset_hardware_inventory for the same reason
    // (it has 'last_updated_at' not 'updated_at')
    await query(`
      DROP TRIGGER IF EXISTS asset_hardware_updated_at ON asset_hardware_inventory;
    `);
    console.log('✓ Dropped trigger: asset_hardware_updated_at on asset_hardware_inventory');

    // Keep the function - it's still used by other tables (asset_licenses, asset_network_devices, asset_warranties)

    console.log('✅ Migration 020 completed successfully');
  } catch (error) {
    console.error('❌ Migration 020 failed:', error);
    throw error;
  }
}

export async function down() {
  console.log('Rolling back migration 020: Recreate triggers');

  try {
    // Recreate the trigger on asset_storage_devices
    await query(`
      CREATE TRIGGER asset_storage_updated_at
      BEFORE UPDATE ON asset_storage_devices
      FOR EACH ROW
      EXECUTE FUNCTION update_asset_updated_at();
    `);
    console.log('✓ Recreated trigger: asset_storage_updated_at on asset_storage_devices');

    // Recreate the trigger on asset_hardware_inventory
    await query(`
      CREATE TRIGGER asset_hardware_updated_at
      BEFORE UPDATE ON asset_hardware_inventory
      FOR EACH ROW
      EXECUTE FUNCTION update_asset_updated_at();
    `);
    console.log('✓ Recreated trigger: asset_hardware_updated_at on asset_hardware_inventory');

    console.log('✅ Migration 020 rollback completed');
  } catch (error) {
    console.error('❌ Migration 020 rollback failed:', error);
    throw error;
  }
}
