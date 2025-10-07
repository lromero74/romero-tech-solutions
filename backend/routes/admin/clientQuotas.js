import express from 'express';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import clientQuotaService from '../../services/clientQuotaService.js';
import globalQuotaService from '../../services/globalQuotaService.js';

const router = express.Router();

/**
 * GET /api/admin/client-quotas
 * Get all clients with their quota information
 * Permission: manage.client_quotas.enable
 */
router.get('/',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const clients = await clientQuotaService.getAllClientsWithQuotas();

      return res.status(200).json({
        success: true,
        data: clients
      });

    } catch (error) {
      console.error('❌ Error fetching all client quotas:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch client quotas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-quotas/:businessId
 * Get quota configuration for a specific client
 * Permission: manage.client_quotas.enable
 */
router.get('/:businessId',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      // Get client quota (may be null if not set)
      const clientQuota = await clientQuotaService.getClientQuota(businessId);

      // Get effective quota (global or custom)
      const effectiveQuota = await globalQuotaService.getEffectiveQuota(businessId);

      // Get current usage
      const usage = await clientQuotaService.getClientUsage(businessId);

      return res.status(200).json({
        success: true,
        data: {
          clientQuota,
          effectiveQuota,
          usage
        }
      });

    } catch (error) {
      console.error('❌ Error fetching client quota:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch client quota',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * PUT /api/admin/client-quotas/:businessId
 * Update quota configuration for a specific client
 * Permission: manage.client_quotas.enable
 */
router.put('/:businessId',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const employeeId = req.session.userId;
      const { softLimitBytes, hardLimitBytes, warningThresholdPercent } = req.body;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      // Transform frontend field names to service field names
      const quotaData = {
        storageSoftLimitBytes: softLimitBytes,
        maxTotalStorageBytes: hardLimitBytes,
        warningThresholdPercentage: warningThresholdPercent,
        customQuotaEnabled: !!(softLimitBytes || hardLimitBytes),
        useGlobalDefaults: !(softLimitBytes || hardLimitBytes)
      };

      const updatedQuota = await clientQuotaService.updateClientQuota(
        businessId,
        quotaData,
        employeeId
      );

      return res.status(200).json({
        success: true,
        message: 'Client quota updated successfully',
        data: updatedQuota
      });

    } catch (error) {
      console.error('❌ Error updating client quota:', error);

      // Return validation errors with 400 status
      if (error.message.includes('must be') || error.message.includes('cannot exceed')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update client quota',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * DELETE /api/admin/client-quotas/:businessId
 * Reset client to use global defaults (remove custom quota)
 * Permission: manage.client_quotas.enable
 */
router.delete('/:businessId',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const employeeId = req.session.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const updatedQuota = await clientQuotaService.resetToGlobalDefaults(
        businessId,
        employeeId
      );

      return res.status(200).json({
        success: true,
        message: 'Client quota reset to global defaults',
        data: updatedQuota
      });

    } catch (error) {
      console.error('❌ Error resetting client quota:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reset client quota',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * POST /api/admin/client-quotas/:businessId/reset
 * Reset client to use global defaults (legacy endpoint)
 * Permission: manage.client_quotas.enable
 */
router.post('/:businessId/reset',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const employeeId = req.session.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const updatedQuota = await clientQuotaService.resetToGlobalDefaults(
        businessId,
        employeeId
      );

      return res.status(200).json({
        success: true,
        message: 'Client quota reset to global defaults',
        data: updatedQuota
      });

    } catch (error) {
      console.error('❌ Error resetting client quota:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reset client quota',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-quotas/:businessId/usage
 * Get current usage statistics for a client
 * Permission: manage.client_quotas.enable
 */
router.get('/:businessId/usage',
  requirePermission('manage.client_quotas.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const usage = await clientQuotaService.getClientUsage(businessId);

      return res.status(200).json({
        success: true,
        data: usage
      });

    } catch (error) {
      console.error('❌ Error fetching client usage:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch client usage',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;
