import React, { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity,
  RefreshCw, ArrowLeft, Terminal, Bell, Clock, CheckCircle, XCircle,
  Cpu, HardDrive, Wifi, TrendingUp, Calendar, Shield, Download, Disc, Thermometer, AlertOctagon, FileWarning, Info, MapPin
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice, AgentMetric, AgentAlert, AgentCommand } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import MetricsChart from './MetricsChart';
import { CurrentMetrics, SystemEventLogs, DiskHealthStatus, OSPatchStatus, PackageManagerStatus, HardwareTemperature, NetworkConnectivity, SecurityStatus, FailedLoginAttempts, ServiceMonitoring, OSEndOfLifeStatus } from './agent-details';
import { websocketService } from '../../services/websocketService';

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
  const [metricsZoomWindow, setMetricsZoomWindow] = useState<number>(4); // Default zoom: 4 hours
  const METRICS_FETCH_WINDOW = 168; // Always fetch 7 days of history

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

      // Load metrics history (fetch large window, zoom will be applied for display)
      const metricsResponse = await agentService.getAgentMetricsHistory(agentId, METRICS_FETCH_WINDOW);
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
  }, [agentId, canViewAgents, METRICS_FETCH_WINDOW]);

  useEffect(() => {
    loadAgentDetails();
  }, [loadAgentDetails]);

  // WebSocket listener for real-time metrics updates
  useEffect(() => {
    // Only set up WebSocket if we have an agent ID
    if (!agentId) return;

    console.log(`🔌 Setting up WebSocket listener for agent ${agentId}`);

    // Register callback for agent metrics updates
    const unsubscribe = websocketService.onAgentMetricsChange((update) => {
      console.log(`📊 Received metrics update via WebSocket:`, update);

      // Only update if this is for our current agent
      if (update.agentId === agentId) {
        console.log(`✅ Metrics update is for current agent, updating state`);

        // Update latest metrics with the new data
        const newMetrics: AgentMetric = {
          id: '', // Not needed for display
          agent_device_id: agentId,
          cpu_percent: Number(update.metrics.cpu_percent) || 0,
          memory_percent: Number(update.metrics.memory_percent) || 0,
          disk_percent: Number(update.metrics.disk_percent) || 0,
          memory_used_gb: update.metrics.memory_used_gb ? Number(update.metrics.memory_used_gb) : undefined,
          disk_used_gb: update.metrics.disk_used_gb ? Number(update.metrics.disk_used_gb) : undefined,
          network_rx_bytes: update.metrics.network_rx_bytes ? Number(update.metrics.network_rx_bytes) : null,
          network_tx_bytes: update.metrics.network_tx_bytes ? Number(update.metrics.network_tx_bytes) : null,
          collected_at: update.timestamp,
          // Include all other metric fields
          patches_available: update.metrics.patches_available || 0,
          security_patches_available: update.metrics.security_patches_available || 0,
          patches_require_reboot: update.metrics.patches_require_reboot || false,
          eol_status: update.metrics.eol_status || null,
          eol_date: update.metrics.eol_date || null,
          security_eol_date: update.metrics.security_eol_date || null,
          days_until_eol: update.metrics.days_until_eol || null,
          days_until_sec_eol: update.metrics.days_until_sec_eol || null,
          eol_message: update.metrics.eol_message || null,
          disk_health_status: update.metrics.disk_health_status || null,
          disk_health_data: update.metrics.disk_health_data || null,
          disk_failures_predicted: update.metrics.disk_failures_predicted || 0,
          disk_temperature_max: update.metrics.disk_temperature_max || null,
          disk_reallocated_sectors_total: update.metrics.disk_reallocated_sectors_total || 0,
          system_uptime_seconds: update.metrics.system_uptime_seconds || null,
          last_boot_time: update.metrics.last_boot_time || null,
          unexpected_reboot: update.metrics.unexpected_reboot || false,
          services_monitored: update.metrics.services_monitored || 0,
          services_running: update.metrics.services_running || 0,
          services_failed: update.metrics.services_failed || 0,
          services_data: update.metrics.services_data || null,
          network_devices_monitored: update.metrics.network_devices_monitored || 0,
          network_devices_online: update.metrics.network_devices_online || 0,
          network_devices_offline: update.metrics.network_devices_offline || 0,
          network_devices_data: update.metrics.network_devices_data || null,
          backups_detected: update.metrics.backups_detected || 0,
          backups_running: update.metrics.backups_running || 0,
          backups_with_issues: update.metrics.backups_with_issues || 0,
          backup_data: update.metrics.backup_data || null,
          antivirus_installed: update.metrics.antivirus_installed || false,
          antivirus_enabled: update.metrics.antivirus_enabled || false,
          antivirus_up_to_date: update.metrics.antivirus_up_to_date || false,
          firewall_enabled: update.metrics.firewall_enabled || false,
          security_products_count: update.metrics.security_products_count || 0,
          security_issues_count: update.metrics.security_issues_count || 0,
          security_data: update.metrics.security_data || null,
          failed_login_attempts: update.metrics.failed_login_attempts || 0,
          failed_login_last_24h: update.metrics.failed_login_last_24h || 0,
          unique_attacking_ips: update.metrics.unique_attacking_ips || 0,
          failed_login_data: update.metrics.failed_login_data || null,
          internet_connected: update.metrics.internet_connected !== undefined ? update.metrics.internet_connected : true,
          gateway_reachable: update.metrics.gateway_reachable !== undefined ? update.metrics.gateway_reachable : true,
          dns_working: update.metrics.dns_working !== undefined ? update.metrics.dns_working : true,
          avg_latency_ms: update.metrics.avg_latency_ms || null,
          packet_loss_percent: update.metrics.packet_loss_percent || null,
          connectivity_issues_count: update.metrics.connectivity_issues_count || 0,
          connectivity_data: update.metrics.connectivity_data || null,
          cpu_temperature_c: update.metrics.cpu_temperature_c || null,
          gpu_temperature_c: update.metrics.gpu_temperature_c || null,
          motherboard_temperature_c: update.metrics.motherboard_temperature_c || null,
          highest_temperature_c: update.metrics.highest_temperature_c || 0,
          temperature_critical_count: update.metrics.temperature_critical_count || 0,
          fan_count: update.metrics.fan_count || 0,
          fan_speeds_rpm: update.metrics.fan_speeds_rpm || null,
          fan_failure_count: update.metrics.fan_failure_count || 0,
          sensor_data: update.metrics.sensor_data || null,
          critical_events_count: update.metrics.critical_events_count || 0,
          error_events_count: update.metrics.error_events_count || 0,
          warning_events_count: update.metrics.warning_events_count || 0,
          last_critical_event: update.metrics.last_critical_event || null,
          last_critical_event_message: update.metrics.last_critical_event_message || null,
          package_managers_outdated: update.metrics.package_managers_outdated || 0,
          homebrew_outdated: update.metrics.homebrew_outdated || 0,
          npm_outdated: update.metrics.npm_outdated || 0,
          pip_outdated: update.metrics.pip_outdated || 0,
          outdated_packages_data: update.metrics.outdated_packages_data || null,
          raw_metrics: update.metrics.raw_metrics || null,
        };

        setLatestMetrics(newMetrics);

        // Also append to metrics history for charts
        setMetricsHistory(prev => [...prev, newMetrics]);
      }
    });

    // Cleanup on unmount or when agentId changes
    return () => {
      console.log(`🧹 Cleaning up WebSocket listener for agent ${agentId}`);
      unsubscribe();
    };
  }, [agentId]);

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

  // Format time window label
  const getTimeWindowLabel = (hours: number): string => {
    if (hours < 24) return `Last ${hours} Hours`;
    if (hours === 24) return 'Last 24 Hours';
    const days = hours / 24;
    return `Last ${days} Days`;
  };

  // Time window options
  const timeWindowOptions = [
    { value: 1, label: 'Last 1 Hour' },
    { value: 4, label: 'Last 4 Hours' },
    { value: 12, label: 'Last 12 Hours' },
    { value: 24, label: 'Last 24 Hours' },
    { value: 48, label: 'Last 2 Days' },
    { value: 168, label: 'Last 7 Days' },
  ];

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
            className={`mr-4 p-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} hover:${themeClasses.bg.card}`}
          >
            <ArrowLeft className={`w-5 h-5 ${themeClasses.text.primary}`} />
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
            className={`mr-4 p-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} hover:${themeClasses.bg.card}`}
          >
            <ArrowLeft className={`w-5 h-5 ${themeClasses.text.primary}`} />
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
            className={`mr-4 p-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} hover:${themeClasses.bg.card}`}
          >
            <ArrowLeft className={`w-5 h-5 ${themeClasses.text.primary}`} />
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
            className={`mr-4 p-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} hover:${themeClasses.bg.card}`}
            title="Back to agent list"
          >
            <ArrowLeft className={`w-5 h-5 ${themeClasses.text.primary}`} />
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
            {agent.location_street && agent.location_city ? (
              <button
                onClick={() => {
                  const streetFull = `${agent.location_street}${agent.location_street2 ? ' ' + agent.location_street2 : ''}`;
                  const fullAddress = `${streetFull}, ${agent.location_city}, ${agent.location_state} ${agent.location_zip}${agent.location_country && agent.location_country !== 'USA' ? ', ' + agent.location_country : ''}`;
                  const encodedAddress = encodeURIComponent(fullAddress);
                  const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                  window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                }}
                className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left group`}
                title="Click to open in maps"
              >
                <div className="flex items-start">
                  <MapPin className={`w-4 h-4 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 mt-0.5 flex-shrink-0 transition-colors`} />
                  <div>
                    <div className="font-medium group-hover:text-blue-600 transition-colors">
                      {agent.location_name || 'Location'}
                    </div>
                    <div className="group-hover:text-blue-600 transition-colors">
                      {agent.location_street}
                      {agent.location_street2 && ` ${agent.location_street2}`}
                    </div>
                    <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 transition-colors`}>
                      {agent.location_city}, {agent.location_state} {agent.location_zip}
                    </div>
                  </div>
                </div>
              </button>
            ) : (
              <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                {agent.location_name || 'N/A'}
              </p>
            )}
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

      {/* latestMetrics={latestMetrics} */}
      <CurrentMetrics latestMetrics={latestMetrics} />
      {/* Metrics History Charts */}
      {metricsHistory.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className={`text-xl font-semibold ${themeClasses.text.primary} flex items-center`}>
              <TrendingUp className="w-6 h-6 mr-2" />
              Metrics Trends ({getTimeWindowLabel(metricsZoomWindow)})
            </h3>
            <div className="flex items-center gap-3">
              <label className={`text-sm ${themeClasses.text.secondary}`}>
                Time Window:
              </label>
              <select
                value={metricsZoomWindow}
                onChange={(e) => setMetricsZoomWindow(Number(e.target.value))}
                className={`px-3 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.bg.card} ${themeClasses.text.primary} text-sm focus:outline-none focus:ring-2 focus:ring-purple-500`}
              >
                {timeWindowOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
            initialZoomWindowHours={metricsZoomWindow}
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
            initialZoomWindowHours={metricsZoomWindow}
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
            initialZoomWindowHours={metricsZoomWindow}
          />
        </div>
      )}

      {/* OS Patch Status */}
      <OSPatchStatus latestMetrics={latestMetrics} />

      {/* Package Manager Status */}
      <PackageManagerStatus latestMetrics={latestMetrics} />

      {/* OS End-of-Life Status */}
      <OSEndOfLifeStatus latestMetrics={latestMetrics} />


      {/* OS End-of-Life Status - Placeholder */}

      {/* Service Monitoring */}
      <ServiceMonitoring latestMetrics={latestMetrics} />


      {/* Service Monitoring - Placeholder */}

      {/* Security Status Monitoring */}
      <SecurityStatus latestMetrics={latestMetrics} />


      {/* Security Status Monitoring - Placeholder */}

      {/* Failed Login Attempts */}
      <FailedLoginAttempts latestMetrics={latestMetrics} />


      {/* Failed Login Attempts - Placeholder */}

      {/* Network Connectivity Status */}
      <NetworkConnectivity latestMetrics={latestMetrics} />

      {/* Network Connectivity Status - Placeholder */}

      {/* Hardware Temperature & Sensors */}
      <HardwareTemperature latestMetrics={latestMetrics} agent={agent} />

      {/* latestMetrics={latestMetrics} */}
      <SystemEventLogs latestMetrics={latestMetrics} />
      {/* latestMetrics={latestMetrics} */}
      <DiskHealthStatus latestMetrics={latestMetrics} />
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
