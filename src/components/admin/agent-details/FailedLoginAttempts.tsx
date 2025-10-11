import React from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

export const FailedLoginAttempts: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || latestMetrics.failed_login_last_24h === null || latestMetrics.failed_login_last_24h === undefined) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <AlertOctagon className="w-5 h-5 mr-2" />
        Failed Login Attempts
      </h3>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        {/* Last 24h Attempts */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Last 24 Hours:</span>
            <span className={`text-lg font-bold ${
              latestMetrics.failed_login_last_24h === 0 ? 'text-green-600 dark:text-green-400' :
              latestMetrics.failed_login_last_24h < 10 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.failed_login_last_24h}
            </span>
          </div>
          {latestMetrics.failed_login_last_24h > 0 && (
            <p className={`text-xs ${
              latestMetrics.failed_login_last_24h < 10 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.failed_login_last_24h < 10 ? 'Some attempts detected' : 'High attack activity!'}
            </p>
          )}
          {latestMetrics.failed_login_last_24h === 0 && (
            <p className="text-xs text-green-600 dark:text-green-400">
              No attempts detected
            </p>
          )}
        </div>

        {/* Total Attempts */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Attempts:</span>
            <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
              {latestMetrics.failed_login_attempts || 0}
            </span>
          </div>
          <p className={`text-xs ${themeClasses.text.muted}`}>
            Since monitoring started
          </p>
        </div>

        {/* Unique Attackers */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Unique IPs:</span>
            <span className={`text-lg font-bold ${
              (latestMetrics.unique_attacking_ips || 0) === 0 ? 'text-green-600 dark:text-green-400' :
              (latestMetrics.unique_attacking_ips || 0) < 5 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.unique_attacking_ips || 0}
            </span>
          </div>
          <p className={`text-xs ${themeClasses.text.muted}`}>
            Different attacking IPs
          </p>
        </div>
      </div>

      {/* Detailed Attack List */}
      {latestMetrics.failed_login_data && Array.isArray(latestMetrics.failed_login_data) && latestMetrics.failed_login_data.length > 0 && (
        <div className="space-y-3">
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            Attack Details ({latestMetrics.failed_login_data.length} unique attempts)
          </h4>
          {latestMetrics.failed_login_data
            .sort((a, b) => b.count - a.count) // Sort by count descending
            .slice(0, 10) // Show top 10
            .map((attempt, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                attempt.count >= 10
                  ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                  : attempt.count >= 5
                  ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                  : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <AlertTriangle className={`w-4 h-4 mr-2 ${
                      attempt.count >= 10 ? 'text-red-600 dark:text-red-400' :
                      attempt.count >= 5 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-gray-600'
                    }`} />
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {attempt.ip}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className={themeClasses.text.muted}>Username:</span>{' '}
                      <span className={`${themeClasses.text.secondary} font-medium`}>{attempt.username}</span>
                    </div>
                    <div>
                      <span className={themeClasses.text.muted}>Method:</span>{' '}
                      <span className={`${themeClasses.text.secondary} font-medium uppercase`}>{attempt.method}</span>
                    </div>
                    <div>
                      <span className={themeClasses.text.muted}>Attempts:</span>{' '}
                      <span className={`font-bold ${
                        attempt.count >= 10 ? 'text-red-600 dark:text-red-400' :
                        attempt.count >= 5 ? 'text-yellow-600 dark:text-yellow-400' :
                        themeClasses.text.secondary
                      }`}>{attempt.count}</span>
                    </div>
                    <div>
                      <span className={themeClasses.text.muted}>Last Seen:</span>{' '}
                      <span className={themeClasses.text.secondary}>
                        {new Date(attempt.last_attempt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {attempt.error_message && (
                    <p className={`text-xs ${themeClasses.text.muted} mt-2`}>
                      {attempt.error_message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {latestMetrics.failed_login_data.length > 10 && (
            <p className={`text-xs ${themeClasses.text.muted} text-center mt-3`}>
              Showing top 10 of {latestMetrics.failed_login_data.length} total attempts
            </p>
          )}
        </div>
      )}

      {/* Security Alert */}
      {latestMetrics.failed_login_last_24h > 10 && (
        <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                High Security Alert: {latestMetrics.failed_login_last_24h} failed login attempts in 24 hours
              </p>
              <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                This system may be under attack. Consider implementing IP blocking, fail2ban, or reviewing firewall rules.
                {latestMetrics.unique_attacking_ips && latestMetrics.unique_attacking_ips > 5 && (
                  <span> Multiple attacking IPs detected - potential distributed attack.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
