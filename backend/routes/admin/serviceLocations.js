import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// POST /service-locations - Create a new service location
router.post('/service-locations', async (req, res) => {
  try {
    console.log('=== CREATE SERVICE LOCATION ===');
    console.log('Request body:', req.body);

    const {
      business_id,
      address_label,
      location_name,
      location_type,
      street,
      city,
      state,
      zip_code,
      country,
      contact_person,
      contact_phone,
      notes,
      is_headquarters
    } = req.body;

    // Validate required fields
    if (!business_id || !address_label || !location_type || !street || !city || !state || !zip_code) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: business_id, address_label, location_type, street, city, state, zip_code'
      });
    }

    // Insert new service location
    const result = await query(`
      INSERT INTO service_locations (
        business_id,
        address_label,
        location_name,
        location_type,
        street,
        city,
        state,
        zip_code,
        country,
        contact_person,
        contact_phone,
        notes,
        is_headquarters,
        is_active,
        soft_delete
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, false)
      RETURNING *
    `, [
      business_id,
      address_label,
      location_name || null,
      location_type,
      street,
      city,
      state,
      zip_code,
      country || 'USA',
      contact_person || null,
      contact_phone || null,
      notes || null,
      is_headquarters || false
    ]);

    console.log('Service location created:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Service location created successfully',
      data: { serviceLocation: result.rows[0] }
    });
  } catch (error) {
    console.error('Error creating service location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service location',
      error: error.message
    });
  }
});

// GET /service-locations - Get all service locations (for admin use)
router.get('/service-locations', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sl.id,
        sl.business_id,
        sl.address_label,
        sl.location_name,
        sl.location_type,
        sl.street,
        sl.city,
        sl.state,
        sl.zip_code,
        sl.country,
        sl.contact_person,
        sl.contact_phone,
        sl.notes,
        sl.is_active,
        sl.is_headquarters,
        sl.soft_delete,
        sl.created_at,
        sl.updated_at,
        b.business_name
      FROM service_locations sl
      JOIN businesses b ON sl.business_id = b.id
      ORDER BY b.business_name, sl.location_name, sl.address_label
    `);

    res.status(200).json({
      success: true,
      data: {
        serviceLocations: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching service locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service locations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /service-locations/:id - Update service location
router.put('/service-locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log('=== UPDATE SERVICE LOCATION ===');
    console.log('Service Location ID:', id);
    console.log('Updates:', updates);

    // Build the UPDATE query dynamically based on provided fields
    const allowedFields = [
      'business_id', 'address_label', 'location_name', 'location_type',
      'street', 'city', 'state', 'zip_code', 'country',
      'contact_person', 'contact_phone', 'notes',
      'is_active', 'is_headquarters'
    ];

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());
    paramCount++;

    // Add the ID for the WHERE clause
    values.push(id);

    const updateQuery = `
      UPDATE service_locations
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    console.log('Update query:', updateQuery);
    console.log('Values:', values);

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service location not found'
      });
    }

    console.log('Updated service location:', result.rows[0]);

    res.status(200).json({
      success: true,
      message: 'Service location updated successfully',
      data: {
        serviceLocation: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error updating service location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /service-locations/:id/soft-delete - Soft delete service location (toggle soft_delete field)
router.patch('/service-locations/:id/soft-delete', async (req, res) => {
  try {
    const { id } = req.params;
    const { restore = false } = req.body;

    const result = await query(`
      UPDATE service_locations
      SET soft_delete = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [!restore, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service location not found'
      });
    }

    res.status(200).json({
      success: true,
      message: restore ? 'Service location restored successfully' : 'Service location soft deleted successfully',
      data: {
        serviceLocation: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error soft deleting service location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to soft delete service location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /service-locations/:id/toggle-status - Toggle service location active status
router.patch('/service-locations/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      UPDATE service_locations
      SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service location not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Service location status updated successfully',
      data: {
        serviceLocation: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error toggling service location status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle service location status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /service-locations/:id - Permanently delete service location
router.delete('/service-locations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== DELETE SERVICE LOCATION ===');
    console.log('Service Location ID:', id);

    const result = await query(`
      DELETE FROM service_locations
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service location not found'
      });
    }

    console.log('Deleted service location:', result.rows[0]);

    res.status(200).json({
      success: true,
      message: 'Service location permanently deleted successfully',
      data: {
        deletedServiceLocation: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error deleting service location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;