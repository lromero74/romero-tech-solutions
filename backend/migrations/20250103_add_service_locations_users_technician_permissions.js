/**
 * Migration: Add Service Locations and Users (Clients) permissions for technician role
 *
 * This migration grants technicians the same level of access to Service Locations and Clients
 * as they have for Businesses:
 * - Can view service locations and clients
 * - Can modify service locations and clients
 * - CANNOT view soft deleted items
 * - CANNOT view stats
 * - CANNOT soft delete or hard delete
 *
 * Created: 2025-01-03
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Add Service Locations and Users technician permissions...');

  try {
    // Start transaction
    await pool.query('BEGIN');

    // 1. Create view.soft_deleted_service_locations.enable permission (exec/admin/sales only)
    const softDeletedLocationsResult = await pool.query(`
      INSERT INTO permissions (permission_key, resource_type, action_type, description)
      VALUES (
        'view.soft_deleted_service_locations.enable',
        'service_locations',
        'view_soft_deleted',
        'Permission to view soft-deleted service locations (Executive, Admin, Sales only)'
      )
      ON CONFLICT (permission_key) DO NOTHING
      RETURNING id;
    `);

    const softDeletedLocationsPermissionId = softDeletedLocationsResult.rows[0]?.id;
    if (softDeletedLocationsPermissionId) {
      console.log('✅ Created permission: view.soft_deleted_service_locations.enable');

      // Grant to executive, admin, sales
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name IN ('executive', 'admin', 'sales')
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [softDeletedLocationsPermissionId]);
      console.log('✅ Granted view.soft_deleted_service_locations.enable to executive, admin, sales');
    } else {
      console.log('ℹ️  Permission view.soft_deleted_service_locations.enable already exists');
    }

    // 2. Create view.soft_deleted_users.enable permission (exec/admin/sales only)
    const softDeletedUsersResult = await pool.query(`
      INSERT INTO permissions (permission_key, resource_type, action_type, description)
      VALUES (
        'view.soft_deleted_users.enable',
        'users',
        'view_soft_deleted',
        'Permission to view soft-deleted users/clients (Executive, Admin, Sales only)'
      )
      ON CONFLICT (permission_key) DO NOTHING
      RETURNING id;
    `);

    const softDeletedUsersPermissionId = softDeletedUsersResult.rows[0]?.id;
    if (softDeletedUsersPermissionId) {
      console.log('✅ Created permission: view.soft_deleted_users.enable');

      // Grant to executive, admin, sales
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name IN ('executive', 'admin', 'sales')
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [softDeletedUsersPermissionId]);
      console.log('✅ Granted view.soft_deleted_users.enable to executive, admin, sales');
    } else {
      console.log('ℹ️  Permission view.soft_deleted_users.enable already exists');
    }

    // 3. Grant technician basic view permission for service locations
    const viewLocationsResult = await pool.query(`
      SELECT id FROM permissions WHERE permission_key = 'view.service_locations.enable';
    `);

    if (viewLocationsResult.rows.length > 0) {
      const viewLocationsPermissionId = viewLocationsResult.rows[0].id;
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name = 'technician'
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [viewLocationsPermissionId]);
      console.log('✅ Granted view.service_locations.enable to technician');
    }

    // 4. Grant technician modify permission for service locations
    const modifyLocationsResult = await pool.query(`
      SELECT id FROM permissions WHERE permission_key = 'modify.service_locations.enable';
    `);

    if (modifyLocationsResult.rows.length > 0) {
      const modifyLocationsPermissionId = modifyLocationsResult.rows[0].id;
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name = 'technician'
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [modifyLocationsPermissionId]);
      console.log('✅ Granted modify.service_locations.enable to technician');
    }

    // 5. Grant technician basic view permission for users (clients)
    const viewUsersResult = await pool.query(`
      SELECT id FROM permissions WHERE permission_key = 'view.users.enable';
    `);

    if (viewUsersResult.rows.length === 0) {
      // Create the permission if it doesn't exist
      const createViewUsersResult = await pool.query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description)
        VALUES (
          'view.users.enable',
          'users',
          'view',
          'Permission to view users/clients'
        )
        RETURNING id;
      `);
      const viewUsersPermissionId = createViewUsersResult.rows[0].id;
      console.log('✅ Created permission: view.users.enable');

      // Grant to all roles
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [viewUsersPermissionId]);
      console.log('✅ Granted view.users.enable to all roles');
    } else {
      const viewUsersPermissionId = viewUsersResult.rows[0].id;
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name = 'technician'
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [viewUsersPermissionId]);
      console.log('✅ Granted view.users.enable to technician');
    }

    // 6. Grant technician modify permission for users (clients)
    const modifyUsersResult = await pool.query(`
      SELECT id FROM permissions WHERE permission_key = 'modify.users.enable';
    `);

    if (modifyUsersResult.rows.length > 0) {
      const modifyUsersPermissionId = modifyUsersResult.rows[0].id;
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name = 'technician'
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [modifyUsersPermissionId]);
      console.log('✅ Granted modify.users.enable to technician');
    }

    // Commit transaction
    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully: Service Locations and Users technician permissions added');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function down(pool) {
  console.log('🔄 Starting rollback: Remove Service Locations and Users technician permissions...');

  try {
    await pool.query('BEGIN');

    // Remove view.soft_deleted_service_locations.enable permission
    await pool.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE permission_key = 'view.soft_deleted_service_locations.enable'
      );
    `);

    await pool.query(`
      DELETE FROM permissions WHERE permission_key = 'view.soft_deleted_service_locations.enable';
    `);
    console.log('✅ Removed permission: view.soft_deleted_service_locations.enable');

    // Remove view.soft_deleted_users.enable permission
    await pool.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE permission_key = 'view.soft_deleted_users.enable'
      );
    `);

    await pool.query(`
      DELETE FROM permissions WHERE permission_key = 'view.soft_deleted_users.enable';
    `);
    console.log('✅ Removed permission: view.soft_deleted_users.enable');

    // Remove technician grants for service locations
    await pool.query(`
      DELETE FROM role_permissions
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key IN ('view.service_locations.enable', 'modify.service_locations.enable')
      );
    `);
    console.log('✅ Removed technician grants for service locations');

    // Remove technician grants for users
    await pool.query(`
      DELETE FROM role_permissions
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key IN ('view.users.enable', 'modify.users.enable')
      );
    `);
    console.log('✅ Removed technician grants for users');

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
