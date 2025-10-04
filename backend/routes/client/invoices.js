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

  console.log('📋 Client invoices request - clientId:', clientId);

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

    console.log('📋 Found invoices for client:', result.rows.length);

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
 * Calculate cost estimate for a service request
 */
const calculateCost = async (pool, date, timeStart, timeEnd, baseRate, isFirstRequest, categoryName) => {
  if (!date || !timeStart || !timeEnd || !baseRate) return null;

  // Parse times
  const [startHour, startMin] = timeStart.split(':').map(Number);
  const [endHour, endMin] = timeEnd.split(':').map(Number);

  // Calculate duration in hours
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const durationHours = (endMinutes - startMinutes) / 60;

  // Get day of week from date
  const requestDate = new Date(date);
  const dayOfWeek = requestDate.getDay();

  // Load rate tiers for this day
  const tiersQuery = `
    SELECT tier_name, tier_level, time_start, time_end, rate_multiplier
    FROM service_hour_rate_tiers
    WHERE is_active = true AND day_of_week = $1
    ORDER BY tier_level DESC
  `;
  const tiersResult = await pool.query(tiersQuery, [dayOfWeek]);
  const rateTiers = tiersResult.rows;

  // Helper to find rate tier for a specific time
  const findRateTier = (hour, minute) => {
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    const matchingTier = rateTiers.find(tier =>
      timeString >= tier.time_start && timeString < tier.time_end
    );
    return matchingTier ? {
      tierName: matchingTier.tier_name,
      multiplier: parseFloat(matchingTier.rate_multiplier)
    } : { tierName: 'Standard', multiplier: 1.0 };
  };

  // Calculate cost by 30-minute increments
  let totalCost = 0;
  const tierBlocks = [];
  let currentBlock = null;

  let currentHour = startHour;
  let currentMinute = startMin;

  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMin)) {
    const tier = findRateTier(currentHour, currentMinute);
    const incrementCost = (baseRate * tier.multiplier) / 2; // Half-hour rate
    totalCost += incrementCost;

    // Group contiguous blocks of same tier
    if (currentBlock && currentBlock.tierName === tier.tierName && currentBlock.multiplier === tier.multiplier) {
      currentBlock.halfHourCount += 1;
    } else {
      if (currentBlock) {
        const hours = currentBlock.halfHourCount / 2;
        tierBlocks.push({
          tierName: currentBlock.tierName,
          multiplier: currentBlock.multiplier,
          hours,
          cost: hours * baseRate * currentBlock.multiplier
        });
      }
      currentBlock = { tierName: tier.tierName, multiplier: tier.multiplier, halfHourCount: 1 };
    }

    // Advance by 30 minutes
    currentMinute += 30;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }

  // Save final block
  if (currentBlock) {
    const hours = currentBlock.halfHourCount / 2;
    tierBlocks.push({
      tierName: currentBlock.tierName,
      multiplier: currentBlock.multiplier,
      hours,
      cost: hours * baseRate * currentBlock.multiplier
    });
  }

  // Apply first-hour comp for first-time clients
  let firstHourDiscount = 0;
  const firstHourCompBreakdown = [];

  if (isFirstRequest && durationHours >= 1) {
    let hoursAccounted = 0;
    for (const block of tierBlocks) {
      if (hoursAccounted >= 1) break;

      const hoursInThisBlock = Math.min(block.hours, 1 - hoursAccounted);
      const discountForThisBlock = hoursInThisBlock * baseRate * block.multiplier;

      firstHourCompBreakdown.push({
        tierName: block.tierName,
        multiplier: block.multiplier,
        hours: hoursInThisBlock,
        discount: discountForThisBlock
      });

      firstHourDiscount += discountForThisBlock;
      hoursAccounted += hoursInThisBlock;
    }
  }

  const finalTotal = Math.max(0, totalCost - firstHourDiscount);

  return {
    baseRate,
    rateCategoryName: categoryName,
    durationHours,
    total: finalTotal,
    subtotal: totalCost,
    firstHourDiscount: firstHourDiscount > 0 ? firstHourDiscount : undefined,
    firstHourCompBreakdown: firstHourCompBreakdown.length > 0 ? firstHourCompBreakdown : undefined,
    breakdown: tierBlocks,
    isFirstRequest
  };
};

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
        b.rate_category_id,
        sr.request_number,
        sr.title as service_title,
        sr.description as service_description,
        sr.created_at as service_created_at,
        sr.closed_at as service_completed_at,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.primary_contact_name,
        sr.primary_contact_phone,
        sr.resolution_summary,
        st.name as service_type,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        e.first_name as technician_first_name,
        e.last_name as technician_last_name
      FROM invoices i
      JOIN businesses b ON i.business_id = b.id
      JOIN users u ON b.id = u.business_id
      JOIN service_requests sr ON i.service_request_id = sr.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN employees e ON sr.closed_by_employee_id = e.id
      WHERE i.id = $1 AND u.id = $2
    `;

    const result = await pool.query(query, [id, clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    const invoiceData = result.rows[0];

    // Use stored snapshots (calculated at invoice generation time)
    // This ensures historical invoices remain unchanged even if rate schedules are modified
    const costEstimate = invoiceData.original_cost_estimate || null;
    const actualHoursBreakdown = invoiceData.actual_hours_breakdown || null;

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
        invoice: invoiceData,
        companyInfo,
        costEstimate,
        actualHoursBreakdown,
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
