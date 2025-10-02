import React, { useState, useEffect } from 'react';
import { DollarSign, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { systemSettingsService } from '../../services/systemSettingsService';

const AdminPricingSettings: React.FC = () => {
  const [baseHourlyRate, setBaseHourlyRate] = useState<number>(75);
  const [originalRate, setOriginalRate] = useState<number>(75);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBaseHourlyRate();
  }, []);

  useEffect(() => {
    setHasChanges(baseHourlyRate !== originalRate);
  }, [baseHourlyRate, originalRate]);

  const loadBaseHourlyRate = async () => {
    try {
      setIsLoading(true);
      const data = await systemSettingsService.getSetting('base_hourly_rate');
      const rate = parseFloat(data.value);
      setBaseHourlyRate(rate);
      setOriginalRate(rate);
    } catch (error) {
      console.error('Failed to load base hourly rate:', error);
      setErrorMessage('Failed to load current rate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (baseHourlyRate <= 0) {
      setErrorMessage('Rate must be greater than $0');
      return;
    }

    try {
      setSaveStatus('saving');
      setErrorMessage('');

      await systemSettingsService.updateSetting('base_hourly_rate', baseHourlyRate);

      setOriginalRate(baseHourlyRate);
      setHasChanges(false);
      setSaveStatus('saved');

      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error: any) {
      console.error('Failed to save base hourly rate:', error);
      setSaveStatus('error');
      setErrorMessage(error.message || 'Failed to save rate');

      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    }
  };

  const handleReset = () => {
    setBaseHourlyRate(originalRate);
    setHasChanges(false);
    setErrorMessage('');
  };

  if (isLoading) {
    return (
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
        <div className="flex items-center">
          <DollarSign className="w-5 h-5 text-green-500 mr-2" />
          <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Base Hourly Rate</h2>
        </div>
        <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
          Set the base hourly rate for on-call services. This rate is multiplied by tier multipliers (Standard, Premium, Emergency) to calculate actual service costs.
        </p>
      </div>

      {/* Body */}
      <div className="p-6">
        <div className="max-w-md">
          <label htmlFor="baseHourlyRate" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            Base Hourly Rate (USD)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className={themeClasses.text.secondary}>$</span>
            </div>
            <input
              type="number"
              id="baseHourlyRate"
              min="1"
              step="1"
              value={baseHourlyRate}
              onChange={(e) => setBaseHourlyRate(parseFloat(e.target.value) || 0)}
              className={`
                block w-full pl-7 pr-12 py-2 rounded-md
                ${themeClasses.input.base}
                ${hasChanges ? 'border-yellow-400 focus:border-yellow-500 focus:ring-yellow-500' : ''}
              `}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className={`text-xs ${themeClasses.text.secondary}`}>per hour</span>
            </div>
          </div>
          <p className={`text-xs ${themeClasses.text.secondary} mt-2`}>
            Example: With a ${baseHourlyRate}/hour rate, a 2x Premium tier would cost ${(baseHourlyRate * 2).toFixed(2)}/hour
          </p>

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-md flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex justify-between items-center`}>
        <div className="flex items-center space-x-2">
          {hasChanges && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center">
              <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span>
              Unsaved changes
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">
              ✓ Saved successfully
            </span>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            disabled={!hasChanges || saveStatus === 'saving'}
            className={`
              px-4 py-2 text-sm font-medium rounded-md
              ${themeClasses.button.secondary}
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center
            `}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </button>

          <button
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === 'saving' || baseHourlyRate <= 0}
            className={`
              px-4 py-2 text-sm font-medium rounded-md text-white
              ${hasChanges && baseHourlyRate > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400'}
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center
            `}
          >
            {saveStatus === 'saving' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPricingSettings;
