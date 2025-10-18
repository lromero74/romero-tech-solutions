import React, { useState, useEffect, useCallback } from 'react';
import { TestTube, Server, Laptop, Monitor, Circle, AlertTriangle, Activity, RefreshCw, Filter, X, Eye, Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';

interface TrialAgentsDashboardProps {
  onViewAgentDetails?: (agentId: string) => void;
  onConvertTrial?: (trialId: string) => void;
}

const TrialAgentsDashboard: React.FC<TrialAgentsDashboardProps> = ({
  onViewAgentDetails,
  onConvertTrial,
}) => {
  const [trialAgents, setTrialAgents] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('trial_end_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Permission checks
  const { checkPermission, loading: permissionsLoading } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load trial agents
  const loadTrialAgents = useCallback(async () => {
    if (permissionsLoading) {
      return;
    }

    if (!canViewAgents) {
      setPermissionDenied({
        show: true,
        action: 'View Trial Agents',
        requiredPermission: 'view.agents.enable',
        message: 'You do not have permission to view trial agents'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await agentService.listTrialAgents();
      if (response.success && response.data) {
        setTrialAgents(response.data.agents);
      } else {
        setError(response.message || 'Failed to load trial agents');
      }
    } catch (err) {
      console.error('Error loading trial agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trial agents');
    } finally {
      setLoading(false);
    }
  }, [canViewAgents, permissionsLoading]);

  useEffect(() => {
    loadTrialAgents();
  }, [loadTrialAgents]);

  // Calculate trial status
  const getTrialStatus = (agent: AgentDevice): {
    status: 'active' | 'expiring-soon' | 'expired' | 'converted';
    daysRemaining: number;
    percentUsed: number;
    color: string;
    bgColor: string;
    label: string;
  } => {
    if (agent.trial_converted_at) {
      return {
        status: 'converted',
        daysRemaining: 0,
        percentUsed: 100,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        label: 'Converted'
      };
    }

    if (!agent.trial_start_date || !agent.trial_end_date) {
      return {
        status: 'expired',
        daysRemaining: 0,
        percentUsed: 100,
        color: 'text-red-600',
        bgColor: 'bg-red-100 dark:bg-red-900/20',
        label: 'Unknown'
      };
    }

    const now = new Date();
    const startDate = new Date(agent.trial_start_date);
    const endDate = new Date(agent.trial_end_date);

    const totalMs = endDate.getTime() - startDate.getTime();
    const elapsedMs = now.getTime() - startDate.getTime();
    const remainingMs = endDate.getTime() - now.getTime();

    const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const percentUsed = Math.min(100, Math.round((elapsedMs / totalMs) * 100));

    if (remainingMs <= 0) {
      return {
        status: 'expired',
        daysRemaining: 0,
        percentUsed: 100,
        color: 'text-red-600',
        bgColor: 'bg-red-100 dark:bg-red-900/20',
        label: 'Expired'
      };
    }

    if (daysRemaining <= 3) {
      return {
        status: 'expiring-soon',
        daysRemaining,
        percentUsed,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100 dark:bg-orange-900/20',
        label: `${daysRemaining}d left`
      };
    }

    return {
      status: 'active',
      daysRemaining,
      percentUsed,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      label: `${daysRemaining}d left`
    };
  };

  // Get device icon
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />;
      case 'laptop':
        return <Laptop className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  // Filter and sort
  const getFilteredAndSortedAgents = (): AgentDevice[] => {
    let filtered = trialAgents;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.device_name.toLowerCase().includes(search) ||
        agent.os_type.toLowerCase().includes(search) ||
        agent.trial_original_id?.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(agent => {
        const trialStatus = getTrialStatus(agent);
        return trialStatus.status === statusFilter;
      });
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
        case 'trial_end_date':
          compareA = a.trial_end_date ? new Date(a.trial_end_date).getTime() : 0;
          compareB = b.trial_end_date ? new Date(b.trial_end_date).getTime() : 0;
          break;
        case 'days_remaining':
          compareA = getTrialStatus(a).daysRemaining;
          compareB = getTrialStatus(b).daysRemaining;
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
    total: trialAgents.length,
    active: trialAgents.filter(a => {
      const status = getTrialStatus(a);
      return status.status === 'active';
    }).length,
    expiringSoon: trialAgents.filter(a => {
      const status = getTrialStatus(a);
      return status.status === 'expiring-soon';
    }).length,
    expired: trialAgents.filter(a => {
      const status = getTrialStatus(a);
      return status.status === 'expired';
    }).length,
    converted: trialAgents.filter(a => a.trial_converted_at !== null).length,
    conversionRate: trialAgents.length > 0
      ? Math.round((trialAgents.filter(a => a.trial_converted_at !== null).length / trialAgents.length) * 100)
      : 0
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Trial Agents</h1>
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
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Trial Agents</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            You do not have permission to view trial agents
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
        <div>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Trial Agents</h1>
          <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
            Manage and monitor 30-day trial agents
          </p>
        </div>
        <button
          onClick={loadTrialAgents}
          className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Refresh trial agents"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Trials</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{stats.total}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Expiring Soon</div>
          <div className="text-2xl font-bold text-orange-600">{stats.expiringSoon}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Expired</div>
          <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Converted</div>
          <div className="text-2xl font-bold text-blue-600">{stats.converted}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Conversion Rate</div>
          <div className="text-2xl font-bold text-purple-600">{stats.conversionRate}%</div>
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
              placeholder="Search devices, trial IDs..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Trial Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expiring-soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted</option>
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
          <p className={`${themeClasses.text.secondary}`}>Loading trial agents...</p>
        </div>
      )}

      {/* Trial Agents Table */}
      {!loading && filteredAgents.length > 0 && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
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
                    Trial ID
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    OS Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('trial_end_date')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Expires
                      <span className="ml-1">{getSortIndicator('trial_end_date')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('days_remaining')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Days Left
                      <span className="ml-1">{getSortIndicator('days_remaining')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Progress
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredAgents.map((agent) => {
                  const trialStatus = getTrialStatus(agent);
                  return (
                    <tr key={agent.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full ${trialStatus.bgColor} flex items-center justify-center ${trialStatus.color}`}>
                            {getDeviceIcon(agent.device_type)}
                          </div>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {agent.device_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-xs ${themeClasses.text.secondary} font-mono`}>
                          {agent.trial_original_id || agent.id}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.os_type} {agent.os_version}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.secondary}`}>
                          {formatDate(agent.trial_end_date)}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${trialStatus.bgColor} ${trialStatus.color}`}>
                          {trialStatus.status === 'converted' ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          ) : trialStatus.status === 'expired' ? (
                            <XCircle className="w-3 h-3 mr-1" />
                          ) : (
                            <Clock className="w-3 h-3 mr-1" />
                          )}
                          {trialStatus.label}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                trialStatus.percentUsed >= 90 ? 'bg-red-500' :
                                trialStatus.percentUsed >= 70 ? 'bg-orange-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${trialStatus.percentUsed}%` }}
                            />
                          </div>
                          <span className={`text-xs ${themeClasses.text.secondary} min-w-[3rem] text-right`}>
                            {trialStatus.percentUsed}%
                          </span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewAgentDetails?.(agent.id)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canManageAgents && trialStatus.status !== 'converted' && trialStatus.status !== 'expired' && (
                            <button
                              onClick={() => onConvertTrial?.(agent.trial_original_id || agent.id)}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                              title="Convert to paid"
                            >
                              <TrendingUp className="w-4 h-4" />
                            </button>
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

      {/* Empty State */}
      {!loading && filteredAgents.length === 0 && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <TestTube className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>
            {searchTerm || statusFilter !== 'all'
              ? 'No trial agents found matching your filters.'
              : 'No trial agents yet. Trial agents will appear here when users start free trials.'}
          </p>
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
    </div>
  );
};

export default TrialAgentsDashboard;
