import apiService from './apiService';

/**
 * Agent Service
 *
 * Handles all API calls related to MSP agent monitoring system
 */

export interface AgentDevice {
  id: string;
  business_id: string;
  service_location_id: string | null;
  device_name: string;
  device_type: string;
  os_type: string;
  os_version: string | null;
  system_info: Record<string, unknown> | null;
  status: 'online' | 'offline' | 'warning' | 'critical';
  last_heartbeat: string | null;
  monitoring_enabled: boolean;
  is_active: boolean;
  soft_delete: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  agent_token?: string; // Only returned on registration
  agent_version?: string; // Reported by the agent on every heartbeat (v1.16.77+)
  // End-user opt-out toggle for remote control (set via the agent
  // tray menu, propagated via heartbeat v1.18.1+). When false the
  // dashboard greys out + disables the Remote Control button.
  // Defaults true on the server side; older agents that don't send
  // the field preserve the existing DB value via COALESCE.
  remote_control_enabled?: boolean;
  // Pending action commands (install_update, reboot_host) currently in
  // pending/delivered/executing status. Surfaced in the GET /api/agents
  // list response so the dashboard's "Update in progress" / "Reboot
  // scheduled" badges survive a page refresh.
  pending_action_commands?: Array<{
    command_id: string;
    command_type: 'install_update' | 'reboot_host';
    status: 'pending' | 'delivered' | 'executing';
    requested_at: string;
    command_params?: Record<string, unknown> | null;
  }>;
  // Patch / package-update summary derived from the latest
  // agent_metrics row. Lets the dashboard filter / badge agents
  // without round-tripping to the metrics endpoint per row.
  patch_summary?: {
    os_patches: number;
    os_security_patches: number;
    os_patches_reboot: boolean;
    package_updates: number;
    homebrew_outdated: number;
    npm_outdated: number;
    pip_outdated: number;
    mas_outdated: number;
    distro_upgrade_available: boolean;
    observed_at: string | null;
  } | null;
  business_name?: string; // Joined from businesses table
  is_individual?: boolean; // From businesses table
  individual_first_name?: string; // From users table JOIN (for individuals only)
  individual_last_name?: string; // From users table JOIN (for individuals only)
  location_name?: string; // Joined from service_locations table
  location_street?: string; // Joined from service_locations table
  location_street2?: string; // Joined from service_locations table
  location_city?: string; // Joined from service_locations table
  location_state?: string; // Joined from service_locations table
  location_zip?: string; // Joined from service_locations table
  location_country?: string; // Joined from service_locations table
  // Trial mode fields
  is_trial?: boolean;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
  trial_converted_at?: string | null;
  trial_converted_to_agent_id?: string | null;
  trial_original_id?: string | null;
}

export interface TrialAgentStatus {
  trial_id: string;
  device_name: string;
  os_type: string;
  status: 'active' | 'expired' | 'converted';
  is_active: boolean;
  trial_start_date: string;
  trial_end_date: string;
  days_elapsed: number;
  days_remaining: number;
  total_days: number;
  percent_used: number;
  converted_at: string | null;
  converted_to_agent_id: string | null;
  last_heartbeat: string | null;
  last_metrics_received: string | null;
  created_at: string;
  upgrade_url: string;
}

export interface DiskHealth {
  device: string;
  overall_health: string;
  temperature_c: number;
  power_on_hours: number;
  reallocated_sectors: number;
  pending_sectors: number;
  uncorrectable_errors: number;
  failure_predicted: boolean;
  smart_attributes: Record<string, unknown>;
  last_checked: string;
}

export interface ServiceInfo {
  name: string;
  display_name: string;
  description?: string; // Brief description of what the service does (purpose)
  why_stopped_help?: string; // Contextual help explaining why service might be stopped
  status: string; // running, stopped, failed, unknown
  enabled: boolean;
  pid?: number;
  uptime_seconds?: number;
  memory_mb?: number;
  restart_count?: number;
  last_checked: string;
}

export interface NetworkDevice {
  name: string;
  device_type: string; // printer, scanner, camera, iot, network_equipment, other
  ip_address: string;
  port?: number;
  protocol: string; // ping, http, https
  reachable: boolean;
  response_time_ms?: number;
  last_seen?: string;
  error?: string;
  last_checked: string;
}

export interface BackupInfo {
  name: string;
  backup_type: string; // timemachine, veeam, acronis, windows_backup, etc.
  status: string; // running, stopped, idle, disabled, unknown
  is_running: boolean;
  is_enabled: boolean;
  last_backup_time?: string;
  detection_method: string; // service, process, command
  error_message?: string;
  last_checked: string;
}

export interface SecurityProduct {
  name: string;
  product_type: string; // antivirus, firewall, edr, anti-malware, security-framework
  vendor?: string; // Microsoft, Norton, McAfee, etc.
  version?: string;
  is_enabled: boolean;
  is_running: boolean;
  definitions_up_to_date: boolean;
  last_definition_update?: string;
  real_time_protection: boolean;
  detection_method: string; // service, wmi, command, process, filesystem
  error_message?: string;
  last_checked: string;
}

export interface FailedLoginAttempt {
  ip: string;
  username: string;
  count: number;
  last_attempt: string;
  method: string; // ssh, console, rdp, pam, etc.
  error_message?: string;
}

export interface ConnectivityTest {
  endpoint: string;
  test_type: string; // ping, dns, tcp
  reachable: boolean;
  latency_ms?: number;
  packet_loss?: number;
  dns_resolved?: boolean;
  resolved_ip?: string;
  error_message?: string;
  tested_at: string;
}

export interface SensorReading {
  sensor_name: string;
  sensor_type: string; // temperature, fan, voltage
  value: number;
  unit: string; // C, RPM, V
  critical: boolean;
  last_checked: string;
}

export interface EventLog {
  event_time: string;
  event_level: string; // critical, error, warning
  event_source: string;
  event_id?: string;
  event_message: string;
  event_category?: string; // application, system, security, hardware
  event_data?: Record<string, unknown>;
}

export interface AgentMetric {
  id?: string;
  agent_device_id?: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb?: number;
  disk_percent: number;
  disk_used_gb?: number;
  network_rx_bytes?: number | null;
  network_tx_bytes?: number | null;
  patches_available?: number;
  security_patches_available?: number;
  patches_require_reboot?: boolean;
  eol_status?: string | null;
  eol_date?: string | null;
  security_eol_date?: string | null;
  days_until_eol?: number | null;
  days_until_sec_eol?: number | null;
  eol_message?: string | null;
  disk_health_status?: string | null;
  disk_health_data?: DiskHealth[] | null;
  disk_failures_predicted?: number;
  disk_temperature_max?: number;
  disk_reallocated_sectors_total?: number;
  system_uptime_seconds?: number | null;
  last_boot_time?: string | null;
  unexpected_reboot?: boolean;
  services_monitored?: number;
  services_running?: number;
  services_failed?: number;
  services_data?: ServiceInfo[] | null;
  network_devices_monitored?: number;
  network_devices_online?: number;
  network_devices_offline?: number;
  network_devices_data?: NetworkDevice[] | null;
  backups_detected?: number;
  backups_running?: number;
  backups_with_issues?: number;
  backup_data?: BackupInfo[] | null;
  antivirus_installed?: boolean;
  antivirus_enabled?: boolean;
  antivirus_up_to_date?: boolean;
  firewall_enabled?: boolean;
  security_products_count?: number;
  security_issues_count?: number;
  security_data?: SecurityProduct[] | null;
  failed_login_attempts?: number;
  failed_login_last_24h?: number;
  unique_attacking_ips?: number;
  failed_login_data?: FailedLoginAttempt[] | null;
  internet_connected?: boolean;
  gateway_reachable?: boolean;
  dns_working?: boolean;
  avg_latency_ms?: number;
  packet_loss_percent?: number;
  connectivity_issues_count?: number;
  connectivity_data?: ConnectivityTest[] | null;
  cpu_temperature_c?: number | null;
  gpu_temperature_c?: number | null;
  motherboard_temperature_c?: number | null;
  highest_temperature_c?: number;
  temperature_critical_count?: number;
  fan_count?: number;
  fan_speeds_rpm?: number[] | null;
  fan_failure_count?: number;
  sensor_data?: SensorReading[] | null;
  critical_events_count?: number;
  error_events_count?: number;
  warning_events_count?: number;
  last_critical_event?: string | null;
  last_critical_event_message?: string | null;
  event_logs_data?: EventLog[] | null;
  package_managers_outdated?: number;
  homebrew_outdated?: number;
  npm_outdated?: number;
  pip_outdated?: number;
  // mas (Mac App Store) is reported alongside the other package managers;
  // declared here so PackageManagerStatus can render it without each
  // consumer site casting through `any`.
  mas_outdated?: number;
  outdated_packages_data?: Array<{
    name: string;
    installed_version: string;
    latest_version: string;
    package_manager: string;
    // Vendor-managed packages (Apple's CommandLineTools, distro
    // dist-packages) — the dashboard groups these under their parent
    // updater instead of surfacing them as actionable rows.
    system_managed?: boolean;
    system_updater?: 'macos_clt' | 'apt' | 'dnf' | 'pacman' | 'zypper' | 'linux_distro';
  }> | null;
  // True when the agent saw a pending Command Line Tools update in
  // softwareupdate --list. Drives the "Update via Software Update"
  // prompt under the macOS CommandLineTools group.
  clt_update_available?: boolean;
  // Structured per-update list captured by the agent (v1.16.49+) from
  // apt/dnf/pacman/softwareupdate. The dashboard renders this as a
  // browsable table with clickable version links.
  os_patches_data?: Array<{
    name: string;
    current_version?: string;
    available_version?: string;
    security?: boolean;
    source?: string;
    package_manager?: string;
  }> | null;
  // Linux release upgrade descriptor. nil when none pending.
  distro_upgrade?: {
    current_release: string;
    available_release: string;
    upgrade_command?: string;
    distro?: string;
  } | null;
  raw_metrics?: Record<string, unknown> | null;
  collected_at: string;
  // Backward compatibility (deprecated)
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  network_rx?: number | null;
  network_tx?: number | null;
  custom_metrics?: Record<string, unknown> | null;
}

export interface AgentAlert {
  id: string;
  agent_device_id: string;
  agent_alert_id?: string | null;
  alert_rule_id?: string | null;
  alert_type: string;
  alert_name?: string | null;
  severity: 'info' | 'warning' | 'critical';
  message?: string;
  alert_message?: string; // Alternative field name from agent_alert_history
  metric_value?: number | null;
  threshold_value?: number | null;
  metric_snapshot?: Record<string, unknown> | null;
  status: 'active' | 'acknowledged' | 'resolved';
  triggered_at?: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolution_notes?: string | null;
  notification_sent?: boolean | null;
  notification_sent_at?: string | null;
  service_request_created?: string | null;
}

export interface AgentCommand {
  id: string;
  agent_device_id: string;
  command_type: string;
  command_payload: Record<string, unknown> | null;
  status: 'pending' | 'delivered' | 'acknowledged' | 'executing' | 'completed' | 'completed_with_failures' | 'failed';
  requested_by: string;
  approved_by: string | null;
  requires_approval: boolean;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
  executed_at: string | null;
  updated_at: string;
}

export interface RegistrationToken {
  id: string;
  token: string;
  business_id: string;
  service_location_id: string | null;
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  agent_device_id: string | null;
  created_by: string;
  created_at: string;
}

export interface HardwareInventory {
  id: string;
  agent_device_id: string;
  cpu_model: string | null;
  cpu_cores: number | null;
  cpu_threads: number | null;
  cpu_speed_mhz: number | null;
  cpu_architecture: string | null;
  total_memory_gb: number | null;
  memory_slots_used: number | null;
  memory_slots_total: number | null;
  memory_type: string | null;
  memory_speed_mhz: number | null;
  total_storage_gb: number | null;
  storage_type: string | null;
  motherboard_manufacturer: string | null;
  motherboard_model: string | null;
  bios_version: string | null;
  bios_date: string | null;
  chassis_type: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  manufacturer: string | null;
  model: string | null;
  display_count: number;
  primary_display_resolution: string | null;
  network_interface_count: number;
  mac_addresses: string[] | null;
  usb_devices: Record<string, unknown>[] | null;
  has_battery: boolean;
  battery_health_percent: number | null;
  battery_cycle_count: number | null;
  raw_inventory_data: Record<string, unknown> | null;
  last_updated_at: string;
  created_at: string;
}

export interface SoftwareInventory {
  id: string;
  agent_device_id: string;
  software_name: string;
  software_version: string | null;
  software_publisher: string | null;
  install_date: string | null;
  install_location: string | null;
  install_source: string | null;
  size_mb: number | null;
  requires_license: boolean;
  package_manager: string | null;
  package_name: string | null;
  software_category: string | null;
  is_system_software: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface StorageDevice {
  id: string;
  agent_device_id: string;
  device_name: string;
  device_type: string | null;
  interface_type: string | null;
  capacity_gb: number | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  smart_status: string | null;
  smart_temperature_c: number | null;
  smart_power_on_hours: number | null;
  smart_reallocated_sectors: number | null;
  smart_pending_sectors: number | null;
  partition_count: number;
  partitions: Record<string, unknown>[] | null;
  health_status: string;
  last_scanned_at: string;
  created_at: string;
}

export interface AgentPolicy {
  id: string;
  policy_name: string;
  description: string | null;
  policy_type: string;
  execution_mode: string;
  schedule_cron: string | null;
  enabled: boolean;
  script_name: string | null;
  assignment_id: string;
  assigned_at: string;
  assignment_type: 'direct' | 'business';
  assigned_by_name: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  error?: string;
}

class AgentService {
  /**
   * List all agents (with RBAC filtering on backend)
   */
  async listAgents(filters?: {
    business_id?: string;
    service_location_id?: string;
    status?: string;
  }): Promise<ApiResponse<{ agents: AgentDevice[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.business_id) params.business_id = filters.business_id;
    if (filters?.service_location_id) params.service_location_id = filters.service_location_id;
    if (filters?.status) params.status = filters.status;

    return apiService.get('/agents', { params });
  }

  /**
   * Get detailed information about a specific agent
   */
  async getAgent(agentId: string): Promise<ApiResponse<AgentDevice>> {
    return apiService.get(`/agents/${agentId}`);
  }

  /**
   * Get policies assigned to a specific agent (direct + business-level)
   */
  async getAgentPolicies(agentId: string): Promise<ApiResponse<{ policies: AgentPolicy[]; count: number }>> {
    return apiService.get(`/agents/${agentId}/policies`);
  }

  /**
   * Get metrics history for an agent
   */
  async getAgentMetricsHistory(
    agentId: string,
    hours: number = 24,
    metricType?: string
  ): Promise<ApiResponse<{ metrics: AgentMetric[]; count: number; time_range_hours: number }>> {
    const params: Record<string, string> = { hours: hours.toString() };
    if (metricType) params.metric_type = metricType;

    return apiService.get(`/agents/${agentId}/metrics/history`, { params });
  }

  /**
   * Create a registration token for deploying a new agent (employees only)
   */
  async createRegistrationToken(data: {
    business_id: string;
    service_location_id?: string;
    expires_in_hours?: number;
  }): Promise<ApiResponse<RegistrationToken>> {
    return apiService.post('/agents/registration-tokens', data);
  }

  /**
   * Create a remote command for an agent (employees only)
   */
  async createCommand(
    agentId: string,
    data: {
      command_type: string;
      command_payload?: Record<string, unknown>;
      requires_approval?: boolean;
    }
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, data);
  }

  /**
   * Trigger a remote package-update on the device. Backend creates an
   * agent_commands row with command_type=update_packages; the agent's
   * existing /commands poll picks it up and runs it via internal/updatepkgs.
   * Final result arrives via the agent.command.completed websocket event.
   */
  async requestUpdatePackages(
    agentId: string,
    payload: {
      manager: string;
      scope: 'all' | 'selected' | 'security_only';
      packages: string[];
      dry_run?: boolean;
      auto_confirm?: boolean;
      timeout_seconds?: number;
      stop_on_first_failure?: boolean;
    }
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'update_packages',
      command_params: {
        manager: payload.manager,
        scope: payload.scope,
        packages: payload.packages,
        dry_run: payload.dry_run ?? false,
        auto_confirm: payload.auto_confirm ?? true,
        timeout_seconds: payload.timeout_seconds ?? 1800,
        stop_on_first_failure: payload.stop_on_first_failure ?? false,
      },
      requires_approval: false,
    });
  }

  /**
   * Reboot the agent's host machine. Used after Windows updates that
   * are installed but waiting for a reboot to take effect, or as a
   * general "force reboot this device" admin action.
   *
   * The agent schedules the reboot with the requested delay (default
   * 60s) so it has time to POST a successful result back before the
   * host actually shuts down. Cross-platform: shutdown.exe /r on
   * Windows, `shutdown -r +N` on Linux/macOS. Linux/macOS round the
   * delay up to a whole minute (their shutdown command's minimum).
   */
  async requestRebootHost(
    agentId: string,
    payload: { delay_seconds?: number; message?: string } = {}
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'reboot_host',
      command_params: {
        delay_seconds: payload.delay_seconds ?? 60,
        message: payload.message ?? 'RTS Agent: rebooting to apply pending updates',
      },
      requires_approval: false,
    });
  }

  /**
   * Cancel a previously-scheduled reboot. The agent runs the OS-
   * specific cancel command (`shutdown -c` on Linux, `killall
   * shutdown` on macOS, `shutdown /a` on Windows) and POSTs to the
   * original reboot command's /reboot-cancelled endpoint with
   * source='admin' so the dashboard's "Reboot scheduled" badge
   * clears immediately.
   *
   * originalCommandId is the agent_commands.id of the reboot_host
   * row we're cancelling — required so the agent knows which row
   * to mark cancelled in the dashboard.
   */
  async requestCancelReboot(
    agentId: string,
    originalCommandId: string
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'cancel_reboot',
      command_params: {
        original_command_id: originalCommandId,
      },
      requires_approval: false,
    });
  }

  /**
   * Force an immediate OS-patch re-scan on the agent. The agent's
   * patch cache normally refreshes hourly (or after a successful
   * update_packages). This command-driven path is for "I want to
   * see the post-reboot state right now" — the dashboard's
   * "Refresh now" button on the OS Patch panel header.
   */
  async requestRefreshPatches(
    agentId: string
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'refresh_patches',
      command_params: {},
      requires_approval: false,
    });
  }

  /**
   * Trigger a self-update on the agent. The agent's command-poll
   * loop picks this up and runs internal/updater.AutoUpdateUnattended
   * — same pipeline as the background auto-update loop, but bypasses
   * the agent-side cfg.Advanced.AutoUpdate gate (the explicit
   * dashboard click IS the consent).
   *
   * The agent posts a "queued" result back immediately and then the
   * install kills the agent process. The OS service supervisor
   * (launchd / systemd / Windows SCM) restarts it on the new binary.
   * Success is observed via the next heartbeat carrying the new
   * agent_version.
   */
  async requestInstallUpdate(
    agentId: string
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'install_update',
      command_params: {},
      requires_approval: false,
    });
  }

  /**
   * Trigger an OS-level distro upgrade (Ubuntu/Debian/Fedora). The
   * agent pops a modal confirmation in the active user's session
   * (zenity/kdialog) explaining the duration + reboot, then runs
   * the upgrade non-interactively if the user clicks Start. Failure
   * to find a graphical user → command fails with an actionable
   * error; admin can override with skip_user_prompt=true to run
   * blind (e.g. for headless servers, but at your own risk).
   *
   * The upgrade itself reboots the host mid-process. The dashboard
   * tracks completion by watching agent_devices.os_version flip to
   * the available_release on the post-reboot heartbeat.
   *
   * Required payload fields are sourced from the cached
   * latestMetrics.distro_upgrade — current/available release and
   * the upgrade_command come from CheckDistroUpgrade on the agent
   * side. Re-sending them in the payload (rather than re-reading
   * on the agent) pins the upgrade to the version the admin saw
   * when they clicked.
   */
  async requestUpgradeDistro(
    agentId: string,
    payload: {
      upgrade_command: string;
      current_release: string;
      available_release: string;
      distro?: string;
      skip_user_prompt?: boolean;
    }
  ): Promise<ApiResponse<{ command_id: string; status: string }>> {
    return apiService.post(`/agents/${agentId}/commands`, {
      command_type: 'upgrade_distro',
      command_params: payload,
      requires_approval: false,
    });
  }

  /**
   * Start a remote-control session against an agent host. Backend
   * mints a short-lived MeshCentral login URL the dashboard opens
   * in an iframe. Auth: requires `manage.remote_control.enable`
   * permission (granted to admin + executive roles by default).
   *
   * On success the response carries:
   *   - session_url: the MeshCentral URL with login token embedded
   *   - expires_at:  ISO timestamp when the URL stops working (~5 min)
   *   - audit_id:    UUID of the remote_control_sessions row, used
   *                  to call requestEndRemoteControl() to force-end
   *
   * Failure modes returned with explicit codes:
   *   AGENT_NOT_FOUND      — bad agentId or soft-deleted device
   *   AGENT_OFFLINE        — agent isn't currently heartbeating
   *   FEATURE_DISABLED     — backend feature flag is off
   *   MESHCENTRAL_UNREACHABLE — backend couldn't reach MeshCentral
   */
  async requestRemoteControl(agentId: string): Promise<
    ApiResponse<{
      session_url: string;
      expires_at: string;
      audit_id: string;
      device_name: string;
    }>
  > {
    return apiService.post(`/remote-control/agents/${agentId}/start`, {});
  }

  /**
   * Force-end an in-flight remote-control session. The dashboard
   * calls this when the technician clicks Disconnect, AND when the
   * iframe modal is closed (any way). Idempotent — already-ended
   * sessions return success.
   *
   * auditId is the UUID returned from requestRemoteControl.
   */
  async requestEndRemoteControl(auditId: string): Promise<
    ApiResponse<{ ended_at: string; duration_seconds: number }>
  > {
    return apiService.post(`/remote-control/sessions/${auditId}/end`, {});
  }

  /**
   * Health check for the MeshCentral integration. Used by the
   * admin diagnostics page to surface "Remote Control unavailable"
   * before a technician clicks the button and gets a confusing
   * 502.
   */
  async getRemoteControlServerHealth(): Promise<
    ApiResponse<{
      status: string;
      meshcentral_version: string;
      device_groups_visible: number;
    }>
  > {
    return apiService.get('/remote-control/server-health');
  }

  /**
   * Get the current "latest" agent version from the download manifest
   * (version.json on the API host's static download directory). Used
   * to compute the "Update available" badge in the AgentDashboard
   * table. Returns null if the manifest is unreachable — the UI
   * treats null as "we don't know" and skips the outdated badge.
   */
  async getLatestAgentVersion(): Promise<string | null> {
    try {
      const resp = await apiService.get<{
        success: boolean;
        current_version: string | null;
      }>('/agent/latest-version');
      return resp?.current_version ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get alerts for a specific agent
   */
  async getAgentAlerts(
    agentId: string,
    filters?: {
      status?: 'active' | 'acknowledged' | 'resolved';
      severity?: 'info' | 'warning' | 'critical';
    }
  ): Promise<ApiResponse<{ alerts: AgentAlert[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.severity) params.severity = filters.severity;

    return apiService.get(`/agents/${agentId}/alerts`, { params });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    agentId: string,
    alertId: string
  ): Promise<ApiResponse<{ message: string }>> {
    return apiService.post(`/agents/${agentId}/alerts/${alertId}/acknowledge`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    agentId: string,
    alertId: string,
    notes?: string
  ): Promise<ApiResponse<{ message: string }>> {
    return apiService.post(`/agents/${agentId}/alerts/${alertId}/resolve`, { notes });
  }

  /**
   * Get commands for a specific agent (Admin view)
   */
  async getAgentCommands(
    agentId: string,
    filters?: {
      status?: string;
    }
  ): Promise<ApiResponse<{ commands: AgentCommand[]; count: number }>> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;

    return apiService.get(`/agents/${agentId}/commands/list`, { params });
  }

  /**
   * Update agent settings (e.g., enable/disable monitoring, change location, update name, device type)
   */
  async updateAgent(
    agentId: string,
    data: {
      device_name?: string;
      device_type?: string;
      monitoring_enabled?: boolean;
      is_active?: boolean;
      service_location_id?: string;
    }
  ): Promise<ApiResponse<{ message: string }>> {
    return apiService.patch(`/agents/${agentId}`, data);
  }

  /**
   * Regenerate agent token (invalidates old token)
   */
  async regenerateToken(agentId: string): Promise<ApiResponse<{ token: string; message: string }>> {
    return apiService.post(`/agents/${agentId}/regenerate-token`);
  }

  /**
   * Soft delete an agent
   */
  async softDeleteAgent(agentId: string): Promise<ApiResponse<{ message: string }>> {
    return apiService.post(`/agents/${agentId}/soft-delete`);
  }

  /**
   * Restore a soft-deleted agent
   */
  async restoreAgent(agentId: string): Promise<ApiResponse<{ message: string }>> {
    return apiService.post(`/agents/${agentId}/restore`);
  }

  /**
   * Permanently delete an agent (hard delete)
   */
  async deleteAgent(agentId: string): Promise<ApiResponse<{ message: string }>> {
    return apiService.delete(`/agents/${agentId}`);
  }

  /**
   * Get hardware inventory for an agent
   */
  async getHardwareInventory(
    agentId: string
  ): Promise<ApiResponse<{ hardware: HardwareInventory | null; has_data: boolean }>> {
    return apiService.get(`/agents/${agentId}/inventory/hardware`);
  }

  /**
   * Get software inventory for an agent
   */
  async getSoftwareInventory(
    agentId: string,
    filters?: {
      package_manager?: string;
      category?: string;
      search?: string;
    }
  ): Promise<
    ApiResponse<{
      software: SoftwareInventory[];
      count: number;
      stats: {
        total_packages: number;
        package_managers_count: number;
        categories_count: number;
        total_size_mb: number;
      } | null;
    }>
  > {
    const params: Record<string, string> = {};
    if (filters?.package_manager) params.package_manager = filters.package_manager;
    if (filters?.category) params.category = filters.category;
    if (filters?.search) params.search = filters.search;

    return apiService.get(`/agents/${agentId}/inventory/software`, { params });
  }

  /**
   * Get storage device inventory for an agent
   */
  async getStorageInventory(
    agentId: string
  ): Promise<
    ApiResponse<{
      storage: StorageDevice[];
      count: number;
      stats: {
        total_devices: number;
        total_capacity_gb: number;
        devices_with_issues: number;
      } | null;
    }>
  > {
    return apiService.get(`/agents/${agentId}/inventory/storage`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIAL AGENT METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get trial agent status by trial_id (e.g., "trial-1234567890")
   */
  async getTrialStatus(trialId: string): Promise<ApiResponse<TrialAgentStatus>> {
    return apiService.get(`/agents/trial/status/${trialId}`);
  }

  /**
   * Convert trial agent to registered agent
   */
  async convertTrialAgent(data: {
    trial_id: string;
    registration_token: string;
    preserve_data?: boolean;
  }): Promise<ApiResponse<{
    agent_id: string;
    agent_token: string;
    business_id: string;
    service_location_id: string | null;
    metrics_migrated: number;
    trial_id: string;
  }>> {
    return apiService.post('/agents/trial/convert', data);
  }

  /**
   * List all trial agents (employees only)
   * This queries the agent_devices table for agents with is_trial=true
   */
  async listTrialAgents(): Promise<ApiResponse<{ agents: AgentDevice[]; count: number }>> {
    // Use the existing listAgents endpoint but filter for trial agents on the frontend
    // Alternatively, we could add a backend endpoint specifically for this
    const response = await this.listAgents();

    if (response.success && response.data) {
      const trialAgents = response.data.agents.filter(agent => agent.is_trial === true);
      return {
        success: true,
        data: {
          agents: trialAgents,
          count: trialAgents.length
        }
      };
    }

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERT AGGREGATION SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get aggregation settings for a specific agent
   * Returns device override, user default, and effective level
   */
  async getAgentAggregationSettings(agentId: string): Promise<ApiResponse<{
    agent_id: string;
    device_name: string;
    device_override: string | null;
    user_default: string;
    effective_level: string;
  }>> {
    return apiService.get(`/agents/${agentId}/aggregation-settings`);
  }

  /**
   * Update aggregation level for a specific agent
   * Pass null to remove device override and use user default
   */
  async updateAgentAggregationLevel(
    agentId: string,
    aggregationLevel: string | null
  ): Promise<ApiResponse<{
    agent_id: string;
    device_override: string | null;
    effective_level: string;
  }>> {
    return apiService.put(`/agents/${agentId}/aggregation-level`, {
      aggregation_level: aggregationLevel
    });
  }

  /**
   * Get available aggregation levels with descriptions
   */
  async getAggregationLevels(): Promise<ApiResponse<Record<string, {
    interval: string;
    minutes: number;
    description: string;
  }>>> {
    return apiService.get('/agents/aggregation-levels');
  }
}

// Export singleton instance
export const agentService = new AgentService();
export default agentService;
