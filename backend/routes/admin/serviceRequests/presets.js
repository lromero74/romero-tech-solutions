import express from 'express';
import { logger } from '../../../utils/logger.js';
import filterPresetService from '../../../services/filterPresetService.js';

const router = express.Router();

/**
 * POST /api/admin/service-requests/filter-presets
 * Create a new filter preset
 */
router.post('/service-requests/filter-presets', async (req, res) => {
  try {
    const { name, description, filter_type, criteria, display_order } = req.body;
    const employeeId = req.employeeId || req.user?.id;

    if (!name || !criteria) {
      return res.status(400).json({
        success: false,
        message: 'Name and criteria are required'
      });
    }

    const preset = await filterPresetService.createPreset(
      { name, description, filter_type, criteria, display_order },
      employeeId
    );

    res.status(201).json({
      success: true,
      message: 'Filter preset created successfully',
      data: preset
    });

  } catch (error) {
    logger.error('Error creating filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/filter-presets/:id
 * Update a filter preset
 */
router.put('/service-requests/filter-presets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const preset = await filterPresetService.updatePreset(id, updates);

    res.json({
      success: true,
      message: 'Filter preset updated successfully',
      data: preset
    });

  } catch (error) {
    logger.error('Error updating filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/admin/service-requests/filter-presets/:id
 * Delete a filter preset
 */
router.delete('/service-requests/filter-presets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await filterPresetService.deletePreset(id);

    res.json({
      success: true,
      message: 'Filter preset deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/filter-presets/all
 * Get all filter presets (including inactive ones, for management)
 */
router.get('/service-requests/filter-presets/all', async (req, res) => {
  try {
    const presets = await filterPresetService.getAllPresets();

    res.json({
      success: true,
      data: presets
    });

  } catch (error) {
    logger.error('Error fetching all filter presets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter presets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;
