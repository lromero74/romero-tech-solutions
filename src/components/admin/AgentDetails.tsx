import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity,
  RefreshCw, ArrowLeft, Terminal, Bell, Clock, CheckCircle, XCircle,
  Cpu, HardDrive, Wifi, TrendingUp, Calendar, Shield, Download, Disc, Thermometer, AlertOctagon, FileWarning, Info
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice, AgentMetric, AgentAlert, AgentCommand } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import MetricsChart from './MetricsChart';

interface AgentDetailsProps {
  agentId: string;
  onBack?: () => void;
  onSendCommand?: (agentId: string) => void;
}

const AgentDetails: React.FC<AgentDetailsProps> = ({
  agentId,
  onBack,
  onSendCommand,
}) => {
  const [agent, setAgent] = useState<AgentDevice | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<AgentMetric | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<AgentMetric[]>([]);
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'commands'>('overview');

  // Permission checks
  const { checkPermission } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');
  const canSendCommands = checkPermission('send.agent_commands.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load agent details
  const loadAgentDetails = useCallback(async () => {
    if (!canViewAgents) {
      setPermissionDenied({
        show: true,
        action: 'View Agent Details',
        requiredPermission: 'view.agents.enable',
        message: 'You do not have permission to view agent details'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load agent info
      const agentResponse = await agentService.getAgent(agentId);
      if (agentResponse.success && agentResponse.data) {
        setAgent(agentResponse.data);
      }

      // Load metrics history (last 24 hours for charts)
      const metricsResponse = await agentService.getAgentMetricsHistory(agentId, 24);
      if (metricsResponse.success && metricsResponse.data && metricsResponse.data.metrics.length > 0) {
        const rawMetrics = metricsResponse.data.metrics[metricsResponse.data.metrics.length - 1];
        // Ensure numeric fields are properly converted (PostgreSQL may return strings)
        setLatestMetrics({
          ...rawMetrics,
          cpu_percent: Number(rawMetrics.cpu_percent) || 0,
          memory_percent: Number(rawMetrics.memory_percent) || 0,
          disk_percent: Number(rawMetrics.disk_percent) || 0,
          memory_used_gb: rawMetrics.memory_used_gb ? Number(rawMetrics.memory_used_gb) : undefined,
          disk_used_gb: rawMetrics.disk_used_gb ? Number(rawMetrics.disk_used_gb) : undefined,
          network_rx_bytes: rawMetrics.network_rx_bytes ? Number(rawMetrics.network_rx_bytes) : null,
          network_tx_bytes: rawMetrics.network_tx_bytes ? Number(rawMetrics.network_tx_bytes) : null,
        });

        // Store full metrics history for charts
        setMetricsHistory(metricsResponse.data.metrics.map(m => ({
          ...m,
          cpu_percent: Number(m.cpu_percent) || 0,
          memory_percent: Number(m.memory_percent) || 0,
          disk_percent: Number(m.disk_percent) || 0,
          memory_used_gb: m.memory_used_gb ? Number(m.memory_used_gb) : undefined,
          disk_used_gb: m.disk_used_gb ? Number(m.disk_used_gb) : undefined,
          network_rx_bytes: m.network_rx_bytes ? Number(m.network_rx_bytes) : null,
          network_tx_bytes: m.network_tx_bytes ? Number(m.network_tx_bytes) : null,
        })));
      }

      // Load active alerts
      const alertsResponse = await agentService.getAgentAlerts(agentId, { status: 'active' });
      if (alertsResponse.success && alertsResponse.data) {
        setAlerts(alertsResponse.data.alerts);
      }

      // Load recent commands
      const commandsResponse = await agentService.getAgentCommands(agentId);
      if (commandsResponse.success && commandsResponse.data) {
        setCommands(commandsResponse.data.commands);
      }

    } catch (err) {
      console.error('Error loading agent details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agent details');
    } finally {
      setLoading(false);
    }
  }, [agentId, canViewAgents]);

  useEffect(() => {
    loadAgentDetails();
  }, [loadAgentDetails]);

  // Get device icon
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return <Server className="w-8 h-8" />;
      case 'desktop':
      case 'workstation':
        return <Monitor className="w-8 h-8" />;
      case 'laptop':
        return <Laptop className="w-8 h-8" />;
      case 'mobile':
        return <Smartphone className="w-8 h-8" />;
      default:
        return <Monitor className="w-8 h-8" />;
    }
  };

  // Get status display
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'online':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <Circle className="w-4 h-4 fill-current" />,
          label: 'Online'
        };
      case 'offline':
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100 dark:bg-gray-700',
          icon: <Circle className="w-4 h-4 fill-current" />,
          label: 'Offline'
        };
      case 'warning':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <AlertTriangle className="w-4 h-4" />,
          label: 'Warning'
        };
      case 'critical':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <AlertTriangle className="w-4 h-4" />,
          label: 'Critical'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <Circle className="w-4 h-4" />,
          label: 'Unknown'
        };
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';

    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Get metric color based on value
  const getMetricColor = (value: number): string => {
    if (value >= 90) return 'text-red-600';
    if (value >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Extract OS common name from eol_message (e.g., "macOS Sequoia", "Ubuntu 24.04 LTS")
  const getOSCommonName = (): string | null => {
    if (!latestMetrics?.eol_message) return null;

    // Common patterns in EOL messages
    const patterns = [
      /^(macOS [A-Za-z]+)/i,           // "macOS Sequoia"
      /^(Ubuntu \d+\.\d+\s*LTS?)/i,    // "Ubuntu 24.04 LTS"
      /^(Debian \d+ [A-Za-z]+)/i,      // "Debian 12 Bookworm"
      /^(Fedora \d+)/i,                // "Fedora 41"
      /^(Windows \d+ \w+)/i,           // "Windows 11 24H2"
    ];

    for (const pattern of patterns) {
      const match = latestMetrics.eol_message.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20';
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700';
    }
  };

  // Get command status badge
  const getCommandStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20';
      case 'delivered':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700';
    }
  };

  // Handle acknowledge alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const response = await agentService.acknowledgeAlert(agentId, alertId);
      if (response.success) {
        // Reload alerts
        loadAgentDetails();
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  if (!canViewAgents) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className={`mr-4 p-2 rounded-lg ${themeClasses.bg.hover}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Details</h1>
        </div>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            You do not have permission to view agent details
          </p>
        </div>
        <PermissionDeniedModal
          isOpen={permissionDenied.show}
          onClose={() => setPermissionDenied({ show: false })}
          action={permissionDenied.action}
          requiredPermission={permissionDenied.requiredPermission}
          message={permissionDenied.message}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className={`mr-4 p-2 rounded-lg ${themeClasses.bg.hover}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Details</h1>
        </div>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading agent details...</p>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className={`mr-4 p-2 rounded-lg ${themeClasses.bg.hover}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Details</h1>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error || 'Agent not found'}</p>
        </div>
      </div>
    );
  }

  const statusDisplay = getStatusDisplay(agent.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className={`mr-4 p-2 rounded-lg ${themeClasses.bg.hover}`}
            title="Back to agent list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Details</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadAgentDetails}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {canSendCommands ? (
            <button
              onClick={() => onSendCommand?.(agentId)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Send Command
            </button>
          ) : (
            <button
              onClick={() => setPermissionDenied({
                show: true,
                action: 'Send Command',
                requiredPermission: 'send.agent_commands.enable',
                message: 'You do not have permission to send commands'
              })}
              disabled
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
              title="Permission required"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Send Command
            </button>
          )}
        </div>
      </div>

      {/* Agent Info Card */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className={`h-16 w-16 rounded-lg ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color}`}>
              {getDeviceIcon(agent.device_type)}
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {agent.device_name}
              </h2>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                {agent.device_type} • {agent.os_type} {agent.os_version}
                {getOSCommonName() && (
                  <span className={`ml-2 text-xs font-medium ${themeClasses.text.muted}`}>
                    ({getOSCommonName()})
                  </span>
                )}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
            <span className="mr-2">{statusDisplay.icon}</span>
            {statusDisplay.label}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Business</p>
            <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
              {agent.business_name || 'N/A'}
            </p>
          </div>
          <div>
            <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Service Location</p>
            <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
              {agent.location_name || 'N/A'}
            </p>
          </div>
          <div>
            <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Last Seen</p>
            <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
              {formatRelativeTime(agent.last_heartbeat)}
            </p>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {formatTimestamp(agent.last_heartbeat)}
            </p>
          </div>
        </div>
      </div>

      {/* Current Metrics */}
      {latestMetrics && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <TrendingUp className="w-5 h-5 mr-2" />
            Current Performance
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* CPU Usage */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>CPU Usage:</span>
                </div>
                <span className={`${latestMetrics.cpu_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.cpu_percent)}`}>
                  {latestMetrics.cpu_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    latestMetrics.cpu_percent >= 90 ? 'bg-red-600' :
                    latestMetrics.cpu_percent >= 75 ? 'bg-yellow-600' :
                    'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(latestMetrics.cpu_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Memory Usage */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Activity className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Memory Usage:</span>
                </div>
                <span className={`${latestMetrics.memory_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.memory_percent)}`}>
                  {latestMetrics.memory_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    latestMetrics.memory_percent >= 90 ? 'bg-red-600' :
                    latestMetrics.memory_percent >= 75 ? 'bg-yellow-600' :
                    'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(latestMetrics.memory_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Disk Usage */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <HardDrive className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Disk Usage:</span>
                </div>
                <span className={`${latestMetrics.disk_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.disk_percent)}`}>
                  {latestMetrics.disk_percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    latestMetrics.disk_percent >= 90 ? 'bg-red-600' :
                    latestMetrics.disk_percent >= 75 ? 'bg-yellow-600' :
                    'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(latestMetrics.disk_percent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Network Stats */}
          {(latestMetrics.network_rx_bytes !== null || latestMetrics.network_tx_bytes !== null) && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Wifi className={`w-4 h-4 mr-2 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Network</span>
                </div>
                <div className="flex gap-4">
                  {latestMetrics.network_rx_bytes !== null && (
                    <span className={`text-sm ${themeClasses.text.primary}`}>
                      ↓ {(latestMetrics.network_rx_bytes / 1024 / 1024).toFixed(2)} MB/s
                    </span>
                  )}
                  {latestMetrics.network_tx_bytes !== null && (
                    <span className={`text-sm ${themeClasses.text.primary}`}>
                      ↑ {(latestMetrics.network_tx_bytes / 1024 / 1024).toFixed(2)} MB/s
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics History Charts (24 hours) */}
      {metricsHistory.length > 0 && (
        <div className="space-y-6">
          <h3 className={`text-xl font-semibold ${themeClasses.text.primary} flex items-center`}>
            <TrendingUp className="w-6 h-6 mr-2" />
            Metrics Trends (Last 24 Hours)
          </h3>

          {/* CPU Usage Chart */}
          <MetricsChart
            data={metricsHistory.map(m => ({
              timestamp: m.collected_at,
              value: m.cpu_percent
            }))}
            title="CPU Usage"
            dataKey="CPU"
            unit="%"
            color="#3b82f6"
          />

          {/* Memory Usage Chart */}
          <MetricsChart
            data={metricsHistory.map(m => ({
              timestamp: m.collected_at,
              value: m.memory_percent
            }))}
            title="Memory Usage"
            dataKey="Memory"
            unit="%"
            color="#8b5cf6"
          />

          {/* Disk Usage Chart */}
          <MetricsChart
            data={metricsHistory.map(m => ({
              timestamp: m.collected_at,
              value: m.disk_percent
            }))}
            title="Disk Usage"
            dataKey="Disk"
            unit="%"
            color="#f59e0b"
          />
        </div>
      )}

      {/* OS Patch Status */}
      {latestMetrics && latestMetrics.patches_available !== undefined && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Shield className="w-5 h-5 mr-2" />
            OS Patch Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Total Patches */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Updates Available:</span>
                </div>
                <span className={`text-lg font-bold ${
                  latestMetrics.patches_available === 0 ? 'text-green-600' :
                  (latestMetrics.security_patches_available || 0) > 0 ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {latestMetrics.patches_available}
                </span>
              </div>
              {latestMetrics.patches_available === 0 ? (
                <p className={`text-xs ${themeClasses.text.muted}`}>System is up to date</p>
              ) : (
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {latestMetrics.patches_available} update{latestMetrics.patches_available !== 1 ? 's' : ''} available
                </p>
              )}
            </div>

            {/* Security Patches */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Security Updates:</span>
                </div>
                <span className={`text-lg font-bold ${
                  (latestMetrics.security_patches_available || 0) === 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.security_patches_available || 0}
                </span>
              </div>
              {(latestMetrics.security_patches_available || 0) === 0 ? (
                <p className={`text-xs ${themeClasses.text.muted}`}>No security updates pending</p>
              ) : (
                <p className={`text-xs text-red-600`}>
                  {latestMetrics.security_patches_available} security update{latestMetrics.security_patches_available !== 1 ? 's' : ''} required
                </p>
              )}
            </div>

            {/* Reboot Required */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Reboot Status:</span>
                </div>
                <span className={`text-lg font-bold ${
                  latestMetrics.patches_require_reboot ? 'text-red-600' : 'text-green-600'
                }`}>
                  {latestMetrics.patches_require_reboot ? 'Required' : 'Not Required'}
                </span>
              </div>
              {latestMetrics.patches_require_reboot ? (
                <p className={`text-xs text-red-600`}>System restart needed for updates</p>
              ) : (
                <p className={`text-xs ${themeClasses.text.muted}`}>No restart needed</p>
              )}
            </div>
          </div>

          {/* Warning for security patches or reboot */}
          {((latestMetrics.security_patches_available || 0) > 0 || latestMetrics.patches_require_reboot) && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className={`text-sm font-medium text-yellow-800 dark:text-yellow-200`}>
                    {(latestMetrics.security_patches_available || 0) > 0 && latestMetrics.patches_require_reboot
                      ? 'Security updates available and system reboot required'
                      : (latestMetrics.security_patches_available || 0) > 0
                      ? 'Security updates available - please install as soon as possible'
                      : 'System reboot required to complete updates'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Package Manager Status */}
      {latestMetrics && latestMetrics.package_managers_outdated !== undefined && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Download className="w-5 h-5 mr-2" />
            Package Manager Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            {/* Total Outdated */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Outdated:</span>
                </div>
                <span className={`text-lg font-bold ${
                  latestMetrics.package_managers_outdated === 0 ? 'text-green-600' :
                  latestMetrics.package_managers_outdated > 10 ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {latestMetrics.package_managers_outdated}
                </span>
              </div>
              {latestMetrics.package_managers_outdated === 0 ? (
                <p className={`text-xs ${themeClasses.text.muted}`}>All packages are up to date</p>
              ) : (
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {latestMetrics.package_managers_outdated} package{latestMetrics.package_managers_outdated !== 1 ? 's' : ''} outdated
                </p>
              )}
            </div>

            {/* Homebrew */}
            {latestMetrics.homebrew_outdated !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Homebrew:</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    latestMetrics.homebrew_outdated === 0 ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {latestMetrics.homebrew_outdated}
                  </span>
                </div>
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {latestMetrics.homebrew_outdated === 0 ? 'Up to date' : `${latestMetrics.homebrew_outdated} outdated`}
                </p>
              </div>
            )}

            {/* npm */}
            {latestMetrics.npm_outdated !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>npm:</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    latestMetrics.npm_outdated === 0 ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {latestMetrics.npm_outdated}
                  </span>
                </div>
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {latestMetrics.npm_outdated === 0 ? 'Up to date' : `${latestMetrics.npm_outdated} outdated`}
                </p>
              </div>
            )}

            {/* pip */}
            {latestMetrics.pip_outdated !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>pip:</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    latestMetrics.pip_outdated === 0 ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {latestMetrics.pip_outdated}
                  </span>
                </div>
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {latestMetrics.pip_outdated === 0 ? 'Up to date' : `${latestMetrics.pip_outdated} outdated`}
                </p>
              </div>
            )}
          </div>

          {/* Warning for outdated packages */}
          {latestMetrics.package_managers_outdated > 0 && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className={`text-sm font-medium text-blue-800 dark:text-blue-200 mb-2`}>
                    {latestMetrics.package_managers_outdated} outdated package{latestMetrics.package_managers_outdated !== 1 ? 's' : ''} detected
                  </p>
                  {latestMetrics.outdated_packages_data && Array.isArray(latestMetrics.outdated_packages_data) && latestMetrics.outdated_packages_data.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-blue-200 dark:border-blue-700">
                            <th className="text-left py-1 px-2 font-semibold">Package</th>
                            <th className="text-left py-1 px-2 font-semibold">Installed</th>
                            <th className="text-left py-1 px-2 font-semibold">Latest</th>
                            <th className="text-left py-1 px-2 font-semibold">Manager</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestMetrics.outdated_packages_data.slice(0, 10).map((pkg: any, idx: number) => (
                            <tr key={idx} className="border-b border-blue-100 dark:border-blue-800/50">
                              <td className="py-1 px-2">{pkg.name}</td>
                              <td className="py-1 px-2 text-red-600 dark:text-red-400">{pkg.installed_version}</td>
                              <td className="py-1 px-2 text-green-600 dark:text-green-400">{pkg.latest_version}</td>
                              <td className="py-1 px-2">{pkg.package_manager}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {latestMetrics.outdated_packages_data.length > 10 && (
                        <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                          ...and {latestMetrics.outdated_packages_data.length - 10} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OS End-of-Life Status */}
      {latestMetrics && latestMetrics.eol_status && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Calendar className="w-5 h-5 mr-2" />
            OS End-of-Life Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* EOL Status */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Support Status:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.eol_status === 'active' ? 'text-green-600' :
                  latestMetrics.eol_status === 'approaching_eol' ? 'text-yellow-600' :
                  latestMetrics.eol_status === 'eol' || latestMetrics.eol_status === 'security_only' ? 'text-orange-600' :
                  latestMetrics.eol_status === 'unsupported' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {latestMetrics.eol_status === 'active' ? 'Active' :
                   latestMetrics.eol_status === 'approaching_eol' ? 'Approaching EOL' :
                   latestMetrics.eol_status === 'eol' ? 'EOL' :
                   latestMetrics.eol_status === 'security_only' ? 'Security Only' :
                   latestMetrics.eol_status === 'unsupported' ? 'Unsupported' :
                   'Unknown'}
                </span>
              </div>
            </div>

            {/* Security Updates End */}
            {latestMetrics.days_until_sec_eol !== null && latestMetrics.days_until_sec_eol !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Security Updates:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.days_until_sec_eol < 0 ? 'text-red-600' :
                    latestMetrics.days_until_sec_eol <= 180 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {latestMetrics.days_until_sec_eol < 0 ? 'Ended' :
                     `${latestMetrics.days_until_sec_eol} days`}
                  </span>
                </div>
                {latestMetrics.security_eol_date && (
                  <p className={`text-xs ${themeClasses.text.muted}`}>
                    {latestMetrics.days_until_sec_eol < 0 ? 'Ended: ' : 'Ends: '}
                    {new Date(latestMetrics.security_eol_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Full EOL Date */}
            {latestMetrics.days_until_eol !== null && latestMetrics.days_until_eol !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Full EOL:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.days_until_eol < 0 ? 'text-red-600' :
                    latestMetrics.days_until_eol <= 180 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {latestMetrics.days_until_eol < 0 ? 'Past EOL' :
                     `${latestMetrics.days_until_eol} days`}
                  </span>
                </div>
                {latestMetrics.eol_date && (
                  <p className={`text-xs ${themeClasses.text.muted}`}>
                    {latestMetrics.days_until_eol < 0 ? 'EOL Date: ' : 'EOL Date: '}
                    {new Date(latestMetrics.eol_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* EOL Message/Warning */}
          {latestMetrics.eol_message && (
            <div className={`mt-4 p-3 rounded-lg ${
              latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ?
                'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
              latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only' ?
                'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
                'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            }`}>
              <div className="flex items-start">
                {(latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' || latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only') ? (
                  <AlertTriangle className={`w-5 h-5 mr-2 flex-shrink-0 mt-0.5 ${
                    latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ? 'text-red-600' : 'text-yellow-600'
                  }`} />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ?
                      'text-red-800 dark:text-red-200' :
                    latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only' ?
                      'text-yellow-800 dark:text-yellow-200' :
                      'text-green-800 dark:text-green-200'
                  }`}>
                    {latestMetrics.eol_message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Service Monitoring */}
      {latestMetrics && latestMetrics.services_monitored !== null && latestMetrics.services_monitored !== undefined && latestMetrics.services_monitored > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Activity className="w-5 h-5 mr-2" />
            Service & Process Monitoring
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            {/* Services Monitored */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Services Monitored:</span>
                <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                  {latestMetrics.services_monitored}
                </span>
              </div>
            </div>

            {/* Services Running */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Running:</span>
                <span className={`text-lg font-bold text-green-600`}>
                  {latestMetrics.services_running}
                </span>
              </div>
            </div>

            {/* Services Failed */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failed/Stopped:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.services_failed > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {latestMetrics.services_failed}
                </span>
              </div>
              {latestMetrics.services_failed > 0 && (
                <p className={`text-xs text-red-600`}>
                  {latestMetrics.services_failed} service{latestMetrics.services_failed !== 1 ? 's' : ''} require attention
                </p>
              )}
            </div>
          </div>

          {/* Service List */}
          {latestMetrics.services_data && Array.isArray(latestMetrics.services_data) && latestMetrics.services_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Service Status
              </h4>
              {latestMetrics.services_data.map((service, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    service.status === 'failed' || service.status === 'stopped'
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : service.status === 'running'
                      ? `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <Circle className={`w-3 h-3 mr-2 ${
                        service.status === 'running' ? 'text-green-600 fill-current' :
                        service.status === 'stopped' ? 'text-gray-600 fill-current' :
                        service.status === 'failed' ? 'text-red-600 fill-current' :
                        'text-gray-400 fill-current'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                            {service.display_name}
                            {service.description && (
                              <span className={`ml-2 font-normal ${themeClasses.text.secondary}`}>
                                - {service.description}
                              </span>
                            )}
                          </p>
                          {service.why_stopped_help && (service.status === 'stopped' || service.status === 'failed') && (
                            <div className="relative group">
                              <Info className={`w-4 h-4 ${themeClasses.text.tertiary} cursor-help`} />
                              <div className="absolute left-0 top-6 w-80 p-3 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                                <p className="font-semibold mb-1">Why is this stopped?</p>
                                <p>{service.why_stopped_help}</p>
                                <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-800 transform rotate-45"></div>
                              </div>
                            </div>
                          )}
                        </div>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          {service.name}
                          {service.pid && ` • PID: ${service.pid}`}
                          {service.memory_mb && ` • ${service.memory_mb.toFixed(1)} MB`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {service.enabled && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                          Auto-start
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        service.status === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                        service.status === 'stopped' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700' :
                        service.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/20' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700'
                      }`}>
                        {service.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warning for failed services */}
          {latestMetrics.services_failed > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {latestMetrics.services_failed} critical service{latestMetrics.services_failed !== 1 ? 's are' : ' is'} not running
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    Review failed services and restart them to ensure system stability
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* System Uptime & Reboot History */}
      {latestMetrics && latestMetrics.system_uptime_seconds !== null && latestMetrics.system_uptime_seconds !== undefined && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Clock className="w-5 h-5 mr-2" />
            System Uptime & Reboot History
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Uptime Duration */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Current Uptime</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.system_uptime_seconds > 7776000 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {(latestMetrics.system_uptime_seconds / 86400).toFixed(1)} days
                </span>
              </div>
              {latestMetrics.system_uptime_seconds > 7776000 && (
                <p className={`text-xs text-yellow-600`}>
                  Uptime exceeds 90 days - reboot recommended
                </p>
              )}
            </div>

            {/* Last Boot Time */}
            {latestMetrics.last_boot_time && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Last Boot</span>
                  <span className={`text-sm font-bold ${themeClasses.text.primary}`}>
                    {formatRelativeTime(latestMetrics.last_boot_time)}
                  </span>
                </div>
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  {new Date(latestMetrics.last_boot_time).toLocaleString()}
                </p>
              </div>
            )}

            {/* Unexpected Reboot */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Last Reboot Status</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.unexpected_reboot ? 'text-red-600' : 'text-green-600'
                }`}>
                  {latestMetrics.unexpected_reboot ? 'Unexpected' : 'Normal'}
                </span>
              </div>
              {latestMetrics.unexpected_reboot ? (
                <p className={`text-xs text-red-600`}>
                  Last reboot was unexpected (crash/panic detected)
                </p>
              ) : (
                <p className={`text-xs ${themeClasses.text.muted}`}>
                  System shutdown was clean
                </p>
              )}
            </div>
          </div>

          {/* Warning for high uptime or unexpected reboot */}
          {(latestMetrics.system_uptime_seconds > 7776000 || latestMetrics.unexpected_reboot) && (
            <div className={`mt-4 p-3 rounded-lg ${
              latestMetrics.unexpected_reboot ?
                'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
            }`}>
              <div className="flex items-start">
                <AlertTriangle className={`w-5 h-5 mr-2 flex-shrink-0 mt-0.5 ${
                  latestMetrics.unexpected_reboot ? 'text-red-600' : 'text-yellow-600'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    latestMetrics.unexpected_reboot ?
                      'text-red-800 dark:text-red-200' :
                      'text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {latestMetrics.unexpected_reboot && latestMetrics.system_uptime_seconds > 7776000
                      ? 'System experienced unexpected reboot and uptime exceeds 90 days'
                      : latestMetrics.unexpected_reboot
                      ? 'System experienced unexpected reboot (kernel panic, crash, or power loss detected)'
                      : 'System uptime exceeds 90 days - reboot recommended to apply pending patches'}
                  </p>
                  {latestMetrics.unexpected_reboot && (
                    <p className={`text-xs mt-1 ${
                      latestMetrics.unexpected_reboot ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'
                    }`}>
                      Check system logs to identify the cause of the unexpected shutdown
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Network Device Monitoring */}
      {latestMetrics && latestMetrics.network_devices_monitored !== null && latestMetrics.network_devices_monitored !== undefined && latestMetrics.network_devices_monitored > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Wifi className="w-5 h-5 mr-2" />
            Network Device Monitoring
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            {/* Devices Monitored */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Devices Monitored:</span>
                <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                  {latestMetrics.network_devices_monitored}
                </span>
              </div>
            </div>

            {/* Devices Online */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Online:</span>
                <span className={`text-lg font-bold text-green-600`}>
                  {latestMetrics.network_devices_online}
                </span>
              </div>
            </div>

            {/* Devices Offline */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Offline:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.network_devices_offline > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {latestMetrics.network_devices_offline}
                </span>
              </div>
              {latestMetrics.network_devices_offline > 0 && (
                <p className={`text-xs text-red-600`}>
                  {latestMetrics.network_devices_offline} device{latestMetrics.network_devices_offline !== 1 ? 's' : ''} unreachable
                </p>
              )}
            </div>
          </div>

          {/* Device List */}
          {latestMetrics.network_devices_data && Array.isArray(latestMetrics.network_devices_data) && latestMetrics.network_devices_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Device Status
              </h4>
              {latestMetrics.network_devices_data.map((device, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    !device.reachable
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : device.response_time_ms && device.response_time_ms > 1000
                      ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <Circle className={`w-3 h-3 mr-2 ${
                        device.reachable ? 'text-green-600 fill-current' : 'text-red-600 fill-current'
                      }`} />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {device.name}
                        </p>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          {device.device_type} • {device.ip_address}
                          {device.port && device.port > 0 && `:${device.port}`}
                          {device.response_time_ms !== null && device.response_time_ms !== undefined && (
                            <span className={`ml-2 ${
                              device.response_time_ms > 1000 ? 'text-yellow-600' : ''
                            }`}>
                              • {device.response_time_ms}ms
                            </span>
                          )}
                        </p>
                        {device.error && (
                          <p className={`text-xs text-red-600 mt-1`}>
                            Error: {device.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        device.reachable
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20'
                      }`}>
                        {device.reachable ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded text-xs">
                        {device.protocol.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warning for offline devices */}
          {latestMetrics.network_devices_offline > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {latestMetrics.network_devices_offline} network device{latestMetrics.network_devices_offline !== 1 ? 's are' : ' is'} offline
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    Check device power, network connectivity, and IP configuration
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backup Status Monitoring */}
      {latestMetrics && latestMetrics.backups_detected !== null && latestMetrics.backups_detected !== undefined && latestMetrics.backups_detected > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <HardDrive className="w-5 h-5 mr-2" />
            Backup Status (Auto-Discovery)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            {/* Backups Detected */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Detected:</span>
                <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                  {latestMetrics.backups_detected}
                </span>
              </div>
              <p className={`text-xs ${themeClasses.text.muted}`}>
                Backup solutions found
              </p>
            </div>

            {/* Backups Running */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Running:</span>
                <span className={`text-lg font-bold text-green-600`}>
                  {latestMetrics.backups_running}
                </span>
              </div>
              <p className={`text-xs ${themeClasses.text.muted}`}>
                Active backup services
              </p>
            </div>

            {/* Backups with Issues */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Issues:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.backups_with_issues > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {latestMetrics.backups_with_issues}
                </span>
              </div>
              {latestMetrics.backups_with_issues > 0 && (
                <p className={`text-xs text-red-600`}>
                  {latestMetrics.backups_with_issues} backup{latestMetrics.backups_with_issues !== 1 ? 's' : ''} with problems
                </p>
              )}
            </div>
          </div>

          {/* Backup List */}
          {latestMetrics.backup_data && Array.isArray(latestMetrics.backup_data) && latestMetrics.backup_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Detected Backup Solutions
              </h4>
              {latestMetrics.backup_data.map((backup, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    !backup.is_enabled || backup.status === 'disabled' || backup.status === 'stopped'
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : backup.error_message
                      ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <Circle className={`w-3 h-3 mr-2 ${
                        backup.is_running ? 'text-green-600 fill-current' :
                        backup.is_enabled ? 'text-yellow-600 fill-current' :
                        'text-red-600 fill-current'
                      }`} />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {backup.name}
                        </p>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          {backup.backup_type} • {backup.detection_method}
                          {backup.last_backup_time && (
                            <span>
                              {' '}• Last backup: {formatRelativeTime(backup.last_backup_time)}
                            </span>
                          )}
                        </p>
                        {backup.error_message && (
                          <p className={`text-xs ${
                            backup.status === 'disabled' || backup.status === 'stopped' ? 'text-red-600' : 'text-yellow-600'
                          } mt-1`}>
                            {backup.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {backup.is_enabled && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                          Enabled
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        backup.is_running ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                        backup.status === 'idle' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20' :
                        backup.status === 'stopped' || backup.status === 'disabled' ? 'bg-red-100 text-red-800 dark:bg-red-900/20' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700'
                      }`}>
                        {backup.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info banner about auto-discovery mode */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Auto-Discovery Mode
                </p>
                <p className="text-xs mt-1 text-blue-700 dark:text-blue-300">
                  Backup solutions are auto-detected. For detailed monitoring (schedules, logs, retention policies), configuration will be needed.
                </p>
              </div>
            </div>
          </div>

          {/* Warning for stopped/disabled backups */}
          {latestMetrics.backups_with_issues > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {latestMetrics.backups_with_issues} backup solution{latestMetrics.backups_with_issues !== 1 ? 's have' : ' has'} issues
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    Review backup services and ensure they are enabled and running
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Status Monitoring */}
      {latestMetrics && latestMetrics.security_products_count !== null && latestMetrics.security_products_count !== undefined && latestMetrics.security_products_count > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Shield className="w-5 h-5 mr-2" />
            Security & Antivirus Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
            {/* Antivirus Installed */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Antivirus:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.antivirus_installed ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.antivirus_installed ? 'Installed' : 'Missing'}
                </span>
              </div>
              {!latestMetrics.antivirus_installed && (
                <p className={`text-xs text-red-600`}>
                  No antivirus detected!
                </p>
              )}
            </div>

            {/* Antivirus Enabled */}
            {latestMetrics.antivirus_installed && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>AV Protection:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.antivirus_enabled ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {latestMetrics.antivirus_enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {!latestMetrics.antivirus_enabled && (
                  <p className={`text-xs text-red-600`}>
                    Antivirus is not running
                  </p>
                )}
              </div>
            )}

            {/* Definitions Up to Date */}
            {latestMetrics.antivirus_enabled && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Definitions:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.antivirus_up_to_date ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {latestMetrics.antivirus_up_to_date ? 'Current' : 'Outdated'}
                  </span>
                </div>
                {!latestMetrics.antivirus_up_to_date && (
                  <p className={`text-xs text-red-600`}>
                    Update virus definitions
                  </p>
                )}
              </div>
            )}

            {/* Firewall Status */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Firewall:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.firewall_enabled ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.firewall_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {!latestMetrics.firewall_enabled && (
                <p className={`text-xs text-red-600`}>
                  Firewall is not active
                </p>
              )}
            </div>
          </div>

          {/* Security Products List */}
          {latestMetrics.security_data && Array.isArray(latestMetrics.security_data) && latestMetrics.security_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Detected Security Products ({latestMetrics.security_products_count})
              </h4>
              {latestMetrics.security_data.map((product, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    !product.is_enabled || product.error_message
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : product.product_type === 'antivirus' && !product.definitions_up_to_date
                      ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <Circle className={`w-3 h-3 mr-2 ${
                        product.is_running && product.is_enabled ? 'text-green-600 fill-current' :
                        product.is_enabled ? 'text-yellow-600 fill-current' :
                        'text-red-600 fill-current'
                      }`} />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {product.name}
                          {product.vendor && product.vendor !== product.name && (
                            <span className={`text-xs ${themeClasses.text.muted} ml-2`}>
                              ({product.vendor})
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          {product.product_type}
                          {product.version && ` • v${product.version}`}
                          {product.detection_method && ` • ${product.detection_method}`}
                        </p>
                        {product.error_message && (
                          <p className={`text-xs ${
                            !product.is_enabled ? 'text-red-600' : 'text-yellow-600'
                          } mt-1`}>
                            {product.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {product.is_enabled && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                          Enabled
                        </span>
                      )}
                      {product.product_type === 'antivirus' && product.real_time_protection && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 rounded text-xs">
                          Real-Time
                        </span>
                      )}
                      {product.product_type === 'antivirus' && !product.definitions_up_to_date && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 rounded text-xs">
                          Outdated
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        product.is_running ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                        product.is_enabled ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20' :
                        'bg-red-100 text-red-800 dark:bg-red-900/20'
                      }`}>
                        {product.is_running ? 'RUNNING' : product.is_enabled ? 'STOPPED' : 'DISABLED'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Critical Security Warnings */}
          {latestMetrics.security_issues_count > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {latestMetrics.security_issues_count} security issue{latestMetrics.security_issues_count !== 1 ? 's' : ''} detected
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    {!latestMetrics.antivirus_installed && 'No antivirus software installed. '}
                    {latestMetrics.antivirus_installed && !latestMetrics.antivirus_enabled && 'Antivirus is disabled. '}
                    {latestMetrics.antivirus_enabled && !latestMetrics.antivirus_up_to_date && 'Antivirus definitions are out of date. '}
                    {!latestMetrics.firewall_enabled && 'Firewall is disabled. '}
                    Address these security concerns immediately to protect the system.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Failed Login Attempts */}
      {latestMetrics && latestMetrics.failed_login_last_24h !== null && latestMetrics.failed_login_last_24h !== undefined && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <AlertOctagon className="w-5 h-5 mr-2" />
            Failed Login Attempts
          </h3>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            {/* Last 24h Attempts */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Last 24 Hours:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.failed_login_last_24h === 0 ? 'text-green-600' :
                  latestMetrics.failed_login_last_24h < 10 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {latestMetrics.failed_login_last_24h}
                </span>
              </div>
              {latestMetrics.failed_login_last_24h > 0 && (
                <p className={`text-xs ${
                  latestMetrics.failed_login_last_24h < 10 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {latestMetrics.failed_login_last_24h < 10 ? 'Some attempts detected' : 'High attack activity!'}
                </p>
              )}
              {latestMetrics.failed_login_last_24h === 0 && (
                <p className="text-xs text-green-600">
                  No attempts detected
                </p>
              )}
            </div>

            {/* Total Attempts */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Attempts:</span>
                <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                  {latestMetrics.failed_login_attempts || 0}
                </span>
              </div>
              <p className={`text-xs ${themeClasses.text.muted}`}>
                Since monitoring started
              </p>
            </div>

            {/* Unique Attackers */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Unique IPs:</span>
                <span className={`text-lg font-bold ${
                  (latestMetrics.unique_attacking_ips || 0) === 0 ? 'text-green-600' :
                  (latestMetrics.unique_attacking_ips || 0) < 5 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {latestMetrics.unique_attacking_ips || 0}
                </span>
              </div>
              <p className={`text-xs ${themeClasses.text.muted}`}>
                Different attacking IPs
              </p>
            </div>
          </div>

          {/* Detailed Attack List */}
          {latestMetrics.failed_login_data && Array.isArray(latestMetrics.failed_login_data) && latestMetrics.failed_login_data.length > 0 && (
            <div className="space-y-3">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Attack Details ({latestMetrics.failed_login_data.length} unique attempts)
              </h4>
              {latestMetrics.failed_login_data
                .sort((a, b) => b.count - a.count) // Sort by count descending
                .slice(0, 10) // Show top 10
                .map((attempt, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    attempt.count >= 10
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : attempt.count >= 5
                      ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <AlertTriangle className={`w-4 h-4 mr-2 ${
                          attempt.count >= 10 ? 'text-red-600' :
                          attempt.count >= 5 ? 'text-yellow-600' :
                          'text-gray-600'
                        }`} />
                        <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {attempt.ip}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className={themeClasses.text.muted}>Username:</span>{' '}
                          <span className={`${themeClasses.text.secondary} font-medium`}>{attempt.username}</span>
                        </div>
                        <div>
                          <span className={themeClasses.text.muted}>Method:</span>{' '}
                          <span className={`${themeClasses.text.secondary} font-medium uppercase`}>{attempt.method}</span>
                        </div>
                        <div>
                          <span className={themeClasses.text.muted}>Attempts:</span>{' '}
                          <span className={`font-bold ${
                            attempt.count >= 10 ? 'text-red-600' :
                            attempt.count >= 5 ? 'text-yellow-600' :
                            themeClasses.text.secondary
                          }`}>{attempt.count}</span>
                        </div>
                        <div>
                          <span className={themeClasses.text.muted}>Last Seen:</span>{' '}
                          <span className={themeClasses.text.secondary}>
                            {new Date(attempt.last_attempt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {attempt.error_message && (
                        <p className={`text-xs ${themeClasses.text.muted} mt-2`}>
                          {attempt.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {latestMetrics.failed_login_data.length > 10 && (
                <p className={`text-xs ${themeClasses.text.muted} text-center mt-3`}>
                  Showing top 10 of {latestMetrics.failed_login_data.length} total attempts
                </p>
              )}
            </div>
          )}

          {/* Security Alert */}
          {latestMetrics.failed_login_last_24h > 10 && (
            <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertOctagon className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    High Security Alert: {latestMetrics.failed_login_last_24h} failed login attempts in 24 hours
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    This system may be under attack. Consider implementing IP blocking, fail2ban, or reviewing firewall rules.
                    {latestMetrics.unique_attacking_ips && latestMetrics.unique_attacking_ips > 5 && (
                      <span> Multiple attacking IPs detected - potential distributed attack.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Network Connectivity Status */}
      {latestMetrics && (latestMetrics.internet_connected !== undefined || latestMetrics.connectivity_issues_count !== undefined) && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Wifi className="w-5 h-5 mr-2" />
            Network Connectivity & Latency
          </h3>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
            {/* Internet Connection */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Internet:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.internet_connected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.internet_connected ? 'Connected' : 'Offline'}
                </span>
              </div>
              {!latestMetrics.internet_connected && (
                <p className="text-xs text-red-600">
                  No internet connectivity
                </p>
              )}
            </div>

            {/* Gateway Reachability */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Gateway:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.gateway_reachable ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.gateway_reachable ? 'Reachable' : 'Unreachable'}
                </span>
              </div>
              {!latestMetrics.gateway_reachable && (
                <p className="text-xs text-red-600">
                  Router not accessible
                </p>
              )}
            </div>

            {/* DNS Status */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>DNS:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.dns_working ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestMetrics.dns_working ? 'Working' : 'Failed'}
                </span>
              </div>
              {!latestMetrics.dns_working && (
                <p className="text-xs text-red-600">
                  DNS resolution failed
                </p>
              )}
            </div>

            {/* Average Latency */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Avg Latency:</span>
                <span className={`text-lg font-bold ${
                  !latestMetrics.avg_latency_ms ? themeClasses.text.muted :
                  latestMetrics.avg_latency_ms < 50 ? 'text-green-600' :
                  latestMetrics.avg_latency_ms < 200 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {latestMetrics.avg_latency_ms || 'N/A'}{latestMetrics.avg_latency_ms ? 'ms' : ''}
                </span>
              </div>
              {latestMetrics.avg_latency_ms && latestMetrics.avg_latency_ms > 200 && (
                <p className="text-xs text-red-600">
                  High latency detected
                </p>
              )}
            </div>
          </div>

          {/* Additional Metrics */}
          {latestMetrics.packet_loss_percent !== null && latestMetrics.packet_loss_percent !== undefined && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Packet Loss</span>
                <span className={`${Number(latestMetrics.packet_loss_percent) >= 5 ? 'text-lg' : 'text-sm'} font-bold ${
                  latestMetrics.packet_loss_percent === 0 ? 'text-green-600' :
                  latestMetrics.packet_loss_percent < 5 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {Number(latestMetrics.packet_loss_percent).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    latestMetrics.packet_loss_percent === 0 ? 'bg-green-600' :
                    latestMetrics.packet_loss_percent < 5 ? 'bg-yellow-600' :
                    'bg-red-600'
                  }`}
                  style={{ width: `${Math.min(100, latestMetrics.packet_loss_percent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Connectivity Test Details */}
          {latestMetrics.connectivity_data && Array.isArray(latestMetrics.connectivity_data) && latestMetrics.connectivity_data.length > 0 && (
            <div className="space-y-3">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Test Results ({latestMetrics.connectivity_data.length} tests)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {latestMetrics.connectivity_data.map((test, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      !test.reachable
                        ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                        : test.latency_ms && test.latency_ms > 200
                        ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                        : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Circle className={`w-3 h-3 mr-2 ${
                          test.reachable ? 'text-green-600 fill-green-600' : 'text-red-600 fill-red-600'
                        }`} />
                        <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {test.endpoint}
                        </span>
                      </div>
                      {test.latency_ms !== null && test.latency_ms !== undefined && (
                        <span className={`text-xs font-mono ${
                          test.latency_ms < 50 ? 'text-green-600' :
                          test.latency_ms < 200 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {test.latency_ms}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={themeClasses.text.muted}>
                        {test.test_type.toUpperCase()}
                        {test.dns_resolved && test.resolved_ip && ` • ${test.resolved_ip}`}
                      </span>
                      {test.packet_loss !== null && test.packet_loss !== undefined && test.packet_loss > 0 && (
                        <span className="text-red-600 font-medium">
                          {test.packet_loss.toFixed(0)}% loss
                        </span>
                      )}
                    </div>
                    {test.error_message && (
                      <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                        {test.error_message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connectivity Issues Alert */}
          {latestMetrics.connectivity_issues_count !== undefined && latestMetrics.connectivity_issues_count > 0 && (
            <div className="mt-6 p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {latestMetrics.connectivity_issues_count} connectivity issue{latestMetrics.connectivity_issues_count !== 1 ? 's' : ''} detected
                  </p>
                  <p className="text-xs mt-1 text-yellow-700 dark:text-yellow-300">
                    {!latestMetrics.internet_connected && 'No internet connectivity. '}
                    {!latestMetrics.gateway_reachable && 'Gateway unreachable. '}
                    {!latestMetrics.dns_working && 'DNS not working. '}
                    {latestMetrics.packet_loss_percent && Number(latestMetrics.packet_loss_percent) > 10 && `High packet loss (${Number(latestMetrics.packet_loss_percent).toFixed(1)}%). `}
                    {latestMetrics.avg_latency_ms && latestMetrics.avg_latency_ms > 200 && `High latency (${latestMetrics.avg_latency_ms}ms). `}
                    Check network configuration and connectivity.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hardware Temperature & Sensors */}
      {latestMetrics && (latestMetrics.highest_temperature_c !== undefined || latestMetrics.sensor_data) && (() => {
        // Filter out "systeminfo" placeholder sensor
        const realSensors = latestMetrics.sensor_data?.filter(s => s.sensor_type !== 'info') || [];
        const hasSensorData = latestMetrics.highest_temperature_c > 0 || realSensors.length > 0;

        return (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Thermometer className="w-5 h-5 mr-2" />
            Hardware Temperature & Sensors
          </h3>

          {!hasSensorData ? (
            <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
              <Thermometer className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Sensor Data Unavailable
              </p>
              <p className={`text-xs ${themeClasses.text.tertiary}`}>
                This system does not expose hardware temperature sensors to the monitoring agent.
                {agent.os_type === 'darwin' && ' macOS requires elevated permissions or specialized tools for sensor access.'}
                {agent.os_type === 'windows' && ' Install OpenHardwareMonitor for sensor monitoring.'}
                {agent.os_type === 'linux' && ' Install lm-sensors for detailed temperature monitoring.'}
              </p>
            </div>
          ) : (
            <>
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
            {/* Highest Temperature */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Highest Temp:</span>
                <span className={`text-lg font-bold ${
                  (latestMetrics.highest_temperature_c || 0) > 90 ? 'text-red-600' :
                  (latestMetrics.highest_temperature_c || 0) > 80 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {latestMetrics.highest_temperature_c || 0}°C
                </span>
              </div>
              {latestMetrics.highest_temperature_c && latestMetrics.highest_temperature_c > 80 && (
                <p className={`text-xs ${
                  latestMetrics.highest_temperature_c > 90 ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {latestMetrics.highest_temperature_c > 90 ? 'Critical temperature!' : 'High temperature warning'}
                </p>
              )}
            </div>

            {/* CPU Temperature */}
            {latestMetrics.cpu_temperature_c !== null && latestMetrics.cpu_temperature_c !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>CPU Temp:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.cpu_temperature_c > 90 ? 'text-red-600' :
                    latestMetrics.cpu_temperature_c > 80 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {latestMetrics.cpu_temperature_c}°C
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Processor temperature
                </p>
              </div>
            )}

            {/* GPU Temperature */}
            {latestMetrics.gpu_temperature_c !== null && latestMetrics.gpu_temperature_c !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>GPU Temp:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.gpu_temperature_c > 90 ? 'text-red-600' :
                    latestMetrics.gpu_temperature_c > 80 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {latestMetrics.gpu_temperature_c}°C
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Graphics card temperature
                </p>
              </div>
            )}

            {/* Critical Sensors Count */}
            {latestMetrics.temperature_critical_count !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Critical Sensors:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.temperature_critical_count > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {latestMetrics.temperature_critical_count}
                  </span>
                </div>
                {latestMetrics.temperature_critical_count > 0 ? (
                  <p className="text-xs text-red-600">
                    {latestMetrics.temperature_critical_count} sensor{latestMetrics.temperature_critical_count !== 1 ? 's' : ''} above 90°C
                  </p>
                ) : (
                  <p className="text-xs text-green-600">
                    All sensors normal
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Fan Status */}
          {latestMetrics.fan_count !== undefined && latestMetrics.fan_count > 0 && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Fan Status ({latestMetrics.fan_count} detected)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Fans:</span>
                  <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                    {latestMetrics.fan_count}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failed:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.fan_failure_count && latestMetrics.fan_failure_count > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {latestMetrics.fan_failure_count || 0}
                  </span>
                </div>
                {latestMetrics.fan_speeds_rpm && latestMetrics.fan_speeds_rpm.length > 0 && (
                  <div>
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Speeds: </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {latestMetrics.fan_speeds_rpm.map((rpm, idx) => (
                        <span key={idx} className={rpm < 100 ? 'text-red-600' : ''}>
                          {rpm} RPM{idx < latestMetrics.fan_speeds_rpm!.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Sensor List */}
          {latestMetrics.sensor_data && Array.isArray(latestMetrics.sensor_data) && latestMetrics.sensor_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                All Sensors ({latestMetrics.sensor_data.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {latestMetrics.sensor_data
                  .sort((a, b) => {
                    // Sort: critical first, then by type, then by value descending
                    if (a.critical !== b.critical) return a.critical ? -1 : 1;
                    if (a.sensor_type !== b.sensor_type) return a.sensor_type.localeCompare(b.sensor_type);
                    return b.value - a.value;
                  })
                  .map((sensor, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        sensor.critical
                          ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                          : sensor.sensor_type === 'temperature' && sensor.value > 80
                          ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                          : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {sensor.sensor_name}
                            </span>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {sensor.sensor_type}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${
                            sensor.critical ? 'text-red-600' :
                            sensor.sensor_type === 'temperature' && sensor.value > 80 ? 'text-yellow-600' :
                            sensor.sensor_type === 'fan' && sensor.value < 100 ? 'text-red-600' :
                            'text-green-600'
                          }`}>
                            {sensor.value.toFixed(sensor.sensor_type === 'temperature' ? 0 : 0)} {sensor.unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Temperature Alert */}
          {latestMetrics.temperature_critical_count && latestMetrics.temperature_critical_count > 0 && (
            <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Critical Temperature Alert: {latestMetrics.temperature_critical_count} sensor{latestMetrics.temperature_critical_count !== 1 ? 's' : ''} above 90°C
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    System may be overheating. Check cooling system, clean dust filters, verify fans are working, and ensure proper ventilation.
                    {latestMetrics.fan_failure_count && latestMetrics.fan_failure_count > 0 && (
                      <span> {latestMetrics.fan_failure_count} fan(s) have failed!</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
        );
      })()}

      {/* System Event Logs */}
      {latestMetrics && (latestMetrics.critical_events_count || 0) + (latestMetrics.error_events_count || 0) > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <FileWarning className="w-5 h-5 mr-2" />
            System Event Logs (Last 24h)
          </h3>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className={`text-2xl font-bold ${(latestMetrics.critical_events_count || 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                {latestMetrics.critical_events_count || 0}
              </div>
              <div className={`text-sm ${themeClasses.text.tertiary}`}>Critical Events</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${(latestMetrics.error_events_count || 0) > 0 ? 'text-orange-500' : 'text-gray-500'}`}>
                {latestMetrics.error_events_count || 0}
              </div>
              <div className={`text-sm ${themeClasses.text.tertiary}`}>Error Events</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${(latestMetrics.warning_events_count || 0) > 0 ? 'text-yellow-500' : 'text-gray-500'}`}>
                {latestMetrics.warning_events_count || 0}
              </div>
              <div className={`text-sm ${themeClasses.text.tertiary}`}>Warning Events</div>
            </div>
          </div>

          {/* Last Critical Event */}
          {latestMetrics.last_critical_event && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-900 dark:text-red-100">
                    Last Critical Event
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {latestMetrics.last_critical_event_message}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {formatDistanceToNow(new Date(latestMetrics.last_critical_event), { addSuffix: true })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Event List */}
          {latestMetrics.event_logs_data && latestMetrics.event_logs_data.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {latestMetrics.event_logs_data
                .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
                .slice(0, 20)
                .map((event, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border ${
                      event.event_level === 'critical'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200'
                        : event.event_level === 'error'
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            event.event_level === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : event.event_level === 'error'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {event.event_level.toUpperCase()}
                          </span>
                          <span className={`text-xs ${themeClasses.text.tertiary}`}>
                            {event.event_source}
                          </span>
                          {event.event_id && (
                            <span className={`text-xs ${themeClasses.text.tertiary}`}>
                              ID: {event.event_id}
                            </span>
                          )}
                        </div>
                        <div className={`text-sm mt-1 ${themeClasses.text.primary}`}>
                          {event.event_message}
                        </div>
                        <div className={`text-xs mt-1 ${themeClasses.text.tertiary}`}>
                          {formatDistanceToNow(new Date(event.event_time), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* No Events Message */}
          {(!latestMetrics.event_logs_data || latestMetrics.event_logs_data.length === 0) && (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                No critical errors or warnings in system event logs
              </p>
            </div>
          )}
        </div>
      )}

      {/* Disk Health Status */}
      {latestMetrics && latestMetrics.disk_health_status && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
            <Disc className="w-5 h-5 mr-2" />
            Disk Health & SMART Status
          </h3>

          {/* Overall Health Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            {/* Overall Status */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Overall Status:</span>
                <span className={`text-lg font-bold ${
                  latestMetrics.disk_health_status === 'healthy' ? 'text-green-600' :
                  latestMetrics.disk_health_status === 'warning' ? 'text-yellow-600' :
                  latestMetrics.disk_health_status === 'critical' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {latestMetrics.disk_health_status === 'healthy' ? 'Healthy' :
                   latestMetrics.disk_health_status === 'warning' ? 'Warning' :
                   latestMetrics.disk_health_status === 'critical' ? 'Critical' :
                   'Unknown'}
                </span>
              </div>
            </div>

            {/* Max Temperature */}
            {latestMetrics.disk_temperature_max !== null && latestMetrics.disk_temperature_max !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Thermometer className={`w-4 h-4 ${themeClasses.text.muted}`} />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Max Temperature:</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    latestMetrics.disk_temperature_max > 60 ? 'text-red-600' :
                    latestMetrics.disk_temperature_max > 50 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {latestMetrics.disk_temperature_max}°C
                  </span>
                </div>
              </div>
            )}

            {/* Predicted Failures */}
            {latestMetrics.disk_failures_predicted !== null && latestMetrics.disk_failures_predicted !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failures Predicted:</span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.disk_failures_predicted > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {latestMetrics.disk_failures_predicted}
                  </span>
                </div>
                {latestMetrics.disk_failures_predicted > 0 && (
                  <p className={`text-xs text-red-600`}>
                    {latestMetrics.disk_failures_predicted} disk{latestMetrics.disk_failures_predicted !== 1 ? 's' : ''} showing failure indicators
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Per-Disk Details */}
          {latestMetrics.disk_health_data && Array.isArray(latestMetrics.disk_health_data) && latestMetrics.disk_health_data.length > 0 && (
            <div className="space-y-3">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                Individual Disks ({latestMetrics.disk_health_data.length})
              </h4>
              {latestMetrics.disk_health_data.map((disk, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    disk.failure_predicted || disk.overall_health === 'FAILED'
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                      : disk.reallocated_sectors > 0 || disk.temperature_c > 60
                      ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                      : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <HardDrive className={`w-5 h-5 mr-2 ${
                        disk.failure_predicted || disk.overall_health === 'FAILED' ? 'text-red-600' :
                        disk.reallocated_sectors > 0 || disk.temperature_c > 60 ? 'text-yellow-600' :
                        'text-green-600'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${themeClasses.text.primary}`}>{disk.device}</p>
                        <p className={`text-xs ${themeClasses.text.muted}`}>
                          SMART Status: {disk.overall_health}
                        </p>
                      </div>
                    </div>
                    {disk.failure_predicted && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 rounded text-xs font-medium">
                        FAILURE PREDICTED
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className={`${themeClasses.text.muted} mb-1`}>Temperature</p>
                      <p className={`font-medium ${
                        disk.temperature_c > 60 ? 'text-red-600' :
                        disk.temperature_c > 50 ? 'text-yellow-600' :
                        themeClasses.text.primary
                      }`}>
                        {disk.temperature_c}°C
                      </p>
                    </div>
                    <div>
                      <p className={`${themeClasses.text.muted} mb-1`}>Power-On Hours</p>
                      <p className={`font-medium ${themeClasses.text.primary}`}>
                        {disk.power_on_hours.toLocaleString()}h
                      </p>
                    </div>
                    <div>
                      <p className={`${themeClasses.text.muted} mb-1`}>Reallocated Sectors</p>
                      <p className={`font-medium ${
                        disk.reallocated_sectors > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {disk.reallocated_sectors}
                      </p>
                    </div>
                    <div>
                      <p className={`${themeClasses.text.muted} mb-1`}>Pending Sectors</p>
                      <p className={`font-medium ${
                        disk.pending_sectors > 0 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {disk.pending_sectors}
                      </p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {(disk.failure_predicted || disk.reallocated_sectors > 0 || disk.temperature_c > 60) && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-start">
                        <AlertTriangle className={`w-4 h-4 mr-2 flex-shrink-0 mt-0.5 ${
                          disk.failure_predicted || disk.overall_health === 'FAILED' ? 'text-red-600' : 'text-yellow-600'
                        }`} />
                        <div className="text-xs">
                          {disk.failure_predicted && (
                            <p className="text-red-600 font-medium mb-1">
                              ⚠️ Disk failure predicted - backup data immediately
                            </p>
                          )}
                          {disk.reallocated_sectors > 0 && (
                            <p className="text-red-600">
                              • {disk.reallocated_sectors} reallocated sectors detected (disk wear indicator)
                            </p>
                          )}
                          {disk.temperature_c > 60 && (
                            <p className="text-yellow-600">
                              • Temperature exceeds safe threshold (60°C)
                            </p>
                          )}
                          {disk.pending_sectors > 0 && (
                            <p className="text-yellow-600">
                              • {disk.pending_sectors} pending sectors awaiting reallocation
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Critical Warning Banner */}
          {latestMetrics.disk_failures_predicted > 0 && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-6 h-6 text-red-600 mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-800 dark:text-red-200 mb-1">
                    Critical: Disk Failure Imminent
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300">
                    {latestMetrics.disk_failures_predicted} disk{latestMetrics.disk_failures_predicted !== 1 ? 's are' : ' is'} showing
                    signs of imminent failure. Back up all critical data immediately and schedule disk replacement.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-6 py-3 text-sm font-medium ${
              activeTab === 'overview'
                ? `${themeClasses.text.primary} border-b-2 border-purple-600`
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex-1 px-6 py-3 text-sm font-medium ${
              activeTab === 'alerts'
                ? `${themeClasses.text.primary} border-b-2 border-purple-600`
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            <Bell className="w-4 h-4 inline mr-2" />
            Alerts ({alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('commands')}
            className={`flex-1 px-6 py-3 text-sm font-medium ${
              activeTab === 'commands'
                ? `${themeClasses.text.primary} border-b-2 border-purple-600`
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            <Terminal className="w-4 h-4 inline mr-2" />
            Commands ({commands.length})
          </button>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Agent ID</p>
                  <p className={`text-sm font-mono ${themeClasses.text.primary}`}>{agent.id}</p>
                </div>
                <div>
                  <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Created</p>
                  <p className={`text-sm ${themeClasses.text.primary}`}>{formatTimestamp(agent.created_at)}</p>
                </div>
                <div>
                  <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Monitoring</p>
                  <p className={`text-sm ${themeClasses.text.primary}`}>
                    {agent.monitoring_enabled ? '✓ Enabled' : '✗ Disabled'}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Status</p>
                  <p className={`text-sm ${themeClasses.text.primary}`}>
                    {agent.is_active ? '✓ Active' : '✗ Inactive'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
                  <p className={`${themeClasses.text.secondary}`}>No active alerts</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadge(alert.severity)}`}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className={`text-xs ${themeClasses.text.muted}`}>
                            {formatRelativeTime(alert.created_at)}
                          </span>
                        </div>
                        <p className={`text-sm ${themeClasses.text.primary} mb-2`}>{alert.message}</p>
                        <p className={`text-xs ${themeClasses.text.secondary}`}>
                          Type: {alert.alert_type}
                        </p>
                      </div>
                      {canManageAgents && alert.status === 'active' && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          className="ml-4 px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="space-y-3">
              {commands.length === 0 ? (
                <div className="text-center py-8">
                  <Terminal className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
                  <p className={`${themeClasses.text.secondary}`}>No commands yet</p>
                </div>
              ) : (
                commands.slice(0, 10).map((command) => (
                  <div
                    key={command.id}
                    className={`p-4 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Terminal className={`w-4 h-4 ${themeClasses.text.muted}`} />
                        <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {command.command_type}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getCommandStatusBadge(command.status)}`}>
                        {command.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatRelativeTime(command.created_at)}
                      </span>
                      {command.status === 'completed' && command.executed_at && (
                        <span className="flex items-center text-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed {formatRelativeTime(command.executed_at)}
                        </span>
                      )}
                      {command.status === 'failed' && (
                        <span className="flex items-center text-red-600">
                          <XCircle className="w-3 h-3 mr-1" />
                          Failed
                        </span>
                      )}
                    </div>
                    {command.error_message && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-800 dark:text-red-200">
                        {command.error_message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />
    </div>
  );
};

export default AgentDetails;
