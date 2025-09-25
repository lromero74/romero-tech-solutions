import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// GET /roles - Get all roles with their display properties
router.get('/roles', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, display_name, description, text_color, background_color, border_color, is_active, sort_order, created_at, updated_at
      FROM roles
      WHERE is_active = true
      ORDER BY sort_order, name
    `);

    res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /roles - Create a new role
router.post('/roles', async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      textColor = '#000000',
      backgroundColor = '#f3f4f6',
      borderColor = '#d1d5db',
      sortOrder = 99
    } = req.body;

    // Validate required fields
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Name and display name are required'
      });
    }

    // Check if role name already exists
    const existingRole = await query('SELECT id FROM roles WHERE name = $1', [name]);
    if (existingRole.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A role with this name already exists'
      });
    }

    const result = await query(`
      INSERT INTO roles (name, display_name, description, text_color, background_color, border_color, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, displayName, description, textColor, backgroundColor, borderColor, sortOrder]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Role created successfully'
    });

  } catch (error) {
    console.error('Error creating role:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        message: 'A role with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /roles/:id - Update a role
router.put('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      displayName,
      description,
      textColor,
      backgroundColor,
      borderColor,
      isActive,
      sortOrder
    } = req.body;

    // Validate required fields
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Name and display name are required'
      });
    }

    // Check if role exists
    const existingRole = await query('SELECT * FROM roles WHERE id = $1', [id]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if name is being changed and if new name already exists
    if (name !== existingRole.rows[0].name) {
      const nameCheck = await query('SELECT id FROM roles WHERE name = $1 AND id != $2', [name, id]);
      if (nameCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A role with this name already exists'
        });
      }
    }

    const result = await query(`
      UPDATE roles
      SET name = $1, display_name = $2, description = $3, text_color = $4,
          background_color = $5, border_color = $6, is_active = $7, sort_order = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [name, displayName, description, textColor, backgroundColor, borderColor, isActive, sortOrder, id]);

    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: 'Role updated successfully'
    });

  } catch (error) {
    console.error('Error updating role:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        message: 'A role with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /roles/:id - Delete a role (soft delete by setting is_active to false)
router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if role exists
    const existingRole = await query('SELECT * FROM roles WHERE id = $1', [id]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if role is in use by any employees
    const roleInUse = await query('SELECT COUNT(*) as count FROM employee_roles WHERE role_id = $1', [id]);
    if (parseInt(roleInUse.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete role that is assigned to employees. Please reassign employees first.'
      });
    }

    // Soft delete the role
    await query('UPDATE roles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;