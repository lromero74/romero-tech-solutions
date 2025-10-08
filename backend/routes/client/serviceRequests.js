import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware, validateFileUpload } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import { generateRequestNumber } from '../../utils/requestNumberGenerator.js';
import { sendServiceRequestNotificationToTechnicians, sendServiceRequestConfirmationToClient, sendNoteAdditionNotification } from '../../services/emailService.js';
import { initializeServiceRequestWorkflow } from '../../services/workflowService.js';
import { websocketService } from '../../services/websocketService.js';
import { sendNotificationToEmployees } from '../pushRoutes.js';
import virusScanService from '../../services/virusScanService.js';
import quotaManagementService from '../../services/quotaManagementService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply middleware
router.use(authMiddleware);
router.use(clientContextMiddleware);
router.use(requireClientAccess(['business', 'location']));
router.use(sanitizeInputMiddleware);

/**
 * POST /api/client/service-requests
 * Create a new service request
 */
router.post('/', async (req, res) => {
  try {
    console.log('📥 Received service request data:', JSON.stringify(req.body, null, 2));

    const {
      title,
      description,
      service_location_id: serviceLocationId,
      requested_date: requestedDate,
      requested_time_start: requestedTimeStart,
      requested_time_end: requestedTimeEnd,
      requested_datetime: requestedDatetime,
      requested_duration_minutes: requestedDuration,
      urgency_level_id: urgencyLevelId,
      priority_level_id: priorityLevelId,
      contact_name: primaryContactName,
      contact_phone: primaryContactPhone,
      contact_email: primaryContactEmail,
      service_type_id: serviceTypeId,
      attachment_file_ids: attachmentFileIds = []
    } = req.body;

    const businessId = req.user.businessId;
    const clientId = req.user.id; // authMiddleware sets req.user.id

    // Get database pool
    const pool = await getPool();

    // Check if client has reached the limit of 5 open service requests
    const openRequestsQuery = `
      SELECT COUNT(*) as count
      FROM service_requests sr
      JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.client_id = $1
        AND sr.soft_delete = false
        AND srs.is_final_status = false
    `;
    const openRequestsResult = await pool.query(openRequestsQuery, [clientId]);
    const openRequestsCount = parseInt(openRequestsResult.rows[0].count);

    if (openRequestsCount >= 5) {
      return res.status(400).json({
        success: false,
        message: 'You have reached the maximum limit of 5 open service requests. Please wait for some to be completed before submitting new requests.'
      });
    }

    // Generate unique request number (SR-YYYY-NNNNN format)
    const requestNumber = await generateRequestNumber(pool);
    const statusQuery = `
      SELECT id FROM service_request_statuses
      WHERE name = 'Submitted' AND is_active = true
      ORDER BY display_order ASC, created_at ASC
      LIMIT 1
    `;
    const statusResult = await pool.query(statusQuery);

    if (statusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No default service request status found. Please contact administrator.'
      });
    }

    const defaultStatusId = statusResult.rows[0].id;

    // Get default priority level if not provided or invalid UUID
    let finalPriorityLevelId = priorityLevelId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!finalPriorityLevelId || !uuidRegex.test(finalPriorityLevelId)) {
      const priorityQuery = `
        SELECT id FROM priority_levels
        WHERE name = 'Medium'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      const priorityResult = await pool.query(priorityQuery);
      if (priorityResult.rows.length > 0) {
        finalPriorityLevelId = priorityResult.rows[0].id;
      } else {
        return res.status(500).json({
          success: false,
          message: 'No default priority level found. Please contact administrator.'
        });
      }
    }

    // Create service request
    const insertQuery = `
      INSERT INTO service_requests (
        request_number,
        title,
        description,
        client_id,
        business_id,
        service_location_id,
        created_by_user_id,
        requested_datetime,
        requested_duration_minutes,
        urgency_level_id,
        priority_level_id,
        status_id,
        primary_contact_name,
        primary_contact_phone,
        primary_contact_email,
        service_type_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING id, request_number, created_at
    `;

    const values = [
      requestNumber,
      title || 'Service Request',
      description || '',
      clientId,
      businessId,
      serviceLocationId,
      clientId,
      requestedDatetime,
      requestedDuration,
      urgencyLevelId,
      finalPriorityLevelId,
      defaultStatusId,
      primaryContactName,
      primaryContactPhone,
      primaryContactEmail,
      serviceTypeId
    ];

    const result = await pool.query(insertQuery, values);
    const serviceRequestId = result.rows[0].id;

    // Associate uploaded files with the service request
    if (attachmentFileIds && attachmentFileIds.length > 0) {
      console.log(`🔗 Associating ${attachmentFileIds.length} files with service request ${requestNumber}`);

      for (const fileId of attachmentFileIds) {
        try {
          // Verify file belongs to this client and business
          const fileCheckQuery = `
            SELECT id, original_filename
            FROM t_client_files
            WHERE id = $1 AND business_id = $2 AND uploaded_by_user_id = $3 AND soft_delete = false
          `;
          const fileCheckResult = await pool.query(fileCheckQuery, [fileId, businessId, clientId]);

          if (fileCheckResult.rows.length > 0) {
            // Associate file with service request
            const updateFileQuery = `
              UPDATE t_client_files
              SET service_request_id = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `;
            await pool.query(updateFileQuery, [serviceRequestId, fileId]);

            console.log(`✅ Associated file ${fileCheckResult.rows[0].original_filename} with service request ${requestNumber}`);
          } else {
            console.warn(`⚠️ File ${fileId} not found or doesn't belong to client - skipping association`);
          }
        } catch (fileError) {
          console.error(`❌ Error associating file ${fileId}:`, fileError);
          // Continue with other files even if one fails
        }
      }
    }

    // Log the creation
    console.log(`📋 Service request created: ${requestNumber} for business ${businessId}`);

    // Initialize automated workflow (async - don't block response)
    const initializeWorkflow = async () => {
      try {
        // Fetch detailed service request data for workflow initialization
        const serviceRequestDetailsQuery = `
          SELECT
            sr.request_number,
            sr.title,
            sr.description,
            u.first_name as client_first_name,
            u.last_name as client_last_name
          FROM service_requests sr
          JOIN users u ON sr.client_id = u.id
          WHERE sr.id = $1
        `;
        const detailsResult = await pool.query(serviceRequestDetailsQuery, [serviceRequestId]);
        const srDetails = detailsResult.rows[0];

        const serviceRequestData = {
          requestNumber: srDetails.request_number,
          title: srDetails.title,
          description: srDetails.description,
          clientName: `${srDetails.client_first_name} ${srDetails.client_last_name}`
        };

        // Initialize automated workflow (sends emails to executives, admins, technicians)
        await initializeServiceRequestWorkflow(serviceRequestId, serviceRequestData);

        console.log(`✅ Workflow initialized for service request ${requestNumber}`);

      } catch (workflowError) {
        console.error('❌ Error initializing service request workflow:', workflowError);
        // Don't throw - workflow is supplementary and shouldn't break the main flow
      }
    };

    // Initialize workflow asynchronously (don't await - don't block response)
    initializeWorkflow();

    // Send push notification for new service request
    const sendPushNotification = async () => {
      try {
        console.log(`🔔 [ServiceRequest] Starting push notification process for ${requestNumber}`);

        // Get business name for notification
        const businessQuery = await pool.query(
          'SELECT business_name FROM businesses WHERE id = $1',
          [businessId]
        );
        const businessName = businessQuery.rows[0]?.business_name || 'Unknown Business';

        const notificationData = {
          title: '🔧 New Service Request',
          body: `${businessName} submitted: ${title || 'Service Request'} #${requestNumber}`,
          icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          // Enhanced vibration pattern for better noticeability
          vibrate: [200, 100, 200, 100, 200], // Triple pulse pattern
          // Sound - browser will use default notification sound
          sound: '/notification-sound.mp3', // Optional custom sound
          // Require interaction to dismiss (makes it persist)
          requireInteraction: true,
          // High priority tag to make it more prominent
          tag: `service-request-${serviceRequestId}`,
          // Renotify to ensure it shows even if similar notification exists
          renotify: true,
          data: {
            type: 'new_service_request',
            serviceRequestId: serviceRequestId,
            requestNumber: requestNumber,
            businessId: businessId,
            businessName: businessName,
            title: title || 'Service Request',
            urgency: urgencyLevelId === 3 ? 'urgent' : urgencyLevelId === 2 ? 'high' : 'normal',
            timestamp: Date.now(),
            url: `/admin/service-requests/${serviceRequestId}`
          }
        };

        console.log(`🔔 [ServiceRequest] Calling sendNotificationToEmployees for ${requestNumber}`);
        const result = await sendNotificationToEmployees(
          'new_service_request',
          notificationData,
          'view.service_requests.enable'  // Use existing permission for those who can view service requests
        );
        console.log(`✅ [ServiceRequest] Push notification result for ${requestNumber}:`, result);
      } catch (notificationError) {
        console.error(`⚠️ [ServiceRequest] Failed to send push notification for ${requestNumber}:`, notificationError);
        // Don't fail the request if notification fails
      }
    };

    // Send push notification asynchronously
    sendPushNotification();

    // Fetch full service request data for WebSocket broadcast (optimistic updates)
    const fetchAndBroadcast = async () => {
      try {
        console.log(`🔍 Fetching full data for service request ${serviceRequestId} to broadcast...`);
        const fullDataQuery = `
          SELECT
            sr.id,
            sr.request_number,
            sr.title,
            sr.description,
            sr.client_id,
            sr.business_id,
            sr.service_location_id,
            sr.status_id,
            sr.priority_level_id,
            sr.urgency_level_id,
            sr.service_type_id,
            sr.assigned_to_employee_id,
            sr.requested_datetime,
            sr.requested_duration_minutes,
            sr.scheduled_datetime,
            sr.scheduled_duration_minutes,
            sr.actual_start_datetime,
            sr.actual_end_datetime,
            sr.actual_duration_minutes,
            sr.completion_datetime,
            sr.created_at,
            sr.updated_at,
            sr.soft_delete,
            u.first_name as client_first_name,
            u.last_name as client_last_name,
            u.email as client_email,
            b.business_name,
            srs.name as status,
            srs.color_code as status_color,
            pl.name as priority_name,
            ul.name as urgency_name,
            st.type_name as service_type_name,
            e.first_name as assigned_employee_first_name,
            e.last_name as assigned_employee_last_name
          FROM service_requests sr
          LEFT JOIN users u ON sr.client_id = u.id
          LEFT JOIN businesses b ON sr.business_id = b.id
          LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
          LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
          LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
          LEFT JOIN service_types st ON sr.service_type_id = st.id
          LEFT JOIN employees e ON sr.assigned_to_employee_id = e.id
          WHERE sr.id = $1
        `;
        const fullDataResult = await pool.query(fullDataQuery, [serviceRequestId]);
        console.log(`📊 Query returned ${fullDataResult.rows.length} row(s)`);

        if (fullDataResult.rows.length > 0) {
          const fullData = fullDataResult.rows[0];
          console.log(`✅ Broadcasting full service request data: ${fullData.request_number}`);
          // Broadcast service request creation with full data for optimistic updates
          websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'created', {
            serviceRequest: fullData
          });
        } else {
          console.warn(`⚠️ Query returned no rows, using fallback broadcast`);
          // Fallback: broadcast with partial data
          websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'created', {
            requestNumber: result.rows[0].request_number,
            title,
            businessId
          });
        }
      } catch (error) {
        console.error('❌ Error fetching full service request data for broadcast:', error);
        console.error('Stack trace:', error.stack);
        // Fallback: broadcast with partial data
        websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'created', {
          requestNumber: result.rows[0].request_number,
          title,
          businessId
        });
      }
    };

    // Fetch and broadcast asynchronously (don't block response)
    fetchAndBroadcast();

    res.status(201).json({
      success: true,
      message: 'Service request created successfully',
      data: {
        id: serviceRequestId,
        requestNumber: result.rows[0].request_number,
        createdAt: result.rows[0].created_at,
        associatedFiles: attachmentFileIds.length
      }
    });

  } catch (error) {
    console.error('❌ Error creating service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service request'
    });
  }
});

/**
 * GET /api/client/service-requests
 * Get service requests for authenticated client
 */
router.get('/', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const clientId = req.user.id; // authMiddleware sets req.user.id
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const hideClosed = req.query.hideClosed === 'true'; // Get hideClosed filter

    const query = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        sr.scheduled_datetime,
        sr.scheduled_duration_minutes,
        sr.created_at,
        sr.updated_at,
        srs.name as status,
        srs.description as status_description,
        ul.name as urgency_name,
        pl.name as priority_name,
        st.name as service_name,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        sl.contact_phone as location_contact_phone,
        sl.contact_person as location_contact_person,
        sl.contact_email as location_contact_email,
        COUNT(cf.id) as file_count,
        COUNT(*) OVER() as total_count
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN t_client_files cf ON sr.id = cf.service_request_id AND cf.soft_delete = false
      WHERE sr.business_id = $1 AND sr.client_id = $2 AND sr.soft_delete = false
        ${hideClosed ? "AND srs.name NOT IN ('Closed', 'Cancelled')" : ''}
      GROUP BY sr.id, srs.name, srs.description, ul.name,
               pl.name, st.name, sl.location_name, sl.street_address_1,
               sl.street_address_2, sl.city, sl.state, sl.zip_code,
               sl.contact_phone, sl.contact_person, sl.contact_email
      ORDER BY sr.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const pool = await getPool();
    const result = await pool.query(query, [businessId, clientId, limit, offset]);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    // Fetch business-specific base hourly rate from rate category
    let baseHourlyRate = 75; // Fallback default
    let rateCategoryName = 'Standard'; // Fallback default
    try {
      const rateResult = await pool.query(`
        SELECT
          b.id,
          b.rate_category_id,
          rc.base_hourly_rate as category_rate,
          rc.category_name as category_name,
          (SELECT base_hourly_rate FROM hourly_rate_categories WHERE is_default = true LIMIT 1) as default_rate,
          (SELECT category_name FROM hourly_rate_categories WHERE is_default = true LIMIT 1) as default_category_name
        FROM businesses b
        LEFT JOIN hourly_rate_categories rc ON b.rate_category_id = rc.id
        WHERE b.id = $1
      `, [businessId]);

      if (rateResult.rows.length > 0) {
        const business = rateResult.rows[0];
        // Use business category rate if assigned, otherwise use default category rate
        baseHourlyRate = parseFloat(business.category_rate || business.default_rate || 75);
        rateCategoryName = business.category_name || business.default_category_name || 'Standard';
      }
    } catch (error) {
      console.error('Error fetching base hourly rate, using fallback:', error);
    }

    // Helper to check if a service request is the first non-cancelled one for this client
    // First-hour comp applies to the first service request that isn't cancelled
    // If all previous requests were cancelled, a new request can still get the comp
    const isFirstNonCancelledRequest = async (requestId, requestCreatedAt) => {
      const previousNonCancelledCheck = await pool.query(`
        SELECT COUNT(*) as count
        FROM service_requests sr
        JOIN service_request_statuses srs ON sr.status_id = srs.id
        WHERE sr.client_id = $1
          AND sr.soft_delete = false
          AND sr.created_at < $2
          AND srs.name != 'Cancelled'
      `, [clientId, requestCreatedAt]);

      return parseInt(previousNonCancelledCheck.rows[0].count) === 0;
    };

    // Helper function to calculate estimated cost with first-hour waiver for new clients
    const calculateCost = async (date, timeStart, timeEnd, baseRate, isFirstRequest, categoryName) => {
      if (!date || !timeStart || !timeEnd || !baseRate) return null;

      // Parse times
      const [startHour, startMin] = timeStart.split(':').map(Number);
      const [endHour, endMin] = timeEnd.split(':').map(Number);

      // Calculate duration in hours
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const durationHours = (endMinutes - startMinutes) / 60;

      // Get day of week from date (in UTC to match tier times)
      const requestDate = new Date(date + 'T00:00:00Z');
      const dayOfWeek = requestDate.getUTCDay();

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
        const result = matchingTier ? {
          tierName: matchingTier.tier_name,
          multiplier: parseFloat(matchingTier.rate_multiplier)
        } : { tierName: 'Standard', multiplier: 1.0 };

        console.log(`🔍 [CLIENT] Tier lookup: ${timeString} → ${result.tierName} @ ${result.multiplier}x`);
        return result;
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

    // Calculate costs for all service requests
    const serviceRequestsWithCosts = await Promise.all(
      result.rows.map(async (row) => {
        // Check if this is the first non-cancelled request for comp eligibility
        const isFirstRequest = await isFirstNonCancelledRequest(row.id, row.created_at);

        // Calculate cost using business-specific rate from rate category
        let costDate, costTimeStart, costTimeEnd;

        if (row.requested_datetime && row.requested_duration_minutes) {
          // Use datetime fields
          const startDateTime = new Date(row.requested_datetime);
          const endDateTime = new Date(startDateTime.getTime() + row.requested_duration_minutes * 60000);

          // Extract date in YYYY-MM-DD format
          costDate = startDateTime.toISOString().split('T')[0];

          // Extract time in HH:MM:SS format (UTC - matches database tier times)
          const formatTime = (date) => {
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            const seconds = String(date.getUTCSeconds()).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
          };

          costTimeStart = formatTime(startDateTime);
          costTimeEnd = formatTime(endDateTime);

          console.log(`🕐 [CLIENT] SR cost calc:`, {
            request_number: row.request_number,
            utc_datetime: startDateTime.toISOString(),
            utc_hours: startDateTime.getUTCHours(),
            costTimeStart,
            costTimeEnd,
            isFirstRequest
          });
        }

        const costInfo = costDate && costTimeStart && costTimeEnd ? await calculateCost(
          costDate,
          costTimeStart,
          costTimeEnd,
          baseHourlyRate,
          isFirstRequest,
          rateCategoryName
        ) : null;

        // Check if we have any location data (address or contact info)
        const hasLocationData = row.street_address_1 || row.city || row.state ||
                               row.location_contact_phone || row.location_contact_person ||
                               row.location_contact_email;

        return {
            id: row.id,
            requestNumber: row.request_number,
            title: row.title,
            description: row.description,
            requestedDatetime: row.requested_datetime,
            requestedDurationMinutes: row.requested_duration_minutes,
            scheduledDatetime: row.scheduled_datetime,
            scheduledDurationMinutes: row.scheduled_duration_minutes,
            status: row.status,
            statusDescription: row.status_description,
            urgency: row.urgency_name,
            priority: row.priority_name,
            serviceType: row.service_name,
            location: row.location_name,
            locationDetails: hasLocationData ? {
              name: row.location_name || 'Service Location',
              streetAddress1: row.street_address_1,
              streetAddress2: row.street_address_2,
              city: row.city,
              state: row.state,
              zipCode: row.zip_code,
              contactPhone: row.location_contact_phone,
              contactPerson: row.location_contact_person,
              contactEmail: row.location_contact_email
            } : null,
            fileCount: parseInt(row.file_count),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            cost: costInfo
        };
      })
    );

    res.json({
      success: true,
      data: {
        serviceRequests: serviceRequestsWithCosts,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching service requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service requests'
    });
  }
});

/**
 * GET /api/client/service-requests/:id
 * Get a single service request for authenticated client (for WebSocket cache updates)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;
    const clientId = req.user.id;
    const pool = await getPool();

    // Query for single service request
    const query = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        sr.scheduled_datetime,
        sr.scheduled_duration_minutes,
        sr.created_at,
        sr.updated_at,
        srs.name as status,
        srs.description as status_description,
        ul.name as urgency_name,
        pl.name as priority_name,
        st.name as service_name,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        sl.contact_phone as location_contact_phone,
        sl.contact_person as location_contact_person,
        sl.contact_email as location_contact_email,
        (SELECT COUNT(*) FROM t_client_files cf WHERE cf.service_request_id = sr.id AND cf.soft_delete = false) as file_count
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      WHERE sr.id = $1 AND sr.business_id = $2 AND sr.client_id = $3 AND sr.soft_delete = false
    `;

    const result = await pool.query(query, [id, businessId, clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const row = result.rows[0];
    const hasLocationData = row.street_address_1 || row.city || row.state ||
                           row.location_contact_phone || row.location_contact_person ||
                           row.location_contact_email;

    const serviceRequest = {
      id: row.id,
      requestNumber: row.request_number,
      title: row.title,
      description: row.description,
      requestedDatetime: row.requested_datetime,
      requestedDurationMinutes: row.requested_duration_minutes,
      scheduledDatetime: row.scheduled_datetime,
      scheduledDurationMinutes: row.scheduled_duration_minutes,
      status: row.status,
      statusDescription: row.status_description,
      urgency: row.urgency_name,
      priority: row.priority_name,
      serviceType: row.service_name,
      location: row.location_name,
      locationDetails: hasLocationData ? {
        name: row.location_name || 'Service Location',
        streetAddress1: row.street_address_1,
        streetAddress2: row.street_address_2,
        city: row.city,
        state: row.state,
        zipCode: row.zip_code,
        contactPhone: row.location_contact_phone,
        contactPerson: row.location_contact_person,
        contactEmail: row.location_contact_email
      } : null,
      fileCount: parseInt(row.file_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    res.json({
      success: true,
      data: serviceRequest
    });

  } catch (error) {
    console.error('❌ Error fetching service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service request'
    });
  }
});

/**
 * GET /api/client/service-requests/:id/files
 * Get files associated with a specific service request
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;
    const clientId = req.user.id; // authMiddleware sets req.user.id

    // Verify service request belongs to this client
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND business_id = $2 AND client_id = $3 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id, businessId, clientId]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Get associated files
    const filesQuery = `
      SELECT
        cf.id,
        cf.original_filename,
        cf.stored_filename,
        cf.file_size_bytes,
        cf.content_type,
        cf.file_description,
        cf.created_at AT TIME ZONE 'UTC' as created_at,
        cf.uploaded_by_user_id,
        cf.uploaded_by_employee_id,
        COALESCE(u.email, e.email) as uploaded_by_email,
        CASE
          WHEN u.id IS NOT NULL THEN 'client'
          WHEN e.id IS NOT NULL THEN 'employee'
          ELSE 'unknown'
        END as uploaded_by_type
      FROM t_client_files cf
      LEFT JOIN users u ON cf.uploaded_by_user_id = u.id
      LEFT JOIN employees e ON cf.uploaded_by_employee_id = e.id
      WHERE cf.service_request_id = $1 AND cf.soft_delete = false
      ORDER BY cf.created_at DESC
    `;

    const filesResult = await pool.query(filesQuery, [id]);

    res.json({
      success: true,
      data: {
        serviceRequestId: id,
        files: filesResult.rows.map(row => ({
          id: row.id,
          originalFilename: row.original_filename,
          storedFilename: row.stored_filename,
          fileSizeBytes: parseInt(row.file_size_bytes),
          contentType: row.content_type,
          description: row.file_description,
          createdAt: row.created_at,
          uploadedByEmail: row.uploaded_by_email,
          uploadedByType: row.uploaded_by_type
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching service request files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service request files'
    });
  }
});

/**
 * GET /api/client/service-requests/:id/notes
 * Get notes for a specific service request
 */
router.get('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;
    const clientId = req.user.id;

    // Verify service request belongs to this client
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND business_id = $2 AND client_id = $3 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id, businessId, clientId]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Get notes visible to client
    const notesQuery = `
      SELECT
        id,
        note_text,
        note_type,
        created_by_type,
        created_by_name,
        created_at
      FROM service_request_notes
      WHERE service_request_id = $1 AND is_visible_to_client = true
      ORDER BY created_at DESC
    `;

    const notesResult = await pool.query(notesQuery, [id]);

    res.json({
      success: true,
      data: {
        serviceRequestId: id,
        notes: notesResult.rows.map(row => ({
          id: row.id,
          noteText: row.note_text,
          noteType: row.note_type,
          createdByType: row.created_by_type,
          createdByName: row.created_by_name,
          createdAt: row.created_at
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching service request notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service request notes'
    });
  }
});

/**
 * POST /api/client/service-requests/:id/notes
 * Add a note to a service request
 */
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteText } = req.body;
    const businessId = req.user.businessId;
    const clientId = req.user.id;
    const clientEmail = req.user.email;

    if (!noteText || noteText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Note text is required'
      });
    }

    // Verify service request belongs to this client
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND business_id = $2 AND client_id = $3 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id, businessId, clientId]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Insert note
    const insertQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at
    `;

    const insertResult = await pool.query(insertQuery, [
      id,
      noteText.trim(),
      'client_note',
      'client',
      clientId,
      clientEmail,
      true
    ]);

    const newNote = insertResult.rows[0];

    console.log(`📝 Note added to service request ${id} by client ${clientEmail}`);

    // Get service request details for email notification
    const srDetailsQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.assigned_technician_id,
        COALESCE(srs.name, 'Unknown') as status,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        u.id as client_id,
        u.email as client_email,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.phone as client_phone
      FROM service_requests sr
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.id = $1
    `;

    const srDetails = await pool.query(srDetailsQuery, [id]);
    const serviceRequest = srDetails.rows[0];

    // Send email notifications (non-blocking)
    if (serviceRequest) {
      // Check if assigned technician is actively viewing - skip email if so
      let excludeEmployeeId = null;
      if (serviceRequest.assigned_technician_id) {
        const isTechnicianViewing = websocketService.isEmployeeViewingRequest(
          serviceRequest.assigned_technician_id,
          id
        );
        if (isTechnicianViewing) {
          excludeEmployeeId = serviceRequest.assigned_technician_id;
        }
      }

      sendNoteAdditionNotification({
        serviceRequest: {
          requestNumber: serviceRequest.request_number,
          title: serviceRequest.title,
          status: serviceRequest.status,
          locationName: serviceRequest.location_name,
          locationAddress: {
            street1: serviceRequest.street_address_1,
            street2: serviceRequest.street_address_2,
            city: serviceRequest.city,
            state: serviceRequest.state,
            zip: serviceRequest.zip_code
          }
        },
        note: {
          noteText: newNote.note_text,
          createdAt: newNote.created_at
        },
        noteCreator: {
          name: clientEmail,
          email: clientEmail,
          phone: serviceRequest.client_phone
        },
        clientData: {
          email: serviceRequest.client_email,
          firstName: serviceRequest.client_first_name,
          lastName: serviceRequest.client_last_name,
          phone: serviceRequest.client_phone
        },
        excludeEmployeeId: excludeEmployeeId
      }).catch(err => {
        console.error('❌ Failed to send note addition email notifications:', err);
      });
    }

    // Broadcast service request update via websocket for real-time note updates
    // Include the full note data so clients can insert it without reloading all notes
    websocketService.broadcastServiceRequestUpdate(id, 'updated', {
      noteAdded: true,
      note: {
        id: newNote.id,
        note_text: newNote.note_text,
        note_type: newNote.note_type,
        created_by_type: newNote.created_by_type,
        created_by_name: newNote.created_by_name,
        created_at: newNote.created_at,
        is_visible_to_client: true
      }
    });

    res.json({
      success: true,
      message: 'Note added successfully',
      data: {
        note: {
          id: newNote.id,
          noteText: newNote.note_text,
          noteType: newNote.note_type,
          createdByType: newNote.created_by_type,
          createdByName: newNote.created_by_name,
          createdAt: newNote.created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ Error adding service request note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note'
    });
  }
});

/**
 * POST /api/client/service-requests/:id/cancel
 * Cancel a service request
 * Warns client if cancellation is within 1 hour of start time (late cancellation fee applies)
 * Sends email to executives and admins for late cancellations
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const businessId = req.user.businessId;
    const clientId = req.user.id;
    const clientEmail = req.user.email;

    const pool = await getPool();

    // Verify service request belongs to this client and get details
    const serviceRequestQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        srs.name as status_name,
        srs.is_final_status,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.email as client_email,
        u.phone as client_phone,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      WHERE sr.id = $1 AND sr.business_id = $2 AND sr.client_id = $3 AND sr.soft_delete = false
    `;

    const serviceRequestResult = await pool.query(serviceRequestQuery, [id, businessId, clientId]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const serviceRequest = serviceRequestResult.rows[0];

    // Check if already in final status
    if (serviceRequest.is_final_status) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel service request with status: ${serviceRequest.status_name}`
      });
    }

    // Check if service request has already started or passed
    const now = new Date();
    const requestedDateTime = new Date(serviceRequest.requested_datetime);

    if (requestedDateTime < now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel service request that has already started or passed'
      });
    }

    // Calculate time until service request starts (in hours)
    const hoursUntilStart = (requestedDateTime - now) / (1000 * 60 * 60);
    const isLateCancellation = hoursUntilStart < 1;

    // Get "Cancelled" status ID
    const cancelledStatusQuery = `
      SELECT id FROM service_request_statuses
      WHERE name = 'Cancelled' AND is_active = true
      LIMIT 1
    `;
    const cancelledStatusResult = await pool.query(cancelledStatusQuery);

    if (cancelledStatusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Cancelled status not found in system. Please contact administrator.'
      });
    }

    const cancelledStatusId = cancelledStatusResult.rows[0].id;

    // Update service request status to Cancelled
    const updateQuery = `
      UPDATE service_requests
      SET
        status_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING updated_at
    `;

    await pool.query(updateQuery, [cancelledStatusId, id]);

    // Add cancellation note
    const noteText = cancellationReason && cancellationReason.trim()
      ? `Service request cancelled by client. Reason: ${cancellationReason.trim()}`
      : 'Service request cancelled by client.';

    const insertNoteQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await pool.query(insertNoteQuery, [
      id,
      noteText,
      'cancellation',
      'client',
      clientId,
      clientEmail,
      true
    ]);

    console.log(`🚫 Service request ${serviceRequest.request_number} cancelled by client ${clientEmail}`);

    // Send push notification for cancellation (all cancellations, not just late ones)
    const sendCancellationPushNotification = async () => {
      try {
        // Get business name for notification
        const businessQuery = await pool.query(
          'SELECT business_name FROM businesses WHERE id = $1',
          [businessId]
        );
        const businessName = businessQuery.rows[0]?.business_name || 'Unknown Business';

        const notificationData = {
          title: isLateCancellation ? '⚠️ Late Service Request Cancellation' : '🚫 Service Request Cancelled',
          body: `${businessName} cancelled ${serviceRequest.title || 'Service Request'} #${serviceRequest.request_number}${isLateCancellation ? ` (${hoursUntilStart.toFixed(1)}h notice)` : ''}`,
          icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          vibrate: isLateCancellation ? [200, 100, 200, 100, 200, 100, 200] : [200, 100, 200],
          requireInteraction: isLateCancellation, // Late cancellations require interaction
          tag: `service-request-cancelled-${id}`,
          renotify: true,
          data: {
            type: 'service_request_cancelled',
            serviceRequestId: id,
            requestNumber: serviceRequest.request_number,
            businessId: businessId,
            businessName: businessName,
            title: serviceRequest.title || 'Service Request',
            isLateCancellation: isLateCancellation,
            hoursNotice: hoursUntilStart.toFixed(2),
            timestamp: Date.now(),
            url: `/admin/service-requests/${id}`
          }
        };

        const result = await sendNotificationToEmployees(
          'service_request_updated',
          notificationData,
          'view.service_requests.enable'
        );
        console.log(`✅ [ServiceRequest] Cancellation push notification result for ${serviceRequest.request_number}:`, result);
      } catch (notificationError) {
        console.error(`⚠️ [ServiceRequest] Failed to send cancellation push notification for ${serviceRequest.request_number}:`, notificationError);
      }
    };

    // Send push notification asynchronously
    sendCancellationPushNotification();

    // Broadcast WebSocket update for real-time UI refresh
    websocketService.broadcastServiceRequestUpdate(id, 'updated', {
      id,
      requestNumber: serviceRequest.request_number,
      businessId,
      reason: 'Service request cancelled by client'
    });

    // If late cancellation, send email to employees with permission to view service requests
    // (typically executives and admins, but uses RBAC permission system)
    if (isLateCancellation) {
      console.log(`⚠️ Late cancellation detected (${hoursUntilStart.toFixed(2)} hours notice) - notifying authorized employees`);

      // Get employees with permission to view service requests (using RBAC)
      const authorizedEmployeesQuery = `
        SELECT DISTINCT
          e.id,
          e.email,
          e.first_name,
          e.last_name
        FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN role_permissions rp ON er.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE e.business_id = $1
          AND e.is_active = true
          AND e.email IS NOT NULL
          AND rp.is_granted = true
          AND p.permission_key = 'view.service_requests.enable'
          AND p.is_active = true
      `;

      const executivesAdminsResult = await pool.query(authorizedEmployeesQuery, [businessId]);

      if (executivesAdminsResult.rows.length > 0) {
        // Import email service
        const { sendLateCancellationNotification } = await import('../../services/emailService.js');

        // Send notification (async, don't block response)
        sendLateCancellationNotification({
          serviceRequest: {
            requestNumber: serviceRequest.request_number,
            title: serviceRequest.title,
            description: serviceRequest.description,
            requestedDatetime: serviceRequest.requested_datetime,
            requestedDurationMinutes: serviceRequest.requested_duration_minutes,
            locationName: serviceRequest.location_name,
            locationAddress: {
              street1: serviceRequest.street_address_1,
              street2: serviceRequest.street_address_2,
              city: serviceRequest.city,
              state: serviceRequest.state,
              zip: serviceRequest.zip_code
            }
          },
          client: {
            firstName: serviceRequest.client_first_name,
            lastName: serviceRequest.client_last_name,
            email: serviceRequest.client_email,
            phone: serviceRequest.client_phone
          },
          cancellationReason: cancellationReason || 'No reason provided',
          hoursNotice: hoursUntilStart.toFixed(2),
          recipients: executivesAdminsResult.rows.map(row => ({
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name
          }))
        }).catch(err => {
          console.error('❌ Failed to send late cancellation notification:', err);
        });
      }
    }

    res.json({
      success: true,
      message: 'Service request cancelled successfully',
      data: {
        isLateCancellation,
        hoursNotice: hoursUntilStart.toFixed(2),
        lateFeeApplies: isLateCancellation
      }
    });

  } catch (error) {
    console.error('❌ Error cancelling service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel service request'
    });
  }
});

/**
 * DELETE /api/client/service-requests/:requestId/files/:fileId
 * Delete a file attachment with note logging
 */
router.delete('/:requestId/files/:fileId', async (req, res) => {
  try {
    console.log('🗑️  DELETE file request:', { requestId: req.params.requestId, fileId: req.params.fileId, userId: req.user?.id });
    const pool = await getPool();
    const { requestId, fileId } = req.params;
    const userId = req.user.id;

    // Support both body and query params for deletedBy
    const deletedBy = req.body.deletedBy || {
      id: req.query.updatedById,
      name: req.query.updatedByName,
      type: req.query.updatedByType
    };

    console.log('🗑️  deletedBy:', deletedBy);

    if (!deletedBy || !deletedBy.id || !deletedBy.name || !deletedBy.type) {
      console.log('❌ Missing deletedBy information');
      return res.status(400).json({
        success: false,
        message: 'deletedBy information is required (id, name, type)'
      });
    }

    // Verify ownership
    console.log('🔍 Checking ownership for requestId:', requestId, 'userId:', userId);
    const ownerCheck = await pool.query(
      'SELECT id FROM service_requests WHERE id = $1 AND client_id = $2',
      [requestId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      console.log('❌ Ownership check failed');
      return res.status(404).json({
        success: false,
        message: 'Service request not found or access denied'
      });
    }
    console.log('✅ Ownership verified');

    // Get file info before deletion
    console.log('🔍 Looking for file:', fileId, 'in request:', requestId);
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      console.log('❌ File not found');
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const fileName = fileResult.rows[0].original_filename;
    console.log('✅ File found:', fileName);

    // Soft delete the file
    console.log('🗑️  Soft deleting file...');
    await pool.query(
      'UPDATE t_client_files SET soft_delete = true, deleted_at = NOW(), deleted_by_user_id = $1 WHERE id = $2',
      [userId, fileId]
    );
    console.log('✅ File soft deleted');

    // Create note entry
    const noteText = `**${deletedBy.name}** removed file attachment: **${fileName}**`;

    await pool.query(`
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      requestId,
      noteText,
      'file_change',
      deletedBy.type,
      deletedBy.id,
      deletedBy.name,
      true
    ]);

    // Notify via WebSocket (both admins and client)
    websocketService.broadcastServiceRequestUpdate(requestId, 'updated', {
      fileDeleted: true,
      fileId: fileId,
      fileName: fileName,
      deletedBy: deletedBy
    });

    res.json({
      success: true,
      message: `File "${fileName}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/client/service-requests/:requestId/files/:fileId/rename
 * Rename a file attachment with note logging
 */
router.patch('/:requestId/files/:fileId/rename', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;
    const { newFileName, renamedBy } = req.body;
    const userId = req.user.id;

    if (!newFileName) {
      return res.status(400).json({
        success: false,
        message: 'newFileName is required'
      });
    }

    if (!renamedBy || !renamedBy.id || !renamedBy.name || !renamedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'renamedBy information is required (id, name, type)'
      });
    }

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM service_requests WHERE id = $1 AND client_id = $2',
      [requestId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found or access denied'
      });
    }

    // Get current file info
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const oldFileName = fileResult.rows[0].original_filename;

    if (oldFileName === newFileName) {
      return res.json({
        success: true,
        message: 'No change in filename'
      });
    }

    // Update the filename
    await pool.query(
      'UPDATE t_client_files SET original_filename = $1 WHERE id = $2',
      [newFileName, fileId]
    );

    // Create note entry
    const noteText = `**${renamedBy.name}** renamed file attachment:\n- **${oldFileName}**\n+ **${newFileName}**`;

    await pool.query(`
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      requestId,
      noteText,
      'file_change',
      renamedBy.type,
      renamedBy.id,
      renamedBy.name,
      true
    ]);

    res.json({
      success: true,
      message: 'File renamed successfully',
      data: { oldFileName, newFileName }
    });

  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rename file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/client/service-requests/:id/details
 * Update title and/or description with change tracking
 */
router.patch('/service-requests/:id/details', async (req, res) => {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { title, description, updatedBy } = req.body;
    const userId = req.user.id; // From auth middleware

    // Validate input
    if (!title && !description) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (title or description) must be provided'
      });
    }

    if (!updatedBy || !updatedBy.id || !updatedBy.name || !updatedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'updatedBy information is required (id, name, type)'
      });
    }

    // Verify the service request belongs to this user
    const ownerCheck = await pool.query(
      'SELECT id, title, description FROM service_requests WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found or access denied'
      });
    }

    const current = ownerCheck.rows[0];
    const updates = [];
    const params = [];
    let paramIndex = 1;
    const changes = [];

    // Helper function to generate unified diff
    const generateDiff = (oldText, newText, fieldName) => {
      const oldLines = (oldText || '').split('\n');
      const newLines = (newText || '').split('\n');

      let diff = `--- ${fieldName} (before)\n+++ ${fieldName} (after)\n`;

      const maxLines = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i] || '';
        const newLine = newLines[i] || '';

        if (oldLine !== newLine) {
          if (oldLine) diff += `- ${oldLine}\n`;
          if (newLine) diff += `+ ${newLine}\n`;
        } else if (oldLine) {
          diff += `  ${oldLine}\n`;
        }
      }

      return diff;
    };

    // Track title changes
    if (title !== undefined && title !== current.title) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;

      const diff = generateDiff(current.title, title, 'Title');
      changes.push({
        field: 'title',
        oldValue: current.title,
        newValue: title,
        diff
      });
    }

    // Track description changes
    if (description !== undefined && description !== current.description) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;

      const diff = generateDiff(current.description, description, 'Description');
      changes.push({
        field: 'description',
        oldValue: current.description,
        newValue: description,
        diff
      });
    }

    // If no changes detected
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No changes detected',
        data: current
      });
    }

    // Update the service request
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateQuery = `
      UPDATE service_requests
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, params);

    // Create note entries for each change
    for (const change of changes) {
      const noteText = `**${updatedBy.name}** updated the **${change.field}**:\n\n${change.diff}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        id,
        noteText,
        'field_change',
        updatedBy.type, // 'client'
        updatedBy.id,
        updatedBy.name,
        true // Visible to client
      ]);
    }

    res.json({
      success: true,
      message: `Successfully updated ${changes.map(c => c.field).join(' and ')}`,
      data: updateResult.rows[0],
      changes: changes.map(c => ({ field: c.field, diff: c.diff }))
    });

  } catch (error) {
    console.error('Error updating service request details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service request details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Configure multer for service request file uploads
const clientUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'clients');

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const businessId = req.user?.businessId || 'unknown';
      const businessDir = path.join(clientUploadsDir, businessId);
      await ensureDirectoryExists(businessDir);
      cb(null, businessDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // Properly decode filename from Latin-1 to UTF-8 (Multer bug workaround)
    try {
      const originalBytes = Buffer.from(file.originalname, 'latin1');
      file.originalname = originalBytes.toString('utf8');
    } catch (error) {
      console.error('⚠️ Failed to decode filename:', error);
    }

    // Generate secure filename with UUID and timestamp
    const fileExtension = path.extname(file.originalname);
    const randomId = crypto.randomUUID();
    const timestamp = Date.now();
    const secureFilename = `${timestamp}_${randomId}${fileExtension}`;
    cb(null, secureFilename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg', // Some systems use image/jpg instead of image/jpeg
    'image/png',
    'image/gif',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip'
  ];

  const validation = validateFileUpload(file, 'attachments');

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
    return;
  }

  if (validation.isValid) {
    cb(null, true);
  } else {
    cb(new Error(validation.error), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5 // Maximum 5 files per request
  },
  fileFilter: fileFilter
});

/**
 * Ensures the folder structure exists for organizing service request files
 * Creates "Service Requests" parent folder and SR-specific subfolder if needed
 * @param {string} businessId - Business UUID
 * @param {string} requestNumber - Service request number (e.g., "SR-2025-00001")
 * @returns {Promise<string>} - Folder ID for the service request
 */
async function ensureServiceRequestFolder(businessId, requestNumber) {
  const pool = await getPool();

  // Step 1: Ensure "Service Requests" parent folder exists
  let parentFolderId;
  const parentFolderResult = await pool.query(
    `SELECT id FROM t_client_folders
     WHERE business_id = $1
       AND folder_name = 'Service Requests'
       AND parent_folder_id IS NULL
       AND soft_delete = false
       LIMIT 1`,
    [businessId]
  );

  if (parentFolderResult.rows.length > 0) {
    parentFolderId = parentFolderResult.rows[0].id;
  } else {
    // Create "Service Requests" parent folder
    const createParentResult = await pool.query(
      `INSERT INTO t_client_folders (
        business_id,
        parent_folder_id,
        folder_name,
        folder_description,
        folder_color,
        sort_order,
        is_system_folder
      ) VALUES ($1, NULL, $2, $3, $4, 0, true)
      RETURNING id`,
      [
        businessId,
        'Service Requests',
        'Automatically organized files from service requests',
        '#3B82F6'
      ]
    );
    parentFolderId = createParentResult.rows[0].id;
    console.log(`📁 Created "Service Requests" parent folder for business ${businessId}`);
  }

  // Step 2: Ensure service request subfolder exists
  let srFolderId;
  const srFolderResult = await pool.query(
    `SELECT id FROM t_client_folders
     WHERE business_id = $1
       AND parent_folder_id = $2
       AND folder_name = $3
       AND soft_delete = false
       LIMIT 1`,
    [businessId, parentFolderId, requestNumber]
  );

  if (srFolderResult.rows.length > 0) {
    srFolderId = srFolderResult.rows[0].id;
  } else {
    // Create service request subfolder
    const createSrFolderResult = await pool.query(
      `INSERT INTO t_client_folders (
        business_id,
        parent_folder_id,
        folder_name,
        folder_description,
        folder_color,
        sort_order,
        is_system_folder
      ) VALUES ($1, $2, $3, $4, $5, 0, true)
      RETURNING id`,
      [
        businessId,
        parentFolderId,
        requestNumber,
        `Files for service request ${requestNumber}`,
        '#10B981'
      ]
    );
    srFolderId = createSrFolderResult.rows[0].id;
    console.log(`📁 Created folder for service request ${requestNumber}`);
  }

  return srFolderId;
}

/**
 * POST /api/client/service-requests/:id/files/upload
 * Upload files to a service request with virus scanning and auto-note creation
 */
router.post('/:id/files/upload', upload.array('files', 5), async (req, res) => {
  const uploadedFiles = [];
  const failedFiles = [];
  let totalSizeBytes = 0;

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const { id: serviceRequestId } = req.params;
    const businessId = req.user.businessId;
    const userId = req.user.id;
    const pool = await getPool();

    // Verify service request belongs to this client
    const requestCheck = await pool.query(
      'SELECT id, request_number FROM service_requests WHERE id = $1 AND client_id = $2 AND soft_delete = false',
      [serviceRequestId, userId]
    );

    if (requestCheck.rows.length === 0) {
      // Cleanup uploaded files
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));

      return res.status(404).json({
        success: false,
        message: 'Service request not found or access denied'
      });
    }

    const requestNumber = requestCheck.rows[0].request_number;

    // Ensure folder structure exists for this service request
    const serviceRequestFolderId = await ensureServiceRequestFolder(businessId, requestNumber);
    console.log(`📁 Files will be organized in folder: ${requestNumber}`);

    // Calculate total upload size
    totalSizeBytes = req.files.reduce((sum, file) => sum + file.size, 0);

    console.log(`📤 Processing ${req.files.length} file(s) upload for service request ${requestNumber}`);

    // Check quota
    const quotaCheck = await quotaManagementService.checkQuotaAvailability(
      businessId,
      totalSizeBytes,
      null,
      userId
    );

    if (!quotaCheck.canUpload) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));

      return res.status(413).json({
        success: false,
        message: quotaCheck.message,
        quotaInfo: quotaCheck
      });
    }

    // Process each file
    for (const file of req.files) {
      try {
        console.log(`🔍 Processing file: ${file.originalname} (${quotaManagementService.formatBytes(file.size)})`);

        // Perform virus scan
        const scanResult = await virusScanService.scanFile(file.path, {
          originalName: file.originalname,
          size: file.size,
          userId: userId,
          businessId: businessId,
          serviceRequestId: serviceRequestId
        });

        if (scanResult.isInfected) {
          await virusScanService.quarantineFile(file.path, scanResult);

          failedFiles.push({
            originalName: file.originalname,
            error: `File infected with virus: ${scanResult.virusName}`,
            scanId: scanResult.scanId
          });

          console.log(`🚨 Infected file quarantined: ${file.originalname}`);
          continue;
        }

        if (!scanResult.scanSuccess) {
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Virus scan failed: ${scanResult.errorMessage}`,
            scanId: scanResult.scanId
          });

          console.log(`❌ Scan failed for file: ${file.originalname}`);
          continue;
        }

        // File is clean, record in database
        const fileData = {
          businessId: businessId,
          serviceLocationId: null,
          userId: userId,
          fileName: file.filename,
          originalName: file.originalname,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          filePath: file.path,
          categoryId: null,
          description: '',
          isPublic: false,
          metadata: {
            scanId: scanResult.scanId,
            uploadedBy: req.user.email,
            uploadIp: req.ip,
            userAgent: req.get('User-Agent'),
            serviceRequestId: serviceRequestId
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const uploadResult = await quotaManagementService.recordFileUpload(fileData);

        if (uploadResult.success) {
          // Link file to service request and assign to the appropriate folder
          await pool.query(
            'UPDATE t_client_files SET service_request_id = $1, folder_id = $2 WHERE id = $3',
            [serviceRequestId, serviceRequestFolderId, uploadResult.fileId]
          );

          uploadedFiles.push({
            fileId: uploadResult.fileId,
            originalName: file.originalname,
            fileName: file.filename,
            size: file.size,
            mimeType: file.mimetype,
            scanId: scanResult.scanId,
            scanStatus: scanResult.isInfected ? 'infected' : 'clean',
            uploadedAt: uploadResult.createdAt
          });

          console.log(`✅ File uploaded successfully: ${file.originalname}`);
        } else {
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Database error: ${uploadResult.error}`
          });
        }

      } catch (error) {
        console.error(`❌ Error processing file ${file.originalname}:`, error);

        await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

        failedFiles.push({
          originalName: file.originalname,
          error: error.message
        });
      }
    }

    // Create automatic note if any files were uploaded successfully
    if (uploadedFiles.length > 0) {
      const userQuery = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );
      const userName = userQuery.rows[0] ? `${userQuery.rows[0].first_name} ${userQuery.rows[0].last_name}` : 'User';

      const now = new Date();
      const utcTime = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const localTime = now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + ' PST';

      const fileList = uploadedFiles.map(f => `- ${f.originalName} (${quotaManagementService.formatBytes(f.size)})`).join('\n');
      const allClean = uploadedFiles.every(f => f.scanStatus === 'clean');
      const virusStatus = allClean ? '✅ Clean' : '⚠️ Some files flagged';

      const noteText = `📎 **${userName}** uploaded **${uploadedFiles.length}** file(s) on ${utcTime} (${localTime})

**Files:**
${fileList}

**Virus scan:** ${virusStatus}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        serviceRequestId,
        noteText,
        'file_upload',
        'client',
        userId,
        userName,
        true
      ]);

      console.log(`📝 Created auto-note for ${uploadedFiles.length} uploaded file(s)`);

      // Broadcast file upload to admins/employees and client via WebSocket
      websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'updated', {
        filesUploaded: true,
        fileCount: uploadedFiles.length,
        uploadedFiles: uploadedFiles
      });
    }

    // Get updated quota information
    const updatedQuotaInfo = await quotaManagementService.getBusinessQuotaInfo(businessId);

    res.status(uploadedFiles.length > 0 ? 200 : 400).json({
      success: uploadedFiles.length > 0,
      message: `Upload completed. ${uploadedFiles.length} file(s) uploaded successfully${failedFiles.length > 0 ? `, ${failedFiles.length} failed` : ''}.`,
      data: {
        uploadedFiles,
        failedFiles,
        quotaInfo: updatedQuotaInfo
      }
    });

  } catch (error) {
    console.error('❌ File upload error:', error);

    // Cleanup all uploaded files on error
    if (req.files) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during file upload'
    });
  }
});

/**
 * PATCH /api/client/service-requests/:id/reschedule
 * Reschedule a service request (update requested_datetime and requested_duration_minutes)
 */
router.patch('/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { requestedDatetime, requestedDurationMinutes } = req.body;
    const clientId = req.user.id;
    const businessId = req.user.businessId;

    console.log('📅 Reschedule request:', { id, requestedDatetime, requestedDurationMinutes, clientId });

    // Validate inputs
    if (!requestedDatetime || !requestedDurationMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: requestedDatetime and requestedDurationMinutes'
      });
    }

    const pool = await getPool();

    // Verify the service request belongs to this client
    const checkQuery = `
      SELECT id, status_id, title, request_number
      FROM service_requests
      WHERE id = $1 AND client_id = $2 AND business_id = $3 AND soft_delete = false
    `;
    const checkResult = await pool.query(checkQuery, [id, clientId, businessId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const serviceRequest = checkResult.rows[0];

    // Check if request can be rescheduled (not closed or cancelled)
    const statusQuery = `
      SELECT name, is_final_status
      FROM service_request_statuses
      WHERE id = $1
    `;
    const statusResult = await pool.query(statusQuery, [serviceRequest.status_id]);

    if (statusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Invalid service request status'
      });
    }

    const status = statusResult.rows[0];
    if (status.is_final_status) {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule a ${status.name} service request`
      });
    }

    // Update the service request
    const updateQuery = `
      UPDATE service_requests
      SET
        requested_datetime = $1,
        requested_duration_minutes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING
        id,
        request_number,
        title,
        requested_datetime,
        requested_duration_minutes,
        updated_at
    `;

    const updateResult = await pool.query(updateQuery, [
      requestedDatetime,
      requestedDurationMinutes,
      id
    ]);

    const updatedRequest = updateResult.rows[0];

    console.log('✅ Service request rescheduled:', updatedRequest.request_number);

    // Send WebSocket notification to technicians
    try {
      websocketService.notifyServiceRequestUpdate(id, {
        type: 'rescheduled',
        requestNumber: updatedRequest.request_number,
        title: updatedRequest.title,
        requestedDatetime: updatedRequest.requested_datetime,
        requestedDurationMinutes: updatedRequest.requested_duration_minutes,
        updatedAt: updatedRequest.updated_at
      });
    } catch (wsError) {
      console.error('Failed to send WebSocket notification:', wsError);
      // Don't fail the request if WebSocket fails
    }

    // Send push notification to employees
    const sendReschedulePushNotification = async () => {
      try {
        console.log(`🔔 [Reschedule] Starting push notification process for ${updatedRequest.request_number}`);

        // Get business name for notification
        const businessQuery = await pool.query(
          'SELECT business_name FROM businesses WHERE id = $1',
          [businessId]
        );
        const businessName = businessQuery.rows[0]?.business_name || 'Unknown Business';

        // Format datetime for notification
        const dateObj = new Date(updatedRequest.requested_datetime);
        const dateStr = dateObj.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });

        const notificationData = {
          title: '📅 Service Request Rescheduled',
          body: `${businessName} rescheduled ${updatedRequest.title || 'Service Request'} #${updatedRequest.request_number} to ${dateStr}`,
          icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          tag: `service-request-reschedule-${id}`,
          renotify: true,
          data: {
            type: 'service_request_rescheduled',
            serviceRequestId: id,
            requestNumber: updatedRequest.request_number,
            businessId: businessId,
            businessName: businessName,
            title: updatedRequest.title || 'Service Request',
            requestedDatetime: updatedRequest.requested_datetime,
            requestedDurationMinutes: updatedRequest.requested_duration_minutes,
            timestamp: Date.now(),
            url: `/admin/service-requests/${id}`
          }
        };

        console.log(`🔔 [Reschedule] Calling sendNotificationToEmployees for ${updatedRequest.request_number}`);
        const result = await sendNotificationToEmployees(
          'service_request_updated',
          notificationData,
          'view.service_requests.enable'
        );
        console.log(`✅ [Reschedule] Push notification result for ${updatedRequest.request_number}:`, result);
      } catch (notificationError) {
        console.error(`⚠️ [Reschedule] Failed to send push notification for ${updatedRequest.request_number}:`, notificationError);
        // Don't fail the request if notification fails
      }
    };

    // Send push notification asynchronously
    sendReschedulePushNotification();

    res.json({
      success: true,
      message: 'Service request rescheduled successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('❌ Error rescheduling service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule service request'
    });
  }
});

export default router;