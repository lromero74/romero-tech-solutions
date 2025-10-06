import { getPool } from '../config/database.js';

/**
 * Client File Browser Service
 * Admin service for browsing client file storage with folders and metadata
 */
class ClientFileBrowserService {

  /**
   * Get all businesses with file storage statistics
   * @returns {array} List of businesses with file counts and storage info
   */
  async getAllBusinesses() {
    try {
      const query = `
        SELECT
          business_id as id,
          business_name as name,
          COALESCE(total_files, 0)::integer as "totalFiles",
          COALESCE(total_storage_used, 0)::bigint as "totalStorageBytes"
        FROM v_file_storage_by_business
        ORDER BY business_name ASC
      `;

      const pool = await getPool();
      const result = await pool.query(query);

      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching businesses:', error);
      throw error;
    }
  }

  /**
   * Get folder tree for a business
   * @param {string} businessId - Business UUID
   * @returns {array} Folder tree structure
   */
  async getFolderTree(businessId) {
    try {
      const query = `
        WITH RECURSIVE folder_tree AS (
          -- Root folders (no parent)
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
            0 as depth,
            ARRAY[id] as path
          FROM t_client_folders
          WHERE business_id = $1
            AND parent_folder_id IS NULL
            AND soft_delete = false

          UNION ALL

          -- Child folders
          SELECT
            f.id,
            f.business_id,
            f.parent_folder_id,
            f.folder_name,
            f.folder_description,
            f.folder_color,
            f.sort_order,
            f.is_system_folder,
            f.created_at,
            ft.depth + 1,
            ft.path || f.id
          FROM t_client_folders f
          INNER JOIN folder_tree ft ON f.parent_folder_id = ft.id
          WHERE f.soft_delete = false
        )
        SELECT
          id,
          parent_folder_id,
          folder_name,
          folder_description,
          folder_color,
          sort_order,
          is_system_folder,
          created_at,
          depth,
          (SELECT COUNT(*) FROM t_client_files WHERE folder_id = folder_tree.id AND soft_delete = false) as file_count
        FROM folder_tree
        ORDER BY depth, sort_order, folder_name
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);

      return result.rows.map(folder => ({
        id: folder.id,
        parentFolderId: folder.parent_folder_id,
        folderName: folder.folder_name,
        folderDescription: folder.folder_description,
        folderColor: folder.folder_color,
        sortOrder: folder.sort_order,
        isSystemFolder: folder.is_system_folder,
        createdAt: folder.created_at,
        depth: folder.depth,
        fileCount: parseInt(folder.file_count)
      }));

    } catch (error) {
      console.error('❌ Failed to get folder tree:', error);
      throw error;
    }
  }

  /**
   * Get files in a folder with full metadata
   * @param {string} businessId - Business UUID
   * @param {string} folderId - Folder UUID (null for root/unorganized files)
   * @param {object} options - Pagination and filtering options
   * @returns {object} Files and pagination info
   */
  async getFilesInFolder(businessId, folderId = null, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        search = '',
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      const whereConditions = ['f.business_id = $1', 'f.soft_delete = false'];
      const queryParams = [businessId];
      let paramIndex = 2;

      // Folder filter
      if (folderId === null) {
        whereConditions.push('f.folder_id IS NULL');
      } else {
        whereConditions.push(`f.folder_id = $${paramIndex}`);
        queryParams.push(folderId);
        paramIndex++;
      }

      // Search filter
      if (search) {
        whereConditions.push(`f.original_filename ILIKE $${paramIndex}`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Validate sort column
      const validSortColumns = ['created_at', 'original_filename', 'file_size_bytes', 'mime_type'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM t_client_files f
        WHERE ${whereClause}
      `;

      const countResult = await (await getPool()).query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get files with metadata
      const filesQuery = `
        SELECT
          f.id,
          f.original_filename,
          f.stored_filename,
          f.file_size_bytes,
          f.mime_type,
          f.file_description,
          f.folder_id,
          f.service_request_id,
          f.virus_scan_status,
          f.virus_scan_result,
          f.virus_scan_date,
          f.is_public_to_business,
          f.created_at,
          f.updated_at,
          u.id as uploader_id,
          u.first_name as uploader_first_name,
          u.last_name as uploader_last_name,
          u.email as uploader_email,
          folder.folder_name,
          folder.folder_color,
          sr.request_title as service_request_title,
          sr.urgency_level as service_request_urgency
        FROM t_client_files f
        LEFT JOIN users u ON f.uploaded_by_user_id = u.id
        LEFT JOIN t_client_folders folder ON f.folder_id = folder.id
        LEFT JOIN t_service_requests sr ON f.service_request_id = sr.id
        WHERE ${whereClause}
        ORDER BY f.${safeSortBy} ${safeSortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const pool = await getPool();
      const filesResult = await pool.query(filesQuery, queryParams);

      return {
        files: filesResult.rows.map(file => ({
          id: file.id,
          originalFilename: file.original_filename,
          storedFilename: file.stored_filename,
          fileSizeBytes: parseInt(file.file_size_bytes),
          fileSizeFormatted: this.formatBytes(file.file_size_bytes),
          mimeType: file.mime_type,
          fileDescription: file.file_description,
          folderId: file.folder_id,
          folderName: file.folder_name,
          folderColor: file.folder_color,
          serviceRequestId: file.service_request_id,
          serviceRequestTitle: file.service_request_title,
          serviceRequestUrgency: file.service_request_urgency,
          virusScanStatus: file.virus_scan_status,
          virusScanResult: file.virus_scan_result,
          virusScanDate: file.virus_scan_date,
          isPublicToBusiness: file.is_public_to_business,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
          uploader: file.uploader_id ? {
            id: file.uploader_id,
            firstName: file.uploader_first_name,
            lastName: file.uploader_last_name,
            email: file.uploader_email,
            fullName: `${file.uploader_first_name} ${file.uploader_last_name}`.trim()
          } : null
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      console.error('❌ Failed to get files in folder:', error);
      throw error;
    }
  }

  /**
   * Get all files for a business (across all folders)
   * @param {string} businessId - Business UUID
   * @param {object} options - Pagination and filtering options
   * @returns {object} Files and pagination info
   */
  async getAllFiles(businessId, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        search = '',
        sortBy = 'created_at',
        sortOrder = 'DESC',
        virusScanStatus = null,
        folderId = null
      } = options;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      const whereConditions = ['f.business_id = $1', 'f.soft_delete = false'];
      const queryParams = [businessId];
      let paramIndex = 2;

      // Search filter
      if (search) {
        whereConditions.push(`f.original_filename ILIKE $${paramIndex}`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Virus scan status filter
      if (virusScanStatus) {
        whereConditions.push(`f.virus_scan_status = $${paramIndex}`);
        queryParams.push(virusScanStatus);
        paramIndex++;
      }

      // Folder filter
      if (folderId) {
        whereConditions.push(`f.folder_id = $${paramIndex}`);
        queryParams.push(folderId);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Validate sort column
      const validSortColumns = ['created_at', 'original_filename', 'file_size_bytes', 'mime_type'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM t_client_files f
        WHERE ${whereClause}
      `;

      const countResult = await (await getPool()).query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get files with metadata
      const filesQuery = `
        SELECT
          f.id,
          f.original_filename,
          f.stored_filename,
          f.file_size_bytes,
          f.mime_type,
          f.file_description,
          f.folder_id,
          f.service_request_id,
          f.virus_scan_status,
          f.virus_scan_result,
          f.virus_scan_date,
          f.is_public_to_business,
          f.created_at,
          f.updated_at,
          u.id as uploader_id,
          u.first_name as uploader_first_name,
          u.last_name as uploader_last_name,
          u.email as uploader_email,
          folder.folder_name,
          folder.folder_color,
          sr.request_title as service_request_title,
          sr.urgency_level as service_request_urgency
        FROM t_client_files f
        LEFT JOIN users u ON f.uploaded_by_user_id = u.id
        LEFT JOIN t_client_folders folder ON f.folder_id = folder.id
        LEFT JOIN t_service_requests sr ON f.service_request_id = sr.id
        WHERE ${whereClause}
        ORDER BY f.${safeSortBy} ${safeSortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const pool = await getPool();
      const filesResult = await pool.query(filesQuery, queryParams);

      return {
        files: filesResult.rows.map(file => ({
          id: file.id,
          originalFilename: file.original_filename,
          storedFilename: file.stored_filename,
          fileSizeBytes: parseInt(file.file_size_bytes),
          fileSizeFormatted: this.formatBytes(file.file_size_bytes),
          mimeType: file.mime_type,
          fileDescription: file.file_description,
          folderId: file.folder_id,
          folderName: file.folder_name,
          folderColor: file.folder_color,
          serviceRequestId: file.service_request_id,
          serviceRequestTitle: file.service_request_title,
          serviceRequestUrgency: file.service_request_urgency,
          virusScanStatus: file.virus_scan_status,
          virusScanResult: file.virus_scan_result,
          virusScanDate: file.virus_scan_date,
          isPublicToBusiness: file.is_public_to_business,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
          uploader: file.uploader_id ? {
            id: file.uploader_id,
            firstName: file.uploader_first_name,
            lastName: file.uploader_last_name,
            email: file.uploader_email,
            fullName: `${file.uploader_first_name} ${file.uploader_last_name}`.trim()
          } : null
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      console.error('❌ Failed to get all files:', error);
      throw error;
    }
  }

  /**
   * Get storage overview for a business
   * @param {string} businessId - Business UUID
   * @returns {object} Storage statistics
   */
  async getStorageOverview(businessId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total_files,
          COALESCE(SUM(file_size_bytes), 0) as total_bytes,
          COUNT(DISTINCT folder_id) as folder_count,
          COUNT(CASE WHEN virus_scan_status = 'clean' THEN 1 END) as clean_files,
          COUNT(CASE WHEN virus_scan_status = 'infected' THEN 1 END) as infected_files,
          COUNT(CASE WHEN virus_scan_status = 'pending' THEN 1 END) as pending_scan,
          COUNT(CASE WHEN service_request_id IS NOT NULL THEN 1 END) as service_request_files,
          COUNT(CASE WHEN folder_id IS NULL THEN 1 END) as unorganized_files
        FROM t_client_files
        WHERE business_id = $1 AND soft_delete = false
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);
      const stats = result.rows[0];

      return {
        totalFiles: parseInt(stats.total_files),
        totalBytes: parseInt(stats.total_bytes),
        totalFormatted: this.formatBytes(stats.total_bytes),
        folderCount: parseInt(stats.folder_count),
        cleanFiles: parseInt(stats.clean_files),
        infectedFiles: parseInt(stats.infected_files),
        pendingScan: parseInt(stats.pending_scan),
        serviceRequestFiles: parseInt(stats.service_request_files),
        unorganizedFiles: parseInt(stats.unorganized_files)
      };

    } catch (error) {
      console.error('❌ Failed to get storage overview:', error);
      throw error;
    }
  }

  /**
   * Format bytes into human-readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 0) return 'Unlimited';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Create singleton instance
const clientFileBrowserService = new ClientFileBrowserService();

export default clientFileBrowserService;
