import React from 'react';
import { themeClasses } from '../../../contexts/ThemeContext';

interface IndicatorThresholdInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  helpText?: string;
  unit?: string;
}

const IndicatorThresholdInput: React.FC<IndicatorThresholdInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  helpText,
  unit = '',
}) => {
  return (
    <div>
      <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} pr-12`}
        />
        {unit && (
          <div className={`absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none ${themeClasses.text.muted}`}>
            {unit}
          </div>
        )}
      </div>
      {helpText && (
        <p className={`text-xs ${themeClasses.text.muted} mt-1`}>{helpText}</p>
      )}
    </div>
  );
};

export default IndicatorThresholdInput;
