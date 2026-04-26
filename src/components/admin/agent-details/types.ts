/**
 * Shared types for Agent Details components
 */

import { AgentMetric, AgentDevice, AgentCommand } from '../../../services/agentService';

export interface AgentDetailsComponentProps {
  latestMetrics: AgentMetric | null;
  agent?: AgentDevice | null;
  // Optional time series — passed by AgentDetails so components can
  // render historical charts / dedupe events across snapshots
  // without re-fetching. Older callers that only display
  // "right-now" data can omit this.
  metricsHistory?: AgentMetric[];
  // Optional command history — passed by AgentDetails so panels
  // that need to correlate with recent commands (OSPatchStatus
  // showing "Rebooting since X:XX" after a reboot_host command,
  // for example) can read the list without each component
  // re-fetching independently.
  commands?: AgentCommand[];
}

export interface MetricCardProps {
  title: string;
  value: number | string;
  status?: 'normal' | 'warning' | 'critical';
  icon?: React.ReactNode;
  suffix?: string;
}
