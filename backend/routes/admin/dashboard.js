import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// GET /dashboard - Get dashboard overview data
router.get('/dashboard', async (req, res) => {
  try {
    // Get dashboard statistics from both employees and users tables
    const [employeesCount, usersCount, businessesCount, adminCount, salesCount, technicianCount] = await Promise.all([
      query('SELECT COUNT(*) as count FROM employees'),
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM businesses'),
      query(`SELECT COUNT(DISTINCT e.id) as count
             FROM employees e
             JOIN employee_roles er ON e.id = er.employee_id
             JOIN roles r ON er.role_id = r.id
             WHERE r.name = $1 AND r.is_active = true`, ['admin']),
      query(`SELECT COUNT(DISTINCT e.id) as count
             FROM employees e
             JOIN employee_roles er ON e.id = er.employee_id
             JOIN roles r ON er.role_id = r.id
             WHERE r.name = $1 AND r.is_active = true`, ['sales']),
      query(`SELECT COUNT(DISTINCT e.id) as count
             FROM employees e
             JOIN employee_roles er ON e.id = er.employee_id
             JOIN roles r ON er.role_id = r.id
             WHERE r.name = $1 AND r.is_active = true`, ['technician'])
    ]);

    // Get recent users from both employees and clients (last 30 days)
    const recentUsers = await query(`
      SELECT e.id, e.email,
             CASE WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin' ELSE 'employee' END as role,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             e.first_name, e.last_name, e.created_at, null as business_name, 'employee' as user_type
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      WHERE e.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.created_at
      UNION ALL
      SELECT u.id, u.email, u.role, ARRAY[]::text[] as roles, u.first_name, u.last_name, u.created_at, b.business_name, 'client' as user_type
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get user registration trends (last 7 days) from both tables
    const userTrends = await query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM (
        SELECT created_at FROM employees WHERE created_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT created_at FROM users WHERE created_at >= NOW() - INTERVAL '7 days'
      ) combined
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    // Get users by role breakdown from both tables (using normalized employee_roles table)
    const usersByRole = await query(`
      SELECT role, COUNT(*) as count
      FROM (
        SELECT r.name as role FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN roles r ON er.role_id = r.id
        WHERE r.is_active = true
        UNION ALL
        SELECT role FROM users
      ) combined
      GROUP BY role
      ORDER BY count DESC
    `);

    res.status(200).json({
      success: true,
      data: {
        statistics: {
          totalUsers: parseInt(employeesCount.rows[0].count) + parseInt(usersCount.rows[0].count),
          totalEmployees: parseInt(employeesCount.rows[0].count),
          totalClients: parseInt(usersCount.rows[0].count),
          totalBusinesses: parseInt(businessesCount.rows[0].count),
          totalAdmins: parseInt(adminCount.rows[0].count),
          totalSales: parseInt(salesCount.rows[0].count),
          totalTechnicians: parseInt(technicianCount.rows[0].count)
        },
        recentUsers: recentUsers.rows.map(user => ({
          id: user.id,
          email: user.email,
          role: user.role,
          roles: user.roles || [],
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          businessName: user.business_name,
          userType: user.user_type,
          createdAt: user.created_at
        })),
        userTrends: userTrends.rows,
        usersByRole: usersByRole.rows
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;