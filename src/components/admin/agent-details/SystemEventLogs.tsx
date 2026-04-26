import React, { useMemo, useState } from 'react';
import { FileWarning, AlertTriangle, CheckCircle, Filter, X, Search, AlertCircle, Info as InfoIcon, AlertOctagon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { themeClasses } from '../../../contexts/ThemeContext';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { AgentDetailsComponentProps } from './types';
import type { EventLog } from '../../../services/agentService';

// Event-Viewer-inspired browser. The agent submits its 24-hour event
// snapshot on every metric submission, so consecutive metrics
// largely duplicate each other. We dedupe by (event_time +
// event_source + event_id + event_message) and merge across the
// metricsHistory window — the user sees a stable history they can
// filter and search instead of a single point-in-time list.

type LevelFilter = 'all' | 'critical' | 'error' | 'warning' | 'information';

const levelOrder = (l: string): number => {
  switch (l.toLowerCase()) {
    case 'critical': return 0;
    case 'error':    return 1;
    case 'warning':  return 2;
    case 'information':
    case 'info':     return 3;
    default:         return 4;
  }
};

const levelBadge = (level: string): string => {
  switch (level.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    case 'error':    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
    case 'warning':  return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
    case 'information':
    case 'info':     return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    default:         return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

const levelIcon = (level: string) => {
  switch (level.toLowerCase()) {
    case 'critical': return <AlertOctagon className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
    case 'error':    return <AlertCircle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />;
    case 'warning':  return <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />;
    case 'information':
    case 'info':     return <InfoIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
    default:         return null;
  }
};

const dedupeKey = (e: EventLog) =>
  `${e.event_time}|${e.event_source}|${e.event_id || ''}|${e.event_message}`;

export const SystemEventLogs: React.FC<AgentDetailsComponentProps> = ({ latestMetrics, metricsHistory }) => {
  const { t, language } = useOptionalClientLanguage();
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EventLog | null>(null);

  // Merge events from every metric snapshot in the history window so
  // the table reflects more than the single point-in-time the agent
  // last reported. Falls back to just the latest metric when no
  // history was passed (older callers).
  const allEvents: EventLog[] = useMemo(() => {
    const seen = new Map<string, EventLog>();
    const sources: AgentMetricLike[] = [];
    if (Array.isArray(metricsHistory) && metricsHistory.length > 0) {
      sources.push(...metricsHistory);
    }
    if (latestMetrics) sources.push(latestMetrics);
    for (const m of sources) {
      const list = m?.event_logs_data;
      if (!Array.isArray(list)) continue;
      for (const ev of list as EventLog[]) {
        if (!ev?.event_time) continue;
        const k = dedupeKey(ev);
        if (!seen.has(k)) seen.set(k, ev);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
    );
  }, [metricsHistory, latestMetrics]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEvents) if (e.event_source) set.add(e.event_source);
    return Array.from(set).sort();
  }, [allEvents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter(e => {
      if (levelFilter !== 'all' && (e.event_level || '').toLowerCase() !== levelFilter) return false;
      if (sourceFilter !== 'all' && e.event_source !== sourceFilter) return false;
      if (q) {
        const hay = `${e.event_message || ''} ${e.event_id || ''} ${e.event_source || ''} ${e.event_category || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allEvents, levelFilter, sourceFilter, search]);

  // Counts come from the merged set so the header reflects the
  // full window, not just whatever was on the latest metric.
  const counts = useMemo(() => {
    const c = { critical: 0, error: 0, warning: 0, info: 0 };
    for (const e of allEvents) {
      const lvl = (e.event_level || '').toLowerCase();
      if (lvl === 'critical') c.critical++;
      else if (lvl === 'error') c.error++;
      else if (lvl === 'warning') c.warning++;
      else if (lvl === 'information' || lvl === 'info') c.info++;
    }
    return c;
  }, [allEvents]);

  if (!latestMetrics) return null;
  // Suppress entirely when no events are present *and* the metric
  // never claimed any (older agents that don't ship event_logs_data
  // at all). Keeps the panel out of the way on healthy hosts.
  const aggregateClaimed = (latestMetrics.critical_events_count || 0)
    + (latestMetrics.error_events_count || 0)
    + (latestMetrics.warning_events_count || 0);
  if (allEvents.length === 0 && aggregateClaimed === 0) return null;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <FileWarning className="w-5 h-5 mr-2" />
        {t('agentDetails.systemEventLogs.title', undefined, 'System Event Logs')}
        <span className={`ml-2 text-xs font-normal ${themeClasses.text.muted}`}>
          ({allEvents.length} unique event{allEvents.length !== 1 ? 's' : ''} across history window)
        </span>
      </h3>

      {/* Headline counts — lifted from the merged set so they match
          the table's view. */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Critical', count: counts.critical, color: 'text-red-600 dark:text-red-400', filter: 'critical' as const },
          { label: 'Error',    count: counts.error,    color: 'text-orange-500 dark:text-orange-400', filter: 'error' as const },
          { label: 'Warning',  count: counts.warning,  color: 'text-yellow-500 dark:text-yellow-400', filter: 'warning' as const },
          { label: 'Info',     count: counts.info,     color: 'text-blue-500 dark:text-blue-400', filter: 'information' as const },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setLevelFilter(prev => prev === card.filter ? 'all' : card.filter)}
            className={`text-left p-2 rounded-lg border transition-colors ${
              levelFilter === card.filter
                ? `border-blue-400 ${themeClasses.bg.hover}`
                : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
            }`}>
            <div className={`text-2xl font-bold ${card.count > 0 ? card.color : themeClasses.text.muted}`}>
              {card.count}
            </div>
            <div className={`text-sm ${themeClasses.text.tertiary}`}>{card.label}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <Filter className={`w-4 h-4 ${themeClasses.text.muted}`} />
          <span className={`text-xs ${themeClasses.text.muted}`}>Level:</span>
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value as LevelFilter)}
            className={`text-xs px-2 py-1 rounded border ${themeClasses.input}`}>
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="information">Information</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs ${themeClasses.text.muted}`}>Source:</span>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className={`text-xs px-2 py-1 rounded border ${themeClasses.input}`}>
            <option value="all">All ({sources.length})</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Search className={`w-4 h-4 ${themeClasses.text.muted}`} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search message, source, ID…"
            className={`flex-1 text-xs px-2 py-1 rounded border ${themeClasses.input}`}
          />
        </div>
        {(levelFilter !== 'all' || sourceFilter !== 'all' || search) && (
          <button
            onClick={() => { setLevelFilter('all'); setSourceFilter('all'); setSearch(''); }}
            className={`text-xs px-2 py-1 rounded ${themeClasses.bg.hover} flex items-center gap-1`}>
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className={`text-sm ${themeClasses.text.secondary}`}>
            {allEvents.length === 0
              ? t('agentDetails.systemEventLogs.noIssues', undefined, 'No critical errors or warnings in system event logs')
              : 'No events match the current filters'}
          </p>
        </div>
      ) : (
        <div className={`border ${themeClasses.border.primary} rounded-lg overflow-hidden`}>
          <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
            <table className="w-full text-xs">
              <thead className={`sticky top-0 ${themeClasses.bg.secondary}`}>
                <tr className={`border-b ${themeClasses.border.primary}`}>
                  <th className="text-left py-1.5 px-2 font-semibold w-24">Level</th>
                  <th className="text-left py-1.5 px-2 font-semibold w-40">Time</th>
                  <th className="text-left py-1.5 px-2 font-semibold w-48">Source</th>
                  <th className="text-left py-1.5 px-2 font-semibold w-20">ID</th>
                  <th className="text-left py-1.5 px-2 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((e, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelected(e)}
                    className={`border-b ${themeClasses.border.primary} ${themeClasses.bg.hover} cursor-pointer`}>
                    <td className="py-1 px-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${levelBadge(e.event_level)}`}>
                        {levelIcon(e.event_level)}
                        {(e.event_level || '?').toUpperCase()}
                      </span>
                    </td>
                    <td className={`py-1 px-2 ${themeClasses.text.secondary} whitespace-nowrap`} title={e.event_time}>
                      {formatDistanceToNow(new Date(e.event_time), { addSuffix: true, locale: language === 'es' ? es : undefined })}
                    </td>
                    <td className={`py-1 px-2 ${themeClasses.text.primary} truncate max-w-[12rem]`} title={e.event_source}>
                      {e.event_source}
                    </td>
                    <td className={`py-1 px-2 ${themeClasses.text.muted}`}>{e.event_id || '—'}</td>
                    <td className={`py-1 px-2 ${themeClasses.text.primary} truncate max-w-[40ch]`} title={e.event_message}>
                      {e.event_message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && (
            <p className={`px-3 py-1.5 text-xs ${themeClasses.text.muted} border-t ${themeClasses.border.primary}`}>
              Showing 500 of {filtered.length}. Use filters to narrow further.
            </p>
          )}
        </div>
      )}

      {/* Detail dialog */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div
            onClick={e => e.stopPropagation()}
            className={`${themeClasses.bg.modal} rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col`}>
            <div className={`flex items-center justify-between p-4 border-b ${themeClasses.border.primary}`}>
              <h2 className={`text-base font-semibold flex items-center gap-2 ${themeClasses.text.primary}`}>
                {levelIcon(selected.event_level)}
                Event detail — {(selected.event_level || '?').toUpperCase()}
              </h2>
              <button onClick={() => setSelected(null)} className={`p-1 rounded ${themeClasses.bg.hover}`}>
                <X className={`w-5 h-5 ${themeClasses.text.secondary}`} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 text-sm">
              <DetailRow label="Time">{new Date(selected.event_time).toLocaleString()}</DetailRow>
              <DetailRow label="Source">{selected.event_source}</DetailRow>
              {selected.event_id && <DetailRow label="Event ID">{selected.event_id}</DetailRow>}
              {selected.event_category && <DetailRow label="Category">{selected.event_category}</DetailRow>}
              <DetailRow label="Message">
                <pre className={`whitespace-pre-wrap font-sans ${themeClasses.text.primary}`}>{selected.event_message}</pre>
              </DetailRow>
              {selected.event_data && Object.keys(selected.event_data).length > 0 && (
                <details>
                  <summary className={`cursor-pointer text-xs font-medium ${themeClasses.text.secondary}`}>Raw event data</summary>
                  <pre className={`mt-2 p-2 text-xs rounded ${themeClasses.bg.secondary} ${themeClasses.text.primary} overflow-auto max-h-64`}>
                    {JSON.stringify(selected.event_data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // local helper kept inline so we don't pollute the export surface
  function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <div className={`text-xs font-medium ${themeClasses.text.secondary}`}>{label}</div>
        <div className={`text-sm ${themeClasses.text.primary}`}>{children}</div>
      </div>
    );
  }
};

// Loose typing for the metric shape — only the field we actually
// touch needs to be present. Defined here to avoid circular type
// imports back into agentService.
interface AgentMetricLike {
  event_logs_data?: EventLog[] | null;
}
