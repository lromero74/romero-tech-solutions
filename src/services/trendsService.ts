/**
 * Stage 2 Trends API client.
 *
 * Backend endpoints:
 *   GET /api/agents/:id/disk-forecast?days=N
 *   GET /api/agents/:id/baselines
 *   GET /api/agents/:id/wan-ip-history?limit=N
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 */
import apiService from './apiService';

export interface DiskForecast {
  growth_gb_per_day: number | null;
  days_until_full: number | null;
  forecast_full_at: string | null;
  current_used_gb: number | null;
  current_total_gb: number | null;
  current_percent: number | null;
  sample_count: number;
  computed_at: string;
}

export interface DiskHistoryPoint {
  bucket: string;
  used_gb: string | number;
  percent: string | number;
}

export interface DiskForecastResponse {
  success: boolean;
  data: {
    forecast: DiskForecast | null;
    history: DiskHistoryPoint[];
    severity: 'critical' | 'warning' | null;
  };
}

export type MetricType =
  | 'cpu_percent'
  | 'memory_percent'
  | 'disk_percent'
  | 'load_average_1m'
  | 'network_rx_bytes'
  | 'network_tx_bytes';

export interface MetricBaseline {
  metric_type: MetricType;
  mean: string | number;
  stddev: string | number;
  sample_count: number;
  window_days: number;
  computed_at: string;
}

interface BaselinesResponse {
  success: boolean;
  data: MetricBaseline[];
}

export interface WanIpHistoryRow {
  id: string;
  public_ip: string;
  previous_ip: string | null;
  observed_at: string;
}

interface WanIpHistoryResponse {
  success: boolean;
  data: WanIpHistoryRow[];
}

export const trendsService = {
  diskForecast(agentId: string, days = 30): Promise<DiskForecastResponse> {
    const safeDays = Math.min(Math.max(days, 1), 90);
    return apiService.get<DiskForecastResponse>(
      `/agents/${agentId}/disk-forecast?days=${safeDays}`
    );
  },
  baselines(agentId: string): Promise<BaselinesResponse> {
    return apiService.get<BaselinesResponse>(`/agents/${agentId}/baselines`);
  },
  wanIpHistory(agentId: string, limit = 50): Promise<WanIpHistoryResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    return apiService.get<WanIpHistoryResponse>(
      `/agents/${agentId}/wan-ip-history?limit=${safeLimit}`
    );
  },
};

export default trendsService;
