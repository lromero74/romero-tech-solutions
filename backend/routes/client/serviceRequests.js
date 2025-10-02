import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import { generateRequestNumber } from '../../utils/requestNumberGenerator.js';
import { sendServiceRequestNotificationToTechnicians, sendServiceRequestConfirmationToClient } from '../../services/emailService.js';

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

    // Send email notifications (async - don't block response)
    const sendNotifications = async () => {
      try {
        // 1. Fetch active technicians
        const techniciansQuery = `
          SELECT e.id, e.first_name as "firstName", e.email
          FROM employees e
          WHERE e.is_active = true
            AND e.soft_delete = false
            AND e.employee_status_id IN (
              SELECT id FROM employee_statuses
              WHERE name IN ('Active', 'Available')
                AND name NOT IN ('Vacation', 'Sick', 'Unavailable')
            )
        `;
        const techniciansResult = await pool.query(techniciansQuery);
        const activeTechnicians = techniciansResult.rows;

        // 2. Fetch detailed service request data for notifications
        const serviceRequestDetailsQuery = `
          SELECT
            sr.request_number,
            sr.title,
            sr.description,
            sr.scheduled_date,
            sr.scheduled_time_start as scheduled_time,
            sr.primary_contact_name as contact_name,
            sr.primary_contact_phone as contact_phone,
            sr.primary_contact_email as contact_email,
            b.business_name,
            u.first_name as client_first_name,
            u.last_name as client_last_name,
            u.email as client_email,
            sl.location_name as service_location,
            sl.street_address_1,
            sl.street_address_2,
            sl.street,
            sl.city,
            sl.state,
            sl.zip_code,
            sl.contact_phone as location_contact_phone,
            sl.contact_person as location_contact_person,
            sl.contact_email as location_contact_email,
            sl.notes as location_notes,
            ul.name as urgency_level,
            pl.name as priority_level,
            st.name as service_type
          FROM service_requests sr
          JOIN businesses b ON sr.business_id = b.id
          JOIN users u ON sr.client_id = u.id
          LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
          LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
          LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
          LEFT JOIN service_types st ON sr.service_type_id = st.id
          WHERE sr.id = $1
        `;
        const detailsResult = await pool.query(serviceRequestDetailsQuery, [serviceRequestId]);
        const srDetails = detailsResult.rows[0];

        // 3. Send notifications to technicians if any are active
        if (activeTechnicians.length > 0) {
          const serviceRequestData = {
            requestNumber: srDetails.request_number,
            title: srDetails.title,
            description: srDetails.description,
            businessName: srDetails.business_name,
            clientName: `${srDetails.client_first_name} ${srDetails.client_last_name}`,
            serviceLocation: srDetails.service_location || 'Not specified',
            serviceLocationDetails: srDetails.service_location ? {
              location_name: srDetails.service_location,
              street_address_1: srDetails.street_address_1,
              street_address_2: srDetails.street_address_2,
              street: srDetails.street,
              city: srDetails.city,
              state: srDetails.state,
              zip_code: srDetails.zip_code,
              contact_phone: srDetails.location_contact_phone,
              contact_person: srDetails.location_contact_person,
              contact_email: srDetails.location_contact_email,
              notes: srDetails.location_notes
            } : null,
            urgencyLevel: srDetails.urgency_level || 'Normal',
            priorityLevel: srDetails.priority_level || 'Normal',
            serviceType: srDetails.service_type || 'General Support',
            scheduledDate: srDetails.scheduled_date ? new Date(srDetails.scheduled_date).toLocaleDateString() : null,
            scheduledTime: srDetails.scheduled_time || null,
            contactName: srDetails.contact_name,
            contactPhone: srDetails.contact_phone,
            contactEmail: srDetails.contact_email
          };

          const techResult = await sendServiceRequestNotificationToTechnicians({
            serviceRequestData,
            technicians: activeTechnicians,
            serviceRequestId: serviceRequestId
          });

          console.log(`📧 Technician notifications: ${techResult.message}`);
        } else {
          console.warn('⚠️ No active technicians found for service request notifications');
        }

        // 4. Send confirmation email to client
        const clientData = {
          firstName: srDetails.client_first_name,
          email: srDetails.client_email
        };

        const clientServiceRequestData = {
          requestNumber: srDetails.request_number,
          title: srDetails.title,
          description: srDetails.description,
          serviceLocation: srDetails.service_location || 'Not specified',
          scheduledDate: srDetails.scheduled_date ? new Date(srDetails.scheduled_date).toLocaleDateString() : null,
          scheduledTime: srDetails.scheduled_time || null,
          contactName: srDetails.contact_name,
          contactPhone: srDetails.contact_phone
        };

        const clientResult = await sendServiceRequestConfirmationToClient({
          serviceRequestData: clientServiceRequestData,
          clientData
        });

        console.log(`📧 Client confirmation: ${clientResult.message}`);

      } catch (emailError) {
        console.error('❌ Error sending service request notifications:', emailError);
        // Don't throw - notifications are supplementary and shouldn't break the main flow
      }
    };

    // Send notifications asynchronously (don't await - don't block response)
    sendNotifications();

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
               pl.name, st.name, sl.location_name
      ORDER BY sr.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const pool = await getPool();
    const result = await pool.query(query, [businessId, clientId, limit, offset]);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    // Helper function to calculate estimated cost
    const calculateCost = (date, timeStart, timeEnd, baseRate) => {
      if (!date || !timeStart || !timeEnd || !baseRate) return null;

      // Parse times
      const [startHour, startMin] = timeStart.split(':').map(Number);
      const [endHour, endMin] = timeEnd.split(':').map(Number);

      // Calculate duration in hours
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const durationHours = (endMinutes - startMinutes) / 60;

      // For now, use standard 1x rate (in future, could query rate tiers)
      const cost = baseRate * durationHours;

      return {
        baseRate,
        durationHours,
        total: cost
      };
    };

    res.json({
      success: true,
      data: {
        serviceRequests: result.rows.map(row => {
          // Use default base rate of $75/hr (matches scheduler default)
          // TODO: Could be enhanced to fetch actual business rate from hourly_rate_categories
          const costInfo = calculateCost(
            row.requested_date,
            row.requested_time_start,
            row.requested_time_end,
            75 // Default base hourly rate
          );

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

export default router;