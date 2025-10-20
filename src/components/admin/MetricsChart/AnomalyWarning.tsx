import React from 'react';
import { format } from 'date-fns';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface Anomaly {
  timestamp: string;
  value: number;
  severity: 'minor' | 'moderate' | 'severe';
  deviationsFromMean: number;
}

interface AnomalyWarningProps {
  anomalies: Anomaly[];
  filteredAnomalies: Anomaly[];
  anomalyNavigationExpanded: boolean;
  anomalySeverityFilter: 'all' | 'severe';
  currentAnomalyIndex: number;
  unit: string;
  onToggle: () => void;
  onSeverityFilterChange: (filter: 'all' | 'severe') => void;
  onPrevious: () => void;
  onNext: () => void;
  onNavigate: (index: number) => void;
}

const AnomalyWarning: React.FC<AnomalyWarningProps> = ({
  anomalies,
  filteredAnomalies,
  anomalyNavigationExpanded,
  anomalySeverityFilter,
  currentAnomalyIndex,
  unit,
  onToggle,
  onSeverityFilterChange,
  onPrevious,
  onNext,
  onNavigate,
}) => {
  if (anomalies.length === 0) return null;

  return (
    <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg overflow-hidden">
      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="w-full p-3 text-left hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
      >
        <p className="text-sm text-yellow-900 dark:text-yellow-100 flex items-center justify-between">
          <span>
            ⚠️ {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
            ({anomalies.filter(a => a.severity === 'severe').length} severe)
          </span>
          <span className="text-xs opacity-70">
            {anomalyNavigationExpanded ? 'Click to hide controls' : 'Click to navigate'}
          </span>
        </p>
      </button>

      {/* Navigation controls */}
      {anomalyNavigationExpanded && (
        <div className="px-3 pb-3 border-t border-yellow-200 dark:border-yellow-800 pt-3 flex items-center gap-3 flex-wrap">
          {/* Severity filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
            <select
              value={anomalySeverityFilter}
              onChange={(e) => {
                onSeverityFilterChange(e.target.value as 'all' | 'severe');
                // Navigate to first anomaly of new filter
                if (e.target.value === 'severe' && anomalies.filter(a => a.severity === 'severe').length > 0) {
                  setTimeout(() => onNavigate(0), 0);
                } else if (e.target.value === 'all' && anomalies.length > 0) {
                  setTimeout(() => onNavigate(0), 0);
                }
              }}
              className="text-xs px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All anomalies</option>
              <option value="severe">Severe only</option>
            </select>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1 border border-yellow-300 dark:border-yellow-700 rounded-lg p-1 bg-white dark:bg-gray-800">
            <button
              onClick={onPrevious}
              disabled={filteredAnomalies.length === 0 || currentAnomalyIndex === 0}
              className={`p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors ${
                filteredAnomalies.length === 0 || currentAnomalyIndex === 0 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title={currentAnomalyIndex === 0 ? 'At first anomaly' : 'Previous anomaly'}
            >
              <ChevronLeft className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
            </button>
            <span className="text-xs text-yellow-900 dark:text-yellow-100 px-2 min-w-[4rem] text-center">
              {filteredAnomalies.length > 0 ? `${currentAnomalyIndex + 1} of ${filteredAnomalies.length}` : 'None'}
            </span>
            <button
              onClick={onNext}
              disabled={filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1}
              className={`p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors ${
                filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title={currentAnomalyIndex >= filteredAnomalies.length - 1 ? 'At last anomaly' : 'Next anomaly'}
            >
              <ChevronRight className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
            </button>
          </div>

          {/* Current anomaly info */}
          {filteredAnomalies.length > 0 && filteredAnomalies[currentAnomalyIndex] && (
            <div className="text-xs text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded font-medium ${
                filteredAnomalies[currentAnomalyIndex].severity === 'severe' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' :
                filteredAnomalies[currentAnomalyIndex].severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' :
                'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
              }`}>
                {filteredAnomalies[currentAnomalyIndex].severity}
              </span>
              <span>
                {format(new Date(filteredAnomalies[currentAnomalyIndex].timestamp), 'MMM d, HH:mm')}
              </span>
              <span>
                {filteredAnomalies[currentAnomalyIndex].value.toFixed(1)}{unit}
              </span>
              <span className="opacity-70">
                ({filteredAnomalies[currentAnomalyIndex].deviationsFromMean.toFixed(1)}σ)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnomalyWarning;
