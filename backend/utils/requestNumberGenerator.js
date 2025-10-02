/**
 * Generate human-friendly service request numbers in format SR-YYYY-NNNNN
 * Examples: SR-2025-00001, SR-2025-00002, SR-2026-00001
 *
 * Uses PostgreSQL sequences that reset yearly for sequential numbering.
 */

/**
 * Generate next service request number for current year
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<string>} Request number in format SR-YYYY-NNNNN
 */
export async function generateRequestNumber(pool) {
  const year = new Date().getFullYear();
  const sequenceName = `service_request_number_seq_${year}`;

  try {
    // Try to create sequence if it doesn't exist (idempotent)
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS ${sequenceName}
      START WITH 1
      INCREMENT BY 1
      NO MAXVALUE
      NO CYCLE
    `);

    // Get next value from sequence
    const result = await pool.query(`SELECT nextval('${sequenceName}') as next_num`);
    const sequenceNumber = result.rows[0].next_num;

    // Format as SR-YYYY-NNNNN with zero-padding
    const paddedNumber = String(sequenceNumber).padStart(5, '0');
    const requestNumber = `SR-${year}-${paddedNumber}`;

    return requestNumber;
  } catch (error) {
    console.error('❌ Error generating request number:', error);
    throw new Error('Failed to generate request number');
  }
}
