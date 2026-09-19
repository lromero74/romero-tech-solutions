import express from 'express';
import { logger } from '../../../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { getPool } from '../../../config/database.js';
import { websocketService } from '../../../services/websocketService.js';
import virusScanService from '../../../services/virusScanService.js';
import quotaManagementService from '../../../services/quotaManagementService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ============================================================================
// FILE UPLOAD CONFIGURATION AND ENDPOINTS
// ============================================================================

const clientUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'clients');

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    logger.debug(`📁 Created directory: ${dirPath}`);
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // For admin uploads, we need to get the businessId from the service request
      const pool = await getPool();
      const { id: serviceRequestId } = req.params;

      const result = await pool.query(
        'SELECT sr.business_id FROM service_requests sr WHERE sr.id = $1',
        [serviceRequestId]
      );

      const businessId = result.rows[0]?.business_id || 'unknown';
      const businessDir = path.join(clientUploadsDir, businessId);
      await ensureDirectoryExists(businessDir);
      cb(null, businessDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Fix UTF-8 encoding issue - multer interprets UTF-8 as Latin-1
      const originalBytes = Buffer.from(file.originalname, 'latin1');
      file.originalname = originalBytes.toString('utf8');

      const fileExtension = path.extname(file.originalname);
      const randomId = crypto.randomUUID();
      const timestamp = Date.now();
      const secureFilename = `${timestamp}_${randomId}${fileExtension}`;

      cb(null, secureFilename);
    } catch (error) {
      logger.error('Error generating filename:', error);
      cb(error, null);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  }
});

/**
 * Ensures the folder structure exists for organizing service request files
 * Creates "Service Requests" parent folder and SR-specific subfolder if needed
 * @param {string} businessId - Business UUID
 * @param {string} requestNumber - Service request number (e.g., "SR-2025-00001")
 * @returns {Promise<string>} - Folder ID for the service request
 */
async function ensureServiceRequestFolder(businessId, requestNumber) {
  const pool = await getPool();

  // Step 1: Ensure "Service Requests" parent folder exists
  let parentFolderId;
  const parentFolderResult = await pool.query(
    `SELECT id FROM t_client_folders
     WHERE business_id = $1
       AND folder_name = 'Service Requests'
       AND parent_folder_id IS NULL
       AND soft_delete = false
       LIMIT 1`,
    [businessId]
  );

  if (parentFolderResult.rows.length > 0) {
    parentFolderId = parentFolderResult.rows[0].id;
  } else {
    // Create "Service Requests" parent folder
    const createParentResult = await pool.query(
      `INSERT INTO t_client_folders (
        business_id,
        parent_folder_id,
        folder_name,
        folder_description,
        folder_color,
        sort_order,
        is_system_folder
      ) VALUES ($1, NULL, $2, $3, $4, 0, true)
      RETURNING id`,
      [
        businessId,
        'Service Requests',
        'Automatically organized files from service requests',
        '#3B82F6'
      ]
    );
    parentFolderId = createParentResult.rows[0].id;
    logger.debug(`📁 Created "Service Requests" parent folder for business ${businessId}`);
  }

  // Step 2: Ensure service request subfolder exists
  let srFolderId;
  const srFolderResult = await pool.query(
    `SELECT id FROM t_client_folders
     WHERE business_id = $1
       AND parent_folder_id = $2
       AND folder_name = $3
       AND soft_delete = false
       LIMIT 1`,
    [businessId, parentFolderId, requestNumber]
  );

  if (srFolderResult.rows.length > 0) {
    srFolderId = srFolderResult.rows[0].id;
  } else {
    // Create service request subfolder
    const createSrFolderResult = await pool.query(
      `INSERT INTO t_client_folders (
        business_id,
        parent_folder_id,
        folder_name,
        folder_description,
        folder_color,
        sort_order,
        is_system_folder
      ) VALUES ($1, $2, $3, $4, $5, 0, true)
      RETURNING id`,
      [
        businessId,
        parentFolderId,
        requestNumber,
        `Files for service request ${requestNumber}`,
        '#10B981'
      ]
    );
    srFolderId = createSrFolderResult.rows[0].id;
    logger.debug(`📁 Created folder for service request ${requestNumber}`);
  }

  return srFolderId;
}

/**
 * POST /api/admin/service-requests/:id/files/upload
 * Upload files to a service request (admin/employee)
 */
router.post('/service-requests/:id/files/upload', upload.array('files', 5), async (req, res) => {
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

    const { id: serviceRequestId } = req.params;
    const employeeId = req.user.id; // Employee ID from auth middleware
    const pool = await getPool();

    // Verify service request exists and get details
    const requestCheck = await pool.query(
      'SELECT sr.id, sr.request_number, sr.business_id FROM service_requests sr WHERE sr.id = $1 AND sr.soft_delete = false',
      [serviceRequestId]
    );

    if (requestCheck.rows.length === 0) {
      // Cleanup uploaded files
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err))
      ));

      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const requestNumber = requestCheck.rows[0].request_number;
    const businessId = requestCheck.rows[0].business_id;

    // Ensure folder structure exists for this service request
    const serviceRequestFolderId = await ensureServiceRequestFolder(businessId, requestNumber);
    logger.debug(`📁 [Admin] Files will be organized in folder: ${requestNumber}`);

    // Calculate total upload size
    totalSizeBytes = req.files.reduce((sum, file) => sum + file.size, 0);

    logger.debug(`📤 [Admin] Processing ${req.files.length} file(s) upload for service request ${requestNumber}`);

    // Check quota
    const quotaCheck = await quotaManagementService.checkQuotaAvailability(
      businessId,
      totalSizeBytes,
      null,
      null // No specific user for admin uploads
    );

    if (!quotaCheck.canUpload) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err))
      ));

      return res.status(413).json({
        success: false,
        message: quotaCheck.message,
        quotaInfo: quotaCheck
      });
    }

    // Process each file
    for (const file of req.files) {
      try {
        logger.debug(`🔍 Processing file: ${file.originalname} (${quotaManagementService.formatBytes(file.size)})`);

        // Perform virus scan
        const scanResult = await virusScanService.scanFile(file.path, {
          originalName: file.originalname,
          size: file.size,
          employeeId: employeeId,
          businessId: businessId,
          serviceRequestId: serviceRequestId
        });

        if (scanResult.isInfected) {
          await virusScanService.quarantineFile(file.path, scanResult);

          failedFiles.push({
            originalName: file.originalname,
            error: `File infected with virus: ${scanResult.virusName}`,
            scanId: scanResult.scanId
          });

          logger.warn(`🚨 Infected file quarantined: ${file.originalname}`);
          continue;
        }

        if (!scanResult.scanSuccess) {
          await fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Virus scan failed: ${scanResult.errorMessage}`,
            scanId: scanResult.scanId
          });

          logger.warn(`❌ Scan failed for file: ${file.originalname}`);
          continue;
        }

        // File is clean, record in database
        const fileData = {
          businessId: businessId,
          serviceLocationId: null,
          employeeId: employeeId, // Set employee ID for admin uploads
          fileName: file.filename,
          originalName: file.originalname,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          filePath: file.path,
          categoryId: null,
          description: '',
          isPublic: false,
          metadata: {
            scanId: scanResult.scanId,
            uploadedByEmployee: employeeId,
            uploadedByEmail: req.user.email,
            uploadIp: req.ip,
            userAgent: req.get('User-Agent'),
            serviceRequestId: serviceRequestId
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const uploadResult = await quotaManagementService.recordFileUpload(fileData);

        if (uploadResult.success) {
          // Link file to service request and assign to the appropriate folder
          await pool.query(
            'UPDATE t_client_files SET service_request_id = $1, folder_id = $2 WHERE id = $3',
            [serviceRequestId, serviceRequestFolderId, uploadResult.fileId]
          );

          uploadedFiles.push({
            fileId: uploadResult.fileId,
            originalName: file.originalname,
            fileName: file.filename,
            size: file.size,
            mimeType: file.mimetype,
            scanId: scanResult.scanId,
            scanStatus: scanResult.isInfected ? 'infected' : 'clean',
            uploadedAt: uploadResult.createdAt
          });

          logger.debug(`✅ File uploaded successfully: ${file.originalname}`);
        } else {
          await fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Database error: ${uploadResult.error}`
          });
        }

      } catch (error) {
        logger.error(`❌ Error processing file ${file.originalname}:`, error);

        await fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err));

        failedFiles.push({
          originalName: file.originalname,
          error: error.message
        });
      }
    }

    // Create automatic note if any files were uploaded successfully
    if (uploadedFiles.length > 0) {
      const employeeQuery = await pool.query(
        'SELECT first_name, last_name FROM employees WHERE id = $1',
        [employeeId]
      );
      const employeeName = employeeQuery.rows[0] ? `${employeeQuery.rows[0].first_name} ${employeeQuery.rows[0].last_name}` : 'Employee';

      const now = new Date();
      const utcTime = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const localTime = now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + ' PST';

      const fileList = uploadedFiles.map(f => `- ${f.originalName} (${quotaManagementService.formatBytes(f.size)})`).join('\n');
      const allClean = uploadedFiles.every(f => f.scanStatus === 'clean');
      const virusStatus = allClean ? '✅ Clean' : '⚠️ Some files flagged';

      const noteText = `📎 **${employeeName}** uploaded **${uploadedFiles.length}** file(s) on ${utcTime} (${localTime})

**Files:**
${fileList}

**Virus scan:** ${virusStatus}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        serviceRequestId,
        noteText,
        'file_upload',
        'employee',
        employeeId,
        employeeName,
        true
      ]);

      logger.debug(`📝 Created auto-note for ${uploadedFiles.length} uploaded file(s)`);

      // Broadcast file upload to admins/employees and client via WebSocket
      websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'updated', {
        filesUploaded: true,
        fileCount: uploadedFiles.length,
        uploadedFiles: uploadedFiles
      });
    }

    // Get updated quota information
    const updatedQuotaInfo = await quotaManagementService.getBusinessQuotaInfo(businessId);

    res.status(uploadedFiles.length > 0 ? 200 : 400).json({
      success: uploadedFiles.length > 0,
      message: `Upload completed. ${uploadedFiles.length} file(s) uploaded successfully${failedFiles.length > 0 ? `, ${failedFiles.length} failed` : ''}.`,
      data: {
        uploadedFiles,
        failedFiles,
        quotaInfo: updatedQuotaInfo
      }
    });

  } catch (error) {
    logger.error('❌ [Admin] File upload error:', error);

    // Cleanup all uploaded files on error
    if (req.files) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => logger.error('Failed to cleanup file:', err))
      ));
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during file upload'
    });
  }
});

export default router;
