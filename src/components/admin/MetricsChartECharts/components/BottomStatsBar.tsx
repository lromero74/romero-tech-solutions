import React from 'react';
import { themeClasses } from '../../../../contexts/ThemeContext';
import { formatRateOfChange } from '../../../../utils/metricsStats';

interface BottomStatsBarProps {
  stats: {
    min: number;
    max: number;
    range: number;
    rateOfChange: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  unit: string;
  showRateOfChange: boolean;
}

export const BottomStatsBar: React.FC<BottomStatsBarProps> = ({
  stats,
  unit,
  showRateOfChange,
}) => {
  return (
    <div className={`flex items-center justify-between px-4 py-2 border-t ${themeClasses.border.primary} ${themeClasses.bg.hover}`}>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className={`text-xs ${themeClasses.text.tertiary}`}>L:</span>
          <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.min.toFixed(1)}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${themeClasses.text.tertiary}`}>H:</span>
          <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.max.toFixed(1)}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${themeClasses.text.tertiary}`}>Range:</span>
          <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.range.toFixed(1)}{unit}</span>
        </div>
      </div>
      <div className={`text-xs ${themeClasses.text.tertiary}`}>
        {showRateOfChange && (
          <span>
            {formatRateOfChange(stats.rateOfChange, unit)} •{' '}
            <span className={
              stats.trend === 'increasing' ? 'text-orange-600' :
              stats.trend === 'decreasing' ? 'text-blue-600' :
              'text-green-600'
            }>
              {stats.trend}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
