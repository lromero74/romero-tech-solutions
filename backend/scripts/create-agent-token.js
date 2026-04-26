/**
 * create-agent-token.js
 *
 * One-shot helper to mint an agent registration token from the
 * command line. Bypasses the dashboard's employee-auth requirement
 * for ops scenarios where you're SSH'd into the box and just want
 * to register a new monitored device. Writes directly to the
 * agent_registration_tokens table the same way POST /api/agents/
 * registration-tokens does.
 *
 * Usage:
 *   node backend/scripts/create-agent-token.js "<business name OR uuid>" [expires_hours]
 *
 * Examples:
 *   node backend/scripts/create-agent-token.js "Romero Tech Solutions"
 *   node backend/scripts/create-agent-token.js a1b2c3d4-... 168
 *
 * Prints the raw token to stdout — the agent uses this with
 * `rts-agent --register --token <token>`.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to this file so the script works from any CWD.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { query } = await import('../config/database.js');
const crypto = (await import('crypto')).default;
const { v4: uuidv4 } = await import('uuid');

async function main() {
  const businessArg = process.argv[2];
  const employeeEmail = process.argv[3];
  const expiresHours = parseInt(process.argv[4] || '24', 10);

  if (!businessArg || !employeeEmail) {
    console.error('usage: node create-agent-token.js <business_name_or_uuid> <employee_email> [expires_hours]');
    process.exit(1);
  }

  // Match by exact UUID first, then by case-insensitive name. Limit
  // to one row to avoid ambiguity — if the name matches multiple,
  // require the caller to pass the UUID.
  const lookup = await query(
    `SELECT id, business_name
       FROM businesses
      WHERE soft_delete = false
        AND (
          id::text = $1
          OR business_name ILIKE $1
        )
      LIMIT 2`,
    [businessArg]
  );

  if (lookup.rows.length === 0) {
    console.error(`No business found matching "${businessArg}"`);
    process.exit(2);
  }
  if (lookup.rows.length > 1) {
    console.error(`Multiple businesses match "${businessArg}". Pass the UUID instead.`);
    for (const b of lookup.rows) console.error(`  ${b.id}  ${b.business_name}`);
    process.exit(3);
  }
  const business = lookup.rows[0];

  // created_by is NOT NULL on agent_registration_tokens — has to be
  // a real employee. We look up the employee by exact-email match
  // (not LIKE) so the script can't accidentally fish for emails.
  // Employees live in `employees`, not `users` (those are clients).
  const empLookup = await query(
    `SELECT id, email FROM employees WHERE email = $1 LIMIT 1`,
    [employeeEmail]
  );
  if (empLookup.rows.length === 0) {
    console.error(`No user found with email "${employeeEmail}"`);
    process.exit(4);
  }
  const employeeId = empLookup.rows[0].id;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);

  await query(
    `INSERT INTO agent_registration_tokens (id, token, business_id, service_location_id, created_by, expires_at)
     VALUES ($1, $2, $3, NULL, $4, $5)`,
    [uuidv4(), token, business.id, employeeId, expiresAt]
  );

  console.log(`Business: ${business.business_name}`);
  console.log(`Business ID: ${business.id}`);
  console.log(`Expires:  ${expiresAt.toISOString()}`);
  console.log(`Token:    ${token}`);
  console.log('');
  console.log('To register an agent with this token, run on the target host:');
  console.log(`  sudo rts-agent --register --token ${token}`);
}

main().catch((err) => {
  console.error('Error creating token:', err);
  process.exit(99);
}).finally(() => {
  // Force-exit so the pg pool's idle timer doesn't hold us open.
  process.exit(0);
});
