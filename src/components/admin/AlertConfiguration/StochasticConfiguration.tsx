import React from 'react';
import { Activity } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import IndicatorToggle from './IndicatorToggle';
import IndicatorThresholdInput from './IndicatorThresholdInput';

interface StochasticThresholds {
  low_moderate: number;
  low_extreme: number;
  high_moderate: number;
  high_extreme: number;
  detect_crossovers: boolean;
  enabled: boolean;
}

interface StochasticConfigurationProps {
  thresholds: StochasticThresholds;
  onChange: (thresholds: StochasticThresholds) => void;
}

const StochasticConfiguration: React.FC<StochasticConfigurationProps> = ({ thresholds, onChange }) => {
  const handleChange = (field: keyof StochasticThresholds, value: number | boolean) => {
    onChange({ ...thresholds, [field]: value });
  };

  return (
    <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Activity className="w-5 h-5 text-blue-500 mr-2" />
          <h4 className={`text-sm font-medium ${themeClasses.text.primary}`}>
            Stochastic Oscillator
          </h4>
        </div>
        <IndicatorToggle
          label=""
          enabled={thresholds.enabled}
          onChange={(enabled) => handleChange('enabled', enabled)}
        />
      </div>

      {thresholds.enabled && (
        <>
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <IndicatorToggle
              label="Detect Crossovers"
              description="Alert when %K crosses %D in extreme zones"
              enabled={thresholds.detect_crossovers}
              onChange={(enabled) => handleChange('detect_crossovers', enabled)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <IndicatorThresholdInput
              label="Low Utilization Moderate"
              value={thresholds.low_moderate}
              onChange={(value) => handleChange('low_moderate', value)}
              min={0}
              max={100}
              helpText="Moderate low utilization threshold (default: 20)"
            />
            <IndicatorThresholdInput
              label="Low Utilization Extreme"
              value={thresholds.low_extreme}
              onChange={(value) => handleChange('low_extreme', value)}
              min={0}
              max={100}
              helpText="Extreme low utilization threshold (default: 10)"
            />
            <IndicatorThresholdInput
              label="High Utilization Moderate"
              value={thresholds.high_moderate}
              onChange={(value) => handleChange('high_moderate', value)}
              min={0}
              max={100}
              helpText="Moderate high utilization threshold (default: 80)"
            />
            <IndicatorThresholdInput
              label="High Utilization Extreme"
              value={thresholds.high_extreme}
              onChange={(value) => handleChange('high_extreme', value)}
              min={0}
              max={100}
              helpText="Extreme high utilization threshold (default: 90)"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default StochasticConfiguration;
