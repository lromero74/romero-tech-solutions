import React from 'react';
import { Disc, HardDrive, Thermometer, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

export const DiskHealthStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || !latestMetrics.disk_health_status) return null;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Disc className="w-5 h-5 mr-2" />
        Disk Health & SMART Status
      </h3>

      {/* Overall Health Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        {/* Overall Status */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Overall Status:</span>
            <span className={`text-lg font-bold ${
              latestMetrics.disk_health_status === 'healthy' ? 'text-green-600 dark:text-green-400' :
              latestMetrics.disk_health_status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
              latestMetrics.disk_health_status === 'critical' ? 'text-red-600 dark:text-red-400' :
              'text-gray-600'
            }`}>
              {latestMetrics.disk_health_status === 'healthy' ? 'Healthy' :
               latestMetrics.disk_health_status === 'warning' ? 'Warning' :
               latestMetrics.disk_health_status === 'critical' ? 'Critical' :
               'Unknown'}
            </span>
          </div>
        </div>

        {/* Max Temperature */}
        {latestMetrics.disk_temperature_max !== null && latestMetrics.disk_temperature_max !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Thermometer className={`w-4 h-4 ${themeClasses.text.muted}`} />
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Max Temperature:</span>
              </div>
              <span className={`text-lg font-bold ${
                latestMetrics.disk_temperature_max > 60 ? 'text-red-600 dark:text-red-400' :
                latestMetrics.disk_temperature_max > 50 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                {latestMetrics.disk_temperature_max}°C
              </span>
            </div>
          </div>
        )}

        {/* Predicted Failures */}
        {latestMetrics.disk_failures_predicted !== null && latestMetrics.disk_failures_predicted !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failures Predicted:</span>
              <span className={`text-lg font-bold ${
                latestMetrics.disk_failures_predicted > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              }`}>
                {latestMetrics.disk_failures_predicted}
              </span>
            </div>
            {latestMetrics.disk_failures_predicted > 0 && (
              <p className={`text-xs text-red-600`}>
                {latestMetrics.disk_failures_predicted} disk{latestMetrics.disk_failures_predicted !== 1 ? 's' : ''} showing failure indicators
              </p>
            )}
          </div>
        )}
      </div>

      {/* Per-Disk Details */}
      {latestMetrics.disk_health_data && Array.isArray(latestMetrics.disk_health_data) && latestMetrics.disk_health_data.length > 0 && (
        <div className="space-y-3">
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            Individual Disks ({latestMetrics.disk_health_data.length})
          </h4>
          {latestMetrics.disk_health_data.map((disk, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                disk.failure_predicted || disk.overall_health === 'FAILED'
                  ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                  : disk.reallocated_sectors > 0 || disk.temperature_c > 60
                  ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                  : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <HardDrive className={`w-5 h-5 mr-2 ${
                    disk.failure_predicted || disk.overall_health === 'FAILED' ? 'text-red-600 dark:text-red-400' :
                    disk.reallocated_sectors > 0 || disk.temperature_c > 60 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-green-600 dark:text-green-400'
                  }`} />
                  <div>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>{disk.device}</p>
                    <p className={`text-xs ${themeClasses.text.muted}`}>
                      SMART Status: {disk.overall_health}
                    </p>
                  </div>
                </div>
                {disk.failure_predicted && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 rounded text-xs font-medium">
                    FAILURE PREDICTED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className={`${themeClasses.text.muted} mb-1`}>Temperature</p>
                  <p className={`font-medium ${
                    disk.temperature_c > 60 ? 'text-red-600 dark:text-red-400' :
                    disk.temperature_c > 50 ? 'text-yellow-600 dark:text-yellow-400' :
                    themeClasses.text.primary
                  }`}>
                    {disk.temperature_c}°C
                  </p>
                </div>
                <div>
                  <p className={`${themeClasses.text.muted} mb-1`}>Power-On Hours</p>
                  <p className={`font-medium ${themeClasses.text.primary}`}>
                    {disk.power_on_hours.toLocaleString()}h
                  </p>
                </div>
                <div>
                  <p className={`${themeClasses.text.muted} mb-1`}>Reallocated Sectors</p>
                  <p className={`font-medium ${
                    disk.reallocated_sectors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {disk.reallocated_sectors}
                  </p>
                </div>
                <div>
                  <p className={`${themeClasses.text.muted} mb-1`}>Pending Sectors</p>
                  <p className={`font-medium ${
                    disk.pending_sectors > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {disk.pending_sectors}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {(disk.failure_predicted || disk.reallocated_sectors > 0 || disk.temperature_c > 60) && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-start">
                    <AlertTriangle className={`w-4 h-4 mr-2 flex-shrink-0 mt-0.5 ${
                      disk.failure_predicted || disk.overall_health === 'FAILED' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                    }`} />
                    <div className="text-xs">
                      {disk.failure_predicted && (
                        <p className="text-red-600 font-medium mb-1">
                          ⚠️ Disk failure predicted - backup data immediately
                        </p>
                      )}
                      {disk.reallocated_sectors > 0 && (
                        <p className="text-red-600">
                          • {disk.reallocated_sectors} reallocated sectors detected (disk wear indicator)
                        </p>
                      )}
                      {disk.temperature_c > 60 && (
                        <p className="text-yellow-600">
                          • Temperature exceeds safe threshold (60°C)
                        </p>
                      )}
                      {disk.pending_sectors > 0 && (
                        <p className="text-yellow-600">
                          • {disk.pending_sectors} pending sectors awaiting reallocation
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Critical Warning Banner */}
      {latestMetrics.disk_failures_predicted > 0 && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-3 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800 dark:text-red-200 mb-1">
                Critical: Disk Failure Imminent
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                {latestMetrics.disk_failures_predicted} disk{latestMetrics.disk_failures_predicted !== 1 ? 's are' : ' is'} showing
                signs of imminent failure. Back up all critical data immediately and schedule disk replacement.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
