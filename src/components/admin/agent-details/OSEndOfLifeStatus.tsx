import React from 'react';
import { Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

/**
 * Format days into human-readable time units (Years, Weeks, Days)
 * Omits zero values and properly pluralizes
 */
const formatTimeRemaining = (days: number): string => {
  if (days < 0) return '';

  const years = Math.floor(days / 365);
  const remainingAfterYears = days % 365;
  const weeks = Math.floor(remainingAfterYears / 7);
  const remainingDays = remainingAfterYears % 7;

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'Year' : 'Years'}`);
  }
  if (weeks > 0) {
    parts.push(`${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}`);
  }
  if (remainingDays > 0) {
    parts.push(`${remainingDays} ${remainingDays === 1 ? 'Day' : 'Days'}`);
  }

  return parts.join(', ') || '0 Days';
};

export const OSEndOfLifeStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || !latestMetrics.eol_status) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Calendar className="w-5 h-5 mr-2" />
        OS End-of-Life Status
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* EOL Status */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Support Status:</span>
            <span className={`text-lg font-bold ${
              latestMetrics.eol_status === 'active' ? 'text-green-600 dark:text-green-400' :
              latestMetrics.eol_status === 'approaching_eol' ? 'text-yellow-600 dark:text-yellow-400' :
              latestMetrics.eol_status === 'eol' || latestMetrics.eol_status === 'security_only' ? 'text-orange-600 dark:text-orange-400' :
              latestMetrics.eol_status === 'unsupported' ? 'text-red-600 dark:text-red-400' :
              'text-gray-600'
            }`}>
              {latestMetrics.eol_status === 'active' ? 'Active' :
               latestMetrics.eol_status === 'approaching_eol' ? 'Approaching EOL' :
               latestMetrics.eol_status === 'eol' ? 'EOL' :
               latestMetrics.eol_status === 'security_only' ? 'Security Only' :
               latestMetrics.eol_status === 'unsupported' ? 'Unsupported' :
               'Unknown'}
            </span>
          </div>
        </div>

        {/* Security Updates End */}
        {latestMetrics.days_until_sec_eol !== null && latestMetrics.days_until_sec_eol !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Security Updates:</span>
              <span className={`text-lg font-bold ${
                latestMetrics.days_until_sec_eol < 0 ? 'text-red-600 dark:text-red-400' :
                latestMetrics.days_until_sec_eol <= 180 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                {latestMetrics.days_until_sec_eol < 0 ? 'Ended' :
                 formatTimeRemaining(latestMetrics.days_until_sec_eol)}
              </span>
            </div>
            {latestMetrics.security_eol_date && (
              <p className={`text-xs ${themeClasses.text.muted}`}>
                {latestMetrics.days_until_sec_eol < 0 ? 'Ended: ' : 'Ends: '}
                {new Date(latestMetrics.security_eol_date).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Full EOL Date */}
        {latestMetrics.days_until_eol !== null && latestMetrics.days_until_eol !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Full EOL:</span>
              <span className={`text-lg font-bold ${
                latestMetrics.days_until_eol < 0 ? 'text-red-600 dark:text-red-400' :
                latestMetrics.days_until_eol <= 180 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                {latestMetrics.days_until_eol < 0 ? 'Past EOL' :
                 formatTimeRemaining(latestMetrics.days_until_eol)}
              </span>
            </div>
            {latestMetrics.eol_date && (
              <p className={`text-xs ${themeClasses.text.muted}`}>
                {latestMetrics.days_until_eol < 0 ? 'EOL Date: ' : 'EOL Date: '}
                {new Date(latestMetrics.eol_date).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* EOL Message/Warning */}
      {latestMetrics.eol_message && (
        <div className={`mt-4 p-3 rounded-lg ${
          latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ?
            'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
          latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only' ?
            'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
            'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
        }`}>
          <div className="flex items-start">
            {(latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' || latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only') ? (
              <AlertTriangle className={`w-5 h-5 mr-2 flex-shrink-0 mt-0.5 ${
                latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
              }`} />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                latestMetrics.eol_status === 'unsupported' || latestMetrics.eol_status === 'eol' ?
                  'text-red-800 dark:text-red-200' :
                latestMetrics.eol_status === 'approaching_eol' || latestMetrics.eol_status === 'security_only' ?
                  'text-yellow-800 dark:text-yellow-200' :
                  'text-green-800 dark:text-green-200'
              }`}>
                {latestMetrics.eol_message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
