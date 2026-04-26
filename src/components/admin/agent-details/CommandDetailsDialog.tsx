import React from 'react';
import { X, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentCommand } from '../../../services/agentService';

interface PerPackageResult {
  package: string;
  outcome?: 'succeeded' | 'failed' | 'skipped';
  version_before?: string;
  version_after?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  duration_ms?: number;
  reboot_required?: boolean;
  skipped_reason?: string;
}

interface UpdateResultLike {
  status?: string;
  manager?: string;
  manager_version?: string;
  results?: PerPackageResult[];
  pre_flight_error?: string;
  summary?: { total?: number; succeeded?: number; failed?: number; skipped?: number; reboot_required?: boolean };
}

interface CommandDetailsDialogProps {
  command: AgentCommand;
  onClose: () => void;
}

const outcomeBadge = (outcome?: string) => {
  switch (outcome) {
    case 'succeeded':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    case 'skipped':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

export const CommandDetailsDialog: React.FC<CommandDetailsDialogProps> = ({ command, onClose }) => {
  // The agent submits its UpdateResult under result_payload.result
  // for update_packages, with the rolled-up status under
  // result_payload.status. Other command types put their structured
  // result directly under result_payload.result. This view tries
  // both shapes so we never end up with a useless "completed_with_failures"
  // header and no detail.
  const rp = (command.result_payload || {}) as Record<string, unknown>;
  const inner = (rp.result as UpdateResultLike) || (rp as UpdateResultLike);
  const perPackage = Array.isArray(inner?.results) ? inner.results : [];
  const failed = perPackage.filter(p => p.outcome === 'failed');
  const skipped = perPackage.filter(p => p.outcome === 'skipped');
  const succeeded = perPackage.filter(p => p.outcome === 'succeeded');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col`}>
        <div className={`flex items-center justify-between p-4 border-b ${themeClasses.border.primary}`}>
          <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
            Command details: {command.command_type}
          </h2>
          <button onClick={onClose} className={`p-1 rounded ${themeClasses.bg.hover}`}>
            <X className={`w-5 h-5 ${themeClasses.text.secondary}`} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Top-level status summary */}
          <div className={`p-3 rounded ${themeClasses.bg.secondary}`}>
            <div className="flex items-center gap-2 text-sm">
              <span className={themeClasses.text.secondary}>Status:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${outcomeBadge(
                command.status === 'completed' ? 'succeeded' :
                command.status === 'failed' ? 'failed' :
                command.status === 'completed_with_failures' ? 'failed' : 'skipped'
              )}`}>
                {command.status}
              </span>
            </div>
            {command.error_message && (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-700 dark:text-red-300">{command.error_message}</span>
              </div>
            )}
            {inner?.pre_flight_error && (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-700 dark:text-red-300">Pre-flight: {inner.pre_flight_error}</span>
              </div>
            )}
            {inner?.summary && (
              <div className={`mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${themeClasses.text.secondary}`}>
                <span>Total: <strong>{inner.summary.total ?? perPackage.length}</strong></span>
                <span>Succeeded: <strong className="text-green-600 dark:text-green-400">{inner.summary.succeeded ?? succeeded.length}</strong></span>
                <span>Failed: <strong className="text-red-600 dark:text-red-400">{inner.summary.failed ?? failed.length}</strong></span>
                <span>Skipped: <strong className="text-yellow-600 dark:text-yellow-400">{inner.summary.skipped ?? skipped.length}</strong></span>
              </div>
            )}
          </div>

          {/* Per-package detail — only appears for update_packages */}
          {perPackage.length > 0 && (
            <div className="space-y-3">
              {failed.length > 0 && (
                <details open>
                  <summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Failed ({failed.length})
                  </summary>
                  <div className="space-y-2">
                    {failed.map((r, i) => <PackageResultBlock key={i} r={r} />)}
                  </div>
                </details>
              )}
              {skipped.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-yellow-700 dark:text-yellow-300 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Skipped ({skipped.length})
                  </summary>
                  <div className="space-y-2">
                    {skipped.map((r, i) => <PackageResultBlock key={i} r={r} />)}
                  </div>
                </details>
              )}
              {succeeded.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Succeeded ({succeeded.length})
                  </summary>
                  <div className="space-y-2">
                    {succeeded.map((r, i) => <PackageResultBlock key={i} r={r} />)}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Raw payload as last-resort fallback so even unknown
              command shapes still produce *something* useful. */}
          {perPackage.length === 0 && command.result_payload && (
            <details>
              <summary className={`cursor-pointer text-sm font-medium ${themeClasses.text.secondary}`}>Raw result payload</summary>
              <pre className={`mt-2 p-3 text-xs rounded ${themeClasses.bg.secondary} ${themeClasses.text.primary} overflow-auto max-h-64`}>
                {JSON.stringify(command.result_payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

const PackageResultBlock: React.FC<{ r: PerPackageResult }> = ({ r }) => (
  <div className={`p-3 rounded border ${themeClasses.border.primary} ${themeClasses.bg.secondary}`}>
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className={`text-sm font-medium ${themeClasses.text.primary}`}>{r.package}</span>
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${outcomeBadge(r.outcome)}`}>
        {r.outcome || '—'}
      </span>
    </div>
    <div className={`text-xs ${themeClasses.text.secondary} mb-1`}>
      {(r.version_before || r.version_after) && (
        <span>
          {r.version_before || '?'}
          {r.version_after && r.version_after !== r.version_before ? ` → ${r.version_after}` : ''}
        </span>
      )}
      {typeof r.exit_code === 'number' && <span className="ml-3">exit code: {r.exit_code}</span>}
      {r.skipped_reason && <span className="ml-3">reason: <code>{r.skipped_reason}</code></span>}
      {r.reboot_required && <span className="ml-3 text-orange-600 dark:text-orange-400">⚠ reboot required</span>}
    </div>
    {r.stderr && r.stderr.trim() && (
      <details open>
        <summary className={`cursor-pointer text-xs font-medium ${themeClasses.text.secondary}`}>stderr</summary>
        <pre className="mt-1 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 rounded overflow-auto max-h-40 whitespace-pre-wrap">
          {r.stderr}
        </pre>
      </details>
    )}
    {r.stdout && r.stdout.trim() && (
      <details>
        <summary className={`cursor-pointer text-xs font-medium ${themeClasses.text.secondary}`}>stdout</summary>
        <pre className={`mt-1 p-2 text-xs ${themeClasses.bg.tertiary} ${themeClasses.text.primary} rounded overflow-auto max-h-40 whitespace-pre-wrap`}>
          {r.stdout}
        </pre>
      </details>
    )}
  </div>
);
