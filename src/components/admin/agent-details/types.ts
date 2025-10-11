/**
 * Shared types for Agent Details components
 */

import { AgentMetric, AgentDevice } from '../../../services/agentService';

export interface AgentDetailsComponentProps {
  latestMetrics: AgentMetric | null;
  agent?: AgentDevice | null;
}

export interface MetricCardProps {
  title: string;
  value: number | string;
  status?: 'normal' | 'warning' | 'critical';
  icon?: React.ReactNode;
  suffix?: string;
}
