import React from 'react';
import { Maximize2 } from 'lucide-react';
import { themeClasses } from '../../../../contexts/ThemeContext';

interface ChartHeaderProps {
  title: string;
  unit: string;
  stats: {
    mean: number;
    stdDev: number;
  };
  autoFitYAxis: boolean;
  onToggleAutoFit: () => void;
}

export const ChartHeader: React.FC<ChartHeaderProps> = ({
  title,
  unit,
  stats,
  autoFitYAxis,
  onToggleAutoFit,
}) => {
  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b ${themeClasses.border.primary}`}>
      <div className="flex items-center gap-4">
        <div>
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
            {title}
          </h4>
          <div className={`text-xs ${themeClasses.text.tertiary}`}>
            Avg: {stats.mean.toFixed(1)}{unit} • σ: {stats.stdDev.toFixed(1)}{unit}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleAutoFit}
          className={`p-1.5 rounded transition-colors ${
            autoFitYAxis
              ? 'bg-blue-500 text-white'
              : `${themeClasses.text.muted} hover:${themeClasses.bg.hover}`
          }`}
          title={autoFitYAxis ? 'Auto Scale: ON' : 'Auto Scale: OFF'}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
