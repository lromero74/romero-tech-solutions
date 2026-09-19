import express from 'express';
import { logger } from '../../utils/logger.js';
import { query } from '../../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../../middleware/agentAuthMiddleware.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Agent Hardware Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/hardware
 *
 * Receives and stores hardware inventory from agent
 */
router.post('/:agent_id/inventory/hardware', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { hardware } = req.body;

    if (!hardware) {
      return res.status(400).json({
        success: false,
        message: 'Missing hardware inventory data',
        code: 'MISSING_HARDWARE'
      });
    }

    // Upsert hardware inventory (one record per agent)
    await query(
      `INSERT INTO asset_hardware_inventory (
        id,
        agent_device_id,
        cpu_model,
        cpu_cores,
        cpu_threads,
        cpu_speed_mhz,
        cpu_architecture,
        total_memory_gb,
        memory_slots_used,
        memory_slots_total,
        memory_type,
        memory_speed_mhz,
        total_storage_gb,
        storage_type,
        motherboard_manufacturer,
        motherboard_model,
        bios_version,
        bios_date,
        chassis_type,
        serial_number,
        asset_tag,
        manufacturer,
        model,
        display_count,
        primary_display_resolution,
        network_interface_count,
        mac_addresses,
        usb_devices,
        has_battery,
        battery_health_percent,
        battery_cycle_count,
        raw_inventory_data,
        last_updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW()
      )
      ON CONFLICT (agent_device_id)
      DO UPDATE SET
        cpu_model = EXCLUDED.cpu_model,
        cpu_cores = EXCLUDED.cpu_cores,
        cpu_threads = EXCLUDED.cpu_threads,
        cpu_speed_mhz = EXCLUDED.cpu_speed_mhz,
        cpu_architecture = EXCLUDED.cpu_architecture,
        total_memory_gb = EXCLUDED.total_memory_gb,
        memory_slots_used = EXCLUDED.memory_slots_used,
        memory_slots_total = EXCLUDED.memory_slots_total,
        memory_type = EXCLUDED.memory_type,
        memory_speed_mhz = EXCLUDED.memory_speed_mhz,
        total_storage_gb = EXCLUDED.total_storage_gb,
        storage_type = EXCLUDED.storage_type,
        motherboard_manufacturer = EXCLUDED.motherboard_manufacturer,
        motherboard_model = EXCLUDED.motherboard_model,
        bios_version = EXCLUDED.bios_version,
        bios_date = EXCLUDED.bios_date,
        chassis_type = EXCLUDED.chassis_type,
        serial_number = EXCLUDED.serial_number,
        asset_tag = EXCLUDED.asset_tag,
        manufacturer = EXCLUDED.manufacturer,
        model = EXCLUDED.model,
        display_count = EXCLUDED.display_count,
        primary_display_resolution = EXCLUDED.primary_display_resolution,
        network_interface_count = EXCLUDED.network_interface_count,
        mac_addresses = EXCLUDED.mac_addresses,
        usb_devices = EXCLUDED.usb_devices,
        has_battery = EXCLUDED.has_battery,
        battery_health_percent = EXCLUDED.battery_health_percent,
        battery_cycle_count = EXCLUDED.battery_cycle_count,
        raw_inventory_data = EXCLUDED.raw_inventory_data,
        last_updated_at = NOW()`,
      [
        agent_id,
        hardware.cpu_model || null,
        hardware.cpu_cores || null,
        hardware.cpu_threads || null,
        hardware.cpu_speed_mhz || null,
        hardware.cpu_architecture || null,
        hardware.total_memory_gb || null,
        hardware.memory_slots_used || null,
        hardware.memory_slots_total || null,
        hardware.memory_type || null,
        hardware.memory_speed_mhz || null,
        hardware.total_storage_gb || null,
        hardware.storage_type || null,
        hardware.motherboard_manufacturer || null,
        hardware.motherboard_model || null,
        hardware.bios_version || null,
        hardware.bios_date || null,
        hardware.chassis_type || null,
        hardware.serial_number || null,
        hardware.asset_tag || null,
        hardware.manufacturer || null,
        hardware.model || null,
        hardware.display_count || 0,
        hardware.primary_display_resolution || null,
        hardware.network_interface_count || 0,
        hardware.mac_addresses ? JSON.stringify(hardware.mac_addresses) : null,
        hardware.usb_devices ? JSON.stringify(hardware.usb_devices) : null,
        hardware.has_battery || false,
        hardware.battery_health_percent || null,
        hardware.battery_cycle_count || null,
        hardware.raw_inventory_data ? JSON.stringify(hardware.raw_inventory_data) : null
      ]
    );

    logger.debug(`💾 Hardware inventory received for agent ${agent_id}`);

    res.json({
      success: true,
      message: 'Hardware inventory received'
    });

  } catch (error) {
    logger.error('Agent hardware inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Hardware inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Software Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/software
 *
 * Receives and stores software inventory from agent
 */
router.post('/:agent_id/inventory/software', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { software } = req.body;

    if (!software || !Array.isArray(software)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid software inventory data (must be array)',
        code: 'MISSING_SOFTWARE'
      });
    }

    // Delete existing software inventory for this agent (full replacement strategy)
    await query(
      'DELETE FROM asset_software_inventory WHERE agent_device_id = $1',
      [agent_id]
    );

    // Deduplicate software array by creating a map keyed by name+version
    const uniqueSoftware = new Map();
    for (const sw of software) {
      const key = `${sw.software_name || 'Unknown'}|${sw.software_version || ''}`;
      if (!uniqueSoftware.has(key)) {
        uniqueSoftware.set(key, sw);
      }
    }

    // Insert all unique software packages using batch insert with ON CONFLICT
    let insertedCount = 0;
    if (uniqueSoftware.size > 0) {
      // Build batch insert query
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const sw of uniqueSoftware.values()) {
        values.push(`(
          gen_random_uuid(),
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
          $${paramIndex++}, NOW()
        )`);

        params.push(
          agent_id,
          sw.software_name || 'Unknown',
          sw.software_version || null,
          sw.software_publisher || null,
          sw.install_date || null,
          sw.install_location || null,
          sw.install_source || null,
          sw.size_mb || null,
          sw.requires_license || false,
          sw.package_manager || null,
          sw.package_name || null,
          sw.software_category || null,
          sw.is_system_software || false
        );
      }

      const result = await query(
        `INSERT INTO asset_software_inventory (
          id,
          agent_device_id,
          software_name,
          software_version,
          software_publisher,
          install_date,
          install_location,
          install_source,
          size_mb,
          requires_license,
          package_manager,
          package_name,
          software_category,
          is_system_software,
          last_seen_at
        ) VALUES ${values.join(', ')}
        ON CONFLICT (agent_device_id, software_name, software_version)
        DO UPDATE SET
          software_publisher = EXCLUDED.software_publisher,
          install_date = EXCLUDED.install_date,
          install_location = EXCLUDED.install_location,
          install_source = EXCLUDED.install_source,
          size_mb = EXCLUDED.size_mb,
          requires_license = EXCLUDED.requires_license,
          package_manager = EXCLUDED.package_manager,
          package_name = EXCLUDED.package_name,
          software_category = EXCLUDED.software_category,
          is_system_software = EXCLUDED.is_system_software,
          last_seen_at = NOW()`,
        params
      );

      insertedCount = uniqueSoftware.size;
    }

    logger.debug(`💿 Software inventory received for agent ${agent_id}: ${insertedCount} packages (${software.length - insertedCount} duplicates removed)`);

    res.json({
      success: true,
      message: 'Software inventory received',
      data: {
        software_count: insertedCount
      }
    });

  } catch (error) {
    logger.error('Agent software inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Software inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Storage Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/storage
 *
 * Receives and stores detailed storage device inventory from agent
 */
router.post('/:agent_id/inventory/storage', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { storage } = req.body;

    if (!storage || !Array.isArray(storage)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid storage inventory data (must be array)',
        code: 'MISSING_STORAGE'
      });
    }

    // Upsert storage devices (by agent_device_id + device_name unique constraint)
    let upsertedCount = 0;
    for (const disk of storage) {
      await query(
        `INSERT INTO asset_storage_devices (
          id,
          agent_device_id,
          device_name,
          device_type,
          interface_type,
          capacity_gb,
          model,
          serial_number,
          firmware_version,
          smart_status,
          smart_temperature_c,
          smart_power_on_hours,
          smart_reallocated_sectors,
          smart_pending_sectors,
          partition_count,
          partitions,
          health_status,
          last_scanned_at
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        )
        ON CONFLICT (agent_device_id, device_name)
        DO UPDATE SET
          device_type = EXCLUDED.device_type,
          interface_type = EXCLUDED.interface_type,
          capacity_gb = EXCLUDED.capacity_gb,
          model = EXCLUDED.model,
          serial_number = EXCLUDED.serial_number,
          firmware_version = EXCLUDED.firmware_version,
          smart_status = EXCLUDED.smart_status,
          smart_temperature_c = EXCLUDED.smart_temperature_c,
          smart_power_on_hours = EXCLUDED.smart_power_on_hours,
          smart_reallocated_sectors = EXCLUDED.smart_reallocated_sectors,
          smart_pending_sectors = EXCLUDED.smart_pending_sectors,
          partition_count = EXCLUDED.partition_count,
          partitions = EXCLUDED.partitions,
          health_status = EXCLUDED.health_status,
          last_scanned_at = NOW()`,
        [
          agent_id,
          disk.device_name || 'Unknown',
          disk.device_type || null,
          disk.interface_type || null,
          disk.capacity_gb || null,
          disk.model || null,
          disk.serial_number || null,
          disk.firmware_version || null,
          disk.smart_status || null,
          disk.smart_temperature_c || null,
          disk.smart_power_on_hours || null,
          disk.smart_reallocated_sectors || null,
          disk.smart_pending_sectors || null,
          disk.partition_count || 0,
          disk.partitions ? JSON.stringify(disk.partitions) : null,
          disk.health_status || 'Healthy'
        ]
      );
      upsertedCount++;
    }

    logger.debug(`💾 Storage inventory received for agent ${agent_id}: ${upsertedCount} devices`);

    res.json({
      success: true,
      message: 'Storage inventory received',
      data: {
        storage_count: upsertedCount
      }
    });

  } catch (error) {
    logger.error('Agent storage inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Storage inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Hardware Inventory
 * GET /api/agents/:agent_id/inventory/hardware
 *
 * Returns hardware inventory for a specific agent
 */
router.get('/:agent_id/inventory/hardware', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Fetch hardware inventory
    const hardwareResult = await query(
      `SELECT * FROM asset_hardware_inventory WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        hardware: hardwareResult.rows[0] || null,
        has_data: hardwareResult.rows.length > 0
      }
    });

  } catch (error) {
    logger.error('Get hardware inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hardware inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Software Inventory
 * GET /api/agents/:agent_id/inventory/software
 *
 * Returns software inventory for a specific agent
 */
router.get('/:agent_id/inventory/software', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { package_manager, category, search } = req.query;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for software inventory
    let queryText = `
      SELECT * FROM asset_software_inventory
      WHERE agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by package manager if provided
    if (package_manager) {
      queryText += ` AND package_manager = $${paramIndex}`;
      params.push(package_manager);
      paramIndex++;
    }

    // Filter by category if provided
    if (category) {
      queryText += ` AND software_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search by name if provided
    if (search) {
      queryText += ` AND software_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ' ORDER BY software_name ASC';

    const softwareResult = await query(queryText, params);

    // Get summary statistics
    const statsResult = await query(
      `SELECT
        COUNT(*) as total_packages,
        COUNT(DISTINCT package_manager) as package_managers_count,
        COUNT(DISTINCT software_category) as categories_count,
        SUM(size_mb) as total_size_mb
       FROM asset_software_inventory
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        software: softwareResult.rows,
        count: softwareResult.rows.length,
        stats: statsResult.rows[0] || null
      }
    });

  } catch (error) {
    logger.error('Get software inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch software inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Storage Inventory
 * GET /api/agents/:agent_id/inventory/storage
 *
 * Returns storage device inventory for a specific agent
 */
router.get('/:agent_id/inventory/storage', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Fetch storage device inventory
    const storageResult = await query(
      `SELECT * FROM asset_storage_devices
       WHERE agent_device_id = $1
       ORDER BY device_name ASC`,
      [agent_id]
    );

    // Get summary statistics
    const statsResult = await query(
      `SELECT
        COUNT(*) as total_devices,
        SUM(capacity_gb) as total_capacity_gb,
        COUNT(CASE WHEN health_status != 'Healthy' THEN 1 END) as devices_with_issues
       FROM asset_storage_devices
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        storage: storageResult.rows,
        count: storageResult.rows.length,
        stats: statsResult.rows[0] || null
      }
    });

  } catch (error) {
    logger.error('Get storage inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storage inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
