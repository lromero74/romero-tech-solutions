import { query } from '../../config/database.js';
import { hashPassword, validatePasswordComplexity } from '../../utils/passwordUtils.js';
import { generateEmployeeNumber, updateEmployeeRoles } from '../../utils/adminHelpers.js';

// First-admin bootstrap backing POST /auth/bootstrap-admin. DB auth is
// authoritative for employees, so bootstrap creates a real employees row +
// admin role — the old Cognito-only signup produced accounts that could
// never sign in. Single-use by construction: refused once any admin exists.

export async function hasAnyAdmin(queryFn = query) {
  const result = await queryFn(
    `SELECT COUNT(DISTINCT e.id) as admin_count
     FROM employees e
     JOIN employee_roles er ON e.id = er.employee_id
     JOIN roles r ON er.role_id = r.id
     WHERE r.name = $1 AND r.is_active = true`,
    ['admin']
  );
  return parseInt(result.rows[0].admin_count) > 0;
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

export async function createBootstrapAdmin({ name, email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    const err = new Error('A valid email address is required');
    err.statusCode = 400;
    throw err;
  }
  // Authoritative server-side complexity policy (same as password reset).
  const passwordCheck = await validatePasswordComplexity(password || '', {
    email: cleanEmail,
  });
  if (!passwordCheck.isValid) {
    const err = new Error('Password does not meet complexity requirements');
    err.statusCode = 400;
    err.feedback = passwordCheck.feedback;
    throw err;
  }
  const { firstName, lastName } = splitName(name);
  if (!firstName) {
    const err = new Error('A name is required');
    err.statusCode = 400;
    throw err;
  }

  const existing = await query('SELECT id FROM employees WHERE LOWER(email) = $1', [cleanEmail]);
  if (existing.rows.length > 0) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const employeeNumber = await generateEmployeeNumber();
  const created = await query(
    `INSERT INTO employees (
       email, first_name, last_name, employee_number, password_hash, email_verified
     ) VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, email, first_name, last_name, employee_number`,
    [cleanEmail, firstName, lastName || firstName, employeeNumber, passwordHash]
  );
  const employee = created.rows[0];
  await updateEmployeeRoles(employee.id, ['admin']);
  return employee;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
