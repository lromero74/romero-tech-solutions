import express from 'express';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import clientFileBrowserService from '../../services/clientFileBrowserService.js';
import { getPool } from '../../config/database.js';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

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

/**
 * GET /api/admin/client-files/businesses/:businessId/files/:fileId/download
 * Download a file
 * Permission: download.client_files.enable
 */
router.get('/businesses/:businessId/files/:fileId/download',
  requirePermission('download.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId, fileId } = req.params;
      const employeeId = req.employee?.id; // From authMiddleware

      // Verify file belongs to this business and get file details
      const query = `
        SELECT id, file_path, original_filename, content_type
        FROM t_client_files
        WHERE id = $1 AND business_id = $2 AND soft_delete = false
      `;

      const pool = await getPool();
      const result = await pool.query(query, [fileId, businessId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      const fileRecord = result.rows[0];

      // Check if file exists on disk
      try {
        await fs.access(fileRecord.file_path);
      } catch {
        console.error(`❌ File not found on disk: ${fileRecord.file_path}`);
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }

      // Log file access (by employee)
      if (employeeId) {
        const logQuery = `
          INSERT INTO t_client_file_access_log (
            client_file_id, accessed_by_employee_id, access_type, access_granted, ip_address, user_agent
          ) VALUES ($1, $2, 'download', true, $3, $4)
        `;

        await pool.query(logQuery, [
          fileId,
          employeeId,
          req.ip,
          req.get('User-Agent')
        ]);
      }

      // Update download count
      const updateQuery = `
        UPDATE t_client_files
        SET download_count = COALESCE(download_count, 0) + 1,
            last_downloaded_at = CURRENT_TIMESTAMP,
            last_downloaded_by_employee_id = $2
        WHERE id = $1
      `;

      await pool.query(updateQuery, [fileId, employeeId]);

      console.log(`📥 [Admin] File downloaded: ${fileRecord.original_filename} by employee ${req.employee?.email}`);

      // Set headers for download
      res.setHeader('Content-Type', fileRecord.content_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_filename}"`);

      // Stream file to response
      const fileStream = createReadStream(fileRecord.file_path);
      fileStream.pipe(res);

    } catch (error) {
      console.error('❌ Error downloading file:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * DELETE /api/admin/client-files/businesses/:businessId/files/:fileId
 * Delete a file (soft delete)
 * Permission: delete.client_files.enable
 */
router.delete('/businesses/:businessId/files/:fileId',
  requirePermission('delete.client_files.enable'),
  async (req, res) => {
    try {
      const { businessId, fileId } = req.params;
      const employeeId = req.employee?.id; // From authMiddleware

      // Verify file belongs to this business and get its details
      const checkQuery = `
        SELECT file_path, original_filename, folder_id, service_request_id
        FROM t_client_files
        WHERE id = $1 AND business_id = $2 AND soft_delete = false
      `;

      const pool = await getPool();
      const checkResult = await pool.query(checkQuery, [fileId, businessId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      const originalName = checkResult.rows[0].original_filename;

      // Soft delete in database
      const deleteQuery = `
        UPDATE t_client_files
        SET deleted_at = CURRENT_TIMESTAMP,
            deleted_by_employee_id = $3,
            soft_delete = true,
            deletion_reason = 'Deleted by admin'
        WHERE id = $1 AND business_id = $2
      `;

      await pool.query(deleteQuery, [fileId, businessId, employeeId]);

      console.log(`🗑️  [Admin] File soft-deleted: ${originalName} by employee ${req.employee?.email}`);

      return res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      console.error('❌ Error deleting file:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;
