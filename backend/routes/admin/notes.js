import express from 'express';
import { getPool } from '../../config/database.js';
import { sendEmployeeNoteNotificationToClient } from '../../services/emailService.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

/**
 * GET /api/admin/service-requests/:id/notes
 * Get all notes for a service request (admin can see all notes)
 */
router.get('/service-requests/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify service request exists
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Get all notes (admin can see all notes, including those not visible to client)
    const notesQuery = `
      SELECT
        id,
        note_text,
        note_type,
        created_by_type,
        created_by_name,
        created_at,
        is_visible_to_client
      FROM service_request_notes
      WHERE service_request_id = $1
      ORDER BY created_at DESC
    `;

    const notesResult = await pool.query(notesQuery, [id]);

    res.json({
      success: true,
      data: {
        serviceRequestId: id,
        notes: notesResult.rows.map(row => ({
          id: row.id,
          note_text: row.note_text,
          note_type: row.note_type,
          created_by_type: row.created_by_type,
          created_by_name: row.created_by_name,
          created_at: row.created_at,
          is_visible_to_client: row.is_visible_to_client
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching service request notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notes',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/service-requests/:id/notes
 * Add a new note to a service request
 */
router.post('/service-requests/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteText, isVisibleToClient = true } = req.body;
    const employeeId = req.user.id;
    const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;

    if (!noteText || noteText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Note text is required'
      });
    }

    // Verify service request exists
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

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
      RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at, is_visible_to_client
    `;

    const insertResult = await pool.query(insertQuery, [
      id,
      noteText.trim(),
      'employee_note',
      'employee',
      employeeId,
      employeeName,
      isVisibleToClient
    ]);

    const newNote = insertResult.rows[0];

    console.log(`📝 Note added to service request ${id} by employee ${employeeName}`);

    // Get service request details and employee info for email notification
    const detailsQuery = `
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
        u.phone as client_phone,
        e.email as employee_email,
        e.phone as employee_phone,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name
      FROM service_requests sr
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN employees e ON e.id = $2
      WHERE sr.id = $1
    `;

    const details = await pool.query(detailsQuery, [id, employeeId]);
    const serviceRequest = details.rows[0];

    // Send email notification to client (non-blocking) - only if client is NOT actively viewing
    if (serviceRequest && serviceRequest.client_email && serviceRequest.client_id) {
      const isClientViewing = websocketService.isClientViewingRequest(serviceRequest.client_id, id);

      if (isClientViewing) {
        console.log(`📧 Skipping email notification - client is actively viewing service request ${id}`);
      } else {
        sendEmployeeNoteNotificationToClient({
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
          employee: {
            name: `${serviceRequest.employee_first_name} ${serviceRequest.employee_last_name}`.trim() || employeeName,
            email: serviceRequest.employee_email,
            phone: serviceRequest.employee_phone
          },
          client: {
            email: serviceRequest.client_email,
            firstName: serviceRequest.client_first_name,
            lastName: serviceRequest.client_last_name
          }
        }).catch(err => {
          console.error('❌ Failed to send employee note email notification:', err);
        });
      }
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
        is_visible_to_client: newNote.is_visible_to_client
      }
    });

    res.json({
      success: true,
      data: {
        note: {
          id: newNote.id,
          note_text: newNote.note_text,
          note_type: newNote.note_type,
          created_by_type: newNote.created_by_type,
          created_by_name: newNote.created_by_name,
          created_at: newNote.created_at,
          is_visible_to_client: newNote.is_visible_to_client
        }
      }
    });

  } catch (error) {
    console.error('Error adding service request note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


export default router;
