import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { agentService, AgentMetric } from '../../services/agentService';

interface AgentMetricsChartProps {
  agentId: string;
  agentName?: string;
}

const AgentMetricsChart: React.FC<AgentMetricsChartProps> = ({
  agentId,
  agentName,
}) => {
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<number>(24); // hours
  const [selectedMetrics, setSelectedMetrics] = useState<{
    cpu: boolean;
    memory: boolean;
    disk: boolean;
  }>({
    cpu: true,
    memory: true,
    disk: true,
  });

  // Load metrics
  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentService.getAgentMetricsHistory(agentId, timeRange);
      if (response.success && response.data) {
        setMetrics(response.data.metrics);
      } else {
        setError(response.message || 'Failed to load metrics');
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [agentId, timeRange]);

  useEffect(() => {
    loadMetrics();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  // Calculate statistics
  const calculateStats = (metricKey: 'cpu_usage' | 'memory_usage' | 'disk_usage') => {
    if (metrics.length === 0) return { current: 0, avg: 0, min: 0, max: 0 };

    const values = metrics.map(m => m[metricKey]);
    const current = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { current, avg, min, max };
  };

  const cpuStats = calculateStats('cpu_usage');
  const memoryStats = calculateStats('memory_usage');
  const diskStats = calculateStats('disk_usage');

  // Render simple line chart
  const renderMiniChart = (
    data: AgentMetric[],
    metricKey: 'cpu_usage' | 'memory_usage' | 'disk_usage',
    color: string
  ) => {
    if (data.length === 0) return null;

    const values = data.map(m => m[metricKey]);
    const max = Math.max(...values, 100);
    const min = Math.min(...values);
    const range = max - min || 1;

    // Create SVG path
    const width = 100;
    const height = 40;
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;

    return (
      <svg width={width} height={height} className="w-full h-10">
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  // Format timestamp for display
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (timeRange <= 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get color for metric value
  const getMetricColor = (value: number): string => {
    if (value >= 90) return 'text-red-600';
    if (value >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Get stroke color for chart
  const getStrokeColor = (metricType: string): string => {
    switch (metricType) {
      case 'cpu':
        return '#3b82f6'; // blue
      case 'memory':
        return '#10b981'; // green
      case 'disk':
        return '#f59e0b'; // amber
      default:
        return '#6b7280'; // gray
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary} flex items-center`}>
            <TrendingUp className="w-6 h-6 mr-2" />
            Performance Metrics
          </h2>
          {agentName && (
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>{agentName}</p>
          )}
        </div>
        <button
          onClick={loadMetrics}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Time Range Selector */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${themeClasses.text.muted}`} />
          <span className={`text-sm font-medium ${themeClasses.text.secondary} mr-4`}>Time Range:</span>
          {[1, 6, 24, 168, 720].map((hours) => (
            <button
              key={hours}
              onClick={() => setTimeRange(hours)}
              className={`px-3 py-1 text-xs font-medium rounded ${
                timeRange === hours
                  ? 'bg-purple-600 text-white'
                  : `${themeClasses.bg.hover} ${themeClasses.text.secondary}`
              }`}
            >
              {hours === 1 ? '1h' : hours === 6 ? '6h' : hours === 24 ? '24h' : hours === 168 ? '7d' : '30d'}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && metrics.length === 0 && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading metrics...</p>
        </div>
      )}

      {/* Metrics Grid */}
      {!loading && metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CPU Usage */}
          <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-sm font-semibold ${themeClasses.text.secondary}`}>CPU Usage</h3>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMetrics.cpu}
                  onChange={(e) => setSelectedMetrics({ ...selectedMetrics, cpu: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-xs">Show</span>
              </label>
            </div>
            {selectedMetrics.cpu && (
              <>
                <div className={`text-3xl font-bold mb-2 ${getMetricColor(cpuStats.current)}`}>
                  {cpuStats.current.toFixed(1)}%
                </div>
                <div className="mb-4">
                  {renderMiniChart(metrics, 'cpu_usage', getStrokeColor('cpu'))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className={themeClasses.text.muted}>Avg</div>
                    <div className={themeClasses.text.primary}>{cpuStats.avg.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Min</div>
                    <div className={themeClasses.text.primary}>{cpuStats.min.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Max</div>
                    <div className={themeClasses.text.primary}>{cpuStats.max.toFixed(1)}%</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Memory Usage */}
          <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-sm font-semibold ${themeClasses.text.secondary}`}>Memory Usage</h3>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMetrics.memory}
                  onChange={(e) => setSelectedMetrics({ ...selectedMetrics, memory: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-xs">Show</span>
              </label>
            </div>
            {selectedMetrics.memory && (
              <>
                <div className={`text-3xl font-bold mb-2 ${getMetricColor(memoryStats.current)}`}>
                  {memoryStats.current.toFixed(1)}%
                </div>
                <div className="mb-4">
                  {renderMiniChart(metrics, 'memory_usage', getStrokeColor('memory'))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className={themeClasses.text.muted}>Avg</div>
                    <div className={themeClasses.text.primary}>{memoryStats.avg.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Min</div>
                    <div className={themeClasses.text.primary}>{memoryStats.min.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Max</div>
                    <div className={themeClasses.text.primary}>{memoryStats.max.toFixed(1)}%</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Disk Usage */}
          <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-sm font-semibold ${themeClasses.text.secondary}`}>Disk Usage</h3>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMetrics.disk}
                  onChange={(e) => setSelectedMetrics({ ...selectedMetrics, disk: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-xs">Show</span>
              </label>
            </div>
            {selectedMetrics.disk && (
              <>
                <div className={`text-3xl font-bold mb-2 ${getMetricColor(diskStats.current)}`}>
                  {diskStats.current.toFixed(1)}%
                </div>
                <div className="mb-4">
                  {renderMiniChart(metrics, 'disk_usage', getStrokeColor('disk'))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className={themeClasses.text.muted}>Avg</div>
                    <div className={themeClasses.text.primary}>{diskStats.avg.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Min</div>
                    <div className={themeClasses.text.primary}>{diskStats.min.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className={themeClasses.text.muted}>Max</div>
                    <div className={themeClasses.text.primary}>{diskStats.max.toFixed(1)}%</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Data Points Info */}
      {!loading && metrics.length > 0 && (
        <div className={`${themeClasses.bg.card} p-4 rounded-lg`}>
          <div className="flex items-center justify-between text-sm">
            <span className={themeClasses.text.secondary}>
              {metrics.length} data points collected
            </span>
            <span className={themeClasses.text.secondary}>
              From {formatTime(metrics[0].collected_at)} to {formatTime(metrics[metrics.length - 1].collected_at)}
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && metrics.length === 0 && !error && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <TrendingUp className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>No metrics data available</p>
          <p className={`text-sm ${themeClasses.text.muted} mt-2`}>
            Metrics will appear once the agent starts reporting performance data
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentMetricsChart;
