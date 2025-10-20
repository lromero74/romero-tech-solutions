import React from 'react';
import { Wifi, Circle, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useClientLanguage } from '../../../contexts/ClientLanguageContext';

export const NetworkConnectivity: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  const { t } = useClientLanguage();
  if (!latestMetrics || (latestMetrics.internet_connected === undefined && latestMetrics.connectivity_issues_count === undefined)) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Wifi className="w-5 h-5 mr-2" />
        {t('agentDetails.networkConnectivity.title', undefined, 'Network Connectivity & Latency')}
      </h3>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
        {/* Internet Connection */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.networkConnectivity.internet', undefined, 'Internet:')}</span>
            <span className={`text-lg font-bold ${
              latestMetrics.internet_connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.internet_connected ? t('agentDetails.networkConnectivity.connected', undefined, 'Connected') : t('agentDetails.networkConnectivity.offline', undefined, 'Offline')}
            </span>
          </div>
          {!latestMetrics.internet_connected && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('agentDetails.networkConnectivity.noInternet', undefined, 'No internet connectivity')}
            </p>
          )}
        </div>

        {/* Gateway Reachability */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.networkConnectivity.gateway', undefined, 'Gateway:')}</span>
            <span className={`text-lg font-bold ${
              latestMetrics.gateway_reachable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.gateway_reachable ? t('agentDetails.networkConnectivity.reachable', undefined, 'Reachable') : t('agentDetails.networkConnectivity.unreachable', undefined, 'Unreachable')}
            </span>
          </div>
          {!latestMetrics.gateway_reachable && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('agentDetails.networkConnectivity.routerNotAccessible', undefined, 'Router not accessible')}
            </p>
          )}
        </div>

        {/* DNS Status */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.networkConnectivity.dns', undefined, 'DNS:')}</span>
            <span className={`text-lg font-bold ${
              latestMetrics.dns_working ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.dns_working ? t('agentDetails.networkConnectivity.working', undefined, 'Working') : t('agentDetails.networkConnectivity.failed', undefined, 'Failed')}
            </span>
          </div>
          {!latestMetrics.dns_working && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('agentDetails.networkConnectivity.dnsResolutionFailed', undefined, 'DNS resolution failed')}
            </p>
          )}
        </div>

        {/* Average Latency */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.networkConnectivity.avgLatency', undefined, 'Avg Latency:')}</span>
            <span className={`text-lg font-bold ${
              !latestMetrics.avg_latency_ms ? themeClasses.text.muted :
              latestMetrics.avg_latency_ms < 50 ? 'text-green-600 dark:text-green-400' :
              latestMetrics.avg_latency_ms < 200 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.avg_latency_ms || 'N/A'}{latestMetrics.avg_latency_ms ? 'ms' : ''}
            </span>
          </div>
          {latestMetrics.avg_latency_ms && latestMetrics.avg_latency_ms > 200 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('agentDetails.networkConnectivity.highLatencyDetected', undefined, 'High latency detected')}
            </p>
          )}
        </div>
      </div>

      {/* Additional Metrics */}
      {latestMetrics.packet_loss_percent !== null && latestMetrics.packet_loss_percent !== undefined && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.networkConnectivity.packetLoss', undefined, 'Packet Loss')}</span>
            <span className={`${Number(latestMetrics.packet_loss_percent) >= 5 ? 'text-lg' : 'text-sm'} font-bold ${
              latestMetrics.packet_loss_percent === 0 ? 'text-green-600 dark:text-green-400' :
              latestMetrics.packet_loss_percent < 5 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
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
            {t('agentDetails.networkConnectivity.testResults', { count: latestMetrics.connectivity_data.length }, `Test Results (${latestMetrics.connectivity_data.length} tests)`)}
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
                      test.reachable ? 'text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400' : 'text-red-600 dark:text-red-400 fill-red-600 dark:fill-red-400'
                    }`} />
                    <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {test.endpoint}
                    </span>
                  </div>
                  {test.latency_ms !== null && test.latency_ms !== undefined && (
                    <span className={`text-xs font-mono ${
                      test.latency_ms < 50 ? 'text-green-600 dark:text-green-400' :
                      test.latency_ms < 200 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
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
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      {test.packet_loss.toFixed(0)}% {t('agentDetails.networkConnectivity.loss', undefined, 'loss')}
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
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {t('agentDetails.networkConnectivity.issuesDetected', { count: latestMetrics.connectivity_issues_count }, `${latestMetrics.connectivity_issues_count} connectivity issue(s) detected`)}
              </p>
              <p className="text-xs mt-1 text-yellow-700 dark:text-yellow-300">
                {!latestMetrics.internet_connected && t('agentDetails.networkConnectivity.noInternetMsg', undefined, 'No internet connectivity. ')}
                {!latestMetrics.gateway_reachable && t('agentDetails.networkConnectivity.gatewayUnreachableMsg', undefined, 'Gateway unreachable. ')}
                {!latestMetrics.dns_working && t('agentDetails.networkConnectivity.dnsNotWorkingMsg', undefined, 'DNS not working. ')}
                {latestMetrics.packet_loss_percent && Number(latestMetrics.packet_loss_percent) > 10 && t('agentDetails.networkConnectivity.highPacketLossMsg', { percent: Number(latestMetrics.packet_loss_percent).toFixed(1) }, `High packet loss (${Number(latestMetrics.packet_loss_percent).toFixed(1)}%). `)}
                {latestMetrics.avg_latency_ms && latestMetrics.avg_latency_ms > 200 && t('agentDetails.networkConnectivity.highLatencyMsg', { latency: latestMetrics.avg_latency_ms }, `High latency (${latestMetrics.avg_latency_ms}ms). `)}
                {t('agentDetails.networkConnectivity.checkNetworkConfig', undefined, 'Check network configuration and connectivity.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
