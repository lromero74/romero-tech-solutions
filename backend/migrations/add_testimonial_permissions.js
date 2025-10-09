import { getPool } from '../config/database.js';

async function addTestimonialPermissions() {
  const pool = await getPool();

  try {
    console.log('🔐 Adding testimonial and rating question permissions...');

    // Start transaction
    await pool.query('BEGIN');

    // Define permissions to add
    const permissions = [
      {
        key: 'view.testimonials.enable',
        resource: 'testimonials',
        action: 'view',
        description: 'View client testimonials and ratings'
      },
      {
        key: 'approve.testimonials.enable',
        resource: 'testimonials',
        action: 'approve',
        description: 'Approve, edit, and unapprove client testimonials'
      },
      {
        key: 'delete.testimonials.enable',
        resource: 'testimonials',
        action: 'delete',
        description: 'Delete client testimonials'
      },
      {
        key: 'view.rating_questions.enable',
        resource: 'rating_questions',
        action: 'view',
        description: 'View rating questions configuration'
      },
      {
        key: 'manage.rating_questions.enable',
        resource: 'rating_questions',
        action: 'manage',
        description: 'Create, edit, and manage rating questions'
      }
    ];

    // Insert permissions
    for (const perm of permissions) {
      const result = await pool.query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (permission_key) DO UPDATE
        SET
          resource_type = EXCLUDED.resource_type,
          action_type = EXCLUDED.action_type,
          description = EXCLUDED.description
        RETURNING id, permission_key
      `, [perm.key, perm.resource, perm.action, perm.description]);

      console.log(`✅ Added permission: ${perm.key}`);
    }

    // Grant permissions to executive and admin roles
    const rolesQuery = await pool.query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin')
    `);

    for (const role of rolesQuery.rows) {
      // Grant all testimonial and rating question permissions to executives and admins
      for (const perm of permissions) {
        await pool.query(`
          INSERT INTO role_permissions (role_id, permission_id, is_granted)
          SELECT $1, p.id, true
          FROM permissions p
          WHERE p.permission_key = $2
          ON CONFLICT (role_id, permission_id) DO UPDATE
          SET is_granted = true
        `, [role.id, perm.key]);
      }

      console.log(`✅ Granted testimonial permissions to role: ${role.name}`);
    }

    await pool.query('COMMIT');

    console.log('\n✅ Successfully added all testimonial and rating question permissions!');

    // Display summary
    const summaryResult = await pool.query(`
      SELECT
        p.permission_key,
        p.resource_type,
        p.action_type,
        COUNT(rp.role_id) as granted_to_roles
      FROM permissions p
      LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.is_granted = true
      WHERE p.resource_type IN ('testimonials', 'rating_questions')
      GROUP BY p.id, p.permission_key, p.resource_type, p.action_type
      ORDER BY p.permission_key
    `);

    console.log('\n📊 Permission Summary:');
    console.table(summaryResult.rows);

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error adding permissions:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addTestimonialPermissions();
