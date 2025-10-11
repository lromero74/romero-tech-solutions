import React from 'react';
import { Activity, Circle, AlertTriangle, Info } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

export const ServiceMonitoring: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || latestMetrics.services_monitored === null || latestMetrics.services_monitored === undefined || latestMetrics.services_monitored === 0) {
    return null;
  }

  // Calculate critical failed services count from services_data if available
  const criticalFailedCount = latestMetrics.services_data && Array.isArray(latestMetrics.services_data)
    ? latestMetrics.services_data.filter(s =>
        s.severity === 'critical' && (s.status === 'failed' || s.status === 'stopped')
      ).length
    : latestMetrics.services_failed || 0;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Activity className="w-5 h-5 mr-2" />
        Service & Process Monitoring
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        {/* Services Monitored */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Services Monitored:</span>
            <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
              {latestMetrics.services_monitored}
            </span>
          </div>
        </div>

        {/* Services Running */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Running:</span>
            <span className={`text-lg font-bold text-green-600 dark:text-green-400`}>
              {latestMetrics.services_running}
            </span>
          </div>
        </div>

        {/* Services Failed (Critical Only) */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failed/Stopped:</span>
            <span className={`text-lg font-bold ${
              criticalFailedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}>
              {criticalFailedCount}
            </span>
          </div>
          {criticalFailedCount > 0 && (
            <p className={`text-xs text-red-600 dark:text-red-400`}>
              {criticalFailedCount} service{criticalFailedCount !== 1 ? 's' : ''} require attention
            </p>
          )}
        </div>
      </div>

      {/* Service List */}
      {latestMetrics.services_data && Array.isArray(latestMetrics.services_data) && latestMetrics.services_data.length > 0 && (
        <div className="space-y-2">
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            Service Status
          </h4>
          {latestMetrics.services_data.map((service, index) => {
            // Determine styling based on severity (context-aware)
            const getSeverityStyle = () => {
              if (service.severity === 'critical' && (service.status === 'failed' || service.status === 'stopped')) {
                return 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800';
              } else if (service.severity === 'warning' && (service.status === 'failed' || service.status === 'stopped')) {
                return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800';
              } else {
                return `${themeClasses.border.primary} ${themeClasses.bg.hover}`;
              }
            };

            return (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getSeverityStyle()}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <Circle className={`w-3 h-3 mr-2 ${
                    service.status === 'running' ? 'text-green-600 dark:text-green-400 fill-current' :
                    service.status === 'stopped' ? 'text-gray-600 fill-current' :
                    service.status === 'failed' ? 'text-red-600 dark:text-red-400 fill-current' :
                    'text-gray-400 fill-current'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {service.display_name}
                        {service.description && (
                          <span className={`ml-2 font-normal ${themeClasses.text.secondary}`}>
                            - {service.description}
                          </span>
                        )}
                      </p>
                      {service.why_stopped_help && (service.status === 'stopped' || service.status === 'failed') && (
                        <div className="relative group">
                          <Info className={`w-4 h-4 ${themeClasses.text.tertiary} cursor-help`} />
                          <div className="absolute left-0 top-6 w-80 p-3 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                            <p className="font-semibold mb-1">Why is this stopped?</p>
                            <p>{service.why_stopped_help}</p>
                            <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-800 transform rotate-45"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className={`text-xs ${themeClasses.text.muted}`}>
                      {service.name}
                      {service.pid && ` • PID: ${service.pid}`}
                      {service.memory_mb && ` • ${service.memory_mb.toFixed(1)} MB`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {service.enabled && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                      Auto-start
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    service.status === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                    service.status === 'stopped' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700' :
                    service.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/20' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700'
                  }`}>
                    {service.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Warning for failed services - Only show for critical severity */}
      {criticalFailedCount > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {criticalFailedCount} critical service{criticalFailedCount !== 1 ? 's are' : ' is'} not running
              </p>
              <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                Review failed services and restart them to ensure system stability
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
