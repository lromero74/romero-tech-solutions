import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { getPool } from '../../config/database.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

/**
 * GET /api/admin/testimonials
 * Get all testimonials with filtering options
 */
router.get('/', authMiddleware, requirePermission('view.testimonials.enable'), async (req, res) => {
  try {
    const { status, sortBy = 'submitted_at', sortOrder = 'DESC' } = req.query;
    const pool = await getPool();

    let whereClause = '';
    const params = [];

    if (status === 'pending') {
      whereClause = 'WHERE st.is_approved = false';
    } else if (status === 'approved') {
      whereClause = 'WHERE st.is_approved = true';
    }

    const validSortColumns = ['submitted_at', 'total_score', 'is_approved'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'submitted_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT
        st.id,
        st.testimonial_text,
        st.display_name_preference,
        st.allow_public_display,
        st.is_approved,
        st.approved_at,
        st.submitted_at,
        sr.total_score,
        sr.rating_price,
        sr.rating_speed,
        sr.rating_accuracy,
        sr.rating_professionalism,
        sreq.request_number,
        sreq.title as service_title,
        sreq.completed_date,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.email as client_email,
        e.first_name as approved_by_first_name,
        e.last_name as approved_by_last_name
      FROM service_testimonials st
      JOIN service_ratings sr ON st.service_rating_id = sr.id
      JOIN service_requests sreq ON st.service_request_id = sreq.id
      JOIN users u ON st.client_id = u.id
      LEFT JOIN employees e ON st.approved_by_employee_id = e.id
      ${whereClause}
      ORDER BY st.${sortColumn} ${order}
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      testimonials: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching testimonials:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials'
    });
  }
});

/**
 * GET /api/admin/testimonials/:id
 * Get a single testimonial by ID
 */
router.get('/:id', authMiddleware, requirePermission('view.testimonials.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = `
      SELECT
        st.id,
        st.testimonial_text,
        st.display_name_preference,
        st.allow_public_display,
        st.is_approved,
        st.approved_at,
        st.submitted_at,
        st.created_at,
        st.updated_at,
        sr.id as rating_id,
        sr.total_score,
        sr.rating_price,
        sr.rating_speed,
        sr.rating_accuracy,
        sr.rating_professionalism,
        sr.submitted_at as rating_submitted_at,
        sreq.id as service_request_id,
        sreq.request_number,
        sreq.title as service_title,
        sreq.description as service_description,
        sreq.completed_date,
        u.id as client_id,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.email as client_email,
        e.id as approved_by_employee_id,
        e.first_name as approved_by_first_name,
        e.last_name as approved_by_last_name
      FROM service_testimonials st
      JOIN service_ratings sr ON st.service_rating_id = sr.id
      JOIN service_requests sreq ON st.service_request_id = sreq.id
      JOIN users u ON st.client_id = u.id
      LEFT JOIN employees e ON st.approved_by_employee_id = e.id
      WHERE st.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    res.json({
      success: true,
      testimonial: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonial'
    });
  }
});

/**
 * PATCH /api/admin/testimonials/:id/edit
 * Edit a testimonial (for grammar/spelling corrections)
 */
router.patch('/:id/edit', authMiddleware, requirePermission('approve.testimonials.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { editedText } = req.body;
    const pool = await getPool();

    if (!editedText || editedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Edited text is required'
      });
    }

    // Check if testimonial exists
    const testimonialQuery = await pool.query(`
      SELECT id, testimonial_text
      FROM service_testimonials
      WHERE id = $1
    `, [id]);

    if (testimonialQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    // Update the testimonial with edited version
    await pool.query(`
      UPDATE service_testimonials
      SET
        edited_testimonial_text = $1,
        was_edited = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [editedText.trim(), id]);

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('testimonial', id, 'updated', {
      action: 'edited',
      testimonialId: id
    });

    res.json({
      success: true,
      message: 'Testimonial edited successfully'
    });

  } catch (error) {
    console.error('❌ Error editing testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit testimonial'
    });
  }
});

/**
 * PATCH /api/admin/testimonials/:id/approve
 * Approve a testimonial (with optional editing)
 */
router.patch('/:id/approve', authMiddleware, requirePermission('approve.testimonials.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { editedText } = req.body; // Optional edited version
    const employeeId = req.user.employeeId;
    const pool = await getPool();

    // Check if testimonial exists and get client info for email
    const testimonialQuery = await pool.query(`
      SELECT
        st.id,
        st.is_approved,
        st.testimonial_text,
        st.original_testimonial_text,
        st.edited_testimonial_text,
        u.id as client_id,
        u.email as client_email,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        sreq.request_number,
        sreq.title as service_title
      FROM service_testimonials st
      JOIN users u ON st.client_id = u.id
      JOIN service_requests sreq ON st.service_request_id = sreq.id
      WHERE st.id = $1
    `, [id]);

    if (testimonialQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    const testimonial = testimonialQuery.rows[0];

    if (testimonial.is_approved) {
      return res.status(400).json({
        success: false,
        message: 'Testimonial is already approved'
      });
    }

    // If edited text provided, save it
    let wasEdited = false;
    let finalEditedText = testimonial.edited_testimonial_text;

    if (editedText && editedText.trim() !== testimonial.testimonial_text) {
      await pool.query(`
        UPDATE service_testimonials
        SET
          edited_testimonial_text = $1,
          was_edited = true
        WHERE id = $2
      `, [editedText.trim(), id]);
      wasEdited = true;
      finalEditedText = editedText.trim();
    }

    // Approve the testimonial
    await pool.query(`
      UPDATE service_testimonials
      SET
        is_approved = true,
        approved_by_employee_id = $1,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [employeeId, id]);

    // Send approval email to client
    try {
      const { sendTestimonialApprovedEmail } = await import('../../services/emailService.js');
      await sendTestimonialApprovedEmail({
        client: {
          email: testimonial.client_email,
          firstName: testimonial.client_first_name
        },
        testimonialData: {
          originalText: testimonial.testimonial_text,
          editedText: wasEdited ? finalEditedText : null,
          wasEdited,
          requestNumber: testimonial.request_number,
          serviceTitle: testimonial.service_title
        }
      });
    } catch (emailError) {
      console.error('⚠️ Failed to send approval email (testimonial still approved):', emailError);
    }

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('testimonial', id, 'updated', {
      action: 'approved',
      testimonialId: id
    });

    res.json({
      success: true,
      message: 'Testimonial approved successfully'
    });

  } catch (error) {
    console.error('❌ Error approving testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve testimonial'
    });
  }
});

/**
 * PATCH /api/admin/testimonials/:id/unapprove
 * Unapprove a testimonial
 */
router.patch('/:id/unapprove', authMiddleware, requirePermission('approve.testimonials.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Check if testimonial exists
    const testimonialQuery = await pool.query(`
      SELECT id, is_approved
      FROM service_testimonials
      WHERE id = $1
    `, [id]);

    if (testimonialQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    if (!testimonialQuery.rows[0].is_approved) {
      return res.status(400).json({
        success: false,
        message: 'Testimonial is not approved'
      });
    }

    // Unapprove the testimonial
    await pool.query(`
      UPDATE service_testimonials
      SET
        is_approved = false,
        approved_by_employee_id = NULL,
        approved_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('testimonial', id, 'updated', {
      action: 'unapproved',
      testimonialId: id
    });

    res.json({
      success: true,
      message: 'Testimonial unapproved successfully'
    });

  } catch (error) {
    console.error('❌ Error unapproving testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unapprove testimonial'
    });
  }
});

/**
 * DELETE /api/admin/testimonials/:id
 * Delete a testimonial
 */
router.delete('/:id', authMiddleware, requirePermission('delete.testimonials.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.query(`
      DELETE FROM service_testimonials
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }

    // Broadcast WebSocket update to all admins
    websocketService.broadcastEntityUpdate('testimonial', id, 'deleted', {
      action: 'deleted',
      testimonialId: id
    });

    res.json({
      success: true,
      message: 'Testimonial deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete testimonial'
    });
  }
});

/**
 * GET /api/admin/testimonials/stats/summary
 * Get testimonial statistics
 */
router.get('/stats/summary', authMiddleware, requirePermission('view.testimonials.enable'), async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        COUNT(*) as total_testimonials,
        COUNT(*) FILTER (WHERE is_approved = true) as approved_count,
        COUNT(*) FILTER (WHERE is_approved = false) as pending_count,
        COUNT(*) FILTER (WHERE allow_public_display = true AND is_approved = true) as public_approved_count,
        AVG(sr.total_score) FILTER (WHERE st.id IS NOT NULL) as avg_score_with_testimonial
      FROM service_testimonials st
      JOIN service_ratings sr ON st.service_rating_id = sr.id
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      stats: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching testimonial stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonial statistics'
    });
  }
});

export default router;
