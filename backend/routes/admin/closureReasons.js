import express from 'express';
import { getPool } from '../../config/database.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

// Get all closure reasons
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.query(`
      SELECT id, reason_name, reason_description, is_active, created_at, updated_at
      FROM service_request_closure_reasons
      ORDER BY reason_name ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching closure reasons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch closure reasons'
    });
  }
});

// Create new closure reason
router.post('/', async (req, res) => {
  const { reason_name, reason_description, is_active = true } = req.body;

  // Validation
  if (!reason_name || !reason_description) {
    return res.status(400).json({
      success: false,
      message: 'Reason name and description are required'
    });
  }

  if (reason_name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Reason name must not exceed 100 characters'
    });
  }

  if (reason_description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Reason description must not exceed 500 characters'
    });
  }

  try {
    const pool = await getPool();

    // Check for duplicate reason names
    const duplicateCheck = await pool.query(
      'SELECT id FROM service_request_closure_reasons WHERE LOWER(reason_name) = LOWER($1)',
      [reason_name]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A closure reason with this name already exists'
      });
    }

    const result = await pool.query(`
      INSERT INTO service_request_closure_reasons (reason_name, reason_description, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, reason_name, reason_description, is_active, created_at, updated_at
    `, [reason_name, reason_description, is_active]);

    const newReason = result.rows[0];

    // Broadcast closure reason creation to all admin clients
    websocketService.broadcastEntityUpdate('closureReason', newReason.id, 'created', { closureReason: newReason });

    res.status(201).json({
      success: true,
      message: 'Closure reason created successfully',
      data: newReason
    });
  } catch (error) {
    console.error('Error creating closure reason:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create closure reason'
    });
  }
});

// Update closure reason
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { reason_name, reason_description, is_active } = req.body;

  // Validation
  if (!reason_name || !reason_description) {
    return res.status(400).json({
      success: false,
      message: 'Reason name and description are required'
    });
  }

  if (reason_name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Reason name must not exceed 100 characters'
    });
  }

  if (reason_description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Reason description must not exceed 500 characters'
    });
  }

  try {
    const pool = await getPool();

    // Check if closure reason exists
    const existingReason = await pool.query(
      'SELECT id FROM service_request_closure_reasons WHERE id = $1',
      [id]
    );

    if (existingReason.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Closure reason not found'
      });
    }

    // Check for duplicate reason names (excluding current record)
    const duplicateCheck = await pool.query(
      'SELECT id FROM service_request_closure_reasons WHERE LOWER(reason_name) = LOWER($1) AND id != $2',
      [reason_name, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A closure reason with this name already exists'
      });
    }

    const result = await pool.query(`
      UPDATE service_request_closure_reasons
      SET reason_name = $1, reason_description = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, reason_name, reason_description, is_active, created_at, updated_at
    `, [reason_name, reason_description, is_active, id]);

    const updatedReason = result.rows[0];

    // Broadcast closure reason update to all admin clients
    websocketService.broadcastEntityUpdate('closureReason', id, 'updated', { closureReason: updatedReason });

    res.json({
      success: true,
      message: 'Closure reason updated successfully',
      data: updatedReason
    });
  } catch (error) {
    console.error('Error updating closure reason:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update closure reason'
    });
  }
});

// Delete closure reason
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();

    // Check if closure reason exists
    const existingReason = await pool.query(
      'SELECT reason_name FROM service_request_closure_reasons WHERE id = $1',
      [id]
    );

    if (existingReason.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Closure reason not found'
      });
    }

    // Check if closure reason is being used by any service requests
    const usageCheck = await pool.query(
      'SELECT COUNT(*) as count FROM service_requests WHERE closure_reason_id = $1',
      [id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete closure reason as it is being used by existing service requests. Consider deactivating it instead.'
      });
    }

    await pool.query('DELETE FROM service_request_closure_reasons WHERE id = $1', [id]);

    // Broadcast closure reason deletion to all admin clients
    websocketService.broadcastEntityUpdate('closureReason', id, 'deleted');

    res.json({
      success: true,
      message: `Closure reason "${existingReason.rows[0].reason_name}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting closure reason:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete closure reason'
    });
  }
});

// Toggle active status
router.patch('/:id/toggle-active', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();

    // Check if closure reason exists
    const existingReason = await pool.query(
      'SELECT reason_name, is_active FROM service_request_closure_reasons WHERE id = $1',
      [id]
    );

    if (existingReason.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Closure reason not found'
      });
    }

    const currentStatus = existingReason.rows[0].is_active;
    const newStatus = !currentStatus;

    const result = await pool.query(`
      UPDATE service_request_closure_reasons
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, reason_name, reason_description, is_active, created_at, updated_at
    `, [newStatus, id]);

    const updatedReason = result.rows[0];

    // Broadcast closure reason update to all admin clients
    websocketService.broadcastEntityUpdate('closureReason', id, 'updated', { closureReason: updatedReason });

    res.json({
      success: true,
      message: `Closure reason "${existingReason.rows[0].reason_name}" ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: updatedReason
    });
  } catch (error) {
    console.error('Error toggling closure reason status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update closure reason status'
    });
  }
});

export default router;