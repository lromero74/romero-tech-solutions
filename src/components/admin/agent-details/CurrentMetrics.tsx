import React from 'react';
import { Cpu, Activity, HardDrive, Wifi, TrendingUp } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { getMetricColor, getMetricBarColor, formatBytes } from './utils';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';

export const CurrentMetrics: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  const { t } = useOptionalClientLanguage();

  if (!latestMetrics) return null;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <TrendingUp className="w-5 h-5 mr-2" />
        {t('agentDetails.titles.currentPerformance', undefined, 'Current Performance')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* CPU Usage */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Cpu className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.titles.cpuUsage', undefined, 'CPU Usage')}:</span>
            </div>
            <span className={`${latestMetrics.cpu_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.cpu_percent)}`}>
              {latestMetrics.cpu_percent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getMetricBarColor(latestMetrics.cpu_percent)}`}
              style={{ width: `${Math.min(latestMetrics.cpu_percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.titles.memoryUsage', undefined, 'Memory Usage')}:</span>
            </div>
            <span className={`${latestMetrics.memory_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.memory_percent)}`}>
              {latestMetrics.memory_percent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getMetricBarColor(latestMetrics.memory_percent)}`}
              style={{ width: `${Math.min(latestMetrics.memory_percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Disk Usage */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.titles.diskUsage', undefined, 'Disk Usage')}:</span>
            </div>
            <span className={`${latestMetrics.disk_percent >= 50 ? 'text-lg' : 'text-sm'} font-bold ${getMetricColor(latestMetrics.disk_percent)}`}>
              {latestMetrics.disk_percent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getMetricBarColor(latestMetrics.disk_percent)}`}
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
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.labels.network', undefined, 'Network')}</span>
            </div>
            <div className="flex gap-4">
              {latestMetrics.network_rx_bytes !== null && (
                <span className={`text-sm ${themeClasses.text.primary}`}>
                  ↓ {formatBytes(latestMetrics.network_rx_bytes)} MB/s
                </span>
              )}
              {latestMetrics.network_tx_bytes !== null && (
                <span className={`text-sm ${themeClasses.text.primary}`}>
                  ↑ {formatBytes(latestMetrics.network_tx_bytes)} MB/s
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
