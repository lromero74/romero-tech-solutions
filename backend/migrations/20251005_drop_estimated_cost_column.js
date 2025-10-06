/**
 * Migration: Drop estimated_cost column from service_requests
 * Purpose: Remove stored cost in favor of dynamic calculation
 * Date: 2025-10-05
 */

export async function up(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop estimated_cost column from service_requests table
    // CASCADE will also drop the dependent view v_client_service_requests
    await client.query(`
      ALTER TABLE service_requests
      DROP COLUMN IF EXISTS estimated_cost CASCADE;
    `);

    // Recreate the view without estimated_cost
    await client.query(`
      CREATE VIEW v_client_service_requests AS
      SELECT
          sr.*,
          ul.name as urgency_level_name,
          ul.color_code as urgency_color,
          pl.name as priority_level_name,
          pl.color_code as priority_color,
          srs.name as status_name,
          srs.color_code as status_color,
          st.name as service_type_name,
          st.category as service_category,
          sl.address_label as location_name,
          sl.street as location_street,
          sl.city as location_city,
          sl.state as location_state,
          b.business_name,
          CONCAT(e.first_name, ' ', e.last_name) as technician_name
      FROM service_requests sr
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN employees e ON sr.assigned_technician_id = e.id
      WHERE sr.soft_delete = false;
    `);

    await client.query('COMMIT');

    console.log('✅ Dropped estimated_cost column and recreated view successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error dropping estimated_cost column:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Re-add estimated_cost column if we need to rollback
    await client.query(`
      ALTER TABLE service_requests
      ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(10, 2);
    `);

    // Drop and recreate the view to include estimated_cost
    await client.query(`DROP VIEW IF EXISTS v_client_service_requests;`);

    await client.query(`
      CREATE VIEW v_client_service_requests AS
      SELECT
          sr.*,
          ul.name as urgency_level_name,
          ul.color_code as urgency_color,
          pl.name as priority_level_name,
          pl.color_code as priority_color,
          srs.name as status_name,
          srs.color_code as status_color,
          st.name as service_type_name,
          st.category as service_category,
          sl.address_label as location_name,
          sl.street as location_street,
          sl.city as location_city,
          sl.state as location_state,
          b.business_name,
          CONCAT(e.first_name, ' ', e.last_name) as technician_name
      FROM service_requests sr
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN employees e ON sr.assigned_technician_id = e.id
      WHERE sr.soft_delete = false;
    `);

    await client.query('COMMIT');

    console.log('✅ Re-added estimated_cost column and recreated view successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error re-adding estimated_cost column:', error);
    throw error;
  } finally {
    client.release();
  }
}
