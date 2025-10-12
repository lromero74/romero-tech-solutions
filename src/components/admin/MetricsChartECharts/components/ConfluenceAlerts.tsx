import React, { useState } from 'react';
import { themeClasses, useTheme } from '../../../../contexts/ThemeContext';
import type { ConfluenceAlert } from '../../../../utils/indicatorConfluence';

interface ConfluenceAlertsProps {
  alerts: ConfluenceAlert[];
}

export const ConfluenceAlerts: React.FC<ConfluenceAlertsProps> = ({ alerts }) => {
  const { isDark } = useTheme();
  const [expandedAlert, setExpandedAlert] = useState<number | null>(null);

  if (alerts.length === 0) return null;

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          border: 'border-red-500',
          text: 'text-red-800 dark:text-red-300',
          icon: '🚨',
          badge: 'bg-red-500',
        };
      case 'high':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          border: 'border-orange-500',
          text: 'text-orange-800 dark:text-orange-300',
          icon: '⚠️',
          badge: 'bg-orange-500',
        };
      case 'medium':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          border: 'border-yellow-500',
          text: 'text-yellow-800 dark:text-yellow-300',
          icon: '⚡',
          badge: 'bg-yellow-500',
        };
      default:
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          border: 'border-blue-500',
          text: 'text-blue-800 dark:text-blue-300',
          icon: 'ℹ️',
          badge: 'bg-blue-500',
        };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'overbought':
        return '📈';
      case 'oversold':
        return '📉';
      case 'bullish':
        return '🐂';
      case 'bearish':
        return '🐻';
      case 'volatility_spike':
        return '💥';
      default:
        return '📊';
    }
  };

  return (
    <div className="px-4 pb-3 space-y-2">
      {alerts.map((alert, index) => {
        const styles = getSeverityStyles(alert.severity);
        const isExpanded = expandedAlert === index;

        return (
          <div
            key={index}
            className={`${styles.bg} ${styles.border} border-l-4 rounded-r-lg p-3 cursor-pointer transition-all hover:shadow-md`}
            onClick={() => setExpandedAlert(isExpanded ? null : index)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 flex-1">
                <span className="text-xl leading-none">{styles.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`font-semibold text-sm ${styles.text}`}>
                      {alert.title}
                    </h4>
                    {alert.count > 1 && (
                      <span className={`${styles.badge} text-white text-xs px-2 py-0.5 rounded-full font-medium`}>
                        {alert.count} indicators
                      </span>
                    )}
                    <span className="text-lg leading-none">{getTypeIcon(alert.type)}</span>
                  </div>
                  <p className={`text-xs ${styles.text} mt-1 opacity-90`}>
                    {alert.description}
                  </p>

                  {isExpanded && alert.signals.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className={`text-xs font-semibold ${styles.text}`}>
                        Indicator Details:
                      </p>
                      {alert.signals.map((signal, sigIndex) => (
                        <div
                          key={sigIndex}
                          className={`text-xs ${styles.text} opacity-80 pl-3 border-l-2 ${styles.border} border-opacity-30`}
                        >
                          <span className="font-medium">{signal.indicator}:</span>{' '}
                          {signal.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                className={`${styles.text} opacity-60 hover:opacity-100 transition-opacity flex-shrink-0`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedAlert(isExpanded ? null : index);
                }}
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
