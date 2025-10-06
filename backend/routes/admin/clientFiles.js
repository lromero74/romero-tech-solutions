import express from 'express';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import clientFileBrowserService from '../../services/clientFileBrowserService.js';

const router = express.Router();

/**
 * GET /api/admin/client-files/businesses
 * Get all businesses with file storage statistics
 * Permission: view.client_files.enable
 */
router.get('/businesses',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const businesses = await clientFileBrowserService.getAllBusinesses();

      return res.status(200).json({
        success: true,
        data: businesses
      });

    } catch (error) {
      console.error('❌ Error fetching businesses:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch businesses',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/businesses/:businessId/folders
 * Get folder tree for a business (alias for convenience)
 * Permission: view.client_files.enable
 */
router.get('/businesses/:businessId/folders',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const folders = await clientFileBrowserService.getFolderTree(businessId);

      return res.status(200).json({
        success: true,
        data: folders
      });

    } catch (error) {
      console.error('❌ Error fetching folder tree:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch folder tree',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/businesses/:businessId/files
 * Get all files for a business with pagination and filtering
 * Permission: view.client_files.enable
 */
router.get('/businesses/:businessId/files',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const { page, limit, search, sortBy, sortOrder, virusScanStatus, folderId } = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        search: search || '',
        sortBy: sortBy || 'created_at',
        sortOrder: sortOrder || 'DESC',
        virusScanStatus: virusScanStatus || null,
        folderId: folderId || null
      };

      const result = await clientFileBrowserService.getAllFiles(businessId, options);

      return res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Error fetching files:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch files',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/:businessId/folders
 * Get folder tree for a business
 * Permission: view.client_files.enable
 */
router.get('/:businessId/folders',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const folders = await clientFileBrowserService.getFolderTree(businessId);

      return res.status(200).json({
        success: true,
        data: folders
      });

    } catch (error) {
      console.error('❌ Error fetching folder tree:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch folder tree',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/:businessId/folder/:folderId?
 * Get files in a specific folder (or root if folderId is null)
 * Permission: view.client_files.enable
 */
router.get('/:businessId/folder/:folderId?',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId, folderId } = req.params;
      const { page, limit, search, sortBy, sortOrder } = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        search: search || '',
        sortBy: sortBy || 'created_at',
        sortOrder: sortOrder || 'DESC'
      };

      const result = await clientFileBrowserService.getFilesInFolder(
        businessId,
        folderId === 'null' || !folderId ? null : folderId,
        options
      );

      return res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Error fetching files in folder:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch files',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/:businessId/all
 * Get all files for a business
 * Permission: view.client_files.enable
 */
router.get('/:businessId/all',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const { page, limit, search, sortBy, sortOrder, virusScanStatus, folderId } = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        search: search || '',
        sortBy: sortBy || 'created_at',
        sortOrder: sortOrder || 'DESC',
        virusScanStatus: virusScanStatus || null,
        folderId: folderId || null
      };

      const result = await clientFileBrowserService.getAllFiles(businessId, options);

      return res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Error fetching all files:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch files',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/admin/client-files/:businessId/overview
 * Get storage overview for a business
 * Permission: view.client_files.enable
 */
router.get('/:businessId/overview',
  requirePermission('view.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required'
        });
      }

      const overview = await clientFileBrowserService.getStorageOverview(businessId);

      return res.status(200).json({
        success: true,
        data: overview
      });

    } catch (error) {
      console.error('❌ Error fetching storage overview:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch storage overview',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;
