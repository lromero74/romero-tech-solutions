import React from 'react';
import { TrendingUp } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import IndicatorToggle from './IndicatorToggle';
import IndicatorThresholdInput from './IndicatorThresholdInput';

interface RSIThresholds {
  low_moderate: number;
  low_extreme: number;
  high_moderate: number;
  high_extreme: number;
  enabled: boolean;
}

interface RSIConfigurationProps {
  thresholds: RSIThresholds;
  onChange: (thresholds: RSIThresholds) => void;
}

const RSIConfiguration: React.FC<RSIConfigurationProps> = ({ thresholds, onChange }) => {
  const handleChange = (field: keyof RSIThresholds, value: number | boolean) => {
    onChange({ ...thresholds, [field]: value });
  };

  return (
    <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <TrendingUp className="w-5 h-5 text-purple-500 mr-2" />
          <h4 className={`text-sm font-medium ${themeClasses.text.primary}`}>
            RSI (Relative Strength Index)
          </h4>
        </div>
        <IndicatorToggle
          label=""
          enabled={thresholds.enabled}
          onChange={(enabled) => handleChange('enabled', enabled)}
        />
      </div>

      {thresholds.enabled && (
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <IndicatorThresholdInput
            label="Low Utilization Moderate"
            value={thresholds.low_moderate}
            onChange={(value) => handleChange('low_moderate', value)}
            min={0}
            max={100}
            helpText="Moderate low utilization threshold (default: 30)"
          />
          <IndicatorThresholdInput
            label="Low Utilization Extreme"
            value={thresholds.low_extreme}
            onChange={(value) => handleChange('low_extreme', value)}
            min={0}
            max={100}
            helpText="Extreme low utilization threshold (default: 20)"
          />
          <IndicatorThresholdInput
            label="High Utilization Moderate"
            value={thresholds.high_moderate}
            onChange={(value) => handleChange('high_moderate', value)}
            min={0}
            max={100}
            helpText="Moderate high utilization threshold (default: 70)"
          />
          <IndicatorThresholdInput
            label="High Utilization Extreme"
            value={thresholds.high_extreme}
            onChange={(value) => handleChange('high_extreme', value)}
            min={0}
            max={100}
            helpText="Extreme high utilization threshold (default: 80)"
          />
        </div>
      )}
    </div>
  );
};

export default RSIConfiguration;
