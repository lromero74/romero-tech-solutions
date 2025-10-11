/**
 * Shared utility functions for Agent Details components
 */

export const getMetricColor = (value: number): string => {
  if (value >= 90) return 'text-red-600 dark:text-red-400';
  if (value >= 75) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
};

export const getMetricBarColor = (value: number): string => {
  if (value >= 90) return 'bg-red-600';
  if (value >= 75) return 'bg-yellow-600';
  return 'bg-green-600';
};

export const formatBytes = (bytes: number | null, decimals: number = 2): string => {
  if (bytes === null) return 'N/A';
  return (bytes / 1024 / 1024).toFixed(decimals);
};
