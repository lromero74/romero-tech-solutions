import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity,
  RefreshCw, ArrowLeft, Terminal, Bell, Clock, CheckCircle, XCircle,
  Cpu, HardDrive, Wifi, TrendingUp, Calendar, Shield, Download, Disc, Thermometer, AlertOctagon, FileWarning, Info, MapPin,
  Link, Unlink, RotateCcw, Save, Plus, Trash2, Play
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { agentService, AgentDevice, AgentMetric, AgentAlert, AgentCommand, AgentPolicy } from '../../services/agentService';
import { automationService, AutomationPolicy, AutomationScript, PolicyExecutionHistory } from '../../services/automationService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import MetricsChartECharts from './MetricsChartECharts';
import { CurrentMetrics, SystemEventLogs, DiskHealthStatus, OSPatchStatus, PackageManagerStatus, HardwareTemperature, NetworkConnectivity, SecurityStatus, FailedLoginAttempts, ServiceMonitoring, OSEndOfLifeStatus } from './agent-details';
import AssetInventory from './agent-details/AssetInventory';
import { websocketService } from '../../services/websocketService';
import { useSharedChartSettings } from './MetricsChartECharts/hooks/useSharedChartSettings';
import ExecutionDetailsModal from './modals/ExecutionDetailsModal';

interface AgentDetailsProps {
  agentId: string;
  onBack?: () => void;
  onSendCommand?: (agentId: string) => void;
  navigationContext?: {
    agentId: string;
    resource: 'cpu' | 'memory' | 'disk';
    timestamp: string;
    indicator?: string;
    alertId?: number;
  } | null;
  onClearNavigationContext?: () => void;
}

const AgentDetails: React.FC<AgentDetailsProps> = ({
  agentId,
  onBack,
  onSendCommand,
  navigationContext,
  onClearNavigationContext,
}) => {
  const [agent, setAgent] = useState<AgentDevice | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<AgentMetric | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<AgentMetric[]>([]);
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [policies, setPolicies] = useState<AgentPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'commands' | 'inventory' | 'policies'>('overview');
  const [activeResourceTab, setActiveResourceTab] = useState<'cpu' | 'memory' | 'disk'>('cpu');
  const [loadedCharts, setLoadedCharts] = useState<Set<'cpu' | 'memory' | 'disk'>>(new Set(['cpu'])); // Track which charts have been loaded
  const METRICS_FETCH_WINDOW = 168; // Always fetch 7 days of history

  // Policy management state
  const [availablePolicies, setAvailablePolicies] = useState<AutomationPolicy[]>([]);
  const [allScripts, setAllScripts] = useState<AutomationScript[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningPolicy, setAssigningPolicy] = useState<string | null>(null);
  const [removingAssignment, setRemovingAssignment] = useState<string | null>(null);

  // Execution history state
  const [executions, setExecutions] = useState<PolicyExecutionHistory[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  // Chart settings management (shared across resource types)
  const {
    settings: chartSettings,
    linkSettings,
    toggleLinkSettings,
    saveAsUserDefaults,
    revertToSystemDefaults,
    hasUserDefaults,
  } = useSharedChartSettings(agentId);

  // Get current user info to check if they're a client viewing their own agent
  const { authUser } = useEnhancedAuth();

  // Permission checks
  const { checkPermission } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');
  const canSendCommands = checkPermission('send.agent_commands.enable');

  // Check if user is a client (customer role)
  const isClient = authUser && (authUser.role === 'client' || authUser.role === 'customer');
  const userBusinessId = (authUser as any)?.businessId;

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load agent details with retry logic for ServiceWorker failures
  const loadAgentDetails = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1000; // 1 second

    try {
      setLoading(true);
      setError(null);

      // Load agent info first to check business_id for clients
      const agentResponse = await agentService.getAgent(agentId);
      if (agentResponse.success && agentResponse.data) {
        setAgent(agentResponse.data);

        // Permission check: Allow if employee with permission OR client viewing their own business's agent
        const canAccess = canViewAgents || (isClient && agentResponse.data.business_id === userBusinessId);

        if (!canAccess) {
          console.log('🚫 Access denied:', {
            canViewAgents,
            isClient,
            agentBusinessId: agentResponse.data.business_id,
            userBusinessId,
          });

          setPermissionDenied({
            show: true,
            action: 'View Agent Details',
            requiredPermission: 'view.agents.enable',
            message: isClient
              ? 'This agent does not belong to your business'
              : 'You do not have permission to view agent details'
          });
          setLoading(false);
          return;
        }

        console.log('✅ Access granted:', {
          canViewAgents,
          isClient,
          agentBusinessId: agentResponse.data.business_id,
          userBusinessId,
        });
      }

      // Load metrics history (fetch large window, zoom will be applied for display)
      // Use retry logic specifically for metrics history since it's the largest response
      let metricsResponse;
      try {
        metricsResponse = await agentService.getAgentMetricsHistory(agentId, METRICS_FETCH_WINDOW);
      } catch (metricsError) {
        // Check if this is an AbortError (ServiceWorker issue)
        if (metricsError instanceof DOMException && metricsError.name === 'AbortError' && retryCount < MAX_RETRIES) {
          console.warn(`⚠️  Metrics history request aborted (attempt ${retryCount + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1))); // Exponential backoff
          return loadAgentDetails(retryCount + 1); // Retry the entire load
        }
        throw metricsError; // Re-throw if not recoverable
      }

      if (metricsResponse?.success && metricsResponse.data && metricsResponse.data.metrics.length > 0) {
        // Use latest_metric if available (when aggregation is used), otherwise use last item from array
        const rawMetrics = metricsResponse.data.latest_metric ||
                          metricsResponse.data.metrics[metricsResponse.data.metrics.length - 1];

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

      // Load assigned policies
      const policiesResponse = await agentService.getAgentPolicies(agentId);
      if (policiesResponse.success && policiesResponse.data) {
        setPolicies(policiesResponse.data.policies);
      }

    } catch (err) {
      console.error('Error loading agent details:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load agent details';

      // Provide more helpful error message for ServiceWorker issues
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Unable to load metrics history. Please try refreshing the page or clearing your browser cache.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [agentId, canViewAgents, isClient, userBusinessId, METRICS_FETCH_WINDOW]);

  useEffect(() => {
    loadAgentDetails();
  }, [loadAgentDetails]);

  // Lazy load charts as they're viewed
  useEffect(() => {
    if (!loadedCharts.has(activeResourceTab)) {
      console.log(`📊 Lazy loading ${activeResourceTab} chart...`);
      setLoadedCharts(prev => new Set([...prev, activeResourceTab]));
    }
  }, [activeResourceTab, loadedCharts]);

  // Process navigation context from alerts
  useEffect(() => {
    if (navigationContext) {
      console.log('📍 Processing navigation context:', navigationContext);

      // Switch to the correct resource tab (will trigger lazy load if needed)
      setActiveResourceTab(navigationContext.resource);

      // Note: The actual scrolling, indicator overlay, and time range highlighting
      // are now handled by the MetricsChartECharts component via props

      // Clear the navigation context after a delay to allow chart to process it
      setTimeout(() => {
        onClearNavigationContext?.();
      }, 2000); // 2 seconds to allow user to see the highlight
    }
  }, [navigationContext, onClearNavigationContext]);

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
          mas_outdated: update.metrics.mas_outdated || 0,
          outdated_packages_data: update.metrics.outdated_packages_data || null,
          raw_metrics: update.metrics.raw_metrics || null,
        };

        setLatestMetrics(newMetrics);

        // Append to metrics history for charts, but trim to maintain METRICS_FETCH_WINDOW
        setMetricsHistory(prev => {
          const updated = [...prev, newMetrics];

          // Calculate cutoff time based on METRICS_FETCH_WINDOW (in hours)
          const cutoffTime = new Date();
          cutoffTime.setHours(cutoffTime.getHours() - METRICS_FETCH_WINDOW);

          // Filter out metrics older than the cutoff
          const trimmed = updated.filter(m => new Date(m.collected_at) >= cutoffTime);

          // Log if we trimmed any old metrics
          if (trimmed.length < updated.length) {
            console.log(`🗑️  Trimmed ${updated.length - trimmed.length} old metrics (keeping ${trimmed.length} within ${METRICS_FETCH_WINDOW}h window)`);
          }

          return trimmed;
        });
      }
    });

    // Cleanup on unmount or when agentId changes
    return () => {
      console.log(`🧹 Cleaning up WebSocket listener for agent ${agentId}`);
      unsubscribe();
    };
  }, [agentId, METRICS_FETCH_WINDOW]);

  // Memoize chart data to prevent unnecessary re-renders
  const cpuChartData = useMemo(() =>
    metricsHistory.map(m => ({
      timestamp: m.collected_at,
      value: m.cpu_percent
    })),
    [metricsHistory]
  );

  const memoryChartData = useMemo(() =>
    metricsHistory.map(m => ({
      timestamp: m.collected_at,
      value: m.memory_percent
    })),
    [metricsHistory]
  );

  const diskChartData = useMemo(() =>
    metricsHistory.map(m => ({
      timestamp: m.collected_at,
      value: m.disk_percent
    })),
    [metricsHistory]
  );

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

  // Get execution status display
  const getExecutionStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <CheckCircle className="w-3 h-3" />,
          label: 'Completed'
        };
      case 'failed':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <XCircle className="w-3 h-3" />,
          label: 'Failed'
        };
      case 'running':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          icon: <Activity className="w-3 h-3 animate-spin" />,
          label: 'Running'
        };
      case 'timeout':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <Clock className="w-3 h-3" />,
          label: 'Timeout'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          icon: <Activity className="w-3 h-3" />,
          label: 'Unknown'
        };
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

  // Load available policies and scripts for assignment
  const loadAvailablePolicies = useCallback(async () => {
    if (!agent) return;

    try {
      setLoadingPolicies(true);

      // Load all policies and scripts in parallel
      const [policiesResponse, scriptsResponse] = await Promise.all([
        automationService.listPolicies({ enabled: true }),
        automationService.listScripts(),
      ]);

      if (scriptsResponse.success && scriptsResponse.data) {
        setAllScripts(scriptsResponse.data.scripts);
      }

      if (policiesResponse.success && policiesResponse.data) {
        const allPolicies = policiesResponse.data.policies;

        // Filter policies by OS compatibility
        const compatiblePolicies = allPolicies.filter(policy => {
          // If policy has no script, it's compatible (might be a config policy)
          if (!policy.script_id) return true;

          // Find the script for this policy
          const script = scriptsResponse.data?.scripts.find(s => s.id === policy.script_id);
          if (!script) return false;

          // Check if agent's OS is in the script's supported_os array
          // Agent OS values: darwin, linux, windows
          return script.supported_os.includes(agent.os_type);
        });

        setAvailablePolicies(compatiblePolicies);
      }
    } catch (err) {
      console.error('Error loading available policies:', err);
    } finally {
      setLoadingPolicies(false);
    }
  }, [agent]);

  // Load available policies when policies tab is viewed
  useEffect(() => {
    if (activeTab === 'policies' && agent && availablePolicies.length === 0) {
      loadAvailablePolicies();
    }
  }, [activeTab, agent, availablePolicies.length, loadAvailablePolicies]);

  // Load execution history for this agent
  const loadExecutionHistory = useCallback(async () => {
    try {
      setLoadingExecutions(true);

      const response = await automationService.getExecutionHistory({
        agent_id: agentId,
        limit: 50, // Last 50 executions
      });

      if (response.success && response.data) {
        setExecutions(response.data.executions);
      }
    } catch (err) {
      console.error('Error loading execution history:', err);
    } finally {
      setLoadingExecutions(false);
    }
  }, [agentId]);

  // Load execution history when policies tab is viewed
  useEffect(() => {
    if (activeTab === 'policies' && executions.length === 0) {
      loadExecutionHistory();
    }
  }, [activeTab, executions.length, loadExecutionHistory]);

  // Handle policy assignment
  const handleAssignPolicy = async (policyId: string) => {
    try {
      setAssigningPolicy(policyId);

      const response = await automationService.assignPolicy(policyId, {
        agent_device_id: agentId,
      });

      if (response.success) {
        // Reload policies for this agent
        const policiesResponse = await agentService.getAgentPolicies(agentId);
        if (policiesResponse.success && policiesResponse.data) {
          setPolicies(policiesResponse.data.policies);
        }

        // Reload execution history (in case policy ran on assignment)
        loadExecutionHistory();

        // Close the modal
        setShowAssignModal(false);

        // Show success feedback (optional - could add a toast notification)
        console.log('✅ Policy assigned successfully');
      } else {
        alert(response.message || 'Failed to assign policy');
      }
    } catch (err) {
      console.error('Error assigning policy:', err);
      alert('An error occurred while assigning the policy');
    } finally {
      setAssigningPolicy(null);
    }
  };

  // Handle policy removal
  const handleRemovePolicy = async (policyId: string, assignmentId: string, policyName: string) => {
    if (!confirm(`Are you sure you want to remove the policy "${policyName}" from this agent?`)) {
      return;
    }

    try {
      setRemovingAssignment(assignmentId);

      const response = await automationService.removePolicyAssignment(policyId, assignmentId);

      if (response.success) {
        // Remove from local state
        setPolicies(prev => prev.filter(p => p.assignment_id !== assignmentId));

        console.log('✅ Policy assignment removed successfully');
      } else {
        alert(response.message || 'Failed to remove policy assignment');
      }
    } catch (err) {
      console.error('Error removing policy assignment:', err);
      alert('An error occurred while removing the policy assignment');
    } finally {
      setRemovingAssignment(null);
    }
  };

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

  // Show permission denied if access was denied during load
  if (permissionDenied.show) {
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
          <AlertTriangle className={`w-16 w-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            {permissionDenied.message || 'You do not have permission to view agent details'}
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
              Metrics Trends
            </h3>
            <div className="flex items-center gap-3">
              {/* Chart Settings Controls */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                <button
                  onClick={toggleLinkSettings}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    linkSettings
                      ? 'text-blue-600 dark:text-blue-400'
                      : `${themeClasses.text.secondary}`
                  }`}
                  title={linkSettings ? 'Settings are linked across all metrics' : 'Settings are independent per metric'}
                >
                  {linkSettings ? (
                    <Link className="w-3.5 h-3.5" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  <span>{linkSettings ? 'Linked' : 'Independent'}</span>
                </button>
                {hasUserDefaults() && (
                  <button
                    onClick={revertToSystemDefaults}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${themeClasses.text.secondary} hover:text-orange-600 transition-colors`}
                    title="Revert to system defaults"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => saveAsUserDefaults(activeResourceTab)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${themeClasses.text.secondary} hover:text-green-600 transition-colors`}
                  title="Save current settings as your personal default"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Resource Tab Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveResourceTab('cpu')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeResourceTab === 'cpu'
                      ? 'bg-blue-600 text-white'
                      : `${themeClasses.bg.hover} ${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
                  }`}
                >
                  <Cpu className="w-4 h-4 inline mr-2" />
                  CPU
                </button>
                <button
                  onClick={() => setActiveResourceTab('memory')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeResourceTab === 'memory'
                      ? 'bg-purple-600 text-white'
                      : `${themeClasses.bg.hover} ${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
                  }`}
                >
                  <Activity className="w-4 h-4 inline mr-2" />
                  Memory
                </button>
                <button
                  onClick={() => setActiveResourceTab('disk')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeResourceTab === 'disk'
                      ? 'bg-amber-600 text-white'
                      : `${themeClasses.bg.hover} ${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
                  }`}
                >
                  <HardDrive className="w-4 h-4 inline mr-2" />
                  Disk
                </button>
              </div>
            </div>
          </div>

          {/* Lazy-loaded charts: only render charts that have been viewed */}
          {/* CPU Usage Chart - loaded by default */}
          {loadedCharts.has('cpu') && (
            <div style={{ display: activeResourceTab === 'cpu' ? 'block' : 'none' }}>
              <MetricsChartECharts
                data={cpuChartData}
                title="CPU Usage"
                dataKey="CPU"
                unit="%"
                color="#3b82f6"
                scrollToTimestamp={
                  navigationContext?.resource === 'cpu' ? navigationContext.timestamp : null
                }
                indicatorOverlay={
                  navigationContext?.resource === 'cpu' ? navigationContext.indicator : null
                }
                highlightTimeRange={
                  navigationContext?.resource === 'cpu' && navigationContext.timestamp
                    ? {
                        start: new Date(new Date(navigationContext.timestamp).getTime() - 15 * 60 * 1000).toISOString(), // -15 min
                        end: new Date(new Date(navigationContext.timestamp).getTime() + 15 * 60 * 1000).toISOString(),   // +15 min
                      }
                    : null
                }
                agentId={agentId}
                resourceType="cpu"
              />
            </div>
          )}

          {/* Memory Usage Chart - lazy loaded on first view */}
          {loadedCharts.has('memory') && (
            <div style={{ display: activeResourceTab === 'memory' ? 'block' : 'none' }}>
              <MetricsChartECharts
                data={memoryChartData}
                title="Memory Usage"
                dataKey="Memory"
                unit="%"
                color="#8b5cf6"
                scrollToTimestamp={
                  navigationContext?.resource === 'memory' ? navigationContext.timestamp : null
                }
                indicatorOverlay={
                  navigationContext?.resource === 'memory' ? navigationContext.indicator : null
                }
                highlightTimeRange={
                  navigationContext?.resource === 'memory' && navigationContext.timestamp
                    ? {
                        start: new Date(new Date(navigationContext.timestamp).getTime() - 15 * 60 * 1000).toISOString(),
                        end: new Date(new Date(navigationContext.timestamp).getTime() + 15 * 60 * 1000).toISOString(),
                      }
                    : null
                }
                agentId={agentId}
                resourceType="memory"
              />
            </div>
          )}

          {/* Disk Usage Chart - lazy loaded on first view */}
          {loadedCharts.has('disk') && (
            <div style={{ display: activeResourceTab === 'disk' ? 'block' : 'none' }}>
              <MetricsChartECharts
                data={diskChartData}
                title="Disk Usage"
                dataKey="Disk"
                unit="%"
                color="#f59e0b"
                scrollToTimestamp={
                  navigationContext?.resource === 'disk' ? navigationContext.timestamp : null
                }
                indicatorOverlay={
                  navigationContext?.resource === 'disk' ? navigationContext.indicator : null
                }
                highlightTimeRange={
                  navigationContext?.resource === 'disk' && navigationContext.timestamp
                    ? {
                        start: new Date(new Date(navigationContext.timestamp).getTime() - 15 * 60 * 1000).toISOString(),
                        end: new Date(new Date(navigationContext.timestamp).getTime() + 15 * 60 * 1000).toISOString(),
                      }
                    : null
                }
                agentId={agentId}
                resourceType="disk"
              />
            </div>
          )}
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
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 px-6 py-3 text-sm font-medium ${
              activeTab === 'inventory'
                ? `${themeClasses.text.primary} border-b-2 border-purple-600`
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            <Disc className="w-4 h-4 inline mr-2" />
            Inventory
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`flex-1 px-6 py-3 text-sm font-medium ${
              activeTab === 'policies'
                ? `${themeClasses.text.primary} border-b-2 border-purple-600`
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            Policies ({policies.length})
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

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <AssetInventory agentId={agentId} />
          )}

          {/* Policies Tab */}
          {activeTab === 'policies' && (
            <div className="space-y-4">
              {/* Assign Policy Button */}
              <div className="flex items-center justify-between">
                <p className={`text-sm ${themeClasses.text.secondary}`}>
                  {policies.length} {policies.length === 1 ? 'policy' : 'policies'} assigned to this agent
                </p>
                {canManageAgents && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Assign Policy
                  </button>
                )}
              </div>

              {/* Assigned Policies List */}
              <div className="space-y-3">
                {policies.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
                    <p className={`${themeClasses.text.secondary}`}>No policies assigned to this agent</p>
                    {canManageAgents && (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Assign Your First Policy
                      </button>
                    )}
                  </div>
                ) : (
                  policies.map((policy) => (
                    <div
                      key={policy.assignment_id}
                      className={`p-4 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                            {policy.policy_name}
                          </h4>
                          {policy.description && (
                            <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                              {policy.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            policy.assignment_type === 'direct'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200'
                          }`}>
                            {policy.assignment_type === 'direct' ? 'Direct Assignment' : 'Business-Wide'}
                          </span>
                          {/* Only show remove button for direct assignments */}
                          {canManageAgents && policy.assignment_type === 'direct' && (
                            <button
                              onClick={() => handleRemovePolicy(policy.id, policy.assignment_id, policy.policy_name)}
                              disabled={removingAssignment === policy.assignment_id}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                              title="Remove policy assignment"
                            >
                              {removingAssignment === policy.assignment_id ? (
                                <Activity className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                        <div>
                          <span className={`${themeClasses.text.muted}`}>Type:</span>
                          <span className={`ml-1 ${themeClasses.text.primary} capitalize`}>
                            {policy.policy_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div>
                          <span className={`${themeClasses.text.muted}`}>Mode:</span>
                          <span className={`ml-1 ${themeClasses.text.primary} capitalize`}>
                            {policy.execution_mode}
                          </span>
                        </div>
                        {policy.script_name && (
                          <div className="col-span-2">
                            <span className={`${themeClasses.text.muted}`}>Script:</span>
                            <span className={`ml-1 ${themeClasses.text.primary}`}>{policy.script_name}</span>
                          </div>
                        )}
                        {policy.schedule_cron && (
                          <div className="col-span-2">
                            <span className={`${themeClasses.text.muted}`}>Schedule:</span>
                            <span className={`ml-1 font-mono text-xs ${themeClasses.text.primary}`}>
                              {policy.schedule_cron}
                            </span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className={`${themeClasses.text.muted}`}>Status:</span>
                          <span className={`ml-1 ${policy.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-600'}`}>
                            {policy.enabled ? '✓ Enabled' : '✗ Disabled'}
                          </span>
                        </div>
                      </div>
                      <div className={`text-xs ${themeClasses.text.muted} mt-3 pt-2 border-t ${themeClasses.border.primary}`}>
                        Assigned {formatRelativeTime(policy.assigned_at)}
                        {policy.assigned_by_name && ` by ${policy.assigned_by_name}`}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Execution History Section */}
              <div className="space-y-3 mt-8">
                <div className="flex items-center justify-between">
                  <h4 className={`text-lg font-semibold ${themeClasses.text.primary} flex items-center`}>
                    <Play className="w-5 h-5 mr-2" />
                    Recent Executions
                  </h4>
                  <button
                    onClick={loadExecutionHistory}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Refresh
                  </button>
                </div>

                {loadingExecutions ? (
                  <div className="text-center py-8">
                    <Activity className={`w-8 h-8 mx-auto mb-3 animate-spin ${themeClasses.text.muted}`} />
                    <p className={`${themeClasses.text.secondary}`}>Loading execution history...</p>
                  </div>
                ) : executions.length === 0 ? (
                  <div className={`${themeClasses.bg.secondary} rounded-lg p-6 text-center border ${themeClasses.border.primary}`}>
                    <Play className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
                    <p className={`${themeClasses.text.secondary}`}>No executions yet</p>
                    <p className={`text-sm ${themeClasses.text.muted} mt-1`}>
                      Policy executions will appear here
                    </p>
                  </div>
                ) : (
                  <div className={`${themeClasses.bg.card} rounded-lg overflow-hidden border ${themeClasses.border.primary}`}>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className={themeClasses.bg.secondary}>
                          <tr>
                            <th className={`px-4 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Policy / Script
                            </th>
                            <th className={`px-4 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Status
                            </th>
                            <th className={`px-4 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Duration
                            </th>
                            <th className={`px-4 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Started At
                            </th>
                            <th className={`px-4 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                          {executions.slice(0, 10).map((execution) => {
                            const statusDisplay = getExecutionStatusDisplay(execution.status);
                            return (
                              <tr key={execution.id} className={themeClasses.bg.hover}>
                                <td className={`px-4 py-3`}>
                                  <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                    {execution.policy_name || execution.script_name || 'N/A'}
                                  </div>
                                  {execution.triggered_by && (
                                    <div className={`text-xs ${themeClasses.text.muted} capitalize`}>
                                      Triggered by: {execution.triggered_by}
                                    </div>
                                  )}
                                </td>
                                <td className={`px-4 py-3`}>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                                    <span className="mr-1">{statusDisplay.icon}</span>
                                    {statusDisplay.label}
                                  </span>
                                </td>
                                <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                                  {execution.execution_duration_seconds
                                    ? `${execution.execution_duration_seconds}s`
                                    : 'N/A'}
                                </td>
                                <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                                  {formatRelativeTime(execution.started_at)}
                                </td>
                                <td className={`px-4 py-3 text-sm font-medium`}>
                                  <button
                                    onClick={() => setSelectedExecutionId(execution.id)}
                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center"
                                    title="View execution details"
                                  >
                                    <Terminal className="w-4 h-4 mr-1" />
                                    View
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {executions.length > 10 && (
                      <div className={`px-4 py-3 ${themeClasses.bg.secondary} border-t ${themeClasses.border.primary} text-center`}>
                        <p className={`text-sm ${themeClasses.text.muted}`}>
                          Showing 10 of {executions.length} executions
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Assign Policy Modal */}
              {showAssignModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col`}>
                    {/* Modal Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                      <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        Assign Policy to {agent?.device_name}
                      </h3>
                      <button
                        onClick={() => setShowAssignModal(false)}
                        className={`p-1 rounded-lg ${themeClasses.text.muted} hover:${themeClasses.bg.hover}`}
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Modal Body */}
                    <div className="flex-1 overflow-y-auto p-6">
                      {loadingPolicies ? (
                        <div className="text-center py-8">
                          <Activity className={`w-8 h-8 mx-auto mb-3 animate-spin ${themeClasses.text.muted}`} />
                          <p className={`${themeClasses.text.secondary}`}>Loading compatible policies...</p>
                        </div>
                      ) : (
                        <>
                          <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
                            Showing only policies compatible with <strong>{agent?.os_type}</strong> ({availablePolicies.filter(p => !policies.find(ap => ap.id === p.id)).length} available)
                          </p>

                          <div className="space-y-3">
                            {availablePolicies
                              .filter(policy => !policies.find(ap => ap.id === policy.id)) // Exclude already assigned
                              .map(policy => (
                                <div
                                  key={policy.id}
                                  className={`p-4 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} hover:shadow-md transition-shadow`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                                        {policy.policy_name}
                                      </h4>
                                      {policy.description && (
                                        <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                                          {policy.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-3 mt-2 text-xs">
                                        <span className={`${themeClasses.text.muted}`}>
                                          Type: <span className="capitalize">{policy.policy_type.replace(/_/g, ' ')}</span>
                                        </span>
                                        <span className={`${themeClasses.text.muted}`}>
                                          Mode: <span className="capitalize">{policy.execution_mode}</span>
                                        </span>
                                        {policy.script_name && (
                                          <span className={`${themeClasses.text.muted}`}>
                                            Script: {policy.script_name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleAssignPolicy(policy.id)}
                                      disabled={assigningPolicy === policy.id}
                                      className="ml-4 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {assigningPolicy === policy.id ? (
                                        <>
                                          <Activity className="w-4 h-4 inline mr-1 animate-spin" />
                                          Assigning...
                                        </>
                                      ) : (
                                        'Assign'
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ))}

                            {availablePolicies.filter(p => !policies.find(ap => ap.id === p.id)).length === 0 && (
                              <div className="text-center py-8">
                                <Shield className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
                                <p className={`${themeClasses.text.secondary}`}>
                                  No compatible policies available to assign
                                </p>
                                <p className={`text-xs ${themeClasses.text.muted} mt-2`}>
                                  All compatible policies for {agent?.os_type} are already assigned
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setShowAssignModal(false)}
                        className={`px-4 py-2 text-sm font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} rounded-lg transition-colors`}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
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

      {/* Execution Details Modal */}
      {selectedExecutionId && (
        <ExecutionDetailsModal
          isOpen={!!selectedExecutionId}
          onClose={() => setSelectedExecutionId(null)}
          executionId={selectedExecutionId}
        />
      )}
    </div>
  );
};

export default AgentDetails;
