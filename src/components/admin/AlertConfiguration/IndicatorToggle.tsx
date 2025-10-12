import React from 'react';
import { themeClasses } from '../../../contexts/ThemeContext';

interface IndicatorToggleProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  description?: string;
}

const IndicatorToggle: React.FC<IndicatorToggleProps> = ({
  label,
  enabled,
  onChange,
  description,
}) => {
  return (
    <div className="flex items-start justify-between">
      <div className="flex-1 mr-4">
        <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
          {label}
        </label>
        {description && (
          <p className={`text-xs ${themeClasses.text.muted}`}>{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

export default IndicatorToggle;
