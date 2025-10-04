/**
 * Migration: Add notification permissions for RBAC
 * Date: 2025-10-04
 * Purpose: Add permissions for receiving push notifications instead of hardcoded role checks
 */

export async function up(pool) {
  console.log('🔄 Starting migration: Add notification permissions...');

  try {
    await pool.query('BEGIN');

    // Create notification permissions
    const permissions = [
      {
        name: 'receive.notifications.new_client_signup',
        display_name: 'Receive New Client Signup Notifications',
        description: 'Allows receiving push notifications when new clients sign up',
        category: 'notifications',
        resource_type: 'notification',
        action: 'receive',
        is_system: true
      },
      {
        name: 'receive.notifications.new_service_request',
        display_name: 'Receive New Service Request Notifications',
        description: 'Allows receiving push notifications for new service requests',
        category: 'notifications',
        resource_type: 'notification',
        action: 'receive',
        is_system: true
      },
      {
        name: 'receive.notifications.service_request_updated',
        display_name: 'Receive Service Request Update Notifications',
        description: 'Allows receiving push notifications when service requests are updated',
        category: 'notifications',
        resource_type: 'notification',
        action: 'receive',
        is_system: true
      },
      {
        name: 'receive.notifications.invoice_created',
        display_name: 'Receive Invoice Created Notifications',
        description: 'Allows receiving push notifications when invoices are created',
        category: 'notifications',
        resource_type: 'notification',
        action: 'receive',
        is_system: true
      },
      {
        name: 'receive.notifications.invoice_paid',
        display_name: 'Receive Invoice Paid Notifications',
        description: 'Allows receiving push notifications when invoices are paid',
        category: 'notifications',
        resource_type: 'notification',
        action: 'receive',
        is_system: true
      }
    ];

    // Insert permissions
    for (const perm of permissions) {
      await pool.query(`
        INSERT INTO permissions (
          name, display_name, description, category,
          resource_type, action, is_system, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (name) DO NOTHING
      `, [
        perm.name, perm.display_name, perm.description,
        perm.category, perm.resource_type, perm.action, perm.is_system
      ]);
    }

    console.log('✅ Created notification permissions');

    // Get role IDs
    const roleQuery = await pool.query(`
      SELECT id, name FROM roles WHERE name IN ('admin', 'manager', 'executive', 'technician')
    `);

    const roles = {};
    roleQuery.rows.forEach(row => {
      roles[row.name] = row.id;
    });

    // Grant notification permissions to roles
    const rolePermissions = [
      // Admin gets all notification permissions
      { role: 'admin', permission: 'receive.notifications.new_client_signup' },
      { role: 'admin', permission: 'receive.notifications.new_service_request' },
      { role: 'admin', permission: 'receive.notifications.service_request_updated' },
      { role: 'admin', permission: 'receive.notifications.invoice_created' },
      { role: 'admin', permission: 'receive.notifications.invoice_paid' },

      // Manager gets all notification permissions
      { role: 'manager', permission: 'receive.notifications.new_client_signup' },
      { role: 'manager', permission: 'receive.notifications.new_service_request' },
      { role: 'manager', permission: 'receive.notifications.service_request_updated' },
      { role: 'manager', permission: 'receive.notifications.invoice_created' },
      { role: 'manager', permission: 'receive.notifications.invoice_paid' },

      // Executive gets business-related notifications
      { role: 'executive', permission: 'receive.notifications.new_client_signup' },
      { role: 'executive', permission: 'receive.notifications.new_service_request' },
      { role: 'executive', permission: 'receive.notifications.invoice_created' },
      { role: 'executive', permission: 'receive.notifications.invoice_paid' },

      // Technician gets service request notifications
      { role: 'technician', permission: 'receive.notifications.new_service_request' },
      { role: 'technician', permission: 'receive.notifications.service_request_updated' }
    ];

    // Grant permissions to roles
    for (const rp of rolePermissions) {
      if (roles[rp.role]) {
        await pool.query(`
          INSERT INTO role_permissions (role_id, permission_id, is_granted)
          SELECT $1, p.id, true
          FROM permissions p
          WHERE p.name = $2
          ON CONFLICT (role_id, permission_id)
          DO UPDATE SET is_granted = true, updated_at = NOW()
        `, [roles[rp.role], rp.permission]);
      }
    }

    console.log('✅ Granted notification permissions to roles');

    await pool.query('COMMIT');
    console.log('✅ Notification permissions migration completed successfully');
    return { success: true };

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error adding notification permissions:', error);
    throw error;
  }
}

export async function down(pool) {
  console.log('🔄 Rolling back notification permissions...');

  try {
    await pool.query('BEGIN');

    // Remove role permissions
    await pool.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name LIKE 'receive.notifications.%'
      )
    `);

    // Remove permissions
    await pool.query(`
      DELETE FROM permissions
      WHERE name LIKE 'receive.notifications.%'
    `);

    await pool.query('COMMIT');
    console.log('✅ Notification permissions rolled back successfully');
    return { success: true };

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error rolling back notification permissions:', error);
    throw error;
  }
}