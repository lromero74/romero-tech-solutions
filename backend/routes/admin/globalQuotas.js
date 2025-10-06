import express from 'express';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import globalQuotaService from '../../services/globalQuotaService.js';

const router = express.Router();

/**
 * GET /api/admin/global-quotas
 * Get current global quota defaults
 * Permission: manage.global_quotas.enable
 */
router.get('/',
  requirePermission('manage.global_quotas.enable'),
  async (req, res) => {
    try {
      const quotaDefaults = await globalQuotaService.getGlobalQuotaDefaults();

      if (!quotaDefaults) {
        return res.status(404).json({
          success: false,
          message: 'No global quota defaults found'
        });
      }

      return res.status(200).json({
        success: true,
        data: quotaDefaults
      });

    } catch (error) {
      console.error('❌ Error fetching global quotas:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch global quotas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * PUT /api/admin/global-quotas
 * Update global quota defaults
 * Permission: manage.global_quotas.enable
 */
router.put('/',
  requirePermission('manage.global_quotas.enable'),
  async (req, res) => {
    try {
      const employeeId = req.session.userId;
      const quotaData = req.body;

      // Validate required fields
      if (!quotaData.maxFileSizeBytes || !quotaData.maxTotalStorageBytes ||
          !quotaData.maxFileCount || !quotaData.storageSoftLimitBytes) {
        return res.status(400).json({
          success: false,
          message: 'Missing required quota fields'
        });
      }

      const updatedQuota = await globalQuotaService.updateGlobalQuotaDefaults(quotaData, employeeId);

      return res.status(200).json({
        success: true,
        message: 'Global quota defaults updated successfully',
        data: updatedQuota
      });

    } catch (error) {
      console.error('❌ Error updating global quotas:', error);

      // Return validation errors with 400 status
      if (error.message.includes('must be') || error.message.includes('cannot exceed')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update global quotas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/global-quotas/effective/:businessId
 * Get effective quota for a specific business (global or custom)
 * Permission: manage.global_quotas.enable or manage.client_quotas.enable
 */
router.get('/effective/:businessId',
  requirePermission('manage.client_quotas.enable'), // Can view with client quota permission
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const effectiveQuota = await globalQuotaService.getEffectiveQuota(businessId);

      if (!effectiveQuota) {
        return res.status(404).json({
          success: false,
          message: 'No quota found for this business'
        });
      }

      return res.status(200).json({
        success: true,
        data: effectiveQuota
      });

    } catch (error) {
      console.error('❌ Error fetching effective quota:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch effective quota',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;
