import React from 'react';
import { TrendingUp } from 'lucide-react';
import { themeClasses } from '../../../../contexts/ThemeContext';
import type { ChartDisplayType, ActiveIndicators, DropdownPosition } from '../types';

interface ChartToolbarProps {
  chartDisplayType: ChartDisplayType;
  onChartTypeChange: (type: ChartDisplayType) => void;
  candlestickPeriod: number;
  onCandlestickPeriodChange: (period: number) => void;
  selectedTimeWindow: number;
  onTimeWindowChange: (window: number) => void;
  activeIndicators: ActiveIndicators;
  showIndicatorsMenu: boolean;
  onToggleIndicatorsMenu: () => void;
  indicatorsButtonRef: React.RefObject<HTMLButtonElement>;
}

const TIME_WINDOWS = [
  { label: '1H', value: 1 },
  { label: '4H', value: 4 },
  { label: '12H', value: 12 },
  { label: '1D', value: 24 },
  { label: '2D', value: 48 },
  { label: '1W', value: 168 },
];

const CANDLESTICK_PERIODS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '4h', value: 240 },
  { label: '8h', value: 480 },
  { label: '1d', value: 1440 },
];

export const ChartToolbar: React.FC<ChartToolbarProps> = ({
  chartDisplayType,
  onChartTypeChange,
  candlestickPeriod,
  onCandlestickPeriodChange,
  selectedTimeWindow,
  onTimeWindowChange,
  activeIndicators,
  showIndicatorsMenu,
  onToggleIndicatorsMenu,
  indicatorsButtonRef,
}) => {
  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b ${themeClasses.border.primary} ${themeClasses.bg.hover}`}>
      {/* Left: Chart Type Selector */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChartTypeChange('line')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            chartDisplayType === 'line'
              ? 'bg-blue-500 text-white'
              : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
          }`}
        >
          Line
        </button>
        <button
          onClick={() => onChartTypeChange('candlestick')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            chartDisplayType === 'candlestick'
              ? 'bg-blue-500 text-white'
              : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
          }`}
        >
          Candles
        </button>
        <button
          onClick={() => onChartTypeChange('heiken-ashi')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            chartDisplayType === 'heiken-ashi'
              ? 'bg-blue-500 text-white'
              : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
          }`}
        >
          Heikin
        </button>

        {/* Candlestick period selector */}
        {(chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && (
          <>
            <div className={`h-4 w-px ${themeClasses.border.primary} mx-1`}></div>
            <select
              value={candlestickPeriod}
              onChange={(e) => onCandlestickPeriodChange(Number(e.target.value))}
              className={`text-xs px-2 py-1 rounded border ${themeClasses.border.primary} ${themeClasses.bg.card} ${themeClasses.text.primary}`}
            >
              {CANDLESTICK_PERIODS.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Center: Time Range Buttons */}
      <div className="flex items-center gap-1">
        {TIME_WINDOWS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onTimeWindowChange(value)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              selectedTimeWindow === value
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right: Studies/Indicators */}
      <div className="flex items-center gap-1 relative">
        <button
          ref={indicatorsButtonRef}
          onClick={onToggleIndicatorsMenu}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
            Object.values(activeIndicators).some(v => v)
              ? 'bg-blue-500 text-white'
              : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Indicators
        </button>
      </div>
    </div>
  );
};
