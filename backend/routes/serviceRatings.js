import express from 'express';
import crypto from 'crypto';
import { getPool } from '../config/database.js';

const router = express.Router();

/**
 * GET /api/ratings/questions
 * Get all active rating questions (public endpoint)
 */
router.get('/questions', async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT
        id,
        question_key,
        question_text,
        display_order
      FROM rating_questions
      WHERE is_active = true
      ORDER BY display_order ASC
    `);

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
 * GET /api/ratings/verify/:token
 * Verify a rating token and get service request details
 */
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await getPool();

    // Check if rating already exists for this token
    const existingRating = await pool.query(`
      SELECT
        sr.id as rating_id,
        sr.total_score,
        sr.submitted_at,
        sreq.request_number,
        sreq.title
      FROM service_ratings sr
      JOIN service_requests sreq ON sr.service_request_id = sreq.id
      WHERE sr.rating_token = $1
    `, [token]);

    if (existingRating.rows.length > 0) {
      return res.json({
        success: true,
        alreadyRated: true,
        rating: existingRating.rows[0]
      });
    }

    // Token doesn't exist yet - this is expected for new ratings
    // We'll create the token when the service request is completed
    return res.status(404).json({
      success: false,
      message: 'Rating token not found or expired'
    });

  } catch (error) {
    console.error('❌ Error verifying rating token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify rating token'
    });
  }
});

/**
 * GET /api/ratings/:token
 * Get service request details for rating (without auth - uses token)
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = await getPool();

    // Get service request details using the token
    // First check if rating exists
    const ratingQuery = await pool.query(`
      SELECT
        sr.id as rating_id,
        sr.service_request_id,
        sr.total_score,
        sr.submitted_at,
        sreq.request_number,
        sreq.title,
        sreq.description,
        sreq.completed_date,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.email as client_email
      FROM service_ratings sr
      JOIN service_requests sreq ON sr.service_request_id = sreq.id
      JOIN users u ON sr.client_id = u.id
      WHERE sr.rating_token = $1
      AND sr.token_expires_at > NOW()
    `, [token]);

    if (ratingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found or token expired'
      });
    }

    const ratingData = ratingQuery.rows[0];

    // Check if already submitted
    if (ratingData.submitted_at) {
      return res.json({
        success: true,
        alreadySubmitted: true,
        rating: {
          totalScore: ratingData.total_score,
          submittedAt: ratingData.submitted_at,
          requestNumber: ratingData.request_number
        }
      });
    }

    res.json({
      success: true,
      serviceRequest: {
        requestNumber: ratingData.request_number,
        title: ratingData.title,
        description: ratingData.description,
        completedDate: ratingData.completed_date
      }
    });

  } catch (error) {
    console.error('❌ Error fetching rating details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating details'
    });
  }
});

/**
 * POST /api/ratings/:token
 * Submit a service rating (without auth - uses token)
 */
router.post('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { ratings } = req.body; // Expected format: { questionId: ratingValue }

    if (!ratings || typeof ratings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Ratings object is required'
      });
    }

    const pool = await getPool();

    // Get the rating record
    const ratingQuery = await pool.query(`
      SELECT id, service_request_id, client_id, submitted_at, token_expires_at
      FROM service_ratings
      WHERE rating_token = $1
    `, [token]);

    if (ratingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    const ratingRecord = ratingQuery.rows[0];

    // Check if token expired
    if (new Date(ratingRecord.token_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Rating token has expired'
      });
    }

    // Check if already submitted
    if (ratingRecord.submitted_at) {
      return res.status(400).json({
        success: false,
        message: 'Rating has already been submitted'
      });
    }

    // Get active rating questions
    const questionsResult = await pool.query(`
      SELECT id FROM rating_questions WHERE is_active = true
    `);
    const activeQuestionIds = questionsResult.rows.map(q => q.id);

    // Validate all ratings
    for (const [questionId, ratingValue] of Object.entries(ratings)) {
      if (!activeQuestionIds.includes(questionId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid question ID: ${questionId}`
        });
      }
      if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({
          success: false,
          message: 'All ratings must be between 1 and 5'
        });
      }
    }

    // Check if all active questions have been answered
    if (Object.keys(ratings).length !== activeQuestionIds.length) {
      return res.status(400).json({
        success: false,
        message: 'All rating questions must be answered'
      });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Insert rating responses
      for (const [questionId, ratingValue] of Object.entries(ratings)) {
        await pool.query(`
          INSERT INTO rating_responses (
            service_rating_id,
            rating_question_id,
            rating_value
          ) VALUES ($1, $2, $3)
          ON CONFLICT (service_rating_id, rating_question_id)
          DO UPDATE SET rating_value = EXCLUDED.rating_value
        `, [ratingRecord.id, questionId, ratingValue]);
      }

      // Calculate total score
      const totalScoreResult = await pool.query(`
        SELECT COALESCE(SUM(rating_value), 0) as total
        FROM rating_responses
        WHERE service_rating_id = $1
      `, [ratingRecord.id]);

      const totalScore = parseInt(totalScoreResult.rows[0].total);

      // Update service_ratings with submitted_at and total_score
      await pool.query(`
        UPDATE service_ratings
        SET
          submitted_at = CURRENT_TIMESTAMP,
          total_score = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [totalScore, ratingRecord.id]);

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: 'Rating submitted successfully',
        totalScore,
        eligibleForTestimonial: totalScore >= 18
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error submitting rating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating'
    });
  }
});

/**
 * POST /api/ratings/:token/testimonial
 * Submit a testimonial (without auth - uses rating token)
 */
router.post('/:token/testimonial', async (req, res) => {
  try {
    const { token } = req.params;
    const { testimonialText, displayNamePreference, allowPublicDisplay } = req.body;

    // Validate input
    if (!testimonialText || testimonialText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Testimonial text is required'
      });
    }

    if (!['first_name', 'last_name', 'full_name', 'anonymous'].includes(displayNamePreference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid display name preference'
      });
    }

    const pool = await getPool();

    // Get the rating record
    const ratingQuery = await pool.query(`
      SELECT
        sr.id,
        sr.service_request_id,
        sr.client_id,
        sr.total_score,
        sr.token_expires_at
      FROM service_ratings sr
      WHERE sr.rating_token = $1
    `, [token]);

    if (ratingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    const ratingRecord = ratingQuery.rows[0];

    // Check if token expired
    if (new Date(ratingRecord.token_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Rating token has expired'
      });
    }

    // Check if score is high enough (18 or higher)
    if (ratingRecord.total_score < 18) {
      return res.status(400).json({
        success: false,
        message: 'Testimonials are only available for ratings of 18 or higher'
      });
    }

    // Check if testimonial already exists
    const existingTestimonial = await pool.query(`
      SELECT id FROM service_testimonials
      WHERE service_rating_id = $1
    `, [ratingRecord.id]);

    if (existingTestimonial.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Testimonial has already been submitted for this rating'
      });
    }

    // Insert testimonial
    const insertResult = await pool.query(`
      INSERT INTO service_testimonials (
        service_request_id,
        service_rating_id,
        client_id,
        testimonial_text,
        display_name_preference,
        allow_public_display,
        submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      ratingRecord.service_request_id,
      ratingRecord.id,
      ratingRecord.client_id,
      testimonialText.trim(),
      displayNamePreference,
      allowPublicDisplay === true
    ]);

    res.json({
      success: true,
      message: 'Testimonial submitted successfully',
      testimonialId: insertResult.rows[0].id
    });

  } catch (error) {
    console.error('❌ Error submitting testimonial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit testimonial'
    });
  }
});

export default router;
