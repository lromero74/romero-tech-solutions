import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity, Plus, RefreshCw, Filter, X, Eye, Power, Trash2, MapPin, Edit, User, Building, Settings } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import { websocketService } from '../../services/websocketService';
import AgentEditModal from './AgentEditModal';
import { useAdminData } from '../../contexts/AdminDataContext';
import AgentAlertAggregationModal from './AgentAlertAggregationModal';

interface AgentDashboardProps {
  onViewAgentDetails?: (agentId: string) => void;
  onCreateRegistrationToken?: () => void;
  onViewBusiness?: (businessId: string) => void;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({
  onViewAgentDetails,
  onCreateRegistrationToken,
  onViewBusiness,
}) => {
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('device_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    show: boolean;
    agentId?: string;
    agentName?: string;
  }>({ show: false });
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentDevice | null>(null);
  const [showAggregationModal, setShowAggregationModal] = useState(false);
  const [aggregationModalAgent, setAggregationModalAgent] = useState<AgentDevice | null>(null);

  // Get businesses and service locations for the edit modal
  const { businesses, serviceLocations } = useAdminData();

  // Permission checks
  const { checkPermission, loading: permissionsLoading } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');
  const canCreateTokens = checkPermission('create.agent_tokens.enable');
  const canEditAgents = checkPermission('edit.agents.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load agents
  const loadAgents = useCallback(async () => {
    // Don't check permissions while they're still loading
    if (permissionsLoading) {
      return;
    }

    if (!canViewAgents) {
      setPermissionDenied({
        show: true,
        action: 'View Agents',
        requiredPermission: 'view.agents.enable',
        message: 'You do not have permission to view monitoring agents'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await agentService.listAgents();
      if (response.success && response.data) {
        setAgents(response.data.agents);
      } else {
        setError(response.message || 'Failed to load agents');
      }
    } catch (err) {
      console.error('Error loading agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [canViewAgents, permissionsLoading]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Toggle agent monitoring (enable/disable)
  const handleToggleMonitoring = async (agent: AgentDevice) => {
    if (!canManageAgents) {
      setPermissionDenied({
        show: true,
        action: 'Manage Agent',
        requiredPermission: 'manage.agents.enable',
        message: 'You do not have permission to disable/enable agents'
      });
      return;
    }

    try {
      setActionInProgress(agent.id);
      const newStatus = !agent.monitoring_enabled;

      const response = await agentService.updateAgent(agent.id, {
        monitoring_enabled: newStatus
      });

      if (response.success) {
        // Update local state
        setAgents(prevAgents =>
          prevAgents.map(a =>
            a.id === agent.id ? { ...a, monitoring_enabled: newStatus } : a
          )
        );
      } else {
        setError(response.message || 'Failed to update agent');
      }
    } catch (err) {
      console.error('Error toggling agent monitoring:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setActionInProgress(null);
    }
  };

  // Delete agent
  const handleDeleteAgent = async () => {
    if (!canManageAgents) {
      setPermissionDenied({
        show: true,
        action: 'Delete Agent',
        requiredPermission: 'manage.agents.enable',
        message: 'You do not have permission to delete agents'
      });
      return;
    }

    if (!confirmDelete.agentId) return;

    try {
      setActionInProgress(confirmDelete.agentId);
      const response = await agentService.deleteAgent(confirmDelete.agentId);

      if (response.success) {
        // Remove from local state
        setAgents(prevAgents => prevAgents.filter(a => a.id !== confirmDelete.agentId));
        setConfirmDelete({ show: false });
      } else {
        setError(response.message || 'Failed to delete agent');
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setActionInProgress(null);
      setConfirmDelete({ show: false });
    }
  };

  // Edit agent
  const handleEditAgent = (agent: AgentDevice) => {
    if (!canEditAgents) {
      setPermissionDenied({
        show: true,
        action: 'Edit Agent',
        requiredPermission: 'edit.agents.enable',
        message: 'You do not have permission to edit agents'
      });
      return;
    }

    setSelectedAgent(agent);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedAgent(null);
  };

  const handleAgentUpdated = () => {
    // Reload agents after edit
    loadAgents();
  };

  // Open aggregation settings modal
  const handleOpenAggregationModal = (agent: AgentDevice) => {
    setAggregationModalAgent(agent);
    setShowAggregationModal(true);
  };

  const handleCloseAggregationModal = () => {
    setShowAggregationModal(false);
    setAggregationModalAgent(null);
  };

  const handleAggregationUpdated = () => {
    // Reload agents after aggregation update
    loadAgents();
  };

  // WebSocket real-time updates for agent status and metrics
  useEffect(() => {
    if (!canViewAgents) return;

    console.log('🔌 Setting up WebSocket listeners for agent updates');

    // Listen for agent status updates
    const unsubscribeStatus = websocketService.onAgentStatusChange((update) => {
      console.log(`🤖 Agent status update received: ${update.agentId} = ${update.status}`);

      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          if (agent.id === update.agentId) {
            return {
              ...agent,
              status: update.status,
              last_heartbeat: update.lastHeartbeat,
            };
          }
          return agent;
        });
      });
    });

    // Listen for agent metrics updates
    const unsubscribeMetrics = websocketService.onAgentMetricsChange((update) => {
      console.log(`📊 Agent metrics update received: ${update.agentId}`);

      setAgents((prevAgents) => {
        return prevAgents.map((agent) => {
          if (agent.id === update.agentId) {
            // Update agent with new metrics data
            return {
              ...agent,
              // Metrics are updated but we don't display them in the list view
              // The AgentDetails component will handle detailed metrics display
            };
          }
          return agent;
        });
      });
    });

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up WebSocket listeners for agent updates');
      unsubscribeStatus();
      unsubscribeMetrics();
    };
  }, [canViewAgents]);

  // Get device icon based on type
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />;
      case 'desktop':
      case 'workstation':
        return <Monitor className="w-5 h-5" />;
      case 'laptop':
        return <Laptop className="w-5 h-5" />;
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  // Get business display name (handles individuals vs businesses)
  const getBusinessDisplayName = (agent: AgentDevice) => {
    if (agent.is_individual && agent.individual_first_name && agent.individual_last_name) {
      // For individuals, use actual first and last name from users table
      return `${agent.individual_first_name} ${agent.individual_last_name}`;
    }
    return agent.business_name || '';
  };

  // Get status color and icon
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'online':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Online'
        };
      case 'offline':
        return {
          color: 'text-red-700 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Offline'
        };
      case 'warning':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Warning'
        };
      case 'critical':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Critical'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <Circle className="w-3 h-3" />,
          label: 'Unknown'
        };
    }
  };

  // Format last heartbeat time
  const formatLastSeen = (lastHeartbeat: string | null): string => {
    if (!lastHeartbeat) return 'Never';

    const now = new Date();
    const heartbeatDate = new Date(lastHeartbeat);
    const diffMs = now.getTime() - heartbeatDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Filter and sort agents
  const getFilteredAndSortedAgents = (): AgentDevice[] => {
    let filtered = agents;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.device_name.toLowerCase().includes(search) ||
        agent.business_name?.toLowerCase().includes(search) ||
        agent.location_name?.toLowerCase().includes(search) ||
        agent.os_type.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(agent => agent.status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let compareA: string | number = '';
      let compareB: string | number = '';

      switch (sortBy) {
        case 'device_name':
          compareA = a.device_name.toLowerCase();
          compareB = b.device_name.toLowerCase();
          break;
        case 'business_name':
          compareA = (a.business_name || '').toLowerCase();
          compareB = (b.business_name || '').toLowerCase();
          break;
        case 'status':
          compareA = a.status;
          compareB = b.status;
          break;
        case 'last_heartbeat':
          compareA = a.last_heartbeat ? new Date(a.last_heartbeat).getTime() : 0;
          compareB = b.last_heartbeat ? new Date(b.last_heartbeat).getTime() : 0;
          break;
        default:
          compareA = a.device_name.toLowerCase();
          compareB = b.device_name.toLowerCase();
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  const filteredAgents = getFilteredAndSortedAgents();

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Get sort indicator
  const getSortIndicator = (column: string) => {
    if (sortBy === column) {
      return sortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };

  // Summary stats
  const stats = {
    total: agents.length,
    online: agents.filter(a => a.status === 'online').length,
    offline: agents.filter(a => a.status === 'offline').length,
    warning: agents.filter(a => a.status === 'warning').length,
    critical: agents.filter(a => a.status === 'critical').length,
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!canViewAgents) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            You do not have permission to view monitoring agents
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className="flex gap-3">
          <button
            onClick={loadAgents}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh agent list"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {canCreateTokens ? (
            <button
              onClick={onCreateRegistrationToken}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          ) : (
            <button
              onClick={() => setPermissionDenied({
                show: true,
                action: 'Deploy Agent',
                requiredPermission: 'create.agent_tokens.enable',
                message: 'You do not have permission to deploy agents'
              })}
              disabled
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
              title="Permission required"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Agents</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{stats.total}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Online</div>
          <div className="text-2xl font-bold text-green-600">{stats.online}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Offline</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.offline}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Warning</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Critical</div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4 flex items-center`}>
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search devices, businesses..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading agents...</p>
        </div>
      )}

      {/* Agent Table - Desktop */}
      {!loading && (
        <div className={`hidden lg:block ${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('device_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Device Name
                      <span className="ml-1">{getSortIndicator('device_name')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('business_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Business
                      <span className="ml-1">{getSortIndicator('business_name')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Location
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Type / OS
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('status')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Status
                      <span className="ml-1">{getSortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('last_heartbeat')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Last Seen
                      <span className="ml-1">{getSortIndicator('last_heartbeat')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredAgents.map((agent) => {
                  const statusDisplay = getStatusDisplay(agent.status);
                  return (
                    <tr key={agent.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className="flex items-center">
                          <button
                            onClick={() => onViewAgentDetails?.(agent.id)}
                            className={`flex-shrink-0 h-10 w-10 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color} cursor-pointer hover:opacity-80 transition-opacity`}
                            title="View agent details"
                          >
                            {getDeviceIcon(agent.device_type)}
                          </button>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {agent.device_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        {agent.business_id && agent.business_name ? (
                          <button
                            onClick={() => onViewBusiness?.(agent.business_id)}
                            className={`flex items-center text-sm ${themeClasses.text.primary} hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-left`}
                            title="View business details"
                          >
                            {agent.is_individual ? (
                              <User className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                            ) : (
                              <Building className={`w-4 h-4 ${themeClasses.text.muted} mr-1`} />
                            )}
                            {getBusinessDisplayName(agent)}
                          </button>
                        ) : (
                          <div className={`text-sm ${themeClasses.text.primary}`}>
                            N/A
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-4 border-r ${themeClasses.border.primary}`}>
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
                            <div className="flex items-center">
                              <MapPin className={`w-4 h-4 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                              <span className="group-hover:text-blue-600 transition-colors">
                                {agent.location_street}
                                {agent.location_street2 && ` ${agent.location_street2}`}
                              </span>
                            </div>
                            <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 ml-5 transition-colors`}>
                              {agent.location_city}, {agent.location_state} {agent.location_zip}
                            </div>
                          </button>
                        ) : (
                          <div className={`text-sm ${themeClasses.text.primary}`}>
                            {agent.location_name || 'N/A'}
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.device_type}
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>
                          {agent.os_type} {agent.os_version}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.secondary}`}>
                          {formatLastSeen(agent.last_heartbeat)}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewAgentDetails?.(agent.id)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            title="View agent details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEditAgents && (
                            <button
                              onClick={() => handleEditAgent(agent)}
                              disabled={actionInProgress === agent.id}
                              className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Edit agent"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {canManageAgents && (
                            <>
                              <button
                                onClick={() => handleOpenAggregationModal(agent)}
                                disabled={actionInProgress === agent.id}
                                className="text-cyan-600 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Alert sensitivity settings"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleMonitoring(agent)}
                                disabled={actionInProgress === agent.id}
                                className={`${
                                  agent.monitoring_enabled
                                    ? 'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300'
                                    : 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                title={agent.monitoring_enabled ? 'Disable monitoring' : 'Enable monitoring'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ show: true, agentId: agent.id, agentName: agent.device_name })}
                                disabled={actionInProgress === agent.id}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete agent"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Cards - Mobile */}
      {!loading && (
        <div className="lg:hidden space-y-4">
          {filteredAgents.map((agent) => {
            const statusDisplay = getStatusDisplay(agent.status);
            return (
              <div
                key={agent.id}
                className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onViewAgentDetails?.(agent.id)}
                      className={`h-12 w-12 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color} cursor-pointer hover:opacity-80 transition-opacity`}
                      title="View agent details"
                    >
                      {getDeviceIcon(agent.device_type)}
                    </button>
                    <div>
                      <h3 className={`text-base font-semibold ${themeClasses.text.primary}`}>
                        {agent.device_name}
                      </h3>
                      <p className={`text-sm ${themeClasses.text.secondary}`}>
                        {agent.device_type} • {agent.os_type}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                    <span className="mr-1">{statusDisplay.icon}</span>
                    {statusDisplay.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Business</span>
                    {agent.business_id && agent.business_name ? (
                      <button
                        onClick={() => onViewBusiness?.(agent.business_id)}
                        className={`flex items-center ${themeClasses.text.primary} hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-left`}
                        title="View business details"
                      >
                        {agent.is_individual ? (
                          <User className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
                        ) : (
                          <Building className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
                        )}
                        {getBusinessDisplayName(agent)}
                      </button>
                    ) : (
                      <div className={themeClasses.text.primary}>N/A</div>
                    )}
                  </div>
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Location</span>
                    {agent.location_street && agent.location_city ? (
                      <button
                        onClick={() => {
                          const streetFull = `${agent.location_street}${agent.location_street2 ? ' ' + agent.location_street2 : ''}`;
                          const fullAddress = `${streetFull}, ${agent.location_city}, ${agent.location_state} ${agent.location_zip}${agent.location_country && agent.location_country !== 'USA' ? ', ' + agent.location_country : ''}`;
                          const encodedAddress = encodeURIComponent(fullAddress);
                          const mapsUrl = `https://maps.google.com/maps?q=${encodedAddress}`;
                          window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className={`text-sm ${themeClasses.text.primary} hover:text-blue-600 transition-colors text-left group block`}
                        title="Click to open in maps"
                      >
                        <div className="flex items-center">
                          <MapPin className={`w-3 h-3 ${themeClasses.text.muted} group-hover:text-blue-600 mr-1 transition-colors`} />
                          <span className="group-hover:text-blue-600 transition-colors text-xs">
                            {agent.location_street}
                            {agent.location_street2 && ` ${agent.location_street2}`}
                          </span>
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary} group-hover:text-blue-500 ml-4 transition-colors`}>
                          {agent.location_city}, {agent.location_state} {agent.location_zip}
                        </div>
                      </button>
                    ) : (
                      <div className={themeClasses.text.primary}>{agent.location_name || 'N/A'}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs ${themeClasses.text.muted}`}>Last Seen</span>
                    <div className={themeClasses.text.primary}>{formatLastSeen(agent.last_heartbeat)}</div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2 flex-wrap">
                    {canEditAgents && (
                      <button
                        onClick={() => handleEditAgent(agent)}
                        disabled={actionInProgress === agent.id}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-purple-600 hover:text-purple-800 dark:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                    )}
                    {canManageAgents && (
                      <>
                        <button
                          onClick={() => handleToggleMonitoring(agent)}
                          disabled={actionInProgress === agent.id}
                          className={`inline-flex items-center px-3 py-2 text-sm font-medium ${
                            agent.monitoring_enabled
                              ? 'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400'
                              : 'text-green-600 hover:text-green-800 dark:text-green-400'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={agent.monitoring_enabled ? 'Disable' : 'Enable'}
                        >
                          <Power className="w-4 h-4 mr-1" />
                          {agent.monitoring_enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ show: true, agentId: agent.id, agentName: agent.device_name })}
                          disabled={actionInProgress === agent.id}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => onViewAgentDetails?.(agent.id)}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredAgents.length === 0 && (
            <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
              <Monitor className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No agents found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClasses.bg.card} rounded-lg p-6 max-w-md w-full mx-4 ${themeClasses.shadow.xl}`}>
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Delete Agent
                </h3>
                <p className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                  Are you sure you want to delete <strong>{confirmDelete.agentName}</strong>?
                  This action cannot be undone. All agent data, metrics history, and alerts will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmDelete({ show: false })}
                disabled={actionInProgress === confirmDelete.agentId}
                className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={actionInProgress === confirmDelete.agentId}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === confirmDelete.agentId ? 'Deleting...' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />

      {/* Agent Edit Modal */}
      <AgentEditModal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        agent={selectedAgent}
        businesses={businesses}
        serviceLocations={serviceLocations}
        onUpdate={handleAgentUpdated}
      />

      {/* Agent Aggregation Settings Modal */}
      {aggregationModalAgent && (
        <AgentAlertAggregationModal
          isOpen={showAggregationModal}
          onClose={handleCloseAggregationModal}
          agentId={aggregationModalAgent.id}
          agentName={aggregationModalAgent.device_name}
          currentLevel={null}
          onSuccess={handleAggregationUpdated}
        />
      )}
    </div>
  );
};

export default AgentDashboard;
