import express from 'express';
import { getPool } from '../../config/database.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

/**
 * GET /api/admin/invoices/:id
 * Get invoice by ID with full details
 */
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = `
      SELECT
        i.*,
        b.business_name,
        b.is_individual,
        sr.primary_contact_name,
        sr.primary_contact_email,
        sr.primary_contact_phone,
        sr.description as service_description,
        sr.resolution_summary,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        COALESCE(sl.street_address_1, sl.street) as street_address,
        sl.city,
        sl.state,
        sl.zip_code,
        sr.request_number,
        sr.title as service_title,
        sr.created_at as service_created_at,
        sr.closed_at as service_completed_at
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN service_requests sr ON i.service_request_id = sr.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      WHERE i.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const invoiceData = result.rows[0];

    // Use stored snapshots (calculated at invoice generation time)
    // This ensures historical invoices remain unchanged even if rate schedules are modified
    const costEstimate = invoiceData.original_cost_estimate || null;
    const actualHoursBreakdown = invoiceData.actual_hours_breakdown || null;

    // Get company settings for invoice header
    const settingsQuery = `SELECT setting_key, setting_value FROM company_settings`;
    const settingsResult = await pool.query(settingsQuery);
    const companyInfo = {};
    settingsResult.rows.forEach(row => {
      companyInfo[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      data: {
        invoice: invoiceData,
        companyInfo,
        costEstimate,
        actualHoursBreakdown
      }
    });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/invoices
 * List invoices with filtering and pagination
 */
router.get('/invoices', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      paymentStatus,
      businessId,
      dueDateFrom,
      dueDateTo,
      paymentDateFrom,
      paymentDateTo,
      sortBy = 'issue_date',
      sortOrder = 'DESC'
    } = req.query;

    const pool = await getPool();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(`i.payment_status = $${paramIndex}`);
      params.push(paymentStatus);
      paramIndex++;
    }

    if (businessId) {
      conditions.push(`i.business_id = $${paramIndex}`);
      params.push(businessId);
      paramIndex++;
    }

    if (dueDateFrom) {
      conditions.push(`i.due_date >= $${paramIndex}`);
      params.push(dueDateFrom);
      paramIndex++;
    }

    if (dueDateTo) {
      conditions.push(`i.due_date <= $${paramIndex}`);
      params.push(dueDateTo);
      paramIndex++;
    }

    if (paymentDateFrom) {
      conditions.push(`i.payment_date >= $${paramIndex}`);
      params.push(paymentDateFrom);
      paramIndex++;
    }

    if (paymentDateTo) {
      conditions.push(`i.payment_date <= $${paramIndex}`);
      params.push(paymentDateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Main query
    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.payment_date,
        i.payment_status,
        i.total_amount,
        i.is_first_service_request,
        b.business_name,
        sr.request_number,
        sr.title as service_title
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN service_requests sr ON i.service_request_id = sr.id
      ${whereClause}
      ORDER BY i.${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM invoices i
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        invoices: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/admin/invoices/:id/payment-status
 * Update invoice payment status
 */
router.patch('/invoices/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentDate, notes } = req.body;
    const pool = await getPool();

    if (!paymentStatus || !['due', 'pending', 'paid', 'failed', 'overdue', 'comped'].includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment status is required (due, pending, paid, failed, overdue, comped)'
      });
    }

    const updates = ['payment_status = $1'];
    const params = [paymentStatus];
    let paramIndex = 2;

    if (paymentDate) {
      updates.push(`payment_date = $${paramIndex}`);
      params.push(paymentDate);
      paramIndex++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    params.push(id);

    const query = `
      UPDATE invoices
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, invoice_number, payment_status, payment_date
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const updatedInvoice = result.rows[0];

    // Get business ID and client ID to notify the correct client
    const businessQuery = await pool.query(`
      SELECT i.business_id, u.id as client_id
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      WHERE i.id = $1
      LIMIT 1
    `, [id]);

    if (businessQuery.rows.length > 0) {
      const { client_id } = businessQuery.rows[0];

      // Notify the specific client about the invoice update
      websocketService.notifyClientOfInvoiceUpdate(client_id, {
        invoiceId: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoice_number,
        paymentStatus: updatedInvoice.payment_status,
        paymentDate: updatedInvoice.payment_date,
        type: 'status_change'
      });
    }

    // Also notify admins
    websocketService.broadcastInvoiceUpdateToAdmins({
      invoiceId: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoice_number,
      paymentStatus: updatedInvoice.payment_status,
      type: 'status_change'
    });

    res.json({
      success: true,
      message: 'Invoice payment status updated successfully',
      data: updatedInvoice
    });

  } catch (error) {
    console.error('Error updating invoice payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update invoice payment status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;
