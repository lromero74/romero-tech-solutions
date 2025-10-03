import { getPool } from './config/database.js';

async function addServiceRequestPermissions() {
  const pool = await getPool();

  try {
    console.log('Adding service request permissions...');

    // Define the permissions to add
    const permissions = [
      {
        key: 'complete.service_requests.enable',
        resource: 'service_requests',
        action: 'complete',
        description: 'Complete any service request regardless of assignment'
      },
      {
        key: 'complete.assigned_service_requests.enable',
        resource: 'service_requests',
        action: 'complete',
        description: 'Complete service requests assigned to you'
      },
      {
        key: 'assume_ownership.service_requests.enable',
        resource: 'service_requests',
        action: 'assume_ownership',
        description: 'Assume ownership of service requests from other technicians'
      }
    ];

    // Insert permissions
    for (const perm of permissions) {
      const existingPerm = await pool.query(
        'SELECT id FROM permissions WHERE permission_key = $1',
        [perm.key]
      );

      if (existingPerm.rows.length > 0) {
        console.log(`  ✓ Permission already exists: ${perm.key}`);
        continue;
      }

      const result = await pool.query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [perm.key, perm.resource, perm.action, perm.description]);

      console.log(`  ✓ Created permission: ${perm.key} (${result.rows[0].id})`);
    }

    console.log('\n📋 Assigning permissions to roles...');

    // Get role IDs
    const rolesResult = await pool.query('SELECT id, name FROM roles');
    const roles = rolesResult.rows.reduce((acc, row) => {
      acc[row.name.toLowerCase()] = row.id;
      return acc;
    }, {});

    // Get permission IDs
    const permsResult = await pool.query(`
      SELECT id, permission_key FROM permissions
      WHERE permission_key IN (
        'complete.service_requests.enable',
        'complete.assigned_service_requests.enable',
        'assume_ownership.service_requests.enable'
      )
    `);
    const permIds = permsResult.rows.reduce((acc, row) => {
      acc[row.permission_key] = row.id;
      return acc;
    }, {});

    // Grant permissions to roles
    const grants = [
      // Executive can complete any request and assume ownership
      { role: 'executive', permission: 'complete.service_requests.enable', granted: true },
      { role: 'executive', permission: 'assume_ownership.service_requests.enable', granted: true },

      // Admin can complete any request and assume ownership
      { role: 'admin', permission: 'complete.service_requests.enable', granted: true },
      { role: 'admin', permission: 'assume_ownership.service_requests.enable', granted: true },

      // Manager can complete any request and assume ownership
      { role: 'manager', permission: 'complete.service_requests.enable', granted: true },
      { role: 'manager', permission: 'assume_ownership.service_requests.enable', granted: true },

      // Technician can only complete assigned requests and assume ownership
      { role: 'technician', permission: 'complete.assigned_service_requests.enable', granted: true },
      { role: 'technician', permission: 'assume_ownership.service_requests.enable', granted: true }
    ];

    for (const grant of grants) {
      const roleId = roles[grant.role];
      const permId = permIds[grant.permission];

      if (!roleId || !permId) {
        console.log(`  ⚠️  Skipping grant - role or permission not found: ${grant.role} -> ${grant.permission}`);
        continue;
      }

      const existing = await pool.query(
        'SELECT id FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
        [roleId, permId]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE role_permissions SET is_granted = $1, updated_at = CURRENT_TIMESTAMP WHERE role_id = $2 AND permission_id = $3',
          [grant.granted, roleId, permId]
        );
        console.log(`  ✓ Updated: ${grant.role} -> ${grant.permission}`);
      } else {
        await pool.query(
          'INSERT INTO role_permissions (role_id, permission_id, is_granted, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [roleId, permId, grant.granted]
        );
        console.log(`  ✓ Granted: ${grant.role} -> ${grant.permission}`);
      }
    }

    console.log('\n✅ Service request permissions added successfully!');

  } catch (error) {
    console.error('❌ Error adding service request permissions:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addServiceRequestPermissions();
