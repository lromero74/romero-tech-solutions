import React from 'react';
import { Zap } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import IndicatorToggle from './IndicatorToggle';
import IndicatorThresholdInput from './IndicatorThresholdInput';

interface MACDSettings {
  detect_crossovers: boolean;
  momentum_threshold_multiplier: number;
  enabled: boolean;
}

interface MACDConfigurationProps {
  settings: MACDSettings;
  onChange: (settings: MACDSettings) => void;
}

const MACDConfiguration: React.FC<MACDConfigurationProps> = ({ settings, onChange }) => {
  const handleChange = (field: keyof MACDSettings, value: number | boolean) => {
    onChange({ ...settings, [field]: value });
  };

  return (
    <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Zap className="w-5 h-5 text-yellow-500 mr-2" />
          <h4 className={`text-sm font-medium ${themeClasses.text.primary}`}>
            MACD (Moving Average Convergence Divergence)
          </h4>
        </div>
        <IndicatorToggle
          label=""
          enabled={settings.enabled}
          onChange={(enabled) => handleChange('enabled', enabled)}
        />
      </div>

      {settings.enabled && (
        <>
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <IndicatorToggle
              label="Detect Crossovers"
              description="Alert when MACD line crosses signal line"
              enabled={settings.detect_crossovers}
              onChange={(enabled) => handleChange('detect_crossovers', enabled)}
            />
          </div>

          <div>
            <IndicatorThresholdInput
              label="Momentum Threshold Multiplier"
              value={settings.momentum_threshold_multiplier}
              onChange={(value) => handleChange('momentum_threshold_multiplier', value)}
              min={0.1}
              max={2.0}
              step={0.1}
              helpText="Histogram must be >X times MACD line for strong momentum (default: 0.5)"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default MACDConfiguration;
