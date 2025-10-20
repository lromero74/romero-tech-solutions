import React from 'react';
import { Clock } from 'lucide-react';
import { formatRateOfChange } from '../../../utils/metricsStats';
import { themeClasses } from '../../../contexts/ThemeContext';

interface ChartHeaderProps {
  title: string;
  stats: {
    mean: number;
    stdDev: number;
    rateOfChange: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  unit: string;
  showRateOfChange: boolean;
  selectedTimeWindow: number;
  onTimeWindowChange: (window: number) => void;
  onJumpToNow: () => void;
}

const ChartHeader: React.FC<ChartHeaderProps> = ({
  title,
  stats,
  unit,
  showRateOfChange,
  selectedTimeWindow,
  onTimeWindowChange,
  onJumpToNow,
}) => {
  return (
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-4">
        <div>
          <h4 className={`text-md font-semibold ${themeClasses.text.primary}`}>{title}</h4>
          {showRateOfChange && (
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
              {formatRateOfChange(stats.rateOfChange, unit)} •{' '}
              <span className={
                stats.trend === 'increasing' ? 'text-orange-600' :
                stats.trend === 'decreasing' ? 'text-blue-600' :
                'text-green-600'
              }>
                {stats.trend}
              </span>
            </p>
          )}
        </div>

        {/* Time Window Selector */}
        <div className="flex items-center gap-2">
          <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
            Window:
          </label>
          <select
            value={selectedTimeWindow}
            onChange={(e) => onTimeWindowChange(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={1}>1 Hour</option>
            <option value={4}>4 Hours</option>
            <option value={12}>12 Hours</option>
            <option value={24}>24 Hours</option>
            <option value={48}>2 Days</option>
            <option value={168}>7 Days</option>
          </select>
        </div>

        {/* Jump to Now button */}
        <button
          onClick={onJumpToNow}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          title="Jump to most recent data"
        >
          <Clock className="w-3.5 h-3.5" />
          Now
        </button>
      </div>

      {/* Stats Display */}
      <div className="text-right">
        <div className={`text-sm ${themeClasses.text.secondary}`}>
          <span className="font-medium">Avg:</span> {stats.mean.toFixed(1)}{unit}
        </div>
        <div className={`text-xs ${themeClasses.text.tertiary} mt-1`}>
          σ: {stats.stdDev.toFixed(1)}{unit}
        </div>
      </div>
    </div>
  );
};

export default ChartHeader;
