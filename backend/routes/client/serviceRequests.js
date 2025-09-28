import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import crypto from 'crypto';

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
      scheduled_date: requestedDate,
      scheduled_time: requestedTime,
      urgency_level_id: urgencyLevelId,
      priority_level_id: priorityLevelId,
      contact_name: primaryContactName,
      contact_phone: primaryContactPhone,
      contact_email: primaryContactEmail,
      service_type_id: serviceTypeId,
      attachment_file_ids: attachmentFileIds = []
    } = req.body;

    const businessId = req.user.businessId;
    const clientId = req.user.userId;

    // Generate unique request number
    const requestNumber = `SR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Get default status (should be 'submitted' or similar)
    const pool = await getPool();
    const statusQuery = `
      SELECT id FROM service_request_statuses
      WHERE name = 'Pending'
      ORDER BY is_default DESC, created_at ASC
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
      requestedDate,
      requestedTime,
      urgencyLevelId,
      priorityLevelId,
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
    const clientId = req.user.userId;
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
        ul.urgency_name,
        pl.priority_name,
        st.service_name,
        sl.location_name,
        COUNT(cf.id) as file_count,
        COUNT(*) OVER() as total_count
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.service_location_id
      LEFT JOIN t_client_files cf ON sr.id = cf.service_request_id AND cf.soft_delete = false
      WHERE sr.business_id = $1 AND sr.client_id = $2 AND sr.soft_delete = false
      GROUP BY sr.id, srs.name, srs.description, ul.urgency_name,
               pl.priority_name, st.service_name, sl.location_name
      ORDER BY sr.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const pool = await getPool();
    const result = await pool.query(query, [businessId, clientId, limit, offset]);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      success: true,
      data: {
        serviceRequests: result.rows.map(row => ({
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
          updatedAt: row.updated_at
        })),
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
    const clientId = req.user.userId;

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