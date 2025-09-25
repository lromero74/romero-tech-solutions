import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// GET /location-contacts/:serviceLocationId - Get all contacts for a specific service location
router.get('/location-contacts/:serviceLocationId', async (req, res) => {
  try {
    const { serviceLocationId } = req.params;

    const contacts = await query(`
      SELECT
        lc.id,
        lc.service_location_id,
        lc.user_id,
        lc.contact_role,
        lc.is_primary_contact,
        lc.notes,
        lc.created_at,
        lc.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.phone
      FROM location_contacts lc
      JOIN users u ON lc.user_id = u.id
      WHERE lc.service_location_id = $1
      ORDER BY lc.is_primary_contact DESC, lc.created_at ASC
    `, [serviceLocationId]);

    res.status(200).json({
      success: true,
      data: contacts.rows.map(contact => ({
        id: contact.id,
        serviceLocationId: contact.service_location_id,
        userId: contact.user_id,
        contactRole: contact.contact_role,
        isPrimaryContact: contact.is_primary_contact,
        notes: contact.notes,
        createdAt: contact.created_at,
        updatedAt: contact.updated_at,
        user: {
          firstName: contact.first_name,
          lastName: contact.last_name,
          email: contact.email,
          phone: contact.phone
        }
      }))
    });

  } catch (error) {
    console.error('Get location contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location contacts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /location-contacts/:serviceLocationId/exists - Check if a service location has any contacts
router.get('/location-contacts/:serviceLocationId/exists', async (req, res) => {
  try {
    const { serviceLocationId } = req.params;

    const result = await query(`
      SELECT COUNT(*) as count
      FROM location_contacts
      WHERE service_location_id = $1
    `, [serviceLocationId]);

    const hasContacts = parseInt(result.rows[0].count) > 0;

    res.status(200).json({
      success: true,
      data: {
        hasContacts
      }
    });

  } catch (error) {
    console.error('Check location contacts existence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check location contacts existence',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /location-contacts - Create a new location contact relationship
router.post('/location-contacts', async (req, res) => {
  try {
    console.log('🔍 POST /location-contacts - Request body:', JSON.stringify(req.body, null, 2));
    const { service_location_id, user_id, contact_role = 'contact', is_primary_contact = false, notes } = req.body;

    // Validate required fields
    if (!service_location_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'Service location ID and user ID are required'
      });
    }

    // Check if the user is already a contact for this service location
    const existingContact = await query(`
      SELECT id FROM location_contacts
      WHERE service_location_id = $1 AND user_id = $2
    `, [service_location_id, user_id]);

    if (existingContact.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User is already a contact for this service location'
      });
    }

    // Verify that the service location exists
    const serviceLocationExists = await query(`
      SELECT id FROM service_locations WHERE id = $1
    `, [service_location_id]);

    if (serviceLocationExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service location not found'
      });
    }

    // Verify that the user exists
    const userExists = await query(`
      SELECT id FROM users WHERE id = $1
    `, [user_id]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If this is to be a primary contact, remove primary status from other contacts for this location
    if (is_primary_contact) {
      await query(`
        UPDATE location_contacts
        SET is_primary_contact = false
        WHERE service_location_id = $1
      `, [service_location_id]);
    }

    // Create the new location contact
    const result = await query(`
      INSERT INTO location_contacts (service_location_id, user_id, contact_role, is_primary_contact, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [service_location_id, user_id, contact_role, is_primary_contact, notes]);

    const newContact = result.rows[0];

    // Get the user details for the response
    const userDetails = await query(`
      SELECT first_name, last_name, email, phone
      FROM users
      WHERE id = $1
    `, [user_id]);

    const user = userDetails.rows[0];

    res.status(201).json({
      success: true,
      message: 'Location contact created successfully',
      data: {
        id: newContact.id,
        serviceLocationId: newContact.service_location_id,
        userId: newContact.user_id,
        contactRole: newContact.contact_role,
        isPrimaryContact: newContact.is_primary_contact,
        notes: newContact.notes,
        createdAt: newContact.created_at,
        updatedAt: newContact.updated_at,
        user: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone
        }
      }
    });

  } catch (error) {
    console.error('Create location contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create location contact',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;