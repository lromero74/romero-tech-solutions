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
  business_name?: string; // Joined from businesses table
  location_name?: string; // Joined from service_locations table
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
  outdated_packages_data?: Array<{
    name: string;
    installed_version: string;
    latest_version: string;
    package_manager: string;
  }> | null;
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
  alert_rule_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric_snapshot: Record<string, unknown> | null;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
}

export interface AgentCommand {
  id: string;
  agent_device_id: string;
  command_type: string;
  command_payload: Record<string, unknown> | null;
  status: 'pending' | 'delivered' | 'acknowledged' | 'completed' | 'failed';
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
   * Update agent settings (e.g., enable/disable monitoring)
   */
  async updateAgent(
    agentId: string,
    data: {
      device_name?: string;
      monitoring_enabled?: boolean;
      is_active?: boolean;
    }
  ): Promise<ApiResponse<{ message: string }>> {
    return apiService.patch(`/agents/${agentId}`, data);
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
}

// Export singleton instance
export const agentService = new AgentService();
export default agentService;
