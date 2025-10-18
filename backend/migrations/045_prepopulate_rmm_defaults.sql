-- Migration: Prepopulate RMM with Default Scripts, Policies, and Packages
-- Purpose: Add real, useful default data for immediate MSP use
-- Phase: 1
-- Date: 2025-10-18

-- ============================================================================
-- DEFAULT AUTOMATION SCRIPTS
-- ============================================================================

-- Get category IDs for reference
DO $$
DECLARE
  cat_maintenance UUID;
  cat_service UUID;
  cat_security UUID;
  cat_monitoring UUID;
  cat_network UUID;
  cat_software UUID;
BEGIN
  -- Fetch category IDs
  SELECT id INTO cat_maintenance FROM script_categories WHERE category_name = 'System Maintenance' LIMIT 1;
  SELECT id INTO cat_service FROM script_categories WHERE category_name = 'Service Management' LIMIT 1;
  SELECT id INTO cat_security FROM script_categories WHERE category_name = 'Security' LIMIT 1;
  SELECT id INTO cat_monitoring FROM script_categories WHERE category_name = 'Monitoring' LIMIT 1;
  SELECT id INTO cat_network FROM script_categories WHERE category_name = 'Network' LIMIT 1;
  SELECT id INTO cat_software FROM script_categories WHERE category_name = 'Software Management' LIMIT 1;

  -- ============================================================================
  -- SYSTEM MAINTENANCE SCRIPTS
  -- ============================================================================

  -- Linux: Update system packages
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Linux - System Updates',
    'Updates all system packages using the appropriate package manager (apt, yum, dnf, or zypper)',
    cat_maintenance,
    'bash',
    '#!/bin/bash
set -e

echo "Starting system update..."

# Detect package manager and run appropriate update
if command -v apt-get &> /dev/null; then
  echo "Detected: APT (Debian/Ubuntu)"
  apt-get update -y
  apt-get upgrade -y
  apt-get autoremove -y
  apt-get autoclean -y
elif command -v dnf &> /dev/null; then
  echo "Detected: DNF (Fedora/RHEL 8+)"
  dnf upgrade -y
  dnf autoremove -y
  dnf clean all
elif command -v yum &> /dev/null; then
  echo "Detected: YUM (CentOS/RHEL)"
  yum update -y
  yum autoremove -y
  yum clean all
elif command -v zypper &> /dev/null; then
  echo "Detected: Zypper (openSUSE)"
  zypper refresh
  zypper update -y
  zypper clean
else
  echo "ERROR: No supported package manager found"
  exit 1
fi

echo "System update completed successfully"',
    ARRAY['linux'],
    1800,
    true,
    true,
    true,
    ARRAY['updates', 'maintenance', 'patching'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- macOS: System Updates
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'macOS - System Updates',
    'Installs all available macOS software updates',
    cat_maintenance,
    'bash',
    '#!/bin/bash
set -e

echo "Starting macOS software update..."

# List available updates
echo "Available updates:"
softwareupdate -l

# Install all available updates
softwareupdate -i -a

echo "macOS software update completed successfully"',
    ARRAY['macos'],
    1800,
    true,
    true,
    true,
    ARRAY['updates', 'maintenance', 'patching'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- Windows: System Updates
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Windows - Install Updates',
    'Installs all available Windows updates using Windows Update',
    cat_maintenance,
    'powershell',
    '# Requires Windows Update module
if (-not (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
    Write-Host "Installing PSWindowsUpdate module..."
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force
    Install-Module PSWindowsUpdate -Force
}

Import-Module PSWindowsUpdate

Write-Host "Checking for Windows Updates..."
Get-WindowsUpdate -AcceptAll -Install -AutoReboot

Write-Host "Windows Update completed successfully"',
    ARRAY['windows'],
    3600,
    true,
    true,
    true,
    ARRAY['updates', 'maintenance', 'patching'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- Disk Cleanup (Linux)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Linux - Disk Cleanup',
    'Removes old logs, package caches, and temporary files to free disk space',
    cat_maintenance,
    'bash',
    '#!/bin/bash
set -e

echo "Starting disk cleanup..."

# Get initial disk usage
echo "=== Disk Usage Before Cleanup ==="
df -h /

# Clean package manager caches
if command -v apt-get &> /dev/null; then
  apt-get clean
  apt-get autoclean
elif command -v dnf &> /dev/null; then
  dnf clean all
elif command -v yum &> /dev/null; then
  yum clean all
fi

# Clean journald logs (keep last 7 days)
if command -v journalctl &> /dev/null; then
  journalctl --vacuum-time=7d
fi

# Remove old log files
find /var/log -type f -name "*.log.*" -mtime +30 -delete 2>/dev/null || true
find /var/log -type f -name "*.gz" -mtime +30 -delete 2>/dev/null || true

# Clean temporary files
rm -rf /tmp/* 2>/dev/null || true
rm -rf /var/tmp/* 2>/dev/null || true

# Get final disk usage
echo "=== Disk Usage After Cleanup ==="
df -h /

echo "Disk cleanup completed successfully"',
    ARRAY['linux'],
    600,
    true,
    true,
    true,
    ARRAY['cleanup', 'maintenance', 'disk'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- Disk Cleanup (Windows)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Windows - Disk Cleanup',
    'Runs Windows Disk Cleanup utility to free disk space',
    cat_maintenance,
    'powershell',
    'Write-Host "Starting Windows Disk Cleanup..."

# Get initial disk space
Write-Host "=== Disk Space Before Cleanup ==="
Get-PSDrive C | Select-Object Used,Free

# Clear Windows Update cache
Write-Host "Clearing Windows Update cache..."
Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
Remove-Item C:\Windows\SoftwareDistribution\Download\* -Recurse -Force -ErrorAction SilentlyContinue
Start-Service wuauserv

# Clear temporary files
Write-Host "Clearing temporary files..."
Remove-Item $env:TEMP\* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item C:\Windows\Temp\* -Recurse -Force -ErrorAction SilentlyContinue

# Empty Recycle Bin
Write-Host "Emptying Recycle Bin..."
Clear-RecycleBin -Force -ErrorAction SilentlyContinue

# Run Disk Cleanup
Write-Host "Running Disk Cleanup utility..."
Start-Process cleanmgr.exe -ArgumentList "/sagerun:1" -Wait

# Get final disk space
Write-Host "=== Disk Space After Cleanup ==="
Get-PSDrive C | Select-Object Used,Free

Write-Host "Disk cleanup completed successfully"',
    ARRAY['windows'],
    900,
    true,
    true,
    true,
    ARRAY['cleanup', 'maintenance', 'disk'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- SERVICE MANAGEMENT SCRIPTS
  -- ============================================================================

  -- Restart Service (Linux)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version, script_parameters
  ) VALUES (
    'Linux - Restart Service',
    'Restarts a specified systemd service',
    cat_service,
    'bash',
    '#!/bin/bash
set -e

SERVICE_NAME="${SERVICE_NAME:-}"

if [ -z "$SERVICE_NAME" ]; then
  echo "ERROR: SERVICE_NAME parameter is required"
  exit 1
fi

echo "Restarting service: $SERVICE_NAME"

# Check if service exists
if ! systemctl list-unit-files | grep -q "^${SERVICE_NAME}"; then
  echo "ERROR: Service $SERVICE_NAME not found"
  exit 1
fi

# Restart the service
systemctl restart "$SERVICE_NAME"

# Verify service is running
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "Service $SERVICE_NAME restarted successfully"
else
  echo "ERROR: Service $SERVICE_NAME failed to start"
  systemctl status "$SERVICE_NAME"
  exit 1
fi',
    ARRAY['linux'],
    120,
    true,
    true,
    true,
    ARRAY['service', 'restart', 'systemd'],
    '1.0.0',
    '{"SERVICE_NAME": {"type": "string", "required": true, "description": "Name of the service to restart"}}'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- Restart Service (Windows)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version, script_parameters
  ) VALUES (
    'Windows - Restart Service',
    'Restarts a specified Windows service',
    cat_service,
    'powershell',
    'param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceName
)

Write-Host "Restarting service: $ServiceName"

# Check if service exists
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "ERROR: Service $ServiceName not found"
    exit 1
}

# Restart the service
Restart-Service -Name $ServiceName -Force

# Wait for service to start
Start-Sleep -Seconds 5

# Verify service is running
$service = Get-Service -Name $ServiceName
if ($service.Status -eq "Running") {
    Write-Host "Service $ServiceName restarted successfully"
} else {
    Write-Host "ERROR: Service $ServiceName is not running. Status: $($service.Status)"
    exit 1
}',
    ARRAY['windows'],
    120,
    true,
    true,
    true,
    ARRAY['service', 'restart'],
    '1.0.0',
    '{"ServiceName": {"type": "string", "required": true, "description": "Name of the service to restart"}}'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- SECURITY SCRIPTS
  -- ============================================================================

  -- Check for Unauthorized Users (Linux)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Linux - Check Unauthorized Users',
    'Checks for users with UID 0 (root privileges) and recently created accounts',
    cat_security,
    'bash',
    '#!/bin/bash
set -e

echo "=== Checking for Unauthorized Users ==="

# Check for users with UID 0 (root privileges)
echo ""
echo "Users with UID 0 (root privileges):"
awk -F: ''($3 == 0) {print $1}'' /etc/passwd

# Check for recently created user accounts (last 30 days)
echo ""
echo "Recently created user accounts (last 30 days):"
find /home -maxdepth 1 -type d -mtime -30 -printf "%T@ %Tc %p\n" 2>/dev/null | sort -n | tail -10

# Check for users with no password
echo ""
echo "Users with no password set:"
awk -F: ''($2 == "" || $2 == "!") {print $1}'' /etc/shadow 2>/dev/null | grep -v "^#" || echo "None found"

# Check for users with shell access
echo ""
echo "Users with shell access:"
awk -F: ''$7 !~ /nologin|false/ {print $1 ": " $7}'' /etc/passwd

echo ""
echo "Security check completed"',
    ARRAY['linux'],
    60,
    true,
    true,
    true,
    ARRAY['security', 'audit', 'users'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- Firewall Status (Linux)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Linux - Check Firewall Status',
    'Checks firewall status and lists active rules',
    cat_security,
    'bash',
    '#!/bin/bash
set -e

echo "=== Firewall Status Check ==="

# Check UFW (Ubuntu/Debian)
if command -v ufw &> /dev/null; then
  echo ""
  echo "UFW Status:"
  ufw status verbose
fi

# Check firewalld (RHEL/CentOS/Fedora)
if command -v firewall-cmd &> /dev/null; then
  echo ""
  echo "Firewalld Status:"
  firewall-cmd --state
  echo ""
  echo "Active zones:"
  firewall-cmd --get-active-zones
  echo ""
  echo "Default zone:"
  firewall-cmd --get-default-zone
  echo ""
  echo "Allowed services:"
  firewall-cmd --list-all
fi

# Check iptables (fallback)
if command -v iptables &> /dev/null; then
  echo ""
  echo "IPTables Rules:"
  iptables -L -n -v
fi

echo ""
echo "Firewall check completed"',
    ARRAY['linux'],
    60,
    true,
    true,
    true,
    ARRAY['security', 'firewall', 'network'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- MONITORING SCRIPTS
  -- ============================================================================

  -- System Health Check (Cross-platform)
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'System Health Check',
    'Comprehensive system health check including CPU, memory, disk, and network',
    cat_monitoring,
    'bash',
    '#!/bin/bash
set -e

echo "=== SYSTEM HEALTH CHECK ==="
echo "Timestamp: $(date)"
echo ""

# OS Information
echo "=== System Information ==="
uname -a
echo ""

# CPU Usage
echo "=== CPU Usage ==="
if command -v mpstat &> /dev/null; then
  mpstat 1 1
else
  top -bn1 | grep "Cpu(s)" || echo "CPU info not available"
fi
echo ""

# Memory Usage
echo "=== Memory Usage ==="
free -h
echo ""

# Disk Usage
echo "=== Disk Usage ==="
df -h
echo ""

# Load Average
echo "=== Load Average ==="
uptime
echo ""

# Network Interfaces
echo "=== Network Interfaces ==="
if command -v ip &> /dev/null; then
  ip addr show
else
  ifconfig
fi
echo ""

# Active Connections
echo "=== Active Network Connections ==="
ss -tunap | head -20 || netstat -tunap | head -20
echo ""

# Running Processes (Top 10 by CPU)
echo "=== Top 10 Processes by CPU ==="
ps aux --sort=-%cpu | head -11
echo ""

# Running Processes (Top 10 by Memory)
echo "=== Top 10 Processes by Memory ==="
ps aux --sort=-%mem | head -11
echo ""

echo "Health check completed successfully"',
    ARRAY['linux', 'macos'],
    120,
    false,
    true,
    true,
    ARRAY['monitoring', 'health', 'diagnostics'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- Windows System Health
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Windows - System Health Check',
    'Comprehensive Windows system health check',
    cat_monitoring,
    'powershell',
    'Write-Host "=== WINDOWS SYSTEM HEALTH CHECK ==="
Write-Host "Timestamp: $(Get-Date)"
Write-Host ""

# System Information
Write-Host "=== System Information ==="
Get-ComputerInfo | Select-Object CsName, OsName, OsVersion, OsBuildNumber, OsArchitecture
Write-Host ""

# CPU Usage
Write-Host "=== CPU Usage ==="
Get-Counter "\Processor(_Total)\% Processor Time" | Select-Object -ExpandProperty CounterSamples
Write-Host ""

# Memory Usage
Write-Host "=== Memory Usage ==="
$mem = Get-CimInstance Win32_OperatingSystem
$totalMem = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
$freeMem = [math]::Round($mem.FreePhysicalMemory / 1MB, 2)
$usedMem = [math]::Round($totalMem - $freeMem, 2)
Write-Host "Total: $totalMem GB"
Write-Host "Used: $usedMem GB"
Write-Host "Free: $freeMem GB"
Write-Host ""

# Disk Usage
Write-Host "=== Disk Usage ==="
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -gt 0 } | Select-Object Name, @{Name="Used(GB)";Expression={[math]::Round($_.Used/1GB,2)}}, @{Name="Free(GB)";Expression={[math]::Round($_.Free/1GB,2)}}
Write-Host ""

# Top Processes by CPU
Write-Host "=== Top 10 Processes by CPU ==="
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName, CPU, WorkingSet
Write-Host ""

# Top Processes by Memory
Write-Host "=== Top 10 Processes by Memory ==="
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 ProcessName, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB,2)}}
Write-Host ""

# Services Not Running (that should be)
Write-Host "=== Services Not Running (StartMode = Automatic) ==="
Get-Service | Where-Object { $_.StartType -eq "Automatic" -and $_.Status -ne "Running" } | Select-Object Name, Status, StartType
Write-Host ""

Write-Host "Health check completed successfully"',
    ARRAY['windows'],
    120,
    false,
    true,
    true,
    ARRAY['monitoring', 'health', 'diagnostics'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- NETWORK SCRIPTS
  -- ============================================================================

  -- Network Diagnostics
  INSERT INTO automation_scripts (
    script_name, description, script_category_id, script_type, script_content,
    supported_os, timeout_seconds, requires_elevated, is_builtin, is_public,
    tags, version
  ) VALUES (
    'Network Diagnostics',
    'Tests network connectivity, DNS resolution, and displays network configuration',
    cat_network,
    'bash',
    '#!/bin/bash
set -e

echo "=== NETWORK DIAGNOSTICS ==="
echo "Timestamp: $(date)"
echo ""

# Network interfaces
echo "=== Network Interfaces ==="
if command -v ip &> /dev/null; then
  ip addr show
else
  ifconfig
fi
echo ""

# Default gateway
echo "=== Default Gateway ==="
if command -v ip &> /dev/null; then
  ip route | grep default
else
  route -n | grep "^0.0.0.0"
fi
echo ""

# DNS configuration
echo "=== DNS Configuration ==="
cat /etc/resolv.conf
echo ""

# Test DNS resolution
echo "=== DNS Resolution Test ==="
for domain in google.com cloudflare.com 1.1.1.1; do
  echo -n "Testing $domain: "
  if nslookup "$domain" &> /dev/null; then
    echo "OK"
  else
    echo "FAILED"
  fi
done
echo ""

# Test connectivity
echo "=== Connectivity Tests ==="
for host in 8.8.8.8 1.1.1.1 google.com; do
  echo -n "Ping $host: "
  if ping -c 2 -W 2 "$host" &> /dev/null; then
    echo "OK"
  else
    echo "FAILED"
  fi
done
echo ""

# Traceroute to common host
echo "=== Traceroute to 8.8.8.8 ==="
traceroute -m 10 -w 2 8.8.8.8 || echo "Traceroute not available"
echo ""

echo "Network diagnostics completed"',
    ARRAY['linux', 'macos'],
    180,
    false,
    true,
    true,
    ARRAY['network', 'diagnostics', 'connectivity'],
    '1.0.0'
  ) ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- DEFAULT AUTOMATION POLICIES
-- ============================================================================

DO $$
DECLARE
  script_linux_updates UUID;
  script_macos_updates UUID;
  script_windows_updates UUID;
  script_linux_cleanup UUID;
  script_health_check UUID;
  script_windows_health UUID;
BEGIN
  -- Get script IDs
  SELECT id INTO script_linux_updates FROM automation_scripts WHERE script_name = 'Linux - System Updates' LIMIT 1;
  SELECT id INTO script_macos_updates FROM automation_scripts WHERE script_name = 'macOS - System Updates' LIMIT 1;
  SELECT id INTO script_windows_updates FROM automation_scripts WHERE script_name = 'Windows - Install Updates' LIMIT 1;
  SELECT id INTO script_linux_cleanup FROM automation_scripts WHERE script_name = 'Linux - Disk Cleanup' LIMIT 1;
  SELECT id INTO script_health_check FROM automation_scripts WHERE script_name = 'System Health Check' LIMIT 1;
  SELECT id INTO script_windows_health FROM automation_scripts WHERE script_name = 'Windows - System Health Check' LIMIT 1;

  -- Weekly Linux Updates Policy
  IF script_linux_updates IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Weekly Linux System Updates',
      'Automatically update Linux systems every Sunday at 2 AM',
      true,
      'script_execution',
      script_linux_updates,
      'scheduled',
      '0 2 * * 0',
      true,
      ARRAY['updates', 'maintenance', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Weekly macOS Updates Policy
  IF script_macos_updates IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Weekly macOS System Updates',
      'Automatically update macOS systems every Sunday at 3 AM',
      true,
      'script_execution',
      script_macos_updates,
      'scheduled',
      '0 3 * * 0',
      true,
      ARRAY['updates', 'maintenance', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Weekly Windows Updates Policy
  IF script_windows_updates IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Weekly Windows System Updates',
      'Automatically update Windows systems every Sunday at 1 AM',
      true,
      'script_execution',
      script_windows_updates,
      'scheduled',
      '0 1 * * 0',
      true,
      ARRAY['updates', 'maintenance', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Monthly Disk Cleanup Policy
  IF script_linux_cleanup IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Monthly Disk Cleanup',
      'Clean up disk space on the first day of each month at 3 AM',
      true,
      'script_execution',
      script_linux_cleanup,
      'scheduled',
      '0 3 1 * *',
      true,
      ARRAY['cleanup', 'maintenance', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Daily Health Check Policy (Linux/macOS)
  IF script_health_check IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Daily System Health Check',
      'Run system health check every day at 6 AM',
      true,
      'script_execution',
      script_health_check,
      'scheduled',
      '0 6 * * *',
      true,
      ARRAY['monitoring', 'health', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Daily Health Check Policy (Windows)
  IF script_windows_health IS NOT NULL THEN
    INSERT INTO automation_policies (
      policy_name, description, enabled, policy_type, script_id,
      execution_mode, schedule_cron, notify_on_failure,
      tags
    ) VALUES (
      'Daily Windows Health Check',
      'Run Windows health check every day at 6 AM',
      true,
      'script_execution',
      script_windows_health,
      'scheduled',
      '0 6 * * *',
      true,
      ARRAY['monitoring', 'health', 'automated']
    ) ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- ============================================================================
-- DEFAULT SOFTWARE PACKAGES
-- ============================================================================

-- Google Chrome (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  checksum_type,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Google Chrome',
  'Latest',
  'Google LLC',
  'Fast, secure web browser with built-in malware and phishing protection',
  'exe',
  'Productivity',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://dl.google.com/chrome/install/GoogleChromeStandaloneEnterprise64.msi',
  'sha256',
  true,
  false,
  true,
  true,
  true,
  ARRAY['browser', 'productivity', 'google'],
  'Freeware'
) ON CONFLICT DO NOTHING;

-- Mozilla Firefox (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Mozilla Firefox',
  'Latest',
  'Mozilla Foundation',
  'Open-source web browser focused on privacy and customization',
  'exe',
  'Productivity',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://download.mozilla.org/?product=firefox-msi-latest-ssl&os=win64&lang=en-US',
  true,
  false,
  true,
  true,
  true,
  ARRAY['browser', 'productivity', 'mozilla', 'privacy'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- 7-Zip (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  '7-Zip',
  'Latest',
  '7-Zip',
  'File archiver with high compression ratio',
  'exe',
  'Productivity',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://www.7-zip.org/a/7z2301-x64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['utility', 'compression', 'productivity'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- VLC Media Player (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'VLC Media Player',
  'Latest',
  'VideoLAN',
  'Free and open-source cross-platform multimedia player',
  'exe',
  'Media',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://get.videolan.org/vlc/last/win64/vlc-3.0.20-win64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['media', 'player', 'video', 'audio'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- Adobe Acrobat Reader (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Adobe Acrobat Reader DC',
  'Latest',
  'Adobe Inc.',
  'Free PDF reader and viewer',
  'exe',
  'Productivity',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://ardownload2.adobe.com/pub/adobe/reader/win/AcrobatDC/latest/AcroRdrDCx64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['pdf', 'reader', 'productivity', 'adobe'],
  'Freeware'
) ON CONFLICT DO NOTHING;

-- Git for Windows
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Git for Windows',
  'Latest',
  'Git for Windows Project',
  'Distributed version control system',
  'exe',
  'Development',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://github.com/git-for-windows/git/releases/latest/download/Git-2.42.0-64-bit.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['development', 'version-control', 'git'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- Python (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Python',
  '3.11',
  'Python Software Foundation',
  'Python programming language interpreter',
  'exe',
  'Development',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['development', 'programming', 'python'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- Notepad++ (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Notepad++',
  'Latest',
  'Notepad++ Team',
  'Free source code editor and Notepad replacement',
  'exe',
  'Development',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://github.com/notepad-plus-plus/notepad-plus-plus/releases/latest/download/npp.8.5.7.Installer.x64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['editor', 'development', 'productivity'],
  'Open Source'
) ON CONFLICT DO NOTHING;

-- Zoom (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'Zoom',
  'Latest',
  'Zoom Video Communications',
  'Video conferencing and collaboration platform',
  'msi',
  'Communication',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://zoom.us/client/latest/ZoomInstallerFull.msi',
  true,
  false,
  true,
  true,
  true,
  ARRAY['video', 'conferencing', 'communication', 'collaboration'],
  'Freemium'
) ON CONFLICT DO NOTHING;

-- TeamViewer (Windows)
INSERT INTO software_packages (
  package_name, package_version, publisher, description,
  package_type, package_category,
  supported_os, architecture,
  source_type, source_url,
  silent_install_supported, requires_reboot, requires_elevated,
  is_approved, is_public,
  tags, license_type
) VALUES (
  'TeamViewer',
  'Latest',
  'TeamViewer GmbH',
  'Remote access and remote control software',
  'exe',
  'Remote Access',
  ARRAY['windows'],
  ARRAY['x86_64'],
  'url',
  'https://download.teamviewer.com/download/TeamViewer_Setup_x64.exe',
  true,
  false,
  true,
  true,
  true,
  ARRAY['remote-access', 'support', 'remote-control'],
  'Freemium'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- DEFAULT MAINTENANCE WINDOWS
-- ============================================================================

-- Weeknight Maintenance Window
INSERT INTO deployment_schedules (
  schedule_name, description,
  schedule_type, recurring_pattern,
  day_of_week, start_time, end_time,
  window_duration_minutes, timezone,
  only_outside_business_hours, is_active
) VALUES (
  'Weeknight Maintenance Window',
  'Standard maintenance window for weeknights 2 AM - 4 AM',
  'recurring',
  'weekly',
  ARRAY[1, 2, 3, 4, 5], -- Monday through Friday
  '02:00:00',
  '04:00:00',
  120,
  'America/New_York',
  true,
  true
) ON CONFLICT DO NOTHING;

-- Weekend Maintenance Window
INSERT INTO deployment_schedules (
  schedule_name, description,
  schedule_type, recurring_pattern,
  day_of_week, start_time, end_time,
  window_duration_minutes, timezone,
  only_outside_business_hours, is_active
) VALUES (
  'Weekend Maintenance Window',
  'Extended maintenance window for Saturdays 1 AM - 6 AM',
  'recurring',
  'weekly',
  ARRAY[6], -- Saturday
  '01:00:00',
  '06:00:00',
  300,
  'America/New_York',
  true,
  true
) ON CONFLICT DO NOTHING;

-- Sunday Patch Window
INSERT INTO deployment_schedules (
  schedule_name, description,
  schedule_type, recurring_pattern,
  day_of_week, start_time, end_time,
  window_duration_minutes, timezone,
  only_outside_business_hours, is_active
) VALUES (
  'Sunday Patch Window',
  'Dedicated window for system updates and patches on Sundays',
  'recurring',
  'weekly',
  ARRAY[0], -- Sunday
  '02:00:00',
  '05:00:00',
  180,
  'America/New_York',
  true,
  true
) ON CONFLICT DO NOTHING;

-- First of Month Maintenance
INSERT INTO deployment_schedules (
  schedule_name, description,
  schedule_type, recurring_pattern,
  day_of_month, start_time, end_time,
  window_duration_minutes, timezone,
  only_outside_business_hours, is_active
) VALUES (
  'First of Month Maintenance',
  'Monthly maintenance window on the 1st of each month',
  'recurring',
  'monthly',
  ARRAY[1], -- 1st day of month
  '03:00:00',
  '06:00:00',
  180,
  'America/New_York',
  true,
  true
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  script_count INTEGER;
  policy_count INTEGER;
  package_count INTEGER;
  schedule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO script_count FROM automation_scripts WHERE is_builtin = true;
  SELECT COUNT(*) INTO policy_count FROM automation_policies;
  SELECT COUNT(*) INTO package_count FROM software_packages WHERE is_public = true;
  SELECT COUNT(*) INTO schedule_count FROM deployment_schedules;

  RAISE NOTICE '';
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'RMM Default Data Migration Completed Successfully';
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'Default Automation Scripts: %', script_count;
  RAISE NOTICE 'Default Automation Policies: %', policy_count;
  RAISE NOTICE 'Default Software Packages: %', package_count;
  RAISE NOTICE 'Default Maintenance Windows: %', schedule_count;
  RAISE NOTICE '=======================================================';
END $$;
