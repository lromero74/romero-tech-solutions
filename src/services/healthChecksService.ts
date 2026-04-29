/**
 * Stage 1 Health Checks API client.
 *
 * Backend endpoints:
 *   GET /api/agents/:agent_id/health-checks
 *   GET /api/agents/:agent_id/health-checks/:check_type/history
 *
 * See docs/PRPs/STAGE1_HEALTH_CHECKS.md.
 */
import apiService from './apiService';

export type HealthCheckSeverity = 'info' | 'warning' | 'critical';

export type HealthCheckType =
  // Stage 1
  | 'reboot_pending'
  | 'time_drift'
  | 'crashdumps'
  | 'top_processes'
  | 'listening_ports'
  | 'update_history_failures'
  | 'domain_status'
  | 'mapped_drives'
  // Stage 2.4 / 2.5 / 2.6
  | 'battery_health'
  | 'power_policy'
  | 'gpu_status'
  // Stage 3.7 / 3.5 / 3.2
  | 'certificate_expiry'
  | 'scheduled_tasks'
  | 'peripherals'
  // Stage 3.6 / 3.3
  | 'logon_history'
  | 'browser_extensions';

export interface HealthCheckResult {
  check_type: HealthCheckType;
  severity: HealthCheckSeverity;
  passed: boolean;
  payload: Record<string, unknown>;
  collected_at: string;
  reported_at: string;
}

export interface HealthCheckHistoryPoint {
  severity: HealthCheckSeverity;
  passed: boolean;
  payload: Record<string, unknown>;
  collected_at: string;
}

interface HealthCheckListResponse {
  success: boolean;
  data: HealthCheckResult[];
}

interface HealthCheckHistoryResponse {
  success: boolean;
  data: HealthCheckHistoryPoint[];
}

export const healthChecksService = {
  list(agentId: string): Promise<HealthCheckListResponse> {
    return apiService.get<HealthCheckListResponse>(`/agents/${agentId}/health-checks`);
  },

  history(
    agentId: string,
    checkType: HealthCheckType,
    days = 30
  ): Promise<HealthCheckHistoryResponse> {
    const clamped = Math.min(Math.max(days, 1), 90);
    return apiService.get<HealthCheckHistoryResponse>(
      `/agents/${agentId}/health-checks/${checkType}/history?days=${clamped}`
    );
  },
};

export default healthChecksService;
