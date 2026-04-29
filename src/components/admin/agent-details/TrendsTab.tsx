/**
 * Stage 2 Trends tab — see docs/PRPs/STAGE2_TRENDS.md.
 *
 * Renders three sections:
 *   1. Disk-space forecast: actual usage history (sparkline) + projected
 *      fill date pulled from the nightly-computed forecast row.
 *   2. Performance baselines table: 7-day mean ± 2σ band per metric.
 *   3. WAN IP history: recent IP changes (laptop network mobility).
 *
 * Each section has its own permission gate. The whole tab is gated by
 * view.agent_trends.enable; baselines + WAN IP also require that key,
 * the disk forecast section requires view.agent_disk_forecast.enable.
 */
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { TrendingUp, AlertTriangle, AlertCircle, Globe } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { usePermission } from '../../../hooks/usePermission';
import {
  trendsService,
  DiskForecast,
  DiskHistoryPoint,
  MetricBaseline,
  WanIpHistoryRow,
} from '../../../services/trendsService';

interface Props {
  agentId: string;
}

const METRIC_LABELS: Record<string, string> = {
  cpu_percent: 'CPU %',
  memory_percent: 'Memory %',
  disk_percent: 'Disk %',
  load_average_1m: 'Load 1m',
  network_rx_bytes: 'Net RX (B/s)',
  network_tx_bytes: 'Net TX (B/s)',
};

function formatGB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '?';
  return `${Number(n).toFixed(1)} GB`;
}

function formatDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'n/a';
  if (n === 0) return 'now';
  return `${Number(n).toFixed(1)} days`;
}

function severityIcon(severity: 'critical' | 'warning' | null) {
  if (severity === 'critical') return <AlertCircle className="w-5 h-5 text-red-500" aria-label="critical" />;
  if (severity === 'warning')  return <AlertTriangle className="w-5 h-5 text-yellow-500" aria-label="warning" />;
  return <TrendingUp className="w-5 h-5 text-green-500" aria-label="ok" />;
}

const TrendsTab: React.FC<Props> = ({ agentId }) => {
  const { t } = useOptionalClientLanguage();
  const { checkPermission } = usePermission();
  const canViewTrends = checkPermission('view.agent_trends.enable');
  const canViewForecast = checkPermission('view.agent_disk_forecast.enable');

  const [forecast, setForecast] = useState<DiskForecast | null>(null);
  const [history, setHistory] = useState<DiskHistoryPoint[]>([]);
  const [forecastSev, setForecastSev] = useState<'critical' | 'warning' | null>(null);
  const [baselines, setBaselines] = useState<MetricBaseline[]>([]);
  const [wanIps, setWanIps] = useState<WanIpHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewTrends) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      canViewForecast ? trendsService.diskForecast(agentId, 30) : Promise.resolve(null),
      trendsService.baselines(agentId),
      trendsService.wanIpHistory(agentId, 20),
    ])
      .then(([df, bl, ip]) => {
        if (cancelled) return;
        if (df) {
          setForecast(df.data.forecast);
          setHistory(df.data.history || []);
          setForecastSev(df.data.severity);
        }
        setBaselines(bl.data || []);
        setWanIps(ip.data || []);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trends');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [agentId, canViewTrends, canViewForecast]);

  if (!canViewTrends) {
    return (
      <div className={`text-sm ${themeClasses.text.muted}`}>
        {t('agentDetails.trends.noPermission', undefined, "You don't have permission to view trend data.")}
      </div>
    );
  }
  if (loading) return <div className={`text-sm ${themeClasses.text.secondary}`}>Loading…</div>;
  if (error)   return <div className="text-sm text-red-500">{error}</div>;

  const chartData = history.map(p => ({
    bucket: new Date(p.bucket).toLocaleDateString(),
    used_gb: Number(p.used_gb),
    percent: Number(p.percent),
  }));

  return (
    <div className="space-y-6">
      {canViewForecast && (
        <section
          data-testid="trends-disk-forecast"
          className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}
        >
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3 flex items-center gap-2`}>
            {severityIcon(forecastSev)}
            {t('agentDetails.trends.diskForecastTitle', undefined, 'Disk-space forecast')}
          </h3>
          {!forecast ? (
            <div className={`text-sm ${themeClasses.text.muted}`}>
              {t('agentDetails.trends.noForecast', undefined,
                'No forecast yet — the nightly job will compute one once the agent has at least 24 hours of metrics history.')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Stat label="Used" value={formatGB(forecast.current_used_gb)} />
                <Stat label="Total" value={formatGB(forecast.current_total_gb)} />
                <Stat label="Growth" value={
                  forecast.growth_gb_per_day !== null
                    ? `${Number(forecast.growth_gb_per_day).toFixed(2)} GB/day`
                    : '?'
                } />
                <Stat label="Projected full" value={formatDays(forecast.days_until_full)} />
              </div>
              {forecast.forecast_full_at && (
                <div className={`text-sm ${themeClasses.text.secondary} mb-3`}>
                  At current growth, this disk reaches capacity around <strong>{new Date(forecast.forecast_full_at).toLocaleDateString()}</strong>.
                </div>
              )}
              {chartData.length > 0 && (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="used_gb" stroke="#8884d8" fill="#8884d8" fillOpacity={0.2} name="Used (GB)" />
                      <Line type="monotone" dataKey="percent" stroke="#82ca9d" name="Used %" yAxisId={0} dot={false} />
                      {forecast.current_total_gb && (
                        <ReferenceLine y={Number(forecast.current_total_gb)} stroke="red" strokeDasharray="3 3" label="Capacity" />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className={`text-xs ${themeClasses.text.muted} mt-2`}>
                Computed {new Date(forecast.computed_at).toLocaleString()} from {forecast.sample_count} samples (last 30 days)
              </div>
            </>
          )}
        </section>
      )}

      <section
        data-testid="trends-baselines"
        className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}
      >
        <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>
          {t('agentDetails.trends.baselinesTitle', undefined, 'Performance baselines (7-day rolling)')}
        </h3>
        {baselines.length === 0 ? (
          <div className={`text-sm ${themeClasses.text.muted}`}>
            {t('agentDetails.trends.noBaselines', undefined,
              'No baselines yet — requires 7 days of metric samples for each metric type.')}
          </div>
        ) : (
          <table className={`text-sm w-full ${themeClasses.text.secondary}`}>
            <thead>
              <tr className={`${themeClasses.text.primary}`}>
                <th className="text-left py-1">Metric</th>
                <th className="text-right py-1">Mean</th>
                <th className="text-right py-1">σ</th>
                <th className="text-right py-1">2σ band</th>
                <th className="text-right py-1">Samples</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map(b => {
                const mean = Number(b.mean);
                const sd = Number(b.stddev);
                return (
                  <tr key={b.metric_type} data-testid={`baseline-row-${b.metric_type}`} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="py-1">{METRIC_LABELS[b.metric_type] || b.metric_type}</td>
                    <td className="py-1 text-right font-mono">{mean.toFixed(2)}</td>
                    <td className="py-1 text-right font-mono">{sd.toFixed(2)}</td>
                    <td className="py-1 text-right font-mono">
                      {(mean - 2 * sd).toFixed(2)} – {(mean + 2 * sd).toFixed(2)}
                    </td>
                    <td className="py-1 text-right font-mono">{b.sample_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section
        data-testid="trends-wan-ip"
        className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}
      >
        <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3 flex items-center gap-2`}>
          <Globe className="w-5 h-5" />
          {t('agentDetails.trends.wanIpTitle', undefined, 'WAN IP changes')}
        </h3>
        {wanIps.length === 0 ? (
          <div className={`text-sm ${themeClasses.text.muted}`}>
            {t('agentDetails.trends.noWanIp', undefined,
              'No WAN IP changes recorded yet. The first observation lands when the agent next checks in.')}
          </div>
        ) : (
          <ul className={`text-sm ${themeClasses.text.secondary} space-y-1 font-mono`}>
            {wanIps.map(row => (
              <li key={row.id}>
                <span className={`${themeClasses.text.muted}`}>
                  {new Date(row.observed_at).toLocaleString()}
                </span>{' — '}
                {row.previous_ip
                  ? <>{row.previous_ip} → <strong>{row.public_ip}</strong></>
                  : <><span className={themeClasses.text.muted}>(first sighting)</span> <strong>{row.public_ip}</strong></>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className={`text-xs ${themeClasses.text.muted}`}>{label}</div>
    <div className={`text-lg font-semibold ${themeClasses.text.primary}`}>{value}</div>
  </div>
);

export default TrendsTab;
export { TrendsTab };
