import React, { useMemo } from 'react';
import { Thermometer, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import MetricsChartECharts from '../MetricsChartECharts';

export const HardwareTemperature: React.FC<AgentDetailsComponentProps> = ({ latestMetrics, agent, metricsHistory }) => {
  const { t } = useOptionalClientLanguage();
  if (!latestMetrics || (latestMetrics.highest_temperature_c === undefined && !latestMetrics.sensor_data)) {
    return null;
  }

  // Filter out "systeminfo" placeholder sensor
  const realSensors = latestMetrics.sensor_data?.filter(s => s.sensor_type !== 'info') || [];
  const hasSensorData = (latestMetrics.highest_temperature_c && latestMetrics.highest_temperature_c > 0) || realSensors.length > 0;

  // Build per-sensor time series from the metricsHistory window so we
  // can render charts that mirror CPU/Memory/Disk usage. We chart the
  // three named hardware temperatures whenever the host reports them
  // (CPU/GPU/motherboard) plus "highest" as the default rollup. Each
  // returned array is empty when the history doesn't carry that
  // field at all, in which case we don't render the chart.
  const tempSeries = useMemo(() => {
    if (!Array.isArray(metricsHistory) || metricsHistory.length === 0) {
      return { highest: [], cpu: [], gpu: [], mobo: [] };
    }
    const collect = (key: 'highest_temperature_c' | 'cpu_temperature_c' | 'gpu_temperature_c' | 'motherboard_temperature_c') =>
      metricsHistory
        .filter(m => typeof m[key] === 'number' && (m[key] as number) > 0)
        .map(m => ({ timestamp: m.collected_at, value: Number(m[key]) || 0 }));
    return {
      highest: collect('highest_temperature_c'),
      cpu:     collect('cpu_temperature_c'),
      gpu:     collect('gpu_temperature_c'),
      mobo:    collect('motherboard_temperature_c'),
    };
  }, [metricsHistory]);

  // Build per-named-fan / per-named-sensor series by walking the
  // sensor_data array on each historical metric and bucketing by
  // sensor_name. This lets us chart e.g. each individual fan's RPM
  // history rather than just the aggregate fan_count. Map keys are
  // case-sensitive sensor names; values carry the unit + readings so
  // the chart can label its Y axis correctly.
  const namedSeries = useMemo(() => {
    if (!Array.isArray(metricsHistory) || metricsHistory.length === 0) return new Map<string, { unit: string; type: string; points: { timestamp: string; value: number }[] }>();
    const map = new Map<string, { unit: string; type: string; points: { timestamp: string; value: number }[] }>();
    for (const m of metricsHistory) {
      const sensors = (m.sensor_data || []) as Array<{ sensor_name: string; sensor_type: string; unit: string; value: number }>;
      for (const s of sensors) {
        if (!s.sensor_name || s.sensor_type === 'info') continue;
        if (typeof s.value !== 'number') continue;
        const entry = map.get(s.sensor_name) || { unit: s.unit || '', type: s.sensor_type || '', points: [] };
        entry.points.push({ timestamp: m.collected_at, value: s.value });
        map.set(s.sensor_name, entry);
      }
    }
    // Drop sensors that only ever reported a single sample — a chart
    // of one point isn't helpful. Sort each remaining series by time.
    for (const [k, v] of Array.from(map.entries())) {
      if (v.points.length < 2) {
        map.delete(k);
        continue;
      }
      v.points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    return map;
  }, [metricsHistory]);

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

          {/* Sensor history charts: render below the live snapshot.
              Three named-rollup charts up top (highest/CPU/GPU/mobo
              wherever the host reports them) plus per-named-sensor
              charts when the metricsHistory window is large enough
              for the points to be meaningful. */}
          {(tempSeries.highest.length > 1 || tempSeries.cpu.length > 1 || tempSeries.gpu.length > 1 || tempSeries.mobo.length > 1) && (
            <div className="mt-6 space-y-4">
              <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                {t('agentDetails.hardwareTemperature.history', undefined, 'Sensor history')}
              </h4>
              {tempSeries.highest.length > 1 && (
                <MetricsChartECharts
                  data={tempSeries.highest}
                  title="Highest temperature"
                  dataKey="Temp"
                  unit="°C"
                  color="#ef4444"
                  agentId={agent?.id}
                  resourceType="cpu"
                />
              )}
              {tempSeries.cpu.length > 1 && (
                <MetricsChartECharts
                  data={tempSeries.cpu}
                  title="CPU temperature"
                  dataKey="CPU"
                  unit="°C"
                  color="#3b82f6"
                  agentId={agent?.id}
                  resourceType="cpu"
                />
              )}
              {tempSeries.gpu.length > 1 && (
                <MetricsChartECharts
                  data={tempSeries.gpu}
                  title="GPU temperature"
                  dataKey="GPU"
                  unit="°C"
                  color="#8b5cf6"
                  agentId={agent?.id}
                  resourceType="cpu"
                />
              )}
              {tempSeries.mobo.length > 1 && (
                <MetricsChartECharts
                  data={tempSeries.mobo}
                  title="Motherboard temperature"
                  dataKey="MoBo"
                  unit="°C"
                  color="#10b981"
                  agentId={agent?.id}
                  resourceType="cpu"
                />
              )}
            </div>
          )}

          {namedSeries.size > 0 && (
            <details className="mt-4">
              <summary className={`cursor-pointer text-sm font-semibold ${themeClasses.text.primary}`}>
                Per-sensor history ({namedSeries.size} sensors)
              </summary>
              <div className="mt-3 space-y-4">
                {Array.from(namedSeries.entries()).map(([name, entry]) => (
                  <MetricsChartECharts
                    key={name}
                    data={entry.points}
                    title={name}
                    dataKey={entry.type === 'fan' ? 'RPM' : 'Value'}
                    unit={entry.unit}
                    color={entry.type === 'fan' ? '#f59e0b' : '#06b6d4'}
                    agentId={agent?.id}
                    resourceType="cpu"
                  />
                ))}
              </div>
            </details>
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
