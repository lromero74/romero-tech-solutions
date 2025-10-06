import express from 'express';
import clientFolderService from '../../services/clientFolderService.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

const router = express.Router();

/**
 * GET /api/client/folders
 * Get all folders for the authenticated client's business
 */
router.get('/', authenticateClient, async (req, res) => {
  try {
    const businessId = req.user.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: 'Business not found in session'
      });
    }

    const folders = await clientFolderService.getFolders(businessId);

    return res.status(200).json({
      success: true,
      data: folders
    });

  } catch (error) {
    console.error('❌ Error fetching folders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch folders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/client/folders
 * Create a new folder
 */
router.post('/', authenticateClient, async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const userId = req.user.id;

    if (!businessId || !userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const folderData = req.body;

    const folder = await clientFolderService.createFolder(businessId, userId, folderData);

    return res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      data: folder
    });

  } catch (error) {
    console.error('❌ Error creating folder:', error);

    if (error.message.includes('required') || error.message.includes('not found') ||
        error.message.includes('belongs to')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create folder',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/client/folders/:folderId
 * Update a folder
 */
router.put('/:folderId', authenticateClient, async (req, res) => {
  try {
    const { folderId } = req.params;
    const businessId = req.user.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: 'Business not found in session'
      });
    }

    const updates = req.body;

    const updatedFolder = await clientFolderService.updateFolder(folderId, businessId, updates);

    return res.status(200).json({
      success: true,
      message: 'Folder updated successfully',
      data: updatedFolder
    });

  } catch (error) {
    console.error('❌ Error updating folder:', error);

    if (error.message.includes('not found') || error.message.includes('Cannot modify') ||
        error.message.includes('cannot be') || error.message.includes('belongs to')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update folder',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/client/folders/:folderId
 * Delete a folder (soft delete)
 */
router.delete('/:folderId', authenticateClient, async (req, res) => {
  try {
    const { folderId } = req.params;
    const businessId = req.user.businessId;
    const userId = req.user.id;

    if (!businessId || !userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    await clientFolderService.deleteFolder(folderId, businessId, userId);

    return res.status(200).json({
      success: true,
      message: 'Folder deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting folder:', error);

    if (error.message.includes('not found') || error.message.includes('Cannot delete') ||
        error.message.includes('belongs to')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to delete folder',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/client/folders/move-files
 * Move files to a folder
 */
router.post('/move-files', authenticateClient, async (req, res) => {
  try {
    const businessId = req.user.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: 'Business not found in session'
      });
    }

    const { fileIds, folderId } = req.body;

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({
        success: false,
        message: 'File IDs array is required'
      });
    }

    const movedCount = await clientFolderService.moveFilesToFolder(
      fileIds,
      folderId || null,
      businessId
    );

    return res.status(200).json({
      success: true,
      message: `${movedCount} file(s) moved successfully`,
      data: { movedCount }
    });

  } catch (error) {
    console.error('❌ Error moving files:', error);

    if (error.message.includes('not found') || error.message.includes('belongs to')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to move files',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
