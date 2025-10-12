import React from 'react';
import { TrendingUp as TrendIcon } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import IndicatorToggle from './IndicatorToggle';
import IndicatorThresholdInput from './IndicatorThresholdInput';

interface ROCSettings {
  extreme_multiplier: number;
  lookback_periods: number;
  enabled: boolean;
}

interface ROCConfigurationProps {
  settings: ROCSettings;
  onChange: (settings: ROCSettings) => void;
}

const ROCConfiguration: React.FC<ROCConfigurationProps> = ({ settings, onChange }) => {
  const handleChange = (field: keyof ROCSettings, value: number | boolean) => {
    onChange({ ...settings, [field]: value });
  };

  return (
    <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <TrendIcon className="w-5 h-5 text-cyan-500 mr-2" />
          <h4 className={`text-sm font-medium ${themeClasses.text.primary}`}>
            ROC (Rate of Change)
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
            label="Extreme Multiplier"
            value={settings.extreme_multiplier}
            onChange={(value) => handleChange('extreme_multiplier', value)}
            min={1.0}
            max={5.0}
            step={0.1}
            unit="x"
            helpText="ROC must be >X times average to be extreme (default: 2.0)"
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

export default ROCConfiguration;
