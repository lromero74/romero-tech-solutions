import React from 'react';
import { FileWarning, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { themeClasses } from '../../../contexts/ThemeContext';
import { useClientLanguage } from '../../../contexts/ClientLanguageContext';
import { AgentDetailsComponentProps } from './types';

export const SystemEventLogs: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  const { t, language } = useClientLanguage();

  if (!latestMetrics || ((latestMetrics.critical_events_count || 0) + (latestMetrics.error_events_count || 0)) === 0) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <FileWarning className="w-5 h-5 mr-2" />
        {t('agentDetails.systemEventLogs.title', undefined, 'System Event Logs (Last 24h)')}
      </h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className={`text-2xl font-bold ${(latestMetrics.critical_events_count || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {latestMetrics.critical_events_count || 0}
          </div>
          <div className={`text-sm ${themeClasses.text.tertiary}`}>{t('agentDetails.systemEventLogs.criticalEvents', undefined, 'Critical Events')}</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${(latestMetrics.error_events_count || 0) > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {latestMetrics.error_events_count || 0}
          </div>
          <div className={`text-sm ${themeClasses.text.tertiary}`}>{t('agentDetails.systemEventLogs.errorEvents', undefined, 'Error Events')}</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${(latestMetrics.warning_events_count || 0) > 0 ? 'text-yellow-500 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {latestMetrics.warning_events_count || 0}
          </div>
          <div className={`text-sm ${themeClasses.text.tertiary}`}>{t('agentDetails.systemEventLogs.warningEvents', undefined, 'Warning Events')}</div>
        </div>
      </div>

      {/* Last Critical Event */}
      {latestMetrics.last_critical_event && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-900 dark:text-red-100">
                {t('agentDetails.systemEventLogs.lastCriticalEvent', undefined, 'Last Critical Event')}
              </div>
              <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                {latestMetrics.last_critical_event_message}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                {formatDistanceToNow(new Date(latestMetrics.last_critical_event), { addSuffix: true, locale: language === 'es' ? es : undefined })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event List */}
      {latestMetrics.event_logs_data && latestMetrics.event_logs_data.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {latestMetrics.event_logs_data
            .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
            .slice(0, 20)
            .map((event, index) => (
              <div
                key={index}
                className={`p-3 rounded border ${
                  event.event_level === 'critical'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200'
                    : event.event_level === 'error'
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                        event.event_level === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : event.event_level === 'error'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {event.event_level.toUpperCase()}
                      </span>
                      <span className={`text-xs ${themeClasses.text.tertiary}`}>
                        {event.event_source}
                      </span>
                      {event.event_id && (
                        <span className={`text-xs ${themeClasses.text.tertiary}`}>
                          {t('agentDetails.systemEventLogs.id', undefined, 'ID')}: {event.event_id}
                        </span>
                      )}
                    </div>
                    <div className={`text-sm mt-1 ${themeClasses.text.primary}`}>
                      {event.event_message}
                    </div>
                    <div className={`text-xs mt-1 ${themeClasses.text.tertiary}`}>
                      {formatDistanceToNow(new Date(event.event_time), { addSuffix: true, locale: language === 'es' ? es : undefined })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* No Events Message */}
      {((latestMetrics.critical_events_count || 0) === 0 &&
        (latestMetrics.warning_events_count || 0) === 0 &&
        (latestMetrics.error_events_count || 0) === 0) && (
        <div className="text-center py-6">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className={`text-sm ${themeClasses.text.secondary}`}>
            {t('agentDetails.systemEventLogs.noIssues', undefined, 'No critical errors or warnings in system event logs')}
          </p>
        </div>
      )}
    </div>
  );
};
