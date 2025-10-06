import { getPool } from '../config/database.js';

/**
 * Client Folder Service
 * Manages client folder operations (CRUD)
 */
class ClientFolderService {

  /**
   * Get all folders for a business
   * @param {string} businessId - Business UUID
   * @returns {array} Folder list
   */
  async getFolders(businessId) {
    try {
      const query = `
        SELECT
          id,
          business_id,
          parent_folder_id,
          folder_name,
          folder_description,
          folder_color,
          sort_order,
          is_system_folder,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM t_client_files WHERE folder_id = t_client_folders.id AND soft_delete = false) as file_count
        FROM t_client_folders
        WHERE business_id = $1 AND soft_delete = false
        ORDER BY is_system_folder DESC, sort_order, folder_name
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);

      return result.rows.map(folder => ({
        id: folder.id,
        businessId: folder.business_id,
        parentFolderId: folder.parent_folder_id,
        folderName: folder.folder_name,
        folderDescription: folder.folder_description,
        folderColor: folder.folder_color,
        sortOrder: folder.sort_order,
        isSystemFolder: folder.is_system_folder,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        fileCount: parseInt(folder.file_count)
      }));

    } catch (error) {
      console.error('❌ Failed to get folders:', error);
      throw error;
    }
  }

  /**
   * Create a new folder
   * @param {string} businessId - Business UUID
   * @param {string} userId - User UUID
   * @param {object} folderData - Folder data
   * @returns {object} Created folder
   */
  async createFolder(businessId, userId, folderData) {
    try {
      const {
        parentFolderId = null,
        folderName,
        folderDescription = null,
        folderColor = null,
        sortOrder = 0
      } = folderData;

      // Validate folder name
      if (!folderName || folderName.trim().length === 0) {
        throw new Error('Folder name is required');
      }

      // Check if parent folder exists and belongs to the same business
      if (parentFolderId) {
        const parentQuery = `
          SELECT business_id FROM t_client_folders
          WHERE id = $1 AND soft_delete = false
        `;
        const pool = await getPool();
        const parentResult = await pool.query(parentQuery, [parentFolderId]);

        if (parentResult.rows.length === 0) {
          throw new Error('Parent folder not found');
        }

        if (parentResult.rows[0].business_id !== businessId) {
          throw new Error('Parent folder belongs to a different business');
        }
      }

      // Create folder
      const insertQuery = `
        INSERT INTO t_client_folders (
          business_id,
          created_by_user_id,
          parent_folder_id,
          folder_name,
          folder_description,
          folder_color,
          sort_order,
          is_system_folder
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
        RETURNING *
      `;

      const values = [
        businessId,
        userId,
        parentFolderId,
        folderName.trim(),
        folderDescription,
        folderColor,
        sortOrder
      ];

      const pool = await getPool();
      const result = await pool.query(insertQuery, values);
      const folder = result.rows[0];

      console.log(`📁 Folder created: ${folderName} for business ${businessId}`);

      return {
        id: folder.id,
        businessId: folder.business_id,
        parentFolderId: folder.parent_folder_id,
        folderName: folder.folder_name,
        folderDescription: folder.folder_description,
        folderColor: folder.folder_color,
        sortOrder: folder.sort_order,
        isSystemFolder: folder.is_system_folder,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        fileCount: 0
      };

    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      throw error;
    }
  }

  /**
   * Update a folder
   * @param {string} folderId - Folder UUID
   * @param {string} businessId - Business UUID
   * @param {object} updates - Fields to update
   * @returns {object} Updated folder
   */
  async updateFolder(folderId, businessId, updates) {
    try {
      // Check if folder exists and is not a system folder
      const checkQuery = `
        SELECT id, is_system_folder, business_id
        FROM t_client_folders
        WHERE id = $1 AND soft_delete = false
      `;

      const pool = await getPool();
      const checkResult = await pool.query(checkQuery, [folderId]);

      if (checkResult.rows.length === 0) {
        throw new Error('Folder not found');
      }

      const folder = checkResult.rows[0];

      if (folder.business_id !== businessId) {
        throw new Error('Folder belongs to a different business');
      }

      if (folder.is_system_folder) {
        throw new Error('Cannot modify system folders');
      }

      // Build update query
      const allowedFields = ['folder_name', 'folder_description', 'folder_color', 'sort_order', 'parent_folder_id'];
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // Convert camelCase to snake_case
        if (allowedFields.includes(dbKey)) {
          updateFields.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Validate folder name if being updated
      if (updates.folderName && updates.folderName.trim().length === 0) {
        throw new Error('Folder name cannot be empty');
      }

      // Check for circular reference if parent is being updated
      if (updates.parentFolderId && updates.parentFolderId !== null) {
        if (updates.parentFolderId === folderId) {
          throw new Error('Folder cannot be its own parent');
        }
        // Additional check: ensure parent belongs to same business
        const parentCheck = await pool.query(
          'SELECT business_id FROM t_client_folders WHERE id = $1 AND soft_delete = false',
          [updates.parentFolderId]
        );
        if (parentCheck.rows.length === 0) {
          throw new Error('Parent folder not found');
        }
        if (parentCheck.rows[0].business_id !== businessId) {
          throw new Error('Parent folder belongs to a different business');
        }
      }

      values.push(folderId);

      const updateQuery = `
        UPDATE t_client_folders
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await pool.query(updateQuery, values);
      const updatedFolder = result.rows[0];

      console.log(`📁 Folder updated: ${folderId}`);

      return {
        id: updatedFolder.id,
        businessId: updatedFolder.business_id,
        parentFolderId: updatedFolder.parent_folder_id,
        folderName: updatedFolder.folder_name,
        folderDescription: updatedFolder.folder_description,
        folderColor: updatedFolder.folder_color,
        sortOrder: updatedFolder.sort_order,
        isSystemFolder: updatedFolder.is_system_folder,
        createdAt: updatedFolder.created_at,
        updatedAt: updatedFolder.updated_at
      };

    } catch (error) {
      console.error('❌ Failed to update folder:', error);
      throw error;
    }
  }

  /**
   * Delete a folder (soft delete)
   * @param {string} folderId - Folder UUID
   * @param {string} businessId - Business UUID
   * @param {string} userId - User UUID
   * @returns {boolean} Success status
   */
  async deleteFolder(folderId, businessId, userId) {
    try {
      // Check if folder exists and is not a system folder
      const checkQuery = `
        SELECT id, is_system_folder, business_id,
               (SELECT COUNT(*) FROM t_client_files WHERE folder_id = $1 AND soft_delete = false) as file_count
        FROM t_client_folders
        WHERE id = $1 AND soft_delete = false
      `;

      const pool = await getPool();
      const checkResult = await pool.query(checkQuery, [folderId]);

      if (checkResult.rows.length === 0) {
        throw new Error('Folder not found');
      }

      const folder = checkResult.rows[0];

      if (folder.business_id !== businessId) {
        throw new Error('Folder belongs to a different business');
      }

      if (folder.is_system_folder) {
        throw new Error('Cannot delete system folders');
      }

      if (parseInt(folder.file_count) > 0) {
        throw new Error('Cannot delete folder containing files. Please move or delete files first.');
      }

      // Check for subfolders
      const subfolderQuery = `
        SELECT COUNT(*) as count
        FROM t_client_folders
        WHERE parent_folder_id = $1 AND soft_delete = false
      `;
      const subfolderResult = await pool.query(subfolderQuery, [folderId]);

      if (parseInt(subfolderResult.rows[0].count) > 0) {
        throw new Error('Cannot delete folder containing subfolders. Please delete subfolders first.');
      }

      // Soft delete the folder
      const deleteQuery = `
        UPDATE t_client_folders
        SET soft_delete = true, deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = $2
        WHERE id = $1
      `;

      await pool.query(deleteQuery, [folderId, userId]);

      console.log(`🗑️ Folder soft deleted: ${folderId}`);

      return true;

    } catch (error) {
      console.error('❌ Failed to delete folder:', error);
      throw error;
    }
  }

  /**
   * Move files to a folder
   * @param {array} fileIds - Array of file UUIDs
   * @param {string} folderId - Target folder UUID (null for root)
   * @param {string} businessId - Business UUID
   * @returns {number} Number of files moved
   */
  async moveFilesToFolder(fileIds, folderId, businessId) {
    try {
      if (!fileIds || fileIds.length === 0) {
        return 0;
      }

      // Verify folder belongs to business if folderId is provided
      if (folderId) {
        const folderQuery = `
          SELECT business_id FROM t_client_folders
          WHERE id = $1 AND soft_delete = false
        `;
        const pool = await getPool();
        const folderResult = await pool.query(folderQuery, [folderId]);

        if (folderResult.rows.length === 0) {
          throw new Error('Target folder not found');
        }

        if (folderResult.rows[0].business_id !== businessId) {
          throw new Error('Target folder belongs to a different business');
        }
      }

      // Move files
      const updateQuery = `
        UPDATE t_client_files
        SET folder_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2) AND business_id = $3 AND soft_delete = false
      `;

      const pool = await getPool();
      const result = await pool.query(updateQuery, [folderId, fileIds, businessId]);

      console.log(`📂 Moved ${result.rowCount} files to folder ${folderId || 'root'}`);

      return result.rowCount;

    } catch (error) {
      console.error('❌ Failed to move files:', error);
      throw error;
    }
  }
}

// Create singleton instance
const clientFolderService = new ClientFolderService();

export default clientFolderService;
