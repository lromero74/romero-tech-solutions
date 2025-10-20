import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Expand, BarChart2, LineChart as LineChartIcon } from 'lucide-react';
import { ChartDisplayType } from '../MetricsChart.types';
import { themeClasses } from '../../../contexts/ThemeContext';

interface ChartControlsProps {
  chartDisplayType: ChartDisplayType;
  onChartDisplayTypeChange: (type: ChartDisplayType) => void;
  candlestickPeriod: number;
  onCandlestickPeriodChange: (period: number) => void;
  autoFitYAxis: boolean;
  onAutoFitYAxisToggle: () => void;
  zoomPercentage: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zoomDomain: any;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  chartDisplayType,
  onChartDisplayTypeChange,
  candlestickPeriod,
  onCandlestickPeriodChange,
  autoFitYAxis,
  onAutoFitYAxisToggle,
  zoomPercentage,
  zoomDomain,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  return (
    <div className="flex items-center gap-3">
      {/* Chart display type toggle */}
      <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
        <button
          onClick={() => onChartDisplayTypeChange('line')}
          className={`p-1.5 rounded-lg transition-colors ${
            chartDisplayType === 'line'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Line chart"
        >
          <LineChartIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onChartDisplayTypeChange('candlestick')}
          className={`p-1.5 rounded-lg transition-colors ${
            chartDisplayType === 'candlestick'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Candlestick chart"
        >
          <BarChart2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onChartDisplayTypeChange('heiken-ashi')}
          className={`px-2 py-1.5 rounded-lg transition-colors text-xs font-medium ${
            chartDisplayType === 'heiken-ashi'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Heiken Ashi chart (smoothed candlesticks)"
        >
          HA
        </button>
      </div>

      {/* Candlestick period selector */}
      {(chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && (
        <div className="flex items-center gap-2">
          <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
            Period:
          </label>
          <select
            value={candlestickPeriod}
            onChange={(e) => onCandlestickPeriodChange(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            title="Agent polls every 5 minutes"
          >
            <option value={15}>15 min (≈3 pts)</option>
            <option value={30}>30 min (≈6 pts)</option>
            <option value={60}>1 hour (≈12 pts)</option>
            <option value={240}>4 hours (≈48 pts)</option>
            <option value={720}>12 hours (≈144 pts)</option>
            <option value={1440}>24 hours (≈288 pts)</option>
          </select>
        </div>
      )}

      {/* Y-axis autofit toggle */}
      <button
        onClick={onAutoFitYAxisToggle}
        className={`p-1.5 rounded-lg border transition-colors ${
          autoFitYAxis
            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
            : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
        } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
        title={autoFitYAxis ? 'Y-axis autofit enabled' : 'Y-axis autofit disabled'}
      >
        <Expand className="w-4 h-4" />
      </button>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
        <button
          onClick={onZoomIn}
          disabled={zoomPercentage <= 10}
          className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            zoomPercentage <= 10 ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <button
          onClick={onZoomOut}
          disabled={!zoomDomain}
          className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            !zoomDomain ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <button
          onClick={onResetZoom}
          disabled={!zoomDomain}
          className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            !zoomDomain ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Reset Zoom"
        >
          <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <div className={`text-xs ${themeClasses.text.tertiary} px-2 border-l border-gray-300 dark:border-gray-600`}>
          {zoomPercentage}%
        </div>
      </div>
    </div>
  );
};

export default ChartControls;
