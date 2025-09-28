import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { validateFileUpload, sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import virusScanService from '../../services/virusScanService.js';
import quotaManagementService from '../../services/quotaManagementService.js';
import { getPool } from '../../config/database.js';

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
    'image/png',
    'image/gif',
    'image/webp',
    // Archives (for log files, etc.)
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip'
  ];

  const validation = validateFileUpload(file, 'documents');

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    return;
  }

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
router.post('/upload', upload.array('files', 5), async (req, res) => {
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
      req.user.userId
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
          userId: req.user.userId,
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
          userId: req.user.userId,
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
router.get('/', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const serviceLocationId = req.query.serviceLocationId || null;
    const categoryId = req.query.categoryId || null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        f.file_id,
        f.file_name,
        f.original_name,
        f.file_size_bytes,
        f.mime_type,
        f.description,
        f.is_public,
        f.created_at,
        c.category_name,
        sl.location_name,
        COUNT(*) OVER() as total_count
      FROM t_client_files f
      LEFT JOIN t_file_categories c ON f.category_id = c.category_id
      LEFT JOIN service_locations sl ON f.service_location_id = sl.service_location_id
      WHERE f.business_id = $1 AND f.deleted_at IS NULL
    `;

    const queryParams = [businessId];
    let paramCount = 1;

    if (serviceLocationId) {
      query += ` AND f.service_location_id = $${++paramCount}`;
      queryParams.push(serviceLocationId);
    }

    if (categoryId) {
      query += ` AND f.category_id = $${++paramCount}`;
      queryParams.push(categoryId);
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
          fileId: row.file_id,
          fileName: row.file_name,
          originalName: row.original_name,
          fileSizeBytes: parseInt(row.file_size_bytes),
          sizeFormatted: quotaManagementService.formatBytes(parseInt(row.file_size_bytes)),
          mimeType: row.mime_type,
          description: row.description,
          isPublic: row.is_public,
          categoryName: row.category_name,
          locationName: row.location_name,
          createdAt: row.created_at
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
router.get('/quota', async (req, res) => {
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
 * DELETE /api/client/files/:fileId
 * Delete a file (soft delete)
 */
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const businessId = req.user.businessId;

    // Verify file belongs to this business
    const checkQuery = `
      SELECT file_path, original_name
      FROM t_client_files
      WHERE file_id = $1 AND business_id = $2 AND deleted_at IS NULL
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
    const originalName = checkResult.rows[0].original_name;

    // Soft delete in database
    const deleteQuery = `
      UPDATE t_client_files
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $3
      WHERE file_id = $1 AND business_id = $2
    `;

    await pool.query(deleteQuery, [fileId, businessId, req.user.userId]);

    // Log deletion
    const logQuery = `
      INSERT INTO t_client_file_access_log (
        file_id, user_id, action_type, ip_address, user_agent
      ) VALUES ($1, $2, 'delete', $3, $4)
    `;

    await pool.query(logQuery, [
      fileId,
      req.user.userId,
      req.ip,
      req.get('User-Agent')
    ]);

    console.log(`🗑️ File soft-deleted: ${originalName} by user ${req.user.email}`);

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