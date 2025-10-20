import React from 'react';
import { AveragingMode, BandMode } from '../../../utils/metricsStats';
import { themeClasses, useTheme } from '../../../contexts/ThemeContext';

// Averaging Controls Component
interface AveragingControlsProps {
  averagingMode: AveragingMode;
  onAveragingModeChange: (mode: AveragingMode) => void;
  windowSize: number;
  onWindowSizeChange: (size: number) => void;
  bandMode: BandMode;
  onBandModeChange: (mode: BandMode) => void;
}

export const AveragingControls: React.FC<AveragingControlsProps> = ({
  averagingMode,
  onAveragingModeChange,
  windowSize,
  onWindowSizeChange,
  bandMode,
  onBandModeChange,
}) => {
  const { isDark } = useTheme();

  return (
    <div className="flex flex-wrap items-center gap-4 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
          Average:
        </label>
        <select
          value={averagingMode}
          onChange={(e) => onAveragingModeChange(e.target.value as AveragingMode)}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="simple" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Simple</option>
          <option value="moving" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Moving</option>
        </select>
        <span className={`text-xs ${themeClasses.text.tertiary}`}>
          ({averagingMode === 'simple' ? 'Overall average' : `${windowSize}-point window`})
        </span>
      </div>

      {averagingMode === 'moving' && (
        <>
          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
              Window:
            </label>
            <input
              type="number"
              min="3"
              max="50"
              value={windowSize}
              onChange={(e) => onWindowSizeChange(parseInt(e.target.value) || 20)}
              style={{
                colorScheme: isDark ? 'dark' : 'light'
              }}
              className="text-xs w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <span className={`text-xs ${themeClasses.text.tertiary}`}>points</span>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
              Bands:
            </label>
            <select
              value={bandMode}
              onChange={(e) => onBandModeChange(e.target.value as BandMode)}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              <option value="fixed" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Fixed</option>
              <option value="dynamic" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Dynamic</option>
            </select>
            <span className={`text-xs ${themeClasses.text.tertiary}`}>
              ({bandMode === 'fixed' ? 'Fixed std dev' : 'Bollinger Bands'})
            </span>
          </div>
        </>
      )}
    </div>
  );
};

// Statistics Summary Component
interface StatisticsSummaryProps {
  stats: {
    min: number;
    max: number;
    range: number;
    stdDev: number;
  };
  unit: string;
}

export const StatisticsSummary: React.FC<StatisticsSummaryProps> = ({ stats, unit }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <div>
        <div className={`text-xs ${themeClasses.text.tertiary}`}>Min</div>
        <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
          {stats.min.toFixed(1)}{unit}
        </div>
      </div>
      <div>
        <div className={`text-xs ${themeClasses.text.tertiary}`}>Max</div>
        <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
          {stats.max.toFixed(1)}{unit}
        </div>
      </div>
      <div>
        <div className={`text-xs ${themeClasses.text.tertiary}`}>Range</div>
        <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
          {stats.range.toFixed(1)}{unit}
        </div>
      </div>
      <div>
        <div className={`text-xs ${themeClasses.text.tertiary}`}>Std Dev</div>
        <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
          {stats.stdDev.toFixed(1)}{unit}
        </div>
      </div>
    </div>
  );
};
