import { useState } from 'react';
import { ZoomDomain } from '../MetricsChart.types';

interface Anomaly {
  timestamp: string;
  value: number;
  severity: 'minor' | 'moderate' | 'severe';
  deviationsFromMean: number;
}

interface UseAnomalyNavigationProps {
  filteredAnomalies: Anomaly[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chartData: any[];
  setZoomDomain: (domain: ZoomDomain) => void;
}

export function useAnomalyNavigation({
  filteredAnomalies,
  chartData,
  setZoomDomain,
}: UseAnomalyNavigationProps) {
  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // Anomaly navigation handlers
  const navigateToAnomaly = (index: number) => {
    if (!filteredAnomalies || filteredAnomalies.length === 0 || !chartData) return;

    const anomaly = filteredAnomalies[index];
    if (!anomaly) return;

    // Find the chart data index for this anomaly timestamp
    const dataIndex = chartData.findIndex(d => d.timestamp === anomaly.timestamp);
    if (dataIndex === -1) return;

    // Center the view on this anomaly with a reasonable window (50 data points)
    const windowSize = Math.min(50, chartData.length);
    const halfWindow = Math.floor(windowSize / 2);
    const newStart = Math.max(0, dataIndex - halfWindow);
    const newEnd = Math.min(chartData.length - 1, dataIndex + halfWindow);

    setZoomDomain({ startIndex: newStart, endIndex: newEnd });
    setCurrentAnomalyIndex(index);

    // Highlight this anomaly with a blue halo for 2 seconds
    setHighlightedAnomalyTimestamp(anomaly.timestamp);
    setTimeout(() => {
      setHighlightedAnomalyTimestamp(null);
    }, 2000);
  };

  const handlePreviousAnomaly = () => {
    if (filteredAnomalies.length === 0 || currentAnomalyIndex === 0) return;
    const newIndex = currentAnomalyIndex - 1;
    navigateToAnomaly(newIndex);
  };

  const handleNextAnomaly = () => {
    if (filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1) return;
    const newIndex = currentAnomalyIndex + 1;
    navigateToAnomaly(newIndex);
  };

  const handleToggleAnomalyNavigation = () => {
    setAnomalyNavigationExpanded(!anomalyNavigationExpanded);
    // If expanding and there are anomalies, navigate to the first one
    if (!anomalyNavigationExpanded && filteredAnomalies.length > 0) {
      navigateToAnomaly(0);
    }
  };

  const handleSeverityFilterChange = (newFilter: 'all' | 'severe') => {
    setAnomalySeverityFilter(newFilter);
    setCurrentAnomalyIndex(0);
  };

  return {
    anomalyNavigationExpanded,
    anomalySeverityFilter,
    currentAnomalyIndex,
    highlightedAnomalyTimestamp,
    navigateToAnomaly,
    handlePreviousAnomaly,
    handleNextAnomaly,
    handleToggleAnomalyNavigation,
    handleSeverityFilterChange,
  };
}
