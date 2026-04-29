/**
 * Stage 1 Health Checks tab — see docs/PRPs/STAGE1_HEALTH_CHECKS.md.
 *
 * Renders one row per check_type with severity badge + last-collected timestamp
 * + expandable payload. Subscribes to live `agent-check-result` WebSocket events
 * and updates the row in place when a new report arrives for this agent.
 *
 * Permission gate: view.agent_health_checks.enable. The button to drill into a
 * payload is rendered for everyone with the gate; per-check_type sub-permissions
 * (top_processes, listening_ports, etc.) are NOT enforced at this level — the
 * backend free-tier gate already filters which checks the agent reports.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Heart, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { usePermission } from '../../../hooks/usePermission';
import { websocketService } from '../../../services/websocketService';
import {
  healthChecksService,
  HealthCheckResult,
  HealthCheckSeverity,
  HealthCheckType,
} from '../../../services/healthChecksService';

interface Props {
  agentId: string;
}

interface CheckResultEvent {
  agentId: string;
  businessId?: string | null;
  deviceName?: string | null;
  checkType: HealthCheckType;
  severity: HealthCheckSeverity;
  passed: boolean;
  payload: Record<string, unknown>;
  collectedAt: string;
  changed: boolean;
}

const SEVERITY_RANK: Record<HealthCheckSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CHECK_TYPE_LABELS: Record<HealthCheckType, string> = {
  reboot_pending: 'Reboot pending',
  time_drift: 'System clock drift',
  crashdumps: 'Crash dumps',
  top_processes: 'Top processes',
  listening_ports: 'Listening ports',
  update_history_failures: 'Update install history',
  domain_status: 'Domain join status',
  mapped_drives: 'Mapped drives',
  battery_health: 'Battery health',
  power_policy: 'Power policy',
  gpu_status: 'GPU status',
  certificate_expiry: 'Certificate expiry',
  scheduled_tasks: 'Scheduled tasks',
  peripherals: 'Peripherals',
  logon_history: 'Logon history',
  browser_extensions: 'Browser extensions',
  license_keys: 'License keys',
};

function severityIcon(severity: HealthCheckSeverity) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-red-500" aria-label="critical" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" aria-label="warning" />;
    default:
      return <Info className="w-4 h-4 text-blue-400" aria-label="info" />;
  }
}

function severityClasses(severity: HealthCheckSeverity) {
  if (severity === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (severity === 'warning')  return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
}

/** Render the payload JSON for a given check_type. Falls back to a JSON dump. */
function PayloadView({ checkType, payload }: { checkType: HealthCheckType; payload: Record<string, unknown> }) {
  switch (checkType) {
    case 'reboot_pending': {
      const pending = !!payload.pending;
      const reasons = Array.isArray(payload.reasons) ? (payload.reasons as string[]) : [];
      const since = typeof payload.pending_since === 'string' ? payload.pending_since : null;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          <div>Pending: <strong>{pending ? 'yes' : 'no'}</strong></div>
          {reasons.length > 0 && <div>Reasons: {reasons.join(', ')}</div>}
          {since && <div>Pending since: {new Date(since).toLocaleString()}</div>}
        </div>
      );
    }
    case 'time_drift': {
      const drift = typeof payload.drift_seconds === 'number' ? payload.drift_seconds : null;
      const ntp = typeof payload.ntp_server === 'string' ? payload.ntp_server : null;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          {drift !== null && <div>Drift: <strong>{drift.toFixed(3)}s</strong></div>}
          {ntp && <div>NTP source: {ntp}</div>}
        </div>
      );
    }
    case 'crashdumps': {
      const count = typeof payload.count_30d === 'number' ? payload.count_30d : 0;
      const recent = typeof payload.most_recent === 'string' ? payload.most_recent : null;
      const denied = !!payload.access_denied;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          {denied && <div className="text-yellow-600 dark:text-yellow-300">Full Disk Access required to read panic logs</div>}
          <div>Crashes (30d): <strong>{count}</strong></div>
          {recent && <div>Most recent: {new Date(recent).toLocaleString()}</div>}
        </div>
      );
    }
    case 'listening_ports': {
      const ports = Array.isArray(payload.ports) ? (payload.ports as Array<{ port: number; proto?: string; process?: string; address?: string }>) : [];
      const newPorts = Array.isArray(payload.new_ports) ? (payload.new_ports as Array<{ port: number; process?: string }>) : [];
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          {newPorts.length > 0 && (
            <div className="text-yellow-600 dark:text-yellow-300">
              New since last snapshot: {newPorts.map(p => `${p.port}${p.process ? ` (${p.process})` : ''}`).join(', ')}
            </div>
          )}
          <div className="font-mono text-xs max-h-48 overflow-y-auto">
            {ports.length === 0
              ? <span>No listening ports</span>
              : ports.map((p, i) => (
                  <div key={i}>{p.address || '*'}:{p.port} {p.proto || 'tcp'} {p.process ? `→ ${p.process}` : ''}</div>
                ))}
          </div>
        </div>
      );
    }
    case 'top_processes': {
      const byCpu = Array.isArray(payload.top_by_cpu) ? (payload.top_by_cpu as Array<{ name: string; pid: number; cpu_pct?: number }>) : [];
      const byMem = Array.isArray(payload.top_by_mem) ? (payload.top_by_mem as Array<{ name: string; pid: number; mem_pct?: number }>) : [];
      // min-w-0 on each column keeps long unwrappable paths from blowing
      // out the grid; basename + dim full-path-on-second-line is the
      // readable layout (the screenshot bug Louis flagged).
      return (
        <div className={`text-sm ${themeClasses.text.secondary} grid grid-cols-1 sm:grid-cols-2 gap-3`}>
          <div className="min-w-0">
            <div className="font-medium mb-1">Top by CPU</div>
            <div className="text-xs space-y-1">
              {byCpu.slice(0, 10).map((p, i) => (
                <ProcessRow key={i} name={p.name} pid={p.pid} value={p.cpu_pct} unit="%" />
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-medium mb-1">Top by RAM</div>
            <div className="text-xs space-y-1">
              {byMem.slice(0, 10).map((p, i) => (
                <ProcessRow key={i} name={p.name} pid={p.pid} value={p.mem_pct} unit="%" />
              ))}
            </div>
          </div>
        </div>
      );
    }
    case 'update_history_failures': {
      const failures = Array.isArray(payload.failures) ? (payload.failures as Array<{ package?: string; when?: string; error?: string }>) : [];
      const successful = typeof payload.successful_30d === 'number' ? payload.successful_30d : 0;
      const failed = typeof payload.failed_30d === 'number' ? payload.failed_30d : 0;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          <div>Last 30 days: {successful} succeeded, {failed} failed</div>
          {failures.length > 0 && (
            <div className="font-mono text-xs space-y-1">
              {failures.slice(0, 10).map((f, i) => (
                <div key={i}>
                  {f.package || '?'}{f.when ? ` (${new Date(f.when).toLocaleDateString()})` : ''}: {f.error || 'unknown error'}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'domain_status': {
      const joined = !!payload.is_joined;
      const domain = typeof payload.domain === 'string' ? payload.domain : null;
      const hostname = typeof payload.hostname === 'string' ? payload.hostname : null;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          <div>Domain joined: <strong>{joined ? 'yes' : 'no'}</strong></div>
          {domain && <div>Domain: {domain}</div>}
          {hostname && <div>Hostname: {hostname}</div>}
        </div>
      );
    }
    case 'mapped_drives': {
      const applicable = payload.applicable !== false;
      if (!applicable) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>Not applicable on this OS</div>;
      }
      const mappings = Array.isArray(payload.mappings) ? (payload.mappings as Array<{ local: string; remote: string; status: string }>) : [];
      return (
        <div className={`text-sm ${themeClasses.text.secondary} font-mono text-xs space-y-1`}>
          {mappings.length === 0
            ? <span>No mapped drives</span>
            : mappings.map((m, i) => <div key={i}>{m.local} → {m.remote} [{m.status}]</div>)}
        </div>
      );
    }
    case 'battery_health': {
      const applicable = payload.applicable !== false;
      if (!applicable) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No battery (desktop / server)</div>;
      }
      const cycle = typeof payload.cycle_count === 'number' ? payload.cycle_count : null;
      const ratio = typeof payload.capacity_ratio === 'number' ? payload.capacity_ratio : null;
      const design = typeof payload.design_capacity_mah === 'number' ? payload.design_capacity_mah : null;
      const currMax = typeof payload.current_max_capacity_mah === 'number' ? payload.current_max_capacity_mah : null;
      const charging = typeof payload.is_charging === 'boolean' ? payload.is_charging : null;
      const pct = typeof payload.percent_remaining === 'number' ? payload.percent_remaining : null;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          {ratio !== null && (
            <div>Capacity vs design: <strong>{(ratio * 100).toFixed(1)}%</strong>
              {currMax !== null && design !== null && <> ({currMax} / {design} mAh)</>}
            </div>
          )}
          {cycle !== null && <div>Cycle count: <strong>{cycle}</strong></div>}
          {pct !== null && <div>Charge remaining: {pct}%{charging !== null && (charging ? ' (charging)' : ' (not charging)')}</div>}
        </div>
      );
    }
    case 'power_policy': {
      const applicable = payload.applicable !== false;
      if (!applicable) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>Power policy not available</div>;
      }
      const scheme = typeof payload.active_scheme_name === 'string' ? payload.active_scheme_name : null;
      const acMin = typeof payload.sleep_timeout_ac_min === 'number' ? payload.sleep_timeout_ac_min : null;
      const battMin = typeof payload.sleep_timeout_battery_min === 'number' ? payload.sleep_timeout_battery_min : null;
      const neverAC = typeof payload.never_sleep_ac === 'boolean' ? payload.never_sleep_ac : null;
      const neverBatt = typeof payload.never_sleep_battery === 'boolean' ? payload.never_sleep_battery : null;
      const fmtMin = (m: number | null) => m === null ? '?' : (m === 0 ? 'never' : `${m} min`);
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          {scheme && <div>Active scheme: <strong>{scheme}</strong></div>}
          <div>Sleep on AC: <strong>{fmtMin(acMin)}</strong>{neverAC === true && <span className="ml-2 text-yellow-500">(never sleeps)</span>}</div>
          {(battMin !== null || neverBatt !== null) && (
            <div>Sleep on battery: <strong>{fmtMin(battMin)}</strong>{neverBatt === true && <span className="ml-2 text-yellow-500">(never sleeps)</span>}</div>
          )}
        </div>
      );
    }
    case 'certificate_expiry': {
      const total = typeof payload.total === 'number' ? payload.total : 0;
      const soonest = typeof payload.soonest_expiry === 'string' ? payload.soonest_expiry : null;
      const certs = Array.isArray(payload.certs) ? (payload.certs as Array<{
        subject: string;
        issuer?: string;
        not_after: string;
        days_until_expiry: number;
        source?: string;
      }>) : [];
      if (total === 0) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No operator-managed certificates discovered</div>;
      }
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          <div>Total: <strong>{total}</strong>{soonest && <> — soonest expires <strong>{new Date(soonest).toLocaleDateString()}</strong></>}</div>
          {certs.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {certs.slice(0, 25).map((c, i) => {
                const days = c.days_until_expiry;
                const cls = days < 7 ? 'text-red-500 font-semibold'
                          : days < 30 ? 'text-yellow-500'
                          : themeClasses.text.muted;
                return (
                  <div key={i} className="border-l-2 pl-2 border-gray-300 dark:border-gray-600">
                    <div className="font-medium truncate" title={c.subject}>{c.subject}</div>
                    <div className={`text-xs font-mono ${cls}`}>
                      expires in {days} days · {c.source}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    case 'scheduled_tasks': {
      const total = typeof payload.total === 'number' ? payload.total : 0;
      const susp = typeof payload.suspicious_count === 'number' ? payload.suspicious_count : 0;
      const tasks = Array.isArray(payload.tasks) ? (payload.tasks as Array<{
        name: string;
        run_as?: string;
        command?: string;
        source?: string;
        suspicious?: boolean;
      }>) : [];
      const suspiciousTasks = tasks.filter(t => t.suspicious);
      const cleanTasks = tasks.filter(t => !t.suspicious);
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          <div>{total} task{total === 1 ? '' : 's'}, {susp} suspicious</div>
          {suspiciousTasks.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-yellow-500">Suspicious:</div>
              {suspiciousTasks.map((t, i) => (
                <div key={i} className="font-mono text-xs">
                  <span className="font-semibold">{t.name}</span>{t.run_as && <span className={themeClasses.text.muted}> as {t.run_as}</span>}
                  {t.command && <div className={`${themeClasses.text.muted} break-all`}>{t.command}</div>}
                </div>
              ))}
            </div>
          )}
          {cleanTasks.length > 0 && (
            <details>
              <summary className={`cursor-pointer ${themeClasses.text.muted}`}>{cleanTasks.length} routine task{cleanTasks.length === 1 ? '' : 's'} (click to expand)</summary>
              <div className="font-mono text-xs mt-1 max-h-48 overflow-y-auto space-y-0.5">
                {cleanTasks.slice(0, 50).map((t, i) => <div key={i} className="truncate">{t.name}</div>)}
              </div>
            </details>
          )}
        </div>
      );
    }
    case 'peripherals': {
      const usb = Array.isArray(payload.usb_devices) ? (payload.usb_devices as Array<{
        name: string; manufacturer?: string; vendor_id?: string; product_id?: string;
      }>) : [];
      const monitors = Array.isArray(payload.monitors) ? (payload.monitors as Array<{
        name: string; manufacturer?: string; resolution?: string; connection?: string;
      }>) : [];
      if (usb.length === 0 && monitors.length === 0) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No peripherals enumerated</div>;
      }
      return (
        <div className={`text-sm ${themeClasses.text.secondary} grid grid-cols-1 sm:grid-cols-2 gap-3`}>
          <div className="min-w-0">
            <div className="font-medium mb-1">Monitors ({monitors.length})</div>
            {monitors.length === 0 ? <span className={themeClasses.text.muted}>—</span> : (
              <div className="text-xs space-y-1">
                {monitors.map((m, i) => (
                  <div key={i}>
                    <span className="font-semibold">{m.name}</span>
                    {m.connection && <span className={themeClasses.text.muted}> · {m.connection}</span>}
                    {m.resolution && <span className={themeClasses.text.muted}> · {m.resolution}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium mb-1">USB devices ({usb.length})</div>
            {usb.length === 0 ? <span className={themeClasses.text.muted}>—</span> : (
              <div className="text-xs font-mono max-h-48 overflow-y-auto space-y-0.5">
                {usb.slice(0, 50).map((d, i) => (
                  <div key={i} className="truncate" title={d.name}>{d.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'logon_history': {
      const success = typeof payload.success_count_24h === 'number' ? payload.success_count_24h : 0;
      const failures = typeof payload.failure_count_24h === 'number' ? payload.failure_count_24h : 0;
      const last = payload.last_logon as { user?: string; when?: string } | undefined;
      const recent = Array.isArray(payload.recent) ? (payload.recent as Array<{
        user?: string; when: string; source_ip?: string; success: boolean;
      }>) : [];
      const failureCls = failures >= 50 ? 'text-red-500 font-semibold'
                       : failures >= 10 ? 'text-yellow-500 font-semibold'
                       : themeClasses.text.secondary;
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          <div>Last 24h: <strong>{success}</strong> successful, <span className={failureCls}>{failures} failed</span></div>
          {last && last.user && last.when && (
            <div>Last successful logon: <strong>{last.user}</strong> at {new Date(last.when).toLocaleString()}</div>
          )}
          {recent.length > 0 && (
            <details>
              <summary className={`cursor-pointer ${themeClasses.text.muted}`}>{recent.length} recent event{recent.length === 1 ? '' : 's'}</summary>
              <div className="font-mono text-xs mt-1 max-h-64 overflow-y-auto space-y-0.5">
                {recent.map((e, i) => (
                  <div key={i} className={e.success ? '' : 'text-yellow-500'}>
                    {e.success ? '✓' : '✗'} {e.user || '?'}{e.source_ip && <> from {e.source_ip}</>} — {new Date(e.when).toLocaleString()}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      );
    }
    case 'browser_extensions': {
      const total = typeof payload.total === 'number' ? payload.total : 0;
      const exts = Array.isArray(payload.extensions) ? (payload.extensions as Array<{
        browser: string; user?: string; id?: string; name?: string; version?: string; enabled?: boolean;
      }>) : [];
      if (total === 0) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No browser extensions enumerated</div>;
      }
      // Group by browser for compact display.
      const byBrowser: Record<string, typeof exts> = {};
      for (const e of exts) {
        const k = e.browser || 'Other';
        (byBrowser[k] ||= []).push(e);
      }
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          <div>{total} extension{total === 1 ? '' : 's'} across {Object.keys(byBrowser).length} browser{Object.keys(byBrowser).length === 1 ? '' : 's'}</div>
          {Object.entries(byBrowser).map(([browser, list]) => (
            <details key={browser}>
              <summary className={`cursor-pointer ${themeClasses.text.primary}`}>{browser} ({list.length})</summary>
              <div className="font-mono text-xs mt-1 max-h-64 overflow-y-auto space-y-0.5">
                {list.slice(0, 50).map((e, i) => (
                  <div key={i} className={e.enabled ? '' : themeClasses.text.muted}>
                    {e.enabled ? '✓' : '✗'} {e.name || e.id || '(unnamed)'}{e.version && <span className={themeClasses.text.muted}> v{e.version}</span>}
                    {e.user && <span className={themeClasses.text.muted}> · {e.user}</span>}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      );
    }
    case 'license_keys': {
      const applicable = payload.applicable !== false;
      if (!applicable) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>License-key inventory not applicable on this OS</div>;
      }
      const oem = typeof payload.windows_oem_key === 'string' ? payload.windows_oem_key : null;
      const office = Array.isArray(payload.office_licenses) ? (payload.office_licenses as Array<{
        product: string; license_status?: string; partial_key?: string; vendor?: string;
      }>) : [];
      const adobe = Array.isArray(payload.adobe_products) ? (payload.adobe_products as Array<{
        product: string; vendor?: string;
      }>) : [];
      if (!oem && office.length === 0 && adobe.length === 0) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No license-managed software detected</div>;
      }
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          {oem && (
            <div>
              <span className="font-medium">Windows OEM key:</span>{' '}
              <span className="font-mono text-xs">{oem}</span>
            </div>
          )}
          {office.length > 0 && (
            <div>
              <div className="font-medium">Microsoft Office ({office.length})</div>
              <div className="font-mono text-xs space-y-0.5 mt-1">
                {office.map((l, i) => (
                  <div key={i}>
                    {l.product}
                    {l.license_status && <span className={themeClasses.text.muted}> · {l.license_status}</span>}
                    {l.partial_key && <span className={themeClasses.text.muted}> · …{l.partial_key}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {adobe.length > 0 && (
            <div>
              <div className="font-medium">Adobe ({adobe.length})</div>
              <div className="font-mono text-xs space-y-0.5 mt-1">
                {adobe.map((l, i) => <div key={i}>{l.product}</div>)}
              </div>
            </div>
          )}
        </div>
      );
    }
    case 'gpu_status': {
      const applicable = payload.applicable !== false;
      if (!applicable) {
        return <div className={`text-sm ${themeClasses.text.muted}`}>No GPU detected</div>;
      }
      const gpus = Array.isArray(payload.gpus) ? (payload.gpus as Array<{
        name: string;
        vendor?: string;
        utilization_pct?: number;
        temperature_c?: number;
        memory_used_mb?: number;
        memory_total_mb?: number;
      }>) : [];
      return (
        <div className={`text-sm ${themeClasses.text.secondary} space-y-2`}>
          {gpus.length === 0 ? <span>(no GPUs reported)</span> : gpus.map((g, i) => (
            <div key={i} className="border-l-2 pl-2 border-gray-300 dark:border-gray-600">
              <div className="font-medium">{g.name}{g.vendor && <span className={`ml-2 ${themeClasses.text.muted}`}>{g.vendor}</span>}</div>
              <div className="font-mono text-xs">
                {g.utilization_pct !== undefined && <span className="mr-3">util: {g.utilization_pct}%</span>}
                {g.temperature_c !== undefined && (
                  <span className={`mr-3 ${g.temperature_c > 90 ? 'text-yellow-500 font-semibold' : ''}`}>
                    temp: {g.temperature_c}°C
                  </span>
                )}
                {g.memory_total_mb !== undefined && (
                  <span>VRAM: {g.memory_used_mb ?? '?'} / {g.memory_total_mb} MB</span>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
    default: {
      // Defensive — future check types not yet rendered get a JSON dump.
      return (
        <pre className={`text-xs font-mono p-2 rounded ${themeClasses.bg.tertiary} ${themeClasses.text.secondary} max-h-64 overflow-auto`}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
    }
  }
}

const HealthChecksTab: React.FC<Props> = ({ agentId }) => {
  const { t } = useOptionalClientLanguage();
  const { checkPermission } = usePermission();
  const allowed = checkPermission('view.agent_health_checks.enable');

  const [results, setResults] = useState<HealthCheckResult[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    healthChecksService.list(agentId)
      .then(resp => {
        if (cancelled) return;
        setResults(Array.isArray(resp.data) ? resp.data : []);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load health checks');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [agentId, allowed]);

  // Live updates
  useEffect(() => {
    if (!allowed) return;
    const handler = (event: CheckResultEvent) => {
      if (!event || event.agentId !== agentId) return;
      setResults(prev => {
        const next = prev.filter(r => r.check_type !== event.checkType);
        next.push({
          check_type: event.checkType,
          severity: event.severity,
          passed: !!event.passed,
          payload: event.payload,
          collected_at: event.collectedAt,
          reported_at: new Date().toISOString(),
        });
        return next;
      });
    };
    websocketService.on('agent-check-result', handler as (data: unknown) => void);
    return () => {
      websocketService.off('agent-check-result', handler as (data: unknown) => void);
    };
  }, [agentId, allowed]);

  const sorted = useMemo(() => {
    // Critical → warning → info, then by check_type alphabetically.
    return [...results].sort((a, b) => {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      return a.check_type.localeCompare(b.check_type);
    });
  }, [results]);

  if (!allowed) {
    return (
      <div className={`text-sm ${themeClasses.text.muted}`}>
        {t('agentDetails.healthChecks.noPermission', undefined, "You don't have permission to view health checks.")}
      </div>
    );
  }
  if (loading) {
    return <div className={`text-sm ${themeClasses.text.secondary}`}>Loading…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-500">{error}</div>;
  }
  if (sorted.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm ${themeClasses.text.muted}`}>
        <Heart className="w-4 h-4" />
        {t('agentDetails.healthChecks.empty', undefined, 'No health-check data reported yet. Once the agent posts its first health-check, results will appear here.')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(r => {
        const open = expanded.has(r.check_type);
        return (
          <div
            key={r.check_type}
            className={`rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.card}`}
            data-testid={`health-check-row-${r.check_type}`}
          >
            <button
              type="button"
              className={`w-full flex items-center justify-between px-3 py-2 text-left ${themeClasses.text.primary}`}
              onClick={() => {
                setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(r.check_type)) next.delete(r.check_type);
                  else next.add(r.check_type);
                  return next;
                });
              }}
              aria-expanded={open}
            >
              <span className="flex items-center gap-2">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {severityIcon(r.severity)}
                <span className="text-sm font-medium">
                  {CHECK_TYPE_LABELS[r.check_type] || r.check_type}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${severityClasses(r.severity)}`}>
                  {r.severity}
                </span>
              </span>
              <span className={`text-xs ${themeClasses.text.muted}`}>
                {new Date(r.collected_at).toLocaleString()}
              </span>
            </button>
            {open && (
              <div className={`px-3 py-3 border-t ${themeClasses.border.primary}`}>
                <PayloadView checkType={r.check_type} payload={r.payload} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default HealthChecksTab;
export { HealthChecksTab };

// ----- Helpers (top_processes display) -----

/**
 * Returns the trailing component of a / or \ separated path. Used to
 * render the EXECUTABLE NAME prominently while keeping the full path
 * visible (but de-emphasized) for operators who need it. Without
 * this, full macOS framework paths like
 *   /System/Library/ExtensionKit/Extensions/.../SecurityPrivacyExtension
 * blew out the right column of the Top processes grid.
 */
export function basename(path: string): string {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p) return p;
  }
  return path;
}

const ProcessRow: React.FC<{
  name: string;
  pid: number;
  value: number | undefined;
  unit: string;
}> = ({ name, pid, value, unit }) => {
  const short = basename(name);
  const showFullPath = name && name !== short;
  return (
    <div className="leading-tight">
      <div className="flex items-baseline gap-2 font-mono">
        <span className="font-semibold truncate" title={name}>{short}</span>
        <span className={`${themeClasses.text.muted} flex-shrink-0`}>
          PID {pid} · {value !== undefined ? value.toFixed(1) : '?'}{unit}
        </span>
      </div>
      {showFullPath && (
        <div className={`${themeClasses.text.muted} text-[10px] font-mono break-all`}>{name}</div>
      )}
    </div>
  );
};
