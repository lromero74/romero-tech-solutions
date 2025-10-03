import express from 'express';
import { getPool } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

const router = express.Router();

/**
 * GET /api/client/invoices
 * List all invoices for the authenticated client's business
 */
router.get('/', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const clientId = req.user.clientId;

  try {

    const {
      page = 1,
      limit = 20,
      paymentStatus,
      sortBy = 'issue_date',
      sortOrder = 'DESC',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions = ['u.id = $1']; // Filter by user
    const params = [clientId];
    let paramIndex = 2;

    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(`i.payment_status = $${paramIndex}`);
      params.push(paymentStatus);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countQuery = `
      SELECT COUNT(*)
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, paramIndex - 1));
    const totalCount = parseInt(countResult.rows[0].count);

    // Main query
    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.subtotal,
        i.tax_rate,
        i.tax_amount,
        i.total_amount,
        i.issue_date,
        i.due_date,
        i.payment_date,
        i.payment_status,
        i.payment_method,
        i.stripe_payment_intent_id,
        i.work_description,
        sr.request_number,
        sr.title as service_title
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      JOIN service_requests sr ON i.service_request_id = sr.id
      WHERE ${whereClause}
      ORDER BY i.${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        invoices: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('❌ Error fetching client invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices',
      message: error.message,
    });
  }
});

/**
 * GET /api/client/invoices/:id
 * Get a single invoice with full details
 */
router.get('/:id', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const clientId = req.user.clientId;
  const { id } = req.params;

  try {
    const query = `
      SELECT
        i.*,
        b.business_name,
        b.is_individual,
        sr.request_number,
        sr.title as service_title,
        sr.created_at as service_created_at,
        sr.closed_at as service_completed_at,
        l.name as location_name,
        l.street_address_1,
        l.street_address_2,
        l.city,
        l.state,
        l.zip_code
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      JOIN service_requests sr ON i.service_request_id = sr.id
      LEFT JOIN locations l ON sr.location_id = l.id
      WHERE i.id = $1 AND u.id = $2
    `;

    const result = await pool.query(query, [id, clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    // Get company settings for invoice header
    const settingsQuery = `
      SELECT setting_key, setting_value
      FROM company_settings
      WHERE setting_key IN (
        'company_name',
        'company_address',
        'company_city',
        'company_state',
        'company_zip',
        'company_phone',
        'company_email'
      )
    `;
    const settingsResult = await pool.query(settingsQuery);
    const companyInfo = {};
    settingsResult.rows.forEach((row) => {
      companyInfo[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      data: {
        invoice: result.rows[0],
        companyInfo,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching invoice details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice details',
      message: error.message,
    });
  }
});

/**
 * GET /api/client/invoices/summary/stats
 * Get invoice summary statistics for the client
 */
router.get('/summary/stats', authenticateClient, async (req, res) => {
  const pool = await getPool();
  const clientId = req.user.clientId;

  try {
    const query = `
      SELECT
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE payment_status = 'overdue') as overdue_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'overdue'), 0) as overdue_amount
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE u.id = $1
    `;

    const result = await pool.query(query, [clientId]);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Error fetching invoice stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice statistics',
      message: error.message,
    });
  }
});

export default router;
