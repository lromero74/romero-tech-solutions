/**
 * User Query Service
 *
 * This service extracts complex SQL query building logic from the user management routes.
 * It handles the construction of dynamic queries for employee and client user data with
 * filtering, pagination, and sorting capabilities.
 */

import { query } from '../config/database.js';

/**
 * Build the base employee query with all necessary joins
 * @returns {string} The base employee query SQL
 */
export function buildEmployeeQuery() {
  return `
    SELECT e.id, e.email,
           CASE WHEN 'admin' = ANY(array_agg(DISTINCT r.name)) THEN 'admin' ELSE 'employee' END as role,
           COALESCE(array_agg(DISTINCT r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
           e.first_name, e.last_name, e.middle_initial, e.preferred_name, e.phone,
           e.employee_number, d.name as department_detailed,
           jt.title as job_title, e.hire_date,
           es.status_name as employee_status, es.display_name as employee_status_display,
           pr.pronoun_set as pronouns, pr.display_name as pronouns_display,
           e.created_at, e.last_login, e.email_verified,
           ws.status_name as working_status, ws.display_name as working_status_display,
           ws.color_code as working_status_color, ws.is_available_for_work,
           e.is_active, e.is_on_vacation, e.is_out_sick, e.is_on_other_leave, COALESCE(e.soft_delete, false) as soft_delete,
           a.street as address_street, a.street_2 as address_street_2, a.city as address_city,
           a.state as address_state, a.zip_code as address_zip_code, a.country as address_country,
           ec.first_name as emergency_contact_first_name, ec.last_name as emergency_contact_last_name,
           ec.relationship as emergency_contact_relationship, ec.phone as emergency_contact_phone,
           ec.email as emergency_contact_email,
           ep.file_url as profile_photo_url, ep.position_x as photo_position_x,
           ep.position_y as photo_position_y, ep.scale_factor as photo_scale, null as photo_background_color,
           null as business_name, null as business_id, 'employee' as user_type
    FROM employees e
    LEFT JOIN employee_addresses a ON e.id = a.employee_id AND a.is_primary = true
    LEFT JOIN employee_emergency_contacts ec ON e.id = ec.employee_id AND ec.is_primary = true
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN employee_job_titles jt ON e.job_title_id = jt.id
    LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
    LEFT JOIN employee_pronouns pr ON e.pronouns_id = pr.id
    LEFT JOIN employee_photos ep ON e.id = ep.employee_id AND ep.is_primary = true AND ep.photo_type = 'profile'
    LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
    LEFT JOIN employee_roles er ON e.id = er.employee_id
    LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
    GROUP BY e.id, e.email, e.first_name, e.last_name, e.middle_initial, e.preferred_name, e.phone,
             e.employee_number, d.name, jt.title, e.hire_date, es.status_name, es.display_name,
             pr.pronoun_set, pr.display_name, e.created_at, e.last_login, e.email_verified,
             ws.status_name, ws.display_name, ws.color_code, ws.is_available_for_work,
             e.is_active, e.is_on_vacation, e.is_out_sick, e.is_on_other_leave, e.soft_delete, a.street, a.street_2, a.city,
             a.state, a.zip_code, a.country, ec.first_name, ec.last_name, ec.relationship,
             ec.phone, ec.email, ep.file_url, ep.position_x, ep.position_y, ep.scale_factor
  `;
}

/**
 * Build the base client query with all necessary joins
 * @returns {string} The base client query SQL
 */
export function buildClientQuery() {
  return `
    SELECT u.id, u.email, u.role, ARRAY[]::text[] as roles, u.first_name, u.last_name, null as middle_initial, null as preferred_name, u.phone,
           null as employee_number, null as department_detailed, null as job_title, null as hire_date, null as employee_status, null as employee_status_display,
           null as pronouns, null as pronouns_display,
           u.created_at, u.last_login, u.email_verified,
           null as working_status, null as working_status_display,
           null as working_status_color, null as is_available_for_work,
           u.is_active, false as is_on_vacation, false as is_out_sick, false as is_on_other_leave, COALESCE(u.soft_delete, false) as soft_delete,
           null as address_street, null as address_street_2, null as address_city, null as address_state, null as address_zip_code, null as address_country,
           null as emergency_contact_first_name, null as emergency_contact_last_name, null as emergency_contact_relationship,
           null as emergency_contact_phone, null as emergency_contact_email, u.profile_photo_url,
           u.photo_position_x, u.photo_position_y, u.photo_scale, u.photo_background_color,
           b.business_name as businessName, b.id as business_id, 'client' as user_type
    FROM users u
    LEFT JOIN businesses b ON u.business_id = b.id
  `;
}

/**
 * Build filter conditions for both employee and client queries
 * @param {Object} filters - Filter parameters
 * @param {string} filters.role - Role filter
 * @param {string} filters.search - Search term
 * @param {Array} queryParams - Array to store query parameters
 * @param {number} paramCount - Current parameter count
 * @returns {Object} Object containing employee and client WHERE clauses and updated param count
 */
export function buildFilterConditions(filters, queryParams, paramCount) {
  const { role, search } = filters;
  let employeesWhere = '';
  let usersWhere = '';

  // Role filter
  if (role && role !== 'all') {
    paramCount++;
    employeesWhere += `HAVING $${paramCount} = ANY(array_agg(DISTINCT r.name))`;
    usersWhere += `WHERE u.role = $${paramCount}`;
    queryParams.push(role);
  }

  // Search filter
  if (search) {
    paramCount++;
    const employeesSearchCondition = `(email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`;
    const usersSearchCondition = `(u.email ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR b.business_name ILIKE $${paramCount})`;

    employeesWhere += employeesWhere ? ` AND ${employeesSearchCondition}` : `WHERE ${employeesSearchCondition}`;
    usersWhere += usersWhere ? ` AND ${usersSearchCondition}` : `WHERE ${usersSearchCondition}`;
    queryParams.push(`%${search}%`);
  }

  return {
    employeesWhere,
    usersWhere,
    paramCount
  };
}

/**
 * Build the complete user list query with filtering, pagination, and sorting
 * @param {Object} filters - Filter parameters
 * @param {Object} pagination - Pagination parameters
 * @param {Object} sorting - Sorting parameters
 * @returns {Promise<Object>} Query result with data and pagination info
 */
export async function buildUserListQuery(filters, pagination, sorting) {
  try {
    // Add soft_delete columns if they don't exist
    try {
      await query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    const { userType = 'all' } = filters;
    const { page = 1, limit = 10 } = pagination;
    const { sortBy = 'created_at', sortOrder = 'DESC' } = sorting;
    const offset = (page - 1) * limit;

    let queryParams = [];
    let paramCount = 0;

    // Get base queries
    const employeesQuery = buildEmployeeQuery();
    const usersQuery = buildClientQuery();

    // Build filter conditions
    const filterResult = buildFilterConditions(filters, queryParams, paramCount);
    const { employeesWhere, usersWhere } = filterResult;
    paramCount = filterResult.paramCount;

    // Combine queries based on userType filter
    let combinedQuery;
    if (userType === 'employees' || userType === 'employee') {
      combinedQuery = `${employeesQuery} ${employeesWhere}`;
    } else if (userType === 'clients' || userType === 'client') {
      combinedQuery = `${usersQuery} ${usersWhere}`;
    } else {
      // All users (both employees and clients)
      combinedQuery = `
        (${employeesQuery} ${employeesWhere})
        UNION ALL
        (${usersQuery} ${usersWhere})
      `;
    }

    // Get total count
    const totalQuery = `SELECT COUNT(*) as count FROM (${combinedQuery}) as combined`;
    const totalResult = await query(totalQuery, queryParams);
    const totalUsers = parseInt(totalResult.rows[0].count);

    // Add pagination parameters
    paramCount++;
    queryParams.push(limit);
    paramCount++;
    queryParams.push(offset);

    // Build final query with sorting and pagination
    const finalQuery = `
      ${combinedQuery}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    // Execute the query
    const usersResult = await query(finalQuery, queryParams);

    return {
      users: usersResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNextPage: page * limit < totalUsers,
        hasPrevPage: page > 1
      }
    };

  } catch (error) {
    console.error('Error building user list query:', error);
    throw error;
  }
}

/**
 * Build sorting and pagination clause for queries
 * @param {Object} sorting - Sorting parameters
 * @param {Object} pagination - Pagination parameters
 * @param {Array} queryParams - Array to store query parameters
 * @param {number} paramCount - Current parameter count
 * @returns {Object} Object containing SQL clause and updated param count
 */
export function buildSortingAndPagination(sorting, pagination, queryParams, paramCount) {
  const { sortBy = 'created_at', sortOrder = 'DESC' } = sorting;
  const { limit = 10, offset = 0 } = pagination;

  paramCount++;
  queryParams.push(limit);
  paramCount++;
  queryParams.push(offset);

  const clause = `ORDER BY ${sortBy} ${sortOrder} LIMIT $${paramCount - 1} OFFSET $${paramCount}`;

  return {
    clause,
    paramCount
  };
}

/**
 * Ensure soft delete columns exist in both tables
 * @returns {Promise<void>}
 */
export async function ensureSoftDeleteColumns() {
  try {
    await query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
  } catch (err) {
    // Columns might already exist, ignore error
  }
}

export default {
  buildEmployeeQuery,
  buildClientQuery,
  buildFilterConditions,
  buildUserListQuery,
  buildSortingAndPagination,
  ensureSoftDeleteColumns
};