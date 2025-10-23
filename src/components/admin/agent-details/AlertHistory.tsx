import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell, Clock, CheckCircle, XCircle, AlertTriangle, Filter, TrendingUp,
  Calendar, Activity, BarChart3, Timer, AlertOctagon
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { themeClasses } from '../../../contexts/ThemeContext';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { agentService, AgentAlert } from '../../../services/agentService';

interface AlertHistoryProps {
  agentId: string;
  onNavigateToMetric?: (timestamp: string, resource: 'cpu' | 'memory' | 'disk') => void;
}

interface AlertStats {
  total: number;
  active: number;
  resolved: number;
  acknowledged: number;
  avgResolutionTimeMinutes: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  last24Hours: number;
  last7Days: number;
  last30Days: number;
}

const AlertHistory: React.FC<AlertHistoryProps> = ({ agentId, onNavigateToMetric }) => {
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'all' | '24h' | '7d' | '30d'>('30d');

  const { t } = useOptionalClientLanguage();

  // Load alerts
  useEffect(() => {
    loadAlerts();
  }, [agentId]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      // Fetch all alerts (no status filter to get full history)
      const response = await agentService.getAgentAlerts(agentId, {});
      if (response.success && response.data) {
        setAlerts(response.data.alerts);
      }
    } catch (err) {
      console.error('Error loading alert history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics from alerts
  const statistics = useMemo((): AlertStats => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate average resolution time for resolved alerts
    const resolvedAlerts = alerts.filter(a => a.resolved_at);
    const totalResolutionTime = resolvedAlerts.reduce((sum, alert) => {
      if (!alert.resolved_at || !alert.triggered_at) return sum;
      const triggered = new Date(alert.triggered_at).getTime();
      const resolved = new Date(alert.resolved_at).getTime();
      return sum + (resolved - triggered);
    }, 0);
    const avgResolutionTimeMinutes = resolvedAlerts.length > 0
      ? Math.round(totalResolutionTime / resolvedAlerts.length / 1000 / 60)
      : 0;

    return {
      total: alerts.length,
      active: alerts.filter(a => a.status === 'active').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      avgResolutionTimeMinutes,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
      },
      last24Hours: alerts.filter(a => new Date(a.triggered_at || a.created_at) >= last24h).length,
      last7Days: alerts.filter(a => new Date(a.triggered_at || a.created_at) >= last7d).length,
      last30Days: alerts.filter(a => new Date(a.triggered_at || a.created_at) >= last30d).length,
    };
  }, [alerts]);

  // Filter alerts based on selected filters
  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }

    // Time range filter
    if (timeRangeFilter !== 'all') {
      const now = new Date();
      let cutoffTime: Date;

      switch (timeRangeFilter) {
        case '24h':
          cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffTime = new Date(0);
      }

      filtered = filtered.filter(a =>
        new Date(a.triggered_at || a.created_at) >= cutoffTime
      );
    }

    return filtered;
  }, [alerts, statusFilter, severityFilter, timeRangeFilter]);

  // Group alerts by day for timeline
  const alertsByDay = useMemo(() => {
    const grouped = new Map<string, AgentAlert[]>();

    filteredAlerts.forEach(alert => {
      const date = new Date(alert.triggered_at || alert.created_at);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)!.push(alert);
    });

    // Convert to array and sort by date (newest first)
    return Array.from(grouped.entries())
      .map(([date, alerts]) => ({ date, alerts }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredAlerts]);

  // Get severity badge classes
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  // Get status badge classes
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200';
      case 'acknowledged':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <AlertTriangle className="w-3 h-3" />;
      case 'acknowledged':
        return <Clock className="w-3 h-3" />;
      case 'resolved':
        return <CheckCircle className="w-3 h-3" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  // Format duration
  const formatDuration = (startTime: string, endTime: string | null): string => {
    if (!endTime) return 'Ongoing';

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = end - start;

    const minutes = Math.floor(durationMs / 1000 / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) return `${hours}h ${remainingMinutes}m`;

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  };

  // Extract resource type from alert message/type
  const getAlertResourceType = (alert: AgentAlert): 'cpu' | 'memory' | 'disk' | null => {
    const message = (alert.message || alert.alert_message || '').toLowerCase();
    const alertType = (alert.alert_type || '').toLowerCase();

    if (message.includes('cpu') || alertType.includes('cpu')) return 'cpu';
    if (message.includes('memory') || message.includes('ram') || alertType.includes('memory')) return 'memory';
    if (message.includes('disk') || message.includes('storage') || alertType.includes('disk')) return 'disk';

    return null;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Activity className={`w-8 h-8 mx-auto mb-3 animate-spin ${themeClasses.text.muted}`} />
        <p className={`${themeClasses.text.secondary}`}>Loading alert history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Alerts */}
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Total Alerts</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>{statistics.total}</p>
              <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                {statistics.active} active, {statistics.resolved} resolved
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
              <Bell className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        {/* Average Resolution Time */}
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Avg Resolution Time</p>
              <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {statistics.avgResolutionTimeMinutes > 0 ? (
                  statistics.avgResolutionTimeMinutes < 60
                    ? `${statistics.avgResolutionTimeMinutes}m`
                    : `${Math.floor(statistics.avgResolutionTimeMinutes / 60)}h ${statistics.avgResolutionTimeMinutes % 60}m`
                ) : 'N/A'}
              </p>
              <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                {statistics.resolved} alerts resolved
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <Timer className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* By Severity */}
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={`text-xs ${themeClasses.text.muted} mb-2`}>By Severity</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-600 dark:text-red-400 flex items-center">
                    <AlertOctagon className="w-3 h-3 mr-1" />
                    Critical
                  </span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.bySeverity.critical}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-yellow-600 dark:text-yellow-400 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Warning
                  </span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.bySeverity.warning}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600 dark:text-blue-400 flex items-center">
                    <Bell className="w-3 h-3 mr-1" />
                    Info
                  </span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.bySeverity.info}</span>
                </div>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={`text-xs ${themeClasses.text.muted} mb-2`}>Recent Activity</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={themeClasses.text.secondary}>Last 24h</span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.last24Hours}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={themeClasses.text.secondary}>Last 7d</span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.last7Days}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={themeClasses.text.secondary}>Last 30d</span>
                  <span className={`font-semibold ${themeClasses.text.primary}`}>{statistics.last30Days}</span>
                </div>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-4`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${themeClasses.text.muted}`} />
            <span className={`text-sm font-medium ${themeClasses.text.primary}`}>Filters:</span>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary}`}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={`text-xs px-2 py-1 rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary}`}>Severity:</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className={`text-xs px-2 py-1 rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary}`}>Time Range:</label>
            <select
              value={timeRangeFilter}
              onChange={(e) => setTimeRangeFilter(e.target.value as any)}
              className={`text-xs px-2 py-1 rounded border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary}`}
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div className="ml-auto">
            <span className={`text-xs ${themeClasses.text.muted}`}>
              Showing {filteredAlerts.length} of {statistics.total} alerts
            </span>
          </div>
        </div>
      </div>

      {/* Timeline View */}
      <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-6`}>
        <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
          <Calendar className="w-5 h-5 mr-2" />
          Alert Timeline
        </h3>

        {alertsByDay.length === 0 ? (
          <div className="text-center py-8">
            <Bell className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
            <p className={`${themeClasses.text.secondary}`}>No alerts found for the selected filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            {alertsByDay.map(({ date, alerts }) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                    {new Date(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div className={`flex-1 h-px ${themeClasses.bg.secondary}`} />
                  <div className={`text-xs ${themeClasses.text.muted}`}>
                    {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}
                  </div>
                </div>

                {/* Alerts for this day */}
                <div className="space-y-2 ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                  {alerts.map((alert) => {
                    const resourceType = getAlertResourceType(alert);
                    const canNavigate = resourceType && onNavigateToMetric;

                    return (
                      <div
                        key={alert.id}
                        className={`${themeClasses.bg.hover} rounded-lg border ${themeClasses.border.primary} p-3 ${
                          canNavigate ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                        }`}
                        onClick={() => {
                          if (canNavigate) {
                            onNavigateToMetric(alert.triggered_at || alert.created_at, resourceType);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {/* Alert Header */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadge(alert.severity)}`}>
                                {alert.severity}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${getStatusBadge(alert.status)}`}>
                                {getStatusIcon(alert.status)}
                                {alert.status}
                              </span>
                              <span className={`text-xs ${themeClasses.text.muted}`}>
                                {new Date(alert.triggered_at || alert.created_at).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            {/* Alert Message */}
                            <p className={`text-sm ${themeClasses.text.primary} mb-2`}>
                              {alert.message || alert.alert_message}
                            </p>

                            {/* Alert Metadata */}
                            <div className="flex items-center gap-4 text-xs">
                              {alert.alert_type && (
                                <span className={`${themeClasses.text.secondary}`}>
                                  Type: <span className="font-medium">{alert.alert_type}</span>
                                </span>
                              )}
                              {alert.metric_value !== null && alert.threshold_value !== null && (
                                <span className={`${themeClasses.text.secondary}`}>
                                  Value: <span className="font-medium">{alert.metric_value}%</span> / Threshold: <span className="font-medium">{alert.threshold_value}%</span>
                                </span>
                              )}
                              {alert.status !== 'active' && (
                                <span className={`${themeClasses.text.secondary}`}>
                                  Duration: <span className="font-medium">{formatDuration(alert.triggered_at || alert.created_at, alert.resolved_at)}</span>
                                </span>
                              )}
                            </div>

                            {/* Resolution Notes */}
                            {alert.resolution_notes && (
                              <div className={`mt-2 pt-2 border-t ${themeClasses.border.primary}`}>
                                <p className={`text-xs ${themeClasses.text.muted}`}>
                                  <span className="font-medium">Resolution Notes:</span> {alert.resolution_notes}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Navigate Icon */}
                          {canNavigate && (
                            <div className={`${themeClasses.text.muted} hover:text-blue-600 transition-colors`}>
                              <TrendingUp className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertHistory;
