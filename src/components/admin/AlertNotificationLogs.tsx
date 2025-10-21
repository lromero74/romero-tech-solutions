import React, { useState, useEffect } from 'react';
import { Bell, Mail, MessageSquare, Globe, BellRing, CheckCircle, XCircle, Clock, Filter, Search, Calendar } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';

interface NotificationLog {
  id: number;
  alert_id: number;
  alert_name: string;
  agent_name: string;
  severity: string;
  subscriber_type: 'employee' | 'client';
  recipient_name: string;
  recipient_email?: string;
  recipient_phone?: string;
  channel: 'email' | 'sms' | 'websocket' | 'browser';
  status: 'pending' | 'sent' | 'failed';
  error_message?: string;
  sent_at: string;
  delivered_at?: string;
  created_at: string;
}

const AlertNotificationLogs: React.FC = () => {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    severity: '',
    channel: '',
    status: '',
    search: '',
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.channel) params.append('channel', filters.channel);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);

      const response = await api.get(`/admin/alerts/notifications?${params.toString()}`);
      setLogs(response.data.data || []);
      setTotalCount(response.data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load notification logs:', err);
      setError(err.message || 'Failed to load notification logs');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value });
    setPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      severity: '',
      channel: '',
      status: '',
      search: '',
    });
    setPage(1);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-4 h-4 text-blue-500" title="Email" />;
      case 'sms':
        return <MessageSquare className="w-4 h-4 text-green-500" title="SMS" />;
      case 'websocket':
        return <Globe className="w-4 h-4 text-purple-500" title="WebSocket" />;
      case 'browser':
        return <BellRing className="w-4 h-4 text-orange-500" title="Browser" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300">
            Unknown
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[severity as keyof typeof colors] || colors.medium}`}>
        {severity.toUpperCase()}
      </span>
    );
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const totalPages = Math.ceil(totalCount / limit);

  if (loading && logs.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${themeClasses.cardBg} rounded-lg`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={themeClasses.text}>Loading notification logs...</p>
        </div>
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg`}>
        <p className="text-red-700 dark:text-red-300">Error: {error}</p>
        <button
          onClick={loadLogs}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text}`}>
            <Bell className="inline-block w-6 h-6 mr-2" />
            Alert Notification Logs
          </h2>
          <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
            View delivery history for alert notifications ({totalCount} total)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.cardBg} p-4 rounded-lg border ${themeClasses.border}`}>
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 mr-2 text-gray-500" />
          <h3 className={`text-lg font-medium ${themeClasses.text}`}>Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Recipient or agent name..."
                className={`block w-full pl-10 pr-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
              />
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              Start Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className={`block w-full pl-10 pr-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              End Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className={`block w-full pl-10 pr-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
              />
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              Severity
            </label>
            <select
              value={filters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              className={`block w-full px-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Channel */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              Channel
            </label>
            <select
              value={filters.channel}
              onChange={(e) => handleFilterChange('channel', e.target.value)}
              className={`block w-full px-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
            >
              <option value="">All</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="websocket">WebSocket</option>
              <option value="browser">Browser</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-1`}>
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className={`block w-full px-3 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
            >
              <option value="">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className={`px-4 py-2 text-sm font-medium rounded-md ${themeClasses.mutedText} ${themeClasses.cardBg} border ${themeClasses.border} hover:bg-gray-100 dark:hover:bg-gray-700`}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className={`${themeClasses.cardBg} p-12 rounded-lg border ${themeClasses.border} text-center`}>
          <Bell className={`w-16 h-16 mx-auto mb-4 ${themeClasses.mutedText}`} />
          <h3 className={`text-lg font-semibold ${themeClasses.text} mb-2`}>No Notification Logs</h3>
          <p className={`${themeClasses.mutedText}`}>
            No notifications match your current filters.
          </p>
        </div>
      ) : (
        <div className={`${themeClasses.cardBg} rounded-lg border ${themeClasses.border} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Timestamp
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Alert
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Agent
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Severity
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Recipient
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Channel
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.mutedText} uppercase tracking-wider`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text}`}>
                      {formatDateTime(log.sent_at || log.created_at)}
                    </td>
                    <td className={`px-6 py-4 text-sm ${themeClasses.text}`}>
                      <div className="max-w-xs truncate" title={log.alert_name}>
                        {log.alert_name}
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm ${themeClasses.text}`}>
                      <div className="max-w-xs truncate" title={log.agent_name}>
                        {log.agent_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getSeverityBadge(log.severity)}
                    </td>
                    <td className={`px-6 py-4 text-sm ${themeClasses.text}`}>
                      <div>
                        <div className="font-medium">{log.recipient_name}</div>
                        {log.channel === 'email' && log.recipient_email && (
                          <div className={`text-xs ${themeClasses.mutedText}`}>{log.recipient_email}</div>
                        )}
                        {log.channel === 'sms' && log.recipient_phone && (
                          <div className={`text-xs ${themeClasses.mutedText}`}>{log.recipient_phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        {getChannelIcon(log.channel)}
                        <span className={`ml-2 ${themeClasses.text} capitalize`}>{log.channel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div>
                        {getStatusBadge(log.status)}
                        {log.status === 'failed' && log.error_message && (
                          <div className="mt-1 text-xs text-red-600 dark:text-red-400 max-w-xs truncate" title={log.error_message}>
                            {log.error_message}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={`px-6 py-4 border-t ${themeClasses.border} flex items-center justify-between`}>
              <div className={`text-sm ${themeClasses.mutedText}`}>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className={`px-3 py-1 rounded border ${themeClasses.border} ${
                    page === 1
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  } ${themeClasses.text}`}
                >
                  Previous
                </button>
                <span className={`text-sm ${themeClasses.text}`}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className={`px-3 py-1 rounded border ${themeClasses.border} ${
                    page === totalPages
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  } ${themeClasses.text}`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertNotificationLogs;
