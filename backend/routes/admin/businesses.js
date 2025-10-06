import express from 'express';
import { query } from '../../config/database.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

// GET /businesses/by-email-domain/:email - Get businesses authorized for an email domain
router.get('/businesses/by-email-domain/:email', async (req, res) => {
  try {
    const { email } = req.params;

    // Extract domain from email
    const emailParts = email.split('@');
    if (emailParts.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const domain = emailParts[1].toLowerCase().trim();

    // Find businesses that authorize this domain (include all businesses regardless of status)
    const result = await query(`
      SELECT DISTINCT
        b.id,
        b.business_name,
        b.logo_url,
        b.is_active,
        b.soft_delete,
        hq.street_address_1 as business_street,
        hq.city as business_city,
        hq.state as business_state,
        hq.zip_code as business_zip_code,
        hq.country as business_country,
        bad.domain as authorized_domain,
        bad.description as domain_description
      FROM businesses b
      JOIN business_authorized_domains bad ON b.id = bad.business_id
      LEFT JOIN service_locations hq ON hq.business_id = b.id AND hq.is_headquarters = true
      WHERE bad.domain = $1
        AND bad.is_active = true
      ORDER BY
        b.is_active DESC,
        b.soft_delete ASC,
        b.business_name
    `, [domain]);

    res.status(200).json({
      success: true,
      data: {
        email: email,
        domain: domain,
        businesses: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching businesses by email domain:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch businesses for email domain',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /businesses - Get all businesses (for admin use)
router.get('/businesses', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        b.id,
        b.business_name,
        b.logo_url,
        b.logo_position_x,
        b.logo_position_y,
        b.logo_scale,
        b.logo_background_color,
        b.is_active,
        b.rate_category_id,
        COALESCE(b.soft_delete, false) as soft_delete,
        COALESCE(b.is_individual, false) as is_individual,
        b.created_at,
        -- Get rate category info
        rc.category_name as rate_category_name,
        rc.base_hourly_rate,
        -- Get primary business address from headquarters service location
        hq.street_address_1 as street,
        hq.street_address_2,
        hq.city,
        hq.state,
        hq.zip_code,
        hq.country,
        -- Count only actual service locations (not headquarters)
        (SELECT COUNT(*) FROM service_locations sl2 WHERE sl2.business_id = b.id AND sl2.is_active = true AND sl2.soft_delete = false AND sl2.is_headquarters = false) as location_count,
        -- Get authorized domains (comma-separated)
        COALESCE(
          (SELECT string_agg(bad.domain, ', ' ORDER BY bad.domain)
           FROM business_authorized_domains bad
           WHERE bad.business_id = b.id AND bad.is_active = true),
          ''
        ) as domain_emails
      FROM businesses b
      LEFT JOIN service_locations hq ON hq.business_id = b.id AND hq.is_headquarters = true
      LEFT JOIN hourly_rate_categories rc ON b.rate_category_id = rc.id
      ORDER BY b.business_name
    `);

    res.status(200).json({
      success: true,
      data: {
        businesses: result.rows.map(business => ({
          id: business.id,
          businessName: business.business_name,
          domainEmails: business.domain_emails,
          logo: business.logo_url,
          logoPositionX: business.logo_position_x,
          logoPositionY: business.logo_position_y,
          logoScale: business.logo_scale,
          logoBackgroundColor: business.logo_background_color,
          rateCategoryId: business.rate_category_id,
          rateCategoryName: business.rate_category_name,
          baseHourlyRate: business.base_hourly_rate ? parseFloat(business.base_hourly_rate) : null,
          address: {
            street: business.street,
            street2: business.street_address_2,
            city: business.city,
            state: business.state,
            zipCode: business.zip_code,
            country: business.country
          },
          locationCount: parseInt(business.location_count) || 0,
          isActive: business.is_active,
          softDelete: business.soft_delete,
          isIndividual: business.is_individual,
          createdAt: business.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch businesses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /businesses/:businessId - Update business
router.put('/businesses/:businessId', requirePermission('modify.businesses.enable'), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { businessName, address, isActive, logo, logoPositionX, logoPositionY, logoScale, logoBackgroundColor, rateCategoryId } = req.body;

    // Validate required fields
    if (!businessName) {
      return res.status(400).json({
        success: false,
        message: 'Business name is required'
      });
    }

    // Begin transaction
    await query('BEGIN');

    try {
      // Update the business record - ensure position and scale values are integers
      const businessResult = await query(`
        UPDATE businesses
        SET
          business_name = $1,
          is_active = $2,
          logo_url = $3,
          logo_position_x = $4,
          logo_position_y = $5,
          logo_scale = $6,
          logo_background_color = $7,
          rate_category_id = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING id, business_name, is_active, logo_url, logo_position_x, logo_position_y, logo_scale, logo_background_color, rate_category_id, created_at, updated_at
      `, [
        businessName,
        isActive,
        logo || null,
        Math.round(logoPositionX || 50),
        Math.round(logoPositionY || 50),
        Math.round(logoScale || 100),
        logoBackgroundColor || null,
        rateCategoryId || null,
        businessId
      ]);

      if (businessResult.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Business not found'
        });
      }

      const updatedBusiness = businessResult.rows[0];

      // Update headquarters service location address if provided
      if (address) {
        // Check if headquarters service location exists
        const hqCheck = await query(`
          SELECT id FROM service_locations
          WHERE business_id = $1 AND is_headquarters = TRUE
          LIMIT 1
        `, [businessId]);

        if (hqCheck.rows.length > 0) {
          // Update existing headquarters
          await query(`
            UPDATE service_locations
            SET
              street_address_1 = $1,
              street_address_2 = $2,
              city = $3,
              state = $4,
              zip_code = $5,
              country = $6,
              updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $7 AND is_headquarters = TRUE
          `, [
            address.street || '',
            address.street2 || '',
            address.city || '',
            address.state || '',
            address.zipCode || '',
            address.country || 'USA',
            businessId
          ]);
        } else {
          // Create headquarters if it doesn't exist
          await query(`
            INSERT INTO service_locations (
              business_id,
              location_name,
              street_address_1,
              street_address_2,
              city,
              state,
              zip_code,
              country,
              is_headquarters,
              is_active,
              soft_delete
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE, FALSE)
          `, [
            businessId,
            businessName + ' - Headquarters',
            address.street || '',
            address.street2 || '',
            address.city || '',
            address.state || '',
            address.zipCode || '',
            address.country || 'USA'
          ]);
        }
      }

      // Get the updated headquarters address
      const addressResult = await query(`
        SELECT street_address_1 as street, street_address_2, city, state, zip_code, country
        FROM service_locations
        WHERE business_id = $1 AND is_headquarters = TRUE
        LIMIT 1
      `, [businessId]);

      const addressData = addressResult.rows[0] || {};

      // Commit transaction
      await query('COMMIT');

      // Broadcast update to other admin clients via WebSocket
      websocketService.broadcastBusinessUpdate(businessId, 'updated');

      res.status(200).json({
        success: true,
        message: 'Business updated successfully',
        data: {
          business: {
            id: updatedBusiness.id,
            businessName: updatedBusiness.business_name,
            address: {
              street: addressData.street || '',
              street2: addressData.street_address_2 || '',
              city: addressData.city || '',
              state: addressData.state || '',
              zipCode: addressData.zip_code || '',
              country: addressData.country || 'USA'
            },
            isActive: updatedBusiness.is_active,
            logo: updatedBusiness.logo_url,
            logoPositionX: updatedBusiness.logo_position_x,
            logoPositionY: updatedBusiness.logo_position_y,
            logoScale: updatedBusiness.logo_scale,
            logoBackgroundColor: updatedBusiness.logo_background_color,
            createdAt: updatedBusiness.created_at,
            updatedAt: updatedBusiness.updated_at
          }
        }
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating business:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /businesses - Create new business
router.post('/businesses', requirePermission('add.businesses.enable'), async (req, res) => {
  try {
    const {
      businessName,
      authorizedDomains = [],
      address,
      logo,
      logoPositionX,
      logoPositionY,
      logoScale,
      logoBackgroundColor,
      rateCategoryId
    } = req.body;

    // Validate required fields
    if (!businessName || !address) {
      return res.status(400).json({
        success: false,
        message: 'Business name and address are required'
      });
    }

    if (authorizedDomains.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one authorized domain is required'
      });
    }

    // Start transaction
    await query('BEGIN');

    try {
      // If no rate category provided, default to "Standard" category
      let finalRateCategoryId = rateCategoryId;
      if (!finalRateCategoryId) {
        const defaultCategoryResult = await query(`
          SELECT id FROM hourly_rate_categories
          WHERE is_default = true
          LIMIT 1
        `);
        if (defaultCategoryResult.rows.length > 0) {
          finalRateCategoryId = defaultCategoryResult.rows[0].id;
        }
      }

      // Create the business record (NO address columns - address goes in service_locations)
      const businessResult = await query(`
        INSERT INTO businesses (
          business_name,
          is_active,
          logo_url,
          logo_position_x,
          logo_position_y,
          logo_scale,
          logo_background_color,
          rate_category_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, business_name, is_active, logo_url, logo_position_x, logo_position_y, logo_scale, logo_background_color, rate_category_id, created_at
      `, [
        businessName,
        true,
        logo || null,
        logoPositionX ? Math.round(logoPositionX) : null,
        logoPositionY ? Math.round(logoPositionY) : null,
        logoScale ? Math.round(logoScale) : null,
        logoBackgroundColor || null,
        finalRateCategoryId
      ]);

      const business = businessResult.rows[0];

      // Create headquarters service location to store business address
      await query(`
        INSERT INTO service_locations (
          business_id,
          location_name,
          street_address_1,
          street_address_2,
          city,
          state,
          zip_code,
          country,
          is_headquarters,
          is_active,
          soft_delete
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE, FALSE)
      `, [
        business.id,
        businessName + ' - Headquarters',
        address.street,
        address.street2 || '',
        address.city,
        address.state,
        address.zipCode,
        address.country || 'USA'
      ]);

      // Add authorized domains
      for (const domain of authorizedDomains) {
        if (domain.domain && domain.domain.trim()) {
          await query(`
            INSERT INTO business_authorized_domains (business_id, domain, description, is_active)
            VALUES ($1, $2, $3, $4)
          `, [business.id, domain.domain.trim(), domain.description || '', true]);
        }
      }

      // Commit transaction
      await query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Business created successfully',
        data: {
          business: {
            id: business.id,
            businessName: business.business_name,
            address: {
              street: address.street,
              street2: address.street2 || '',
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              country: address.country || 'USA'
            },
            authorizedDomains: authorizedDomains.filter(d => d.domain && d.domain.trim()),
            isActive: business.is_active,
            createdAt: business.created_at
          }
        }
      });

      // Broadcast creation to other admin clients via WebSocket
      websocketService.broadcastBusinessUpdate(business.id, 'created');

    } catch (error) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating business:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create business',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /businesses/:businessId/authorized-domains - Get authorized domains for a business
router.get('/businesses/:businessId/authorized-domains', async (req, res) => {
  try {
    const { businessId } = req.params;

    const result = await query(`
      SELECT id, domain, description, is_active, created_at
      FROM business_authorized_domains
      WHERE business_id = $1
      ORDER BY domain
    `, [businessId]);

    res.status(200).json({
      success: true,
      data: {
        authorizedDomains: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching authorized domains:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch authorized domains',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /businesses/:businessId/authorized-domains - Update authorized domains for a business
router.put('/businesses/:businessId/authorized-domains', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { domains } = req.body;

    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one authorized domain is required'
      });
    }

    if (domains.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum of 5 authorized domains allowed'
      });
    }

    // Validate domains
    for (const domain of domains) {
      if (!domain.domain || typeof domain.domain !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid domain format'
        });
      }
    }

    // Begin transaction
    await query('BEGIN');

    try {
      // Delete existing domains for this business
      await query(`
        DELETE FROM business_authorized_domains
        WHERE business_id = $1
      `, [businessId]);

      // Insert new domains
      for (let i = 0; i < domains.length; i++) {
        const domainData = domains[i];
        await query(`
          INSERT INTO business_authorized_domains (business_id, domain, description, is_active)
          VALUES ($1, $2, $3, $4)
        `, [
          businessId,
          domainData.domain.toLowerCase().trim(),
          domainData.description || `Authorized domain for business`,
          domainData.is_active !== false // Default to true
        ]);
      }

      // Commit transaction
      await query('COMMIT');

      // Get updated domains
      const updatedResult = await query(`
        SELECT id, domain, description, is_active, created_at
        FROM business_authorized_domains
        WHERE business_id = $1
        ORDER BY domain
      `, [businessId]);

      res.status(200).json({
        success: true,
        message: 'Authorized domains updated successfully',
        data: {
          authorizedDomains: updatedResult.rows
        }
      });

    } catch (error) {
      // Rollback transaction
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating authorized domains:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update authorized domains',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /businesses/:id/soft-delete - Soft delete business with cascade to service locations and users
router.patch('/businesses/:id/soft-delete', requirePermission('softDelete.businesses.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { restore = false } = req.body; // restore = true to undelete, false to soft delete

    // Add soft_delete columns if they don't exist
    try {
      await query('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
      await query('ALTER TABLE service_locations ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Start transaction for cascade operations
    await query('BEGIN');

    try {
      // First, check if the business exists
      const businessCheck = await query('SELECT id, COALESCE(soft_delete, false) as soft_delete FROM businesses WHERE id = $1', [id]);

      if (businessCheck.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Business not found'
        });
      }

      const currentSoftDelete = businessCheck.rows[0].soft_delete;
      const newSoftDeleteStatus = !restore;

      // Update the business soft_delete status
      const updateBusinessResult = await query(`
        UPDATE businesses
        SET soft_delete = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, business_name, soft_delete
      `, [newSoftDeleteStatus, id]);

      // Cascade soft delete to service locations belonging to this business
      const updateServiceLocationsResult = await query(`
        UPDATE service_locations
        SET soft_delete = $1, updated_at = NOW()
        WHERE business_id = $2
        RETURNING id
      `, [newSoftDeleteStatus, id]);

      // Cascade soft delete to users (clients) belonging to this business
      const updateUsersResult = await query(`
        UPDATE users
        SET soft_delete = $1, updated_at = NOW()
        WHERE business_id = $2
        RETURNING id
      `, [newSoftDeleteStatus, id]);

      // Commit transaction
      await query('COMMIT');

      const business = updateBusinessResult.rows[0];
      const affectedServiceLocations = updateServiceLocationsResult.rows.length;
      const affectedUsers = updateUsersResult.rows.length;

      // Broadcast soft delete/restore to other admin clients via WebSocket
      const action = business.soft_delete ? 'deleted' : 'restored';
      websocketService.broadcastBusinessUpdate(id, action);

      res.status(200).json({
        success: true,
        message: business.soft_delete
          ? `Business soft deleted successfully. ${affectedServiceLocations} service locations and ${affectedUsers} users were also soft deleted.`
          : `Business restored successfully. ${affectedServiceLocations} service locations and ${affectedUsers} users were also restored.`,
        data: {
          business,
          cascadeResults: {
            serviceLocations: affectedServiceLocations,
            users: affectedUsers
          }
        }
      });

    } catch (error) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Soft delete business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to soft delete business',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /businesses/:id - Permanently delete business
router.delete('/businesses/:id', requirePermission('hardDelete.businesses.enable'), async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== DELETE BUSINESS ===');
    console.log('Business ID:', id);

    const result = await query(`
      DELETE FROM businesses
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    console.log('Deleted business:', result.rows[0]);

    // Broadcast delete to other admin clients via WebSocket
    websocketService.broadcastBusinessUpdate(id, 'deleted');

    res.status(200).json({
      success: true,
      message: 'Business permanently deleted successfully',
      data: {
        deletedBusiness: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error deleting business:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete business',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;