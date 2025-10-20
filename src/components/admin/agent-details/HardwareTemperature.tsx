import React from 'react';
import { Thermometer, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useClientLanguage } from '../../../contexts/ClientLanguageContext';

export const HardwareTemperature: React.FC<AgentDetailsComponentProps> = ({ latestMetrics, agent }) => {
  const { t } = useClientLanguage();
  if (!latestMetrics || (latestMetrics.highest_temperature_c === undefined && !latestMetrics.sensor_data)) {
    return null;
  }

  // Filter out "systeminfo" placeholder sensor
  const realSensors = latestMetrics.sensor_data?.filter(s => s.sensor_type !== 'info') || [];
  const hasSensorData = (latestMetrics.highest_temperature_c && latestMetrics.highest_temperature_c > 0) || realSensors.length > 0;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Thermometer className="w-5 h-5 mr-2" />
        {t('agentDetails.hardwareTemperature.title', undefined, 'Hardware Temperature & Sensors')}
      </h3>

      {!hasSensorData ? (
        <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <Thermometer className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
            {t('agentDetails.hardwareTemperature.sensorDataUnavailable', undefined, 'Sensor Data Unavailable')}
          </p>
          <p className={`text-xs ${themeClasses.text.tertiary}`}>
            {t('agentDetails.hardwareTemperature.sensorUnavailableMessage', undefined, 'This system does not expose hardware temperature sensors to the monitoring agent.')}
            {agent?.os_type === 'darwin' && ' ' + t('agentDetails.hardwareTemperature.macOSRequirements', undefined, 'macOS requires elevated permissions or specialized tools for sensor access.')}
            {agent?.os_type === 'windows' && ' ' + t('agentDetails.hardwareTemperature.windowsRequirements', undefined, 'Install OpenHardwareMonitor for sensor monitoring.')}
            {agent?.os_type === 'linux' && ' ' + t('agentDetails.hardwareTemperature.linuxRequirements', undefined, 'Install lm-sensors for detailed temperature monitoring.')}
          </p>
        </div>
      ) : (
        <>
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
            {/* Highest Temperature */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                  {t('agentDetails.hardwareTemperature.highestTemp', undefined, 'Highest Temp:')}
                </span>
                <span className={`text-lg font-bold ${
                  (latestMetrics.highest_temperature_c || 0) > 90 ? 'text-red-600 dark:text-red-400' :
                  (latestMetrics.highest_temperature_c || 0) > 80 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                }`}>
                  {latestMetrics.highest_temperature_c || 0}°C
                </span>
              </div>
              {latestMetrics.highest_temperature_c && latestMetrics.highest_temperature_c > 80 && (
                <p className={`text-xs ${
                  latestMetrics.highest_temperature_c > 90 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  {latestMetrics.highest_temperature_c > 90
                    ? t('agentDetails.hardwareTemperature.criticalTemperature', undefined, 'Critical temperature!')
                    : t('agentDetails.hardwareTemperature.highTemperatureWarning', undefined, 'High temperature warning')}
                </p>
              )}
            </div>

            {/* CPU Temperature */}
            {latestMetrics.cpu_temperature_c !== null && latestMetrics.cpu_temperature_c !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                    {t('agentDetails.hardwareTemperature.cpuTemp', undefined, 'CPU Temp:')}
                  </span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.cpu_temperature_c > 90 ? 'text-red-600 dark:text-red-400' :
                    latestMetrics.cpu_temperature_c > 80 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-green-600 dark:text-green-400'
                  }`}>
                    {latestMetrics.cpu_temperature_c}°C
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('agentDetails.hardwareTemperature.processorTemperature', undefined, 'Processor temperature')}
                </p>
              </div>
            )}

            {/* GPU Temperature */}
            {latestMetrics.gpu_temperature_c !== null && latestMetrics.gpu_temperature_c !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                    {t('agentDetails.hardwareTemperature.gpuTemp', undefined, 'GPU Temp:')}
                  </span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.gpu_temperature_c > 90 ? 'text-red-600 dark:text-red-400' :
                    latestMetrics.gpu_temperature_c > 80 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-green-600 dark:text-green-400'
                  }`}>
                    {latestMetrics.gpu_temperature_c}°C
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('agentDetails.hardwareTemperature.graphicsCardTemperature', undefined, 'Graphics card temperature')}
                </p>
              </div>
            )}

            {/* Critical Sensors Count */}
            {latestMetrics.temperature_critical_count !== undefined && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                    {t('agentDetails.hardwareTemperature.criticalSensors', undefined, 'Critical Sensors:')}
                  </span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.temperature_critical_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {latestMetrics.temperature_critical_count}
                  </span>
                </div>
                {latestMetrics.temperature_critical_count > 0 ? (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {t(
                      latestMetrics.temperature_critical_count !== 1
                        ? 'agentDetails.hardwareTemperature.sensorsAbove90.plural'
                        : 'agentDetails.hardwareTemperature.sensorsAbove90.singular',
                      undefined,
                      latestMetrics.temperature_critical_count !== 1
                        ? '{count} sensors above 90°C'
                        : '{count} sensor above 90°C'
                    ).replace('{count}', String(latestMetrics.temperature_critical_count))}
                  </p>
                ) : (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {t('agentDetails.hardwareTemperature.allSensorsNormal', undefined, 'All sensors normal')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Fan Status */}
          {latestMetrics.fan_count !== undefined && latestMetrics.fan_count > 0 && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                {t('agentDetails.hardwareTemperature.fanStatus', undefined, 'Fan Status')} ({latestMetrics.fan_count} {t('agentDetails.hardwareTemperature.detected', undefined, 'detected')})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                    {t('agentDetails.hardwareTemperature.totalFans', undefined, 'Total Fans:')}
                  </span>
                  <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                    {latestMetrics.fan_count}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                    {t('agentDetails.hardwareTemperature.failed', undefined, 'Failed:')}
                  </span>
                  <span className={`text-lg font-bold ${
                    latestMetrics.fan_failure_count && latestMetrics.fan_failure_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {latestMetrics.fan_failure_count || 0}
                  </span>
                </div>
                {latestMetrics.fan_speeds_rpm && latestMetrics.fan_speeds_rpm.length > 0 && (
                  <div>
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                      {t('agentDetails.hardwareTemperature.speeds', undefined, 'Speeds:')}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {latestMetrics.fan_speeds_rpm.map((rpm, idx) => (
                        <span key={idx} className={rpm < 100 ? 'text-red-600 dark:text-red-400' : ''}>
                          {rpm} RPM{idx < latestMetrics.fan_speeds_rpm!.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Sensor List */}
          {latestMetrics.sensor_data && Array.isArray(latestMetrics.sensor_data) && latestMetrics.sensor_data.length > 0 && (
            <div className="space-y-2">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                {t('agentDetails.hardwareTemperature.allSensors', undefined, 'All Sensors')} ({latestMetrics.sensor_data.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {latestMetrics.sensor_data
                  .sort((a, b) => {
                    // Sort: critical first, then by type, then by value descending
                    if (a.critical !== b.critical) return a.critical ? -1 : 1;
                    if (a.sensor_type !== b.sensor_type) return a.sensor_type.localeCompare(b.sensor_type);
                    return b.value - a.value;
                  })
                  .map((sensor, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        sensor.critical
                          ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                          : sensor.sensor_type === 'temperature' && sensor.value > 80
                          ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                          : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {sensor.sensor_name}
                            </span>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {t(`agentDetails.hardwareTemperature.sensorType.${sensor.sensor_type}`, undefined, sensor.sensor_type)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${
                            sensor.critical ? 'text-red-600 dark:text-red-400' :
                            sensor.sensor_type === 'temperature' && sensor.value > 80 ? 'text-yellow-600 dark:text-yellow-400' :
                            sensor.sensor_type === 'fan' && sensor.value < 100 ? 'text-red-600 dark:text-red-400' :
                            'text-green-600 dark:text-green-400'
                          }`}>
                            {sensor.value.toFixed(sensor.sensor_type === 'temperature' ? 0 : 0)} {sensor.unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Temperature Alert */}
          {latestMetrics.temperature_critical_count && latestMetrics.temperature_critical_count > 0 && (
            <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {t(
                      latestMetrics.temperature_critical_count !== 1
                        ? 'agentDetails.hardwareTemperature.criticalAlert.plural'
                        : 'agentDetails.hardwareTemperature.criticalAlert.singular',
                      undefined,
                      latestMetrics.temperature_critical_count !== 1
                        ? 'Critical Temperature Alert: {count} sensors above 90°C'
                        : 'Critical Temperature Alert: {count} sensor above 90°C'
                    ).replace('{count}', String(latestMetrics.temperature_critical_count))}
                  </p>
                  <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                    {t('agentDetails.hardwareTemperature.overheatingMessage', undefined, 'System may be overheating. Check cooling system, clean dust filters, verify fans are working, and ensure proper ventilation.')}
                    {latestMetrics.fan_failure_count && latestMetrics.fan_failure_count > 0 && (
                      <span> {t('agentDetails.hardwareTemperature.fansFailedMessage', undefined, '{count} fan(s) have failed!')
                        .replace('{count}', String(latestMetrics.fan_failure_count))}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
