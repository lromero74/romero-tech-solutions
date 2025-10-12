import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Filter, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';

interface AlertHistoryDashboardProps {
  onNavigateToAgent?: (context: {
    agentId: string;
    resource: 'cpu' | 'memory' | 'disk';
    timestamp: string;
    indicator?: string;
    alertId?: number;
  }) => void;
}

interface AlertHistoryItem {
  id: number;
  agent_id: string;
  agent_name?: string;
  configuration_id: number;
  alert_name: string;
  alert_type: string;
  severity: string;
  indicator_count: number;
  contributing_indicators: any;
  metric_values: any;
  triggered_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
}

interface AlertStats {
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  by_severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

// Cache alerts and stats outside component to persist across unmounts
let cachedAlerts: AlertHistoryItem[] | null = null;
let cachedStats: AlertStats | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 30 * 1000; // 30 seconds (shorter for real-time alert data)

const AlertHistoryDashboard: React.FC<AlertHistoryDashboardProps> = ({ onNavigateToAgent }) => {
  const [alerts, setAlerts] = useState<AlertHistoryItem[]>(cachedAlerts || []);
  const [stats, setStats] = useState<AlertStats | null>(cachedStats);
  const [loading, setLoading] = useState(!cachedAlerts);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Filters
  const [filters, setFilters] = useState({
    agentId: '',
    severity: '',
    alertType: '',
    acknowledged: '',
    resolved: '',
    startDate: '',
    endDate: '',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState<number | null>(null);

  // Check if filters are empty (default state)
  const hasActiveFilters = Object.values(filters).some(v => v);

  useEffect(() => {
    // If filters are active, always reload (no caching with filters)
    if (hasActiveFilters) {
      loadAlerts();
      loadStats();
      return;
    }

    // For default view (no filters), use cache if valid
    const isCacheValid = cachedAlerts && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION);

    if (!isCacheValid && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadAlerts();
      loadStats();
    } else if (isCacheValid) {
      // Use cached data immediately
      setAlerts(cachedAlerts!);
      setStats(cachedStats);
      setLoading(false);
    }
  }, [filters, hasActiveFilters]);

  // Listen for real-time alert notifications via CustomEvent
  useEffect(() => {
    const handleAlertCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('📬 Alert notification received in AlertHistoryDashboard:', customEvent.detail);

      // Invalidate cache
      cachedAlerts = null;
      cachedStats = null;
      cacheTimestamp = null;

      // Reload data to show new alert
      loadAlerts();
      loadStats();
    };

    window.addEventListener('alert:created', handleAlertCreated);
    return () => window.removeEventListener('alert:created', handleAlertCreated);
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.agentId) params.append('agent_id', filters.agentId);
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.alertType) params.append('alert_type', filters.alertType);
      if (filters.acknowledged) params.append('acknowledged', filters.acknowledged);
      if (filters.resolved) params.append('resolved', filters.resolved);
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);

      const response = await api.get(`/admin/alerts/history?${params.toString()}`);
      const data = response.data;

      setAlerts(data);

      // Only cache if no filters are active
      if (!hasActiveFilters) {
        cachedAlerts = data;
        cacheTimestamp = Date.now();
      }
    } catch (err: any) {
      console.error('Failed to load alert history:', err);
      setError(err.response?.data?.message || 'Failed to load alert history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/alerts/stats');
      const data = response.data;

      setStats(data);

      // Only cache if no filters are active
      if (!hasActiveFilters) {
        cachedStats = data;
      }
    } catch (err) {
      console.error('Failed to load alert stats:', err);
    }
  };

  const handleAcknowledge = async (alertId: number) => {
    try {
      await api.post(`/admin/alerts/history/${alertId}/acknowledge`, {
        notes: 'Acknowledged via dashboard',
      });
      await loadAlerts();
      await loadStats();
    } catch (err: any) {
      console.error('Failed to acknowledge alert:', err);
      alert(err.response?.data?.message || 'Failed to acknowledge alert');
    }
  };

  const handleResolve = async (alertId: number) => {
    try {
      await api.post(`/admin/alerts/history/${alertId}/resolve`, {
        notes: 'Resolved via dashboard',
      });
      await loadAlerts();
      await loadStats();
    } catch (err: any) {
      console.error('Failed to resolve alert:', err);
      alert(err.response?.data?.message || 'Failed to resolve alert');
    }
  };

  const handleTriggerTestAlert = async () => {
    try {
      const response = await api.post('/admin/alerts/test/trigger');
      console.log('✅ Test alert triggered:', response.data);

      // Refresh alerts to show the new test alert
      await loadAlerts();
      await loadStats();
    } catch (err: any) {
      console.error('Failed to trigger test alert:', err);
      alert(err.response?.data?.message || 'Failed to trigger test alert');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getAlertTypeIcon = (alertType: string) => {
    switch (alertType) {
      case 'high_utilization': return <TrendingUp className="w-5 h-5" />;
      case 'low_utilization': return <TrendingDown className="w-5 h-5" />;
      case 'rising_trend': return <TrendingUp className="w-5 h-5" />;
      case 'declining_trend': return <TrendingDown className="w-5 h-5" />;
      case 'volatility_spike': return <Activity className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <AlertTriangle className="w-8 h-8 text-orange-500 mr-3" />
          <div>
            <h1 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
              Alert History
            </h1>
            <p className={`text-sm ${themeClasses.text.secondary}`}>
              Monitor and manage indicator confluence alerts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerTestAlert}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Trigger Test Alert
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center px-4 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} hover:bg-gray-100 dark:hover:bg-gray-700`}
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`${themeClasses.bg.card} rounded-lg p-4 border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Total Alerts</p>
                <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>{stats.total}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <div className={`${themeClasses.bg.card} rounded-lg p-4 border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Active</p>
                <p className={`text-2xl font-bold text-red-600`}>{stats.active}</p>
              </div>
              <Clock className="w-8 h-8 text-red-400" />
            </div>
          </div>

          <div className={`${themeClasses.bg.card} rounded-lg p-4 border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Acknowledged</p>
                <p className={`text-2xl font-bold text-yellow-600`}>{stats.acknowledged}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-yellow-400" />
            </div>
          </div>

          <div className={`${themeClasses.bg.card} rounded-lg p-4 border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Resolved</p>
                <p className={`text-2xl font-bold text-green-600`}>{stats.resolved}</p>
              </div>
              <XCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className={`${themeClasses.bg.card} rounded-lg p-4 border ${themeClasses.border.primary}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Severity
              </label>
              <select
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              >
                <option value="">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Alert Type
              </label>
              <select
                value={filters.alertType}
                onChange={(e) => setFilters({ ...filters, alertType: e.target.value })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              >
                <option value="">All Types</option>
                <option value="high_utilization">High Utilization</option>
                <option value="low_utilization">Low Utilization</option>
                <option value="rising_trend">Rising Trend</option>
                <option value="declining_trend">Declining Trend</option>
                <option value="volatility_spike">Volatility Spike</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Status
              </label>
              <select
                value={filters.acknowledged}
                onChange={(e) => setFilters({ ...filters, acknowledged: e.target.value, resolved: '' })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              >
                <option value="">All Statuses</option>
                <option value="false">Unacknowledged</option>
                <option value="true">Acknowledged</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Resolution
              </label>
              <select
                value={filters.resolved}
                onChange={(e) => setFilters({ ...filters, resolved: e.target.value })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              >
                <option value="">All</option>
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Start Date
              </label>
              <input
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                End Date
              </label>
              <input
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  agentId: '',
                  severity: '',
                  alertType: '',
                  acknowledged: '',
                  resolved: '',
                  startDate: '',
                  endDate: '',
                })}
                className={`w-full px-4 py-2 text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} border ${themeClasses.border.primary} hover:bg-gray-100 dark:hover:bg-gray-700`}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Alert List */}
      {loading ? (
        <div className={`${themeClasses.bg.card} rounded-lg p-8 text-center border ${themeClasses.border.primary}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className={themeClasses.text.secondary}>Loading alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className={`${themeClasses.bg.card} rounded-lg p-8 text-center border ${themeClasses.border.primary}`}>
          <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className={`text-lg font-medium ${themeClasses.text.primary} mb-2`}>No alerts found</p>
          <p className={themeClasses.text.secondary}>
            {Object.values(filters).some(v => v)
              ? 'Try adjusting your filters'
              : 'Alerts will appear here when indicators detect confluence conditions'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`${themeClasses.bg.card} rounded-lg border-l-4 ${getSeverityColor(alert.severity)} shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={getSeverityColor(alert.severity)}>
                      {getAlertTypeIcon(alert.alert_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                          {alert.alert_name}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        {alert.acknowledged_at && !alert.resolved_at && (
                          <span className="px-2 py-1 text-xs font-medium rounded text-yellow-600 bg-yellow-50 border border-yellow-200">
                            ACKNOWLEDGED
                          </span>
                        )}
                        {alert.resolved_at && (
                          <span className="px-2 py-1 text-xs font-medium rounded text-green-600 bg-green-50 border border-green-200">
                            RESOLVED
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${themeClasses.text.secondary} mb-2`}>
                        {alert.agent_name || `Agent ${alert.agent_id}`} • {alert.indicator_count} indicators in confluence
                      </p>
                      <p className={`text-sm ${themeClasses.text.secondary}`}>
                        Triggered: {formatDate(alert.triggered_at)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 ml-4">
                    {!alert.acknowledged_at && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-yellow-600 bg-yellow-50 border border-yellow-200 hover:bg-yellow-100"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Acknowledge
                      </button>
                    )}
                    {alert.acknowledged_at && !alert.resolved_at && (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-green-600 bg-green-50 border border-green-200 hover:bg-green-100"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                      className={`px-3 py-1 text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} border ${themeClasses.border.primary} hover:bg-gray-100 dark:hover:bg-gray-700`}
                    >
                      {expandedAlert === alert.id ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedAlert === alert.id && (
                  <div className={`mt-4 pt-4 border-t ${themeClasses.border.primary} space-y-3`}>
                    <div>
                      <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                        Contributing Indicators
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(alert.contributing_indicators || {}).map(([key, value]: [string, any]) => {
                          const isDetailedIndicator = value && typeof value === 'object' && value.indicator && value.resource;

                          if (isDetailedIndicator) {
                            // Enhanced indicator with context
                            return (
                              <div
                                key={key}
                                className={`${themeClasses.bg.secondary} rounded-lg p-3 border ${themeClasses.border.primary} ${
                                  value.clickable ? 'cursor-pointer hover:shadow-md transition-shadow hover:border-blue-500' : ''
                                }`}
                                onClick={() => {
                                  if (value.clickable && onNavigateToAgent) {
                                    console.log('📍 Navigating from alert to agent:', {
                                      agentId: value.agent_id,
                                      resource: value.resource,
                                      timestamp: value.timestamp,
                                      indicator: value.indicator,
                                      alertId: alert.id
                                    });
                                    onNavigateToAgent({
                                      agentId: value.agent_id,
                                      resource: value.resource,
                                      timestamp: value.timestamp,
                                      indicator: value.indicator,
                                      alertId: alert.id
                                    });
                                  }
                                }}
                                title={value.clickable ? `Click to view ${value.resource.toUpperCase()} chart at ${new Date(value.timestamp).toLocaleTimeString()}` : ''}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <span className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                                    {value.indicator}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    value.signal === 'overbought' || value.signal === 'oversold'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  }`}>
                                    {value.signal}
                                  </span>
                                </div>
                                <div className={`text-xs ${themeClasses.text.secondary} space-y-1`}>
                                  <div className="flex justify-between">
                                    <span>Resource:</span>
                                    <span className="font-medium">{value.resource.toUpperCase()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Value:</span>
                                    <span className="font-medium">{value.value || `K:${value.k} D:${value.d}` || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Threshold:</span>
                                    <span className="font-medium">{value.threshold}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Metric Value:</span>
                                    <span className="font-medium">
                                      {value.resource_value != null ? Number(value.resource_value).toFixed(1) : 'N/A'}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Time:</span>
                                    <span className="font-medium">{new Date(value.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                </div>
                                {value.clickable && (
                                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                      🔍 Click to view in agent dashboard
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            // Legacy format - simple display
                            return (
                              <div key={key} className={`${themeClasses.bg.secondary} rounded p-2`}>
                                <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                  {key.toUpperCase()}:
                                </span>
                                <span className={`text-sm ${themeClasses.text.secondary} ml-2`}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>

                    {alert.acknowledged_at && (
                      <div className={`${themeClasses.bg.secondary} rounded p-3`}>
                        <p className={`text-sm ${themeClasses.text.primary}`}>
                          <span className="font-medium">Acknowledged:</span> {formatDate(alert.acknowledged_at)}
                          {alert.acknowledged_by && ` by ${alert.acknowledged_by}`}
                        </p>
                      </div>
                    )}

                    {alert.resolved_at && (
                      <div className={`${themeClasses.bg.secondary} rounded p-3`}>
                        <p className={`text-sm ${themeClasses.text.primary}`}>
                          <span className="font-medium">Resolved:</span> {formatDate(alert.resolved_at)}
                          {alert.resolved_by && ` by ${alert.resolved_by}`}
                        </p>
                      </div>
                    )}

                    {alert.notes && (
                      <div className={`${themeClasses.bg.secondary} rounded p-3`}>
                        <p className={`text-sm font-medium ${themeClasses.text.primary} mb-1`}>Notes:</p>
                        <p className={`text-sm ${themeClasses.text.secondary}`}>{alert.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertHistoryDashboard;
