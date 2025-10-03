import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import { generateRequestNumber } from '../../utils/requestNumberGenerator.js';
import { sendServiceRequestNotificationToTechnicians, sendServiceRequestConfirmationToClient, sendNoteAdditionNotification } from '../../services/emailService.js';
import { initializeServiceRequestWorkflow } from '../../services/workflowService.js';

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
    const {
      title,
      description,
      service_location_id: serviceLocationId,
      requested_date: requestedDate,
      requested_time_start: requestedTimeStart,
      requested_time_end: requestedTimeEnd,
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
        requested_date,
        requested_time_start,
        requested_time_end,
        urgency_level_id,
        priority_level_id,
        status_id,
        primary_contact_name,
        primary_contact_phone,
        primary_contact_email,
        service_type_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
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
      requestedDate,
      requestedTimeStart,
      requestedTimeEnd,
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

    const query = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.scheduled_date,
        sr.scheduled_time_start,
        sr.scheduled_time_end,
        sr.created_at,
        sr.updated_at,
        srs.name as status_name,
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
    try {
      const rateResult = await pool.query(`
        SELECT
          b.id,
          b.rate_category_id,
          rc.base_hourly_rate as category_rate,
          (SELECT base_hourly_rate FROM hourly_rate_categories WHERE is_default = true LIMIT 1) as default_rate
        FROM businesses b
        LEFT JOIN hourly_rate_categories rc ON b.rate_category_id = rc.id
        WHERE b.id = $1
      `, [businessId]);

      if (rateResult.rows.length > 0) {
        const business = rateResult.rows[0];
        // Use business category rate if assigned, otherwise use default category rate
        baseHourlyRate = parseFloat(business.category_rate || business.default_rate || 75);
      }
    } catch (error) {
      console.error('Error fetching base hourly rate, using fallback:', error);
    }

    // Check if this is the client's first service request
    const firstServiceRequestCheck = await pool.query(`
      SELECT COUNT(*) as request_count
      FROM service_requests
      WHERE client_id = $1 AND soft_delete = false
    `, [clientId]);

    const isFirstServiceRequest = parseInt(firstServiceRequestCheck.rows[0].request_count) === 1;

    // Helper function to calculate estimated cost with first-hour waiver for new clients
    const calculateCost = (date, timeStart, timeEnd, baseRate, isFirstRequest) => {
      if (!date || !timeStart || !timeEnd || !baseRate) return null;

      // Parse times
      const [startHour, startMin] = timeStart.split(':').map(Number);
      const [endHour, endMin] = timeEnd.split(':').map(Number);

      // Calculate duration in hours
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const durationHours = (endMinutes - startMinutes) / 60;

      // Calculate base cost
      const baseCost = baseRate * durationHours;

      // Apply first-hour waiver for first-time clients
      let firstHourWaiver = 0;
      let finalCost = baseCost;

      if (isFirstRequest && durationHours >= 1) {
        // Waive first hour fee for new clients
        firstHourWaiver = baseRate;
        finalCost = baseCost - firstHourWaiver;
      }

      return {
        baseRate,
        durationHours,
        total: finalCost,
        subtotal: baseCost,
        firstHourWaiver: firstHourWaiver > 0 ? firstHourWaiver : undefined,
        isFirstRequest
      };
    };

    res.json({
      success: true,
      data: {
        serviceRequests: result.rows.map(row => {
          // Calculate cost using business-specific rate from rate category
          const costInfo = calculateCost(
            row.requested_date,
            row.requested_time_start,
            row.requested_time_end,
            baseHourlyRate,
            isFirstServiceRequest
          );

          // Check if we have any location data (address or contact info)
          const hasLocationData = row.street_address_1 || row.city || row.state ||
                                 row.location_contact_phone || row.location_contact_person ||
                                 row.location_contact_email;

          return {
            id: row.id,
            requestNumber: row.request_number,
            title: row.title,
            description: row.description,
            requestedDate: row.requested_date,
            requestedTimeStart: row.requested_time_start,
            requestedTimeEnd: row.requested_time_end,
            scheduledDate: row.scheduled_date,
            scheduledTimeStart: row.scheduled_time_start,
            scheduledTimeEnd: row.scheduled_time_end,
            status: row.status_name,
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
        }),
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
        cf.created_at
      FROM t_client_files cf
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
          createdAt: row.created_at
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
        }
      }).catch(err => {
        console.error('❌ Failed to send note addition email notifications:', err);
      });
    }

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
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
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

    // Parse UTC date and combine with local time
    const requestedDate = new Date(serviceRequest.requested_date);
    const year = requestedDate.getFullYear();
    const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
    const day = String(requestedDate.getDate()).padStart(2, '0');
    const requestedDateTime = new Date(`${year}-${month}-${day}T${serviceRequest.requested_time_start}`);

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

    // If late cancellation, send email to executives and admins
    if (isLateCancellation) {
      console.log(`⚠️ Late cancellation detected (${hoursUntilStart.toFixed(2)} hours notice) - notifying executives and admins`);

      // Get executives and admins
      const executivesAndAdminsQuery = `
        SELECT DISTINCT
          e.id,
          e.email,
          e.first_name,
          e.last_name
        FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN roles r ON er.role_id = r.id
        WHERE e.business_id = $1
          AND e.is_active = true
          AND e.email IS NOT NULL
          AND (r.name = 'executive' OR r.name = 'admin')
      `;

      const executivesAdminsResult = await pool.query(executivesAndAdminsQuery, [businessId]);

      if (executivesAdminsResult.rows.length > 0) {
        // Import email service
        const { sendLateCancellationNotification } = await import('../../services/emailService.js');

        // Send notification (async, don't block response)
        sendLateCancellationNotification({
          serviceRequest: {
            requestNumber: serviceRequest.request_number,
            title: serviceRequest.title,
            description: serviceRequest.description,
            requestedDate: serviceRequest.requested_date,
            requestedTimeStart: serviceRequest.requested_time_start,
            requestedTimeEnd: serviceRequest.requested_time_end,
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
router.delete('/service-requests/:requestId/files/:fileId', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;
    const userId = req.user.id;

    // Support both body and query params for deletedBy
    const deletedBy = req.body.deletedBy || {
      id: req.query.updatedById,
      name: req.query.updatedByName,
      type: req.query.updatedByType
    };

    if (!deletedBy || !deletedBy.id || !deletedBy.name || !deletedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'deletedBy information is required (id, name, type)'
      });
    }

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM service_requests WHERE id = $1 AND user_id = $2',
      [requestId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found or access denied'
      });
    }

    // Get file info before deletion
    const fileResult = await pool.query(
      'SELECT file_name FROM service_request_files WHERE id = $1 AND service_request_id = $2',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const fileName = fileResult.rows[0].file_name;

    // Delete the file
    await pool.query(
      'DELETE FROM service_request_files WHERE id = $1',
      [fileId]
    );

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
router.patch('/service-requests/:requestId/files/:fileId/rename', async (req, res) => {
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
      'SELECT id FROM service_requests WHERE id = $1 AND user_id = $2',
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
      'SELECT file_name FROM service_request_files WHERE id = $1 AND service_request_id = $2',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const oldFileName = fileResult.rows[0].file_name;

    if (oldFileName === newFileName) {
      return res.json({
        success: true,
        message: 'No change in filename'
      });
    }

    // Update the filename
    await pool.query(
      'UPDATE service_request_files SET file_name = $1 WHERE id = $2',
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

export default router;