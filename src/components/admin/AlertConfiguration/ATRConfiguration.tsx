import React from 'react';
import { BarChart } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import IndicatorToggle from './IndicatorToggle';
import IndicatorThresholdInput from './IndicatorThresholdInput';

interface ATRSettings {
  volatility_multiplier: number;
  lookback_periods: number;
  enabled: boolean;
}

interface ATRConfigurationProps {
  settings: ATRSettings;
  onChange: (settings: ATRSettings) => void;
}

const ATRConfiguration: React.FC<ATRConfigurationProps> = ({ settings, onChange }) => {
  const handleChange = (field: keyof ATRSettings, value: number | boolean) => {
    onChange({ ...settings, [field]: value });
  };

  return (
    <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <BarChart className="w-5 h-5 text-orange-500 mr-2" />
          <h4 className={`text-sm font-medium ${themeClasses.text.primary}`}>
            ATR (Average True Range)
          </h4>
        </div>
        <IndicatorToggle
          label=""
          enabled={settings.enabled}
          onChange={(enabled) => handleChange('enabled', enabled)}
        />
      </div>

      {settings.enabled && (
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <IndicatorThresholdInput
            label="Volatility Multiplier"
            value={settings.volatility_multiplier}
            onChange={(value) => handleChange('volatility_multiplier', value)}
            min={1.0}
            max={3.0}
            step={0.1}
            unit="x"
            helpText="ATR must be >X times average for volatility spike (default: 1.5)"
          />
          <IndicatorThresholdInput
            label="Lookback Periods"
            value={settings.lookback_periods}
            onChange={(value) => handleChange('lookback_periods', value)}
            min={5}
            max={50}
            helpText="Calculate average over N periods (default: 20)"
          />
        </div>
      )}
    </div>
  );
};

export default ATRConfiguration;
