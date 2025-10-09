import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { getPool } from '../../config/database.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

/**
 * GET /api/admin/rating-questions
 * Get all rating questions
 */
router.get('/', authMiddleware, requirePermission('view.rating_questions.enable'), async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const pool = await getPool();

    let whereClause = '';
    if (includeInactive !== 'true') {
      whereClause = 'WHERE is_active = true';
    }

    const query = `
      SELECT
        id,
        question_key,
        question_text,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM rating_questions
      ${whereClause}
      ORDER BY display_order ASC, created_at ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      questions: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching rating questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating questions'
    });
  }
});

/**
 * GET /api/admin/rating-questions/:id
 * Get a single rating question by ID
 */
router.get('/:id', authMiddleware, requirePermission('view.rating_questions.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        id,
        question_key,
        question_text,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM rating_questions
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating question not found'
      });
    }

    res.json({
      success: true,
      question: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching rating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating question'
    });
  }
});

/**
 * POST /api/admin/rating-questions
 * Create a new rating question
 */
router.post('/', authMiddleware, requirePermission('manage.rating_questions.enable'), async (req, res) => {
  try {
    const { questionKey, questionText, displayOrder, isActive } = req.body;

    if (!questionKey || !questionText) {
      return res.status(400).json({
        success: false,
        message: 'Question key and text are required'
      });
    }

    const pool = await getPool();

    // Check if question_key already exists
    const existing = await pool.query(`
      SELECT id FROM rating_questions WHERE question_key = $1
    `, [questionKey]);

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A question with this key already exists'
      });
    }

    const result = await pool.query(`
      INSERT INTO rating_questions (
        question_key,
        question_text,
        display_order,
        is_active
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      questionKey,
      questionText,
      displayOrder || 0,
      isActive !== false
    ]);

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('ratingQuestion', result.rows[0].id, 'created', {
      action: 'created',
      questionId: result.rows[0].id
    });

    res.json({
      success: true,
      message: 'Rating question created successfully',
      question: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error creating rating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create rating question'
    });
  }
});

/**
 * PATCH /api/admin/rating-questions/:id
 * Update a rating question
 */
router.patch('/:id', authMiddleware, requirePermission('manage.rating_questions.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { questionKey, questionText, displayOrder, isActive } = req.body;
    const pool = await getPool();

    // Check if question exists
    const existing = await pool.query(`
      SELECT id FROM rating_questions WHERE id = $1
    `, [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating question not found'
      });
    }

    // If updating question_key, check for uniqueness
    if (questionKey) {
      const keyCheck = await pool.query(`
        SELECT id FROM rating_questions WHERE question_key = $1 AND id != $2
      `, [questionKey, id]);

      if (keyCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A question with this key already exists'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (questionKey !== undefined) {
      updates.push(`question_key = $${paramCount++}`);
      values.push(questionKey);
    }
    if (questionText !== undefined) {
      updates.push(`question_text = $${paramCount++}`);
      values.push(questionText);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(id);
    const query = `
      UPDATE rating_questions
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('ratingQuestion', id, 'updated', {
      action: 'updated',
      questionId: id
    });

    res.json({
      success: true,
      message: 'Rating question updated successfully',
      question: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error updating rating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rating question'
    });
  }
});

/**
 * DELETE /api/admin/rating-questions/:id
 * Delete a rating question
 * Note: This will fail if there are existing rating_responses referencing this question
 */
router.delete('/:id', authMiddleware, requirePermission('manage.rating_questions.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Check if question has any responses
    const responseCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM rating_responses
      WHERE rating_question_id = $1
    `, [id]);

    if (parseInt(responseCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete question with existing responses. Consider deactivating it instead.'
      });
    }

    const result = await pool.query(`
      DELETE FROM rating_questions
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating question not found'
      });
    }

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('ratingQuestion', id, 'deleted', {
      action: 'deleted',
      questionId: id
    });

    res.json({
      success: true,
      message: 'Rating question deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting rating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete rating question'
    });
  }
});

/**
 * PATCH /api/admin/rating-questions/:id/reorder
 * Reorder a rating question
 */
router.patch('/:id/reorder', authMiddleware, requirePermission('manage.rating_questions.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newOrder } = req.body;

    if (newOrder === undefined || newOrder < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid new order is required'
      });
    }

    const pool = await getPool();

    await pool.query(`
      UPDATE rating_questions
      SET display_order = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newOrder, id]);

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('ratingQuestion', id, 'updated', {
      action: 'reordered',
      questionId: id
    });

    res.json({
      success: true,
      message: 'Question order updated successfully'
    });

  } catch (error) {
    console.error('❌ Error reordering rating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder rating question'
    });
  }
});

export default router;
