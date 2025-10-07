import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { validateFileUpload, sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import virusScanService from '../../services/virusScanService.js';
import quotaManagementService from '../../services/quotaManagementService.js';
import { getPool } from '../../config/database.js';
import { websocketService } from '../../services/websocketService.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create secure client uploads directory
const clientUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'clients');

// Ensure directory exists
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

// Initialize directories
await ensureDirectoryExists(clientUploadsDir);

// Configure secure multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const businessId = req.user?.businessId || 'unknown';
      const businessDir = path.join(clientUploadsDir, businessId);
      await ensureDirectoryExists(businessDir);
      cb(null, businessDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // Properly decode filename from Latin-1 to UTF-8 (Multer bug workaround)
    // Multer incorrectly interprets UTF-8 bytes as Latin-1 in multipart headers
    try {
      const originalBytes = Buffer.from(file.originalname, 'latin1');
      file.originalname = originalBytes.toString('utf8');
    } catch (error) {
      console.error('⚠️ Failed to decode filename:', error);
      // Keep original if decoding fails
    }

    // Generate secure filename with UUID and timestamp
    const fileExtension = path.extname(file.originalname);
    const randomId = crypto.randomUUID();
    const timestamp = Date.now();
    const secureFilename = `${timestamp}_${randomId}${fileExtension}`;
    cb(null, secureFilename);
  }
});

// Enhanced file filter for client files
const clientFileFilter = (req, file, cb) => {
  // Determine allowed file types based on business requirements
  const allowedTypes = [
    // Documents
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Images
    'image/jpeg',
    'image/jpg', // Some systems use image/jpg instead of image/jpeg
    'image/png',
    'image/gif',
    'image/webp',
    // Archives (for log files, etc.)
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip'
  ];

  console.log(`🔍 File upload attempt: ${file.originalname}, MIME type: ${file.mimetype}`);

  const validation = validateFileUpload(file, 'attachments');

  if (!allowedTypes.includes(file.mimetype)) {
    console.log(`❌ File type rejected: ${file.mimetype}`);
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    return;
  }

  console.log(`✅ File type accepted: ${file.mimetype}`);

  if (validation.isValid) {
    cb(null, true);
  } else {
    cb(new Error(validation.error), false);
  }
};

// Configure multer with enhanced security
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5 // Maximum 5 files per request
  },
  fileFilter: clientFileFilter
});

// Apply middleware
router.use(authMiddleware);
router.use(clientContextMiddleware);
router.use(requireClientAccess(['business', 'location'])); // Allow both access levels
router.use(sanitizeInputMiddleware);

/**
 * POST /api/client/files/upload
 * Upload files with virus scanning and quota enforcement
 */
router.post('/upload', authenticateClient, upload.array('files', 5), async (req, res) => {
  const uploadedFiles = [];
  const failedFiles = [];
  let totalSizeBytes = 0;

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const businessId = req.user.businessId;
    const serviceLocationId = req.body.serviceLocationId || null;
    const serviceRequestId = req.body.serviceRequestId || null;
    const folderId = req.body.folderId || null;
    const categoryId = req.body.categoryId || null;
    const description = req.body.description || '';
    const isPublic = req.body.isPublic === 'true';

    // Calculate total upload size
    totalSizeBytes = req.files.reduce((sum, file) => sum + file.size, 0);

    console.log(`📤 Processing ${req.files.length} file(s) upload for business ${businessId}, total size: ${quotaManagementService.formatBytes(totalSizeBytes)}`);

    // Check quota before processing any files
    const quotaCheck = await quotaManagementService.checkQuotaAvailability(
      businessId,
      totalSizeBytes,
      serviceLocationId,
      req.user.id
    );

    if (!quotaCheck.canUpload) {
      // Delete uploaded files and return quota error
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));

      return res.status(413).json({
        success: false,
        message: quotaCheck.message,
        quotaInfo: {
          canUpload: false,
          availableBytes: quotaCheck.availableBytes,
          usagePercentage: quotaCheck.usagePercentage,
          warningLevel: quotaCheck.warningLevel
        }
      });
    }

    // Process each file
    for (const file of req.files) {
      try {
        console.log(`🔍 Processing file: ${file.originalname} (${quotaManagementService.formatBytes(file.size)})`);

        // Perform virus scan
        const scanResult = await virusScanService.scanFile(file.path, {
          originalName: file.originalname,
          size: file.size,
          userId: req.user.id,
          businessId: businessId,
          serviceLocationId: serviceLocationId
        });

        if (scanResult.isInfected) {
          // Quarantine infected file
          await virusScanService.quarantineFile(file.path, scanResult);

          failedFiles.push({
            originalName: file.originalname,
            error: `File infected with virus: ${scanResult.virusName}`,
            scanId: scanResult.scanId
          });

          console.log(`🚨 Infected file quarantined: ${file.originalname}`);
          continue;
        }

        if (!scanResult.scanSuccess) {
          // Delete file if scan failed
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Virus scan failed: ${scanResult.errorMessage}`,
            scanId: scanResult.scanId
          });

          console.log(`❌ Scan failed for file: ${file.originalname}`);
          continue;
        }

        // File is clean, record in database
        const fileData = {
          businessId: businessId,
          serviceLocationId: serviceLocationId,
          serviceRequestId: serviceRequestId,
          folderId: folderId,
          userId: req.user.id,
          fileName: file.filename,
          originalName: file.originalname,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          filePath: file.path,
          categoryId: categoryId,
          description: description,
          isPublic: isPublic,
          metadata: {
            scanId: scanResult.scanId,
            uploadedBy: req.user.email,
            uploadIp: req.ip,
            userAgent: req.get('User-Agent')
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const uploadResult = await quotaManagementService.recordFileUpload(fileData);

        if (uploadResult.success) {
          uploadedFiles.push({
            fileId: uploadResult.fileId,
            originalName: file.originalname,
            fileName: file.filename,
            size: file.size,
            mimeType: file.mimetype,
            scanId: scanResult.scanId,
            uploadedAt: uploadResult.createdAt
          });

          console.log(`✅ File uploaded successfully: ${file.originalname}`);
        } else {
          // Delete file if database recording failed
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Database error: ${uploadResult.error}`
          });
        }

      } catch (error) {
        console.error(`❌ Error processing file ${file.originalname}:`, error);

        // Cleanup file on error
        await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

        failedFiles.push({
          originalName: file.originalname,
          error: error.message
        });
      }
    }

    // Get updated quota information
    const updatedQuotaInfo = await quotaManagementService.getBusinessQuotaInfo(businessId);

    res.status(uploadedFiles.length > 0 ? 200 : 400).json({
      success: uploadedFiles.length > 0,
      message: `Upload completed. ${uploadedFiles.length} file(s) uploaded successfully, ${failedFiles.length} failed.`,
      data: {
        uploadedFiles,
        failedFiles,
        quotaInfo: updatedQuotaInfo
      }
    });

  } catch (error) {
    console.error('❌ File upload error:', error);

    // Cleanup all uploaded files on error
    if (req.files) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during file upload'
    });
  }
});

/**
 * GET /api/client/files
 * Get files for authenticated client
 */
router.get('/', authenticateClient, async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const serviceLocationId = req.query.serviceLocationId || null;
    const folderId = req.query.folderId || null;
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        f.id,
        f.stored_filename,
        f.original_filename,
        f.file_size_bytes,
        f.content_type as mime_type,
        f.file_description,
        f.is_public_to_business,
        f.folder_id,
        f.service_request_id,
        f.virus_scan_status,
        f.virus_scan_result,
        f.virus_scan_date,
        f.created_at,
        f.updated_at,
        u.id as uploader_id,
        u.first_name as uploader_first_name,
        u.last_name as uploader_last_name,
        folder.folder_name,
        folder.folder_color,
        sr.title as service_request_title,
        COUNT(*) OVER() as total_count
      FROM t_client_files f
      LEFT JOIN users u ON f.uploaded_by_user_id = u.id
      LEFT JOIN t_client_folders folder ON f.folder_id = folder.id
      LEFT JOIN service_requests sr ON f.service_request_id = sr.id
      WHERE f.business_id = $1 AND f.soft_delete = false
    `;

    const queryParams = [businessId];
    let paramCount = 1;

    if (serviceLocationId) {
      query += ` AND f.service_location_id = $${++paramCount}`;
      queryParams.push(serviceLocationId);
    }

    if (folderId !== null) {
      if (folderId === 'null' || folderId === '') {
        query += ` AND f.folder_id IS NULL`;
      } else {
        query += ` AND f.folder_id = $${++paramCount}`;
        queryParams.push(folderId);
      }
    }

    if (search) {
      query += ` AND f.original_filename ILIKE $${++paramCount}`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY f.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    queryParams.push(limit, offset);

    const pool = await getPool();
    const result = await pool.query(query, queryParams);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      success: true,
      data: {
        files: result.rows.map(row => ({
          id: row.id,
          storedFilename: row.stored_filename,
          originalFilename: row.original_filename,
          fileSizeBytes: parseInt(row.file_size_bytes),
          sizeFormatted: quotaManagementService.formatBytes(parseInt(row.file_size_bytes)),
          mimeType: row.mime_type,
          description: row.file_description,
          isPublic: row.is_public_to_business,
          folderId: row.folder_id,
          folderName: row.folder_name,
          folderColor: row.folder_color,
          serviceRequestId: row.service_request_id,
          serviceRequestTitle: row.service_request_title,
          virusScanStatus: row.virus_scan_status,
          virusScanResult: row.virus_scan_result,
          virusScanDate: row.virus_scan_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          uploader: row.uploader_id ? {
            id: row.uploader_id,
            firstName: row.uploader_first_name,
            lastName: row.uploader_last_name,
            fullName: `${row.uploader_first_name} ${row.uploader_last_name}`.trim()
          } : null
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
    console.error('❌ Error fetching files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch files'
    });
  }
});

/**
 * GET /api/client/files/quota
 * Get quota information for client
 */
router.get('/quota', authenticateClient, async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const [quotaInfo, usageStats] = await Promise.all([
      quotaManagementService.getBusinessQuotaInfo(businessId),
      quotaManagementService.getUsageStatistics(businessId)
    ]);

    res.json({
      success: true,
      data: {
        quota: quotaInfo,
        usage: usageStats
      }
    });

  } catch (error) {
    console.error('❌ Error fetching quota info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quota information'
    });
  }
});

/**
 * GET /api/client/files/:fileId/download
 * Download a file
 */
router.get('/:fileId/download', authenticateClient, async (req, res) => {
  try {
    const { fileId } = req.params;
    const businessId = req.user.businessId;

    // Verify file belongs to this business and get file details
    const query = `
      SELECT id, file_path, original_filename, content_type
      FROM t_client_files
      WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
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

    // Log file access
    const logQuery = `
      INSERT INTO t_client_file_access_log (
        client_file_id, accessed_by_user_id, access_type, access_granted, ip_address, user_agent
      ) VALUES ($1, $2, 'download', true, $3, $4)
    `;

    await pool.query(logQuery, [
      fileId,
      req.user.id,
      req.ip,
      req.get('User-Agent')
    ]);

    // Update download count
    const updateQuery = `
      UPDATE t_client_files
      SET download_count = COALESCE(download_count, 0) + 1,
          last_downloaded_at = CURRENT_TIMESTAMP,
          last_downloaded_by_user_id = $2
      WHERE id = $1
    `;

    await pool.query(updateQuery, [fileId, req.user.id]);

    console.log(`📥 File downloaded: ${fileRecord.original_filename} by user ${req.user.email}`);

    // Set headers for download
    res.setHeader('Content-Type', fileRecord.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_filename}"`);

    // Stream file to response
    const fileStream = createReadStream(fileRecord.file_path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file'
    });
  }
});

/**
 * DELETE /api/client/files/:fileId
 * Delete a file (soft delete)
 */
router.delete('/:fileId', authenticateClient, async (req, res) => {
  try {
    const { fileId } = req.params;
    const businessId = req.user.businessId;

    // Verify file belongs to this business and get its details
    const checkQuery = `
      SELECT file_path, original_filename, folder_id, service_request_id
      FROM t_client_files
      WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
    `;

    const pool = await getPool();
    const checkResult = await pool.query(checkQuery, [fileId, businessId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const filePath = checkResult.rows[0].file_path;
    const originalName = checkResult.rows[0].original_filename;
    const folderId = checkResult.rows[0].folder_id;
    const serviceRequestId = checkResult.rows[0].service_request_id;

    // Soft delete in database
    const deleteQuery = `
      UPDATE t_client_files
      SET deleted_at = CURRENT_TIMESTAMP,
          deleted_by_user_id = $3,
          soft_delete = true
      WHERE id = $1 AND business_id = $2
    `;

    await pool.query(deleteQuery, [fileId, businessId, req.user.id]);

    // Log deletion
    const logQuery = `
      INSERT INTO t_client_file_access_log (
        client_file_id, accessed_by_user_id, access_type, access_granted, ip_address, user_agent
      ) VALUES ($1, $2, 'delete', true, $3, $4)
    `;

    await pool.query(logQuery, [
      fileId,
      req.user.id,
      req.ip,
      req.get('User-Agent')
    ]);

    console.log(`🗑️ File soft-deleted: ${originalName} by user ${req.user.email}`);

    // If file belongs to a service request, broadcast update so file count refreshes
    if (serviceRequestId) {
      console.log(`📡 Broadcasting file deletion for service request ${serviceRequestId}`);
      websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'updated', {
        fileDeleted: true,
        fileId: fileId,
        fileName: originalName,
        deletedBy: 'client',
        deletedFrom: 'fileStorage'
      });
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file'
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 50MB per file.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 files per request.'
      });
    }
  }

  if (error.message.includes('not allowed') || error.message.includes('Invalid')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  console.error('❌ File upload middleware error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

export default router;