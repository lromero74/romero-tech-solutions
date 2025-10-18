-- Migration: Asset Management System
-- Purpose: Comprehensive hardware and software inventory tracking
-- Phase: 1
-- Date: 2025-10-17

-- ============================================================================
-- ASSET HARDWARE INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_hardware_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  -- CPU Information
  cpu_model VARCHAR(255),
  cpu_cores INTEGER,
  cpu_threads INTEGER,
  cpu_speed_mhz INTEGER,
  cpu_architecture VARCHAR(50), -- x86_64, arm64, etc.

  -- Memory Information
  total_memory_gb DECIMAL(10, 2),
  memory_slots_used INTEGER,
  memory_slots_total INTEGER,
  memory_type VARCHAR(50), -- DDR4, DDR5, etc.
  memory_speed_mhz INTEGER,

  -- Storage Information (summary - detailed in separate table)
  total_storage_gb DECIMAL(10, 2),
  storage_type VARCHAR(50), -- SSD, HDD, NVMe, Mixed

  -- System Information
  motherboard_manufacturer VARCHAR(255),
  motherboard_model VARCHAR(255),
  bios_version VARCHAR(255),
  bios_date DATE,

  -- Form Factor & Chassis
  chassis_type VARCHAR(50), -- Desktop, Laptop, Server, etc.
  serial_number VARCHAR(255),
  asset_tag VARCHAR(255),
  manufacturer VARCHAR(255),
  model VARCHAR(255),

  -- Display Information
  display_count INTEGER DEFAULT 0,
  primary_display_resolution VARCHAR(50),

  -- Network Interfaces
  network_interface_count INTEGER DEFAULT 0,
  mac_addresses JSONB, -- Array of MAC addresses

  -- USB & Peripherals
  usb_devices JSONB, -- Array of connected USB devices

  -- Power & Battery (for laptops)
  has_battery BOOLEAN DEFAULT false,
  battery_health_percent INTEGER,
  battery_cycle_count INTEGER,

  -- Timestamps
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  raw_inventory_data JSONB, -- Full hardware scan output

  CONSTRAINT unique_agent_hardware UNIQUE (agent_device_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_hardware_agent ON asset_hardware_inventory(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_asset_hardware_manufacturer ON asset_hardware_inventory(manufacturer);
CREATE INDEX IF NOT EXISTS idx_asset_hardware_serial ON asset_hardware_inventory(serial_number);

-- ============================================================================
-- ASSET STORAGE DEVICES (Detailed storage inventory)
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_storage_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  device_name VARCHAR(255) NOT NULL, -- /dev/sda, C:, etc.
  device_type VARCHAR(50), -- SSD, HDD, NVMe, etc.
  interface_type VARCHAR(50), -- SATA, NVMe, USB, etc.

  capacity_gb DECIMAL(10, 2),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  firmware_version VARCHAR(100),

  -- SMART Data
  smart_status VARCHAR(50), -- PASSED, FAILED, WARNING
  smart_temperature_c INTEGER,
  smart_power_on_hours BIGINT,
  smart_reallocated_sectors INTEGER,
  smart_pending_sectors INTEGER,

  -- Partitions
  partition_count INTEGER,
  partitions JSONB, -- Array of partition details

  -- Health & Warranty
  health_status VARCHAR(50), -- Healthy, Degraded, Failed
  warranty_expires_at DATE,

  -- Timestamps
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_agent_storage_device UNIQUE (agent_device_id, device_name)
);

CREATE INDEX IF NOT EXISTS idx_asset_storage_agent ON asset_storage_devices(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_asset_storage_health ON asset_storage_devices(health_status);
CREATE INDEX IF NOT EXISTS idx_asset_storage_warranty ON asset_storage_devices(warranty_expires_at);

-- ============================================================================
-- ASSET SOFTWARE INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_software_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  software_name VARCHAR(255) NOT NULL,
  software_version VARCHAR(100),
  software_publisher VARCHAR(255),

  install_date DATE,
  install_location VARCHAR(500),
  install_source VARCHAR(100), -- Package manager, manual, MSI, etc.

  -- Size & Dependencies
  size_mb DECIMAL(10, 2),
  requires_license BOOLEAN DEFAULT false,

  -- Package Manager Info (if applicable)
  package_manager VARCHAR(50), -- apt, yum, brew, choco, etc.
  package_name VARCHAR(255),

  -- Categorization
  software_category VARCHAR(100), -- Productivity, Security, Development, etc.
  is_system_software BOOLEAN DEFAULT false,

  -- Timestamps
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_agent_software UNIQUE (agent_device_id, software_name, software_version)
);

CREATE INDEX IF NOT EXISTS idx_asset_software_agent ON asset_software_inventory(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_asset_software_name ON asset_software_inventory(software_name);
CREATE INDEX IF NOT EXISTS idx_asset_software_publisher ON asset_software_inventory(software_publisher);
CREATE INDEX IF NOT EXISTS idx_asset_software_category ON asset_software_inventory(software_category);

-- ============================================================================
-- ASSET LICENSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  software_name VARCHAR(255) NOT NULL,
  license_key VARCHAR(500),
  license_type VARCHAR(50), -- Per-device, Per-user, Site, Subscription

  -- Capacity
  seats_total INTEGER,
  seats_used INTEGER DEFAULT 0,

  -- Validity
  purchase_date DATE,
  activation_date DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT true,

  -- Vendor Information
  vendor VARCHAR(255),
  purchase_order VARCHAR(100),
  cost_usd DECIMAL(10, 2),

  -- Assignment
  assigned_to_agent_id UUID REFERENCES agent_devices(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Compliance
  compliance_status VARCHAR(50) DEFAULT 'compliant', -- compliant, over_deployed, expired

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_licenses_business ON asset_licenses(business_id);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_software ON asset_licenses(software_name);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_expiration ON asset_licenses(expiration_date);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_compliance ON asset_licenses(compliance_status);

-- ============================================================================
-- ASSET WARRANTIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  -- Vendor Information
  manufacturer VARCHAR(255) NOT NULL,
  model VARCHAR(255),
  serial_number VARCHAR(255) NOT NULL,

  -- Warranty Details
  warranty_type VARCHAR(100), -- Standard, Extended, On-Site, etc.
  warranty_start_date DATE,
  warranty_end_date DATE,
  warranty_status VARCHAR(50) DEFAULT 'active', -- active, expired, unknown

  -- Coverage
  coverage_description TEXT,
  service_level VARCHAR(100), -- Next Business Day, 4-hour, etc.

  -- Vendor Info
  vendor_api_source VARCHAR(50), -- dell, hp, lenovo, manual
  last_checked_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_warranty UNIQUE (agent_device_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_asset_warranties_agent ON asset_warranties(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_asset_warranties_status ON asset_warranties(warranty_status);
CREATE INDEX IF NOT EXISTS idx_asset_warranties_expiration ON asset_warranties(warranty_end_date);
CREATE INDEX IF NOT EXISTS idx_asset_warranties_manufacturer ON asset_warranties(manufacturer);

-- ============================================================================
-- ASSET NETWORK DISCOVERED DEVICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_network_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  discovered_by_agent_id UUID REFERENCES agent_devices(id) ON DELETE SET NULL,

  -- Device Information
  device_name VARCHAR(255),
  device_type VARCHAR(100), -- Router, Switch, Printer, Scanner, Camera, etc.
  ip_address INET NOT NULL,
  mac_address VARCHAR(17),

  -- Network Details
  hostname VARCHAR(255),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  firmware_version VARCHAR(100),

  -- Status
  is_online BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- SNMP Data (if available)
  snmp_enabled BOOLEAN DEFAULT false,
  snmp_data JSONB,

  -- Management
  is_managed BOOLEAN DEFAULT false, -- Whether this device is actively monitored
  monitoring_enabled BOOLEAN DEFAULT false,

  -- Metadata
  notes TEXT,
  first_discovered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_network_devices_business ON asset_network_devices(business_id);
CREATE INDEX IF NOT EXISTS idx_asset_network_devices_ip ON asset_network_devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_asset_network_devices_type ON asset_network_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_asset_network_devices_online ON asset_network_devices(is_online);

-- ============================================================================
-- ASSET CHANGE HISTORY (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  change_type VARCHAR(50) NOT NULL, -- hardware_added, hardware_removed, software_installed, software_uninstalled
  change_category VARCHAR(50), -- hardware, software, network

  change_description TEXT NOT NULL,

  -- Before/After State
  previous_value JSONB,
  new_value JSONB,

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  change_source VARCHAR(50) DEFAULT 'automated' -- automated, manual, agent_reported
);

CREATE INDEX IF NOT EXISTS idx_asset_changes_agent ON asset_change_history(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_asset_changes_type ON asset_change_history(change_type);
CREATE INDEX IF NOT EXISTS idx_asset_changes_detected ON asset_change_history(detected_at);

-- ============================================================================
-- ASSET INVENTORY SCAN SCHEDULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_inventory_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  agent_device_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,

  scan_type VARCHAR(50) NOT NULL, -- full, hardware_only, software_only, network_only

  -- Schedule
  schedule_enabled BOOLEAN DEFAULT true,
  scan_interval_hours INTEGER DEFAULT 24,
  next_scan_at TIMESTAMPTZ,
  last_scan_at TIMESTAMPTZ,

  -- Scan Options
  scan_options JSONB, -- Detailed scan configuration

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Either business-wide or per-agent
  CONSTRAINT check_schedule_scope CHECK (
    (business_id IS NOT NULL AND agent_device_id IS NULL) OR
    (business_id IS NULL AND agent_device_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_schedules_business ON asset_inventory_schedules(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_schedules_agent ON asset_inventory_schedules(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_inventory_schedules_next_scan ON asset_inventory_schedules(next_scan_at);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Allow backend to manage asset inventory
GRANT SELECT, INSERT, UPDATE, DELETE ON
  asset_hardware_inventory,
  asset_storage_devices,
  asset_software_inventory,
  asset_licenses,
  asset_warranties,
  asset_network_devices,
  asset_change_history,
  asset_inventory_schedules
TO postgres;

-- ============================================================================
-- TRIGGER: Update last_updated_at on changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_asset_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_hardware_updated_at ON asset_hardware_inventory;
CREATE TRIGGER asset_hardware_updated_at
BEFORE UPDATE ON asset_hardware_inventory
FOR EACH ROW EXECUTE FUNCTION update_asset_updated_at();

DROP TRIGGER IF EXISTS asset_storage_updated_at ON asset_storage_devices;
CREATE TRIGGER asset_storage_updated_at
BEFORE UPDATE ON asset_storage_devices
FOR EACH ROW EXECUTE FUNCTION update_asset_updated_at();

DROP TRIGGER IF EXISTS asset_licenses_updated_at ON asset_licenses;
CREATE TRIGGER asset_licenses_updated_at
BEFORE UPDATE ON asset_licenses
FOR EACH ROW EXECUTE FUNCTION update_asset_updated_at();

DROP TRIGGER IF EXISTS asset_warranties_updated_at ON asset_warranties;
CREATE TRIGGER asset_warranties_updated_at
BEFORE UPDATE ON asset_warranties
FOR EACH ROW EXECUTE FUNCTION update_asset_updated_at();

DROP TRIGGER IF EXISTS asset_network_updated_at ON asset_network_devices;
CREATE TRIGGER asset_network_updated_at
BEFORE UPDATE ON asset_network_devices
FOR EACH ROW EXECUTE FUNCTION update_asset_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE asset_hardware_inventory IS 'Comprehensive hardware inventory for each managed device';
COMMENT ON TABLE asset_storage_devices IS 'Detailed storage device information including SMART data';
COMMENT ON TABLE asset_software_inventory IS 'Installed software tracking for each managed device';
COMMENT ON TABLE asset_licenses IS 'Software license management and compliance tracking';
COMMENT ON TABLE asset_warranties IS 'Hardware warranty information from vendor APIs';
COMMENT ON TABLE asset_network_devices IS 'Network-discovered devices (printers, scanners, etc.)';
COMMENT ON TABLE asset_change_history IS 'Audit trail of hardware and software changes';
COMMENT ON TABLE asset_inventory_schedules IS 'Automated inventory scan scheduling';
