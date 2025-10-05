import { query } from '../config/database.js';

class FilterPresetService {
  /**
   * Get all active filter presets
   */
  async getActivePresets(filterType = 'status') {
    const result = await query(`
      SELECT id, name, description, filter_type, criteria, display_order
      FROM service_request_filter_presets
      WHERE is_active = true AND filter_type = $1
      ORDER BY display_order ASC, name ASC
    `, [filterType]);

    return result.rows;
  }

  /**
   * Get all presets (for admin management)
   */
  async getAllPresets() {
    const result = await query(`
      SELECT
        sfp.*,
        CONCAT(e.first_name, ' ', e.last_name) as created_by_name
      FROM service_request_filter_presets sfp
      LEFT JOIN employees e ON sfp.created_by_employee_id = e.id
      ORDER BY sfp.filter_type, sfp.display_order ASC, sfp.name ASC
    `);

    return result.rows;
  }

  /**
   * Create a new filter preset
   */
  async createPreset(data, createdByEmployeeId) {
    const { name, description, filter_type, criteria, display_order } = data;

    // Validate criteria format
    if (!criteria || !criteria.operator) {
      throw new Error('Invalid criteria: operator is required');
    }

    const result = await query(`
      INSERT INTO service_request_filter_presets
        (name, description, filter_type, criteria, display_order, created_by_employee_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, filter_type, JSON.stringify(criteria), display_order || 0, createdByEmployeeId]);

    return result.rows[0];
  }

  /**
   * Update a filter preset
   */
  async updatePreset(id, data) {
    const { name, description, filter_type, criteria, display_order, is_active } = data;

    const result = await query(`
      UPDATE service_request_filter_presets
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        filter_type = COALESCE($3, filter_type),
        criteria = COALESCE($4, criteria),
        display_order = COALESCE($5, display_order),
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      name,
      description,
      filter_type,
      criteria ? JSON.stringify(criteria) : null,
      display_order,
      is_active,
      id
    ]);

    if (result.rows.length === 0) {
      throw new Error('Filter preset not found');
    }

    return result.rows[0];
  }

  /**
   * Delete a filter preset
   */
  async deletePreset(id) {
    const result = await query(`
      DELETE FROM service_request_filter_presets
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Filter preset not found');
    }

    return result.rows[0];
  }

  /**
   * Build SQL WHERE clause from filter preset criteria
   */
  buildWhereClause(criteria) {
    const { operator, value, values } = criteria;

    switch (operator) {
      case 'is_final_status':
        return `srs.is_final_status = ${value}`;

      case 'in':
        if (!values || !Array.isArray(values)) {
          throw new Error('Invalid criteria: "in" operator requires values array');
        }
        const inList = values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
        return `LOWER(srs.name) IN (${inList.toLowerCase()})`;

      case 'not_in':
        if (!values || !Array.isArray(values)) {
          throw new Error('Invalid criteria: "not_in" operator requires values array');
        }
        const notInList = values.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
        return `LOWER(srs.name) NOT IN (${notInList.toLowerCase()})`;

      case 'equals':
        return `LOWER(srs.name) = LOWER('${value.replace(/'/g, "''")}')`;

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }
}

export default new FilterPresetService();
