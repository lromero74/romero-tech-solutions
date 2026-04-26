/**
 * Shared types for Agent Details components
 */

import { AgentMetric, AgentDevice } from '../../../services/agentService';

export interface AgentDetailsComponentProps {
  latestMetrics: AgentMetric | null;
  agent?: AgentDevice | null;
  // Optional time series — passed by AgentDetails so components can
  // render historical charts / dedupe events across snapshots
  // without re-fetching. Older callers that only display
  // "right-now" data can omit this.
  metricsHistory?: AgentMetric[];
}

export interface MetricCardProps {
  title: string;
  value: number | string;
  status?: 'normal' | 'warning' | 'critical';
  icon?: React.ReactNode;
  suffix?: string;
}
