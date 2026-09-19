import express from 'express';
import { logger } from '../../../utils/logger.js';
import { getPool } from '../../../config/database.js';
import { websocketService } from '../../../services/websocketService.js';

const router = express.Router();

/**
 * DELETE /api/admin/service-requests/:requestId/files/:fileId
 * Delete a file attachment with note logging
 */
router.delete('/service-requests/:requestId/files/:fileId', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;

    // Support both body and query params for deletedBy
    const deletedBy = req.body.deletedBy || {
      id: req.query.updatedById,
      name: req.query.updatedByName,
      type: req.query.updatedByType
    };

    if (!deletedBy || !deletedBy.id || !deletedBy.name || !deletedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'deletedBy information is required (id, name, type)'
      });
    }

    // Get file info before deletion
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const fileName = fileResult.rows[0].original_filename;

    // Soft delete the file
    await pool.query(
      'UPDATE t_client_files SET soft_delete = true, deleted_at = NOW(), deleted_by_user_id = $1 WHERE id = $2',
      [deletedBy.id, fileId]
    );

    // Create note entry
    const noteText = `**${deletedBy.name}** removed file attachment: **${fileName}**`;

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
      requestId,
      noteText,
      'file_change',
      deletedBy.type,
      deletedBy.id,
      deletedBy.name,
      true
    ]);

    // Notify via WebSocket (both admins and client)
    websocketService.broadcastServiceRequestUpdate(requestId, 'updated', {
      fileDeleted: true,
      fileId: fileId,
      fileName: fileName,
      deletedBy: deletedBy
    });

    res.json({
      success: true,
      message: `File "${fileName}" deleted successfully`
    });

  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/admin/service-requests/:requestId/files/:fileId/rename
 * Rename a file attachment with note logging
 */
router.patch('/service-requests/:requestId/files/:fileId/rename', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;
    const { newFileName, renamedBy } = req.body;

    if (!newFileName) {
      return res.status(400).json({
        success: false,
        message: 'newFileName is required'
      });
    }

    if (!renamedBy || !renamedBy.id || !renamedBy.name || !renamedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'renamedBy information is required (id, name, type)'
      });
    }

    // Get current file info
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const oldFileName = fileResult.rows[0].original_filename;

    if (oldFileName === newFileName) {
      return res.json({
        success: true,
        message: 'No change in filename'
      });
    }

    // Update the filename
    await pool.query(
      'UPDATE t_client_files SET original_filename = $1 WHERE id = $2',
      [newFileName, fileId]
    );

    // Create note entry
    const noteText = `**${renamedBy.name}** renamed file attachment:\n- **${oldFileName}**\n+ **${newFileName}**`;

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
      requestId,
      noteText,
      'file_change',
      renamedBy.type,
      renamedBy.id,
      renamedBy.name,
      true
    ]);

    res.json({
      success: true,
      message: 'File renamed successfully',
      data: { oldFileName, newFileName }
    });

  } catch (error) {
    logger.error('Error renaming file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rename file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;
