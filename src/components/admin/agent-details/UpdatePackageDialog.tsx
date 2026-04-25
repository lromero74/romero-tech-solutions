import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import agentService from '../../../services/agentService';
import { websocketService } from '../../../services/websocketService';

/**
 * UpdatePackageDialog — confirmation modal for the remote package-update
 * flow. Shows the user exactly what's about to run, lets them confirm,
 * fires the command, and then flips through queued → running → done
 * (or partial / failed) using the agent.command.completed websocket
 * event for real-time updates without polling.
 *
 * The full design is in
 *   .plan/2026.04.25.01-remote-package-updates-PRP.md (PRP §6.3.2).
 */

type DialogState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'queued'; commandId: string }
  | { kind: 'completed'; result: UpdateResult }
  | { kind: 'partial'; result: UpdateResult }
  | { kind: 'failed'; error: string; result?: UpdateResult };

interface PerPackageResult {
  package: string;
  outcome: 'succeeded' | 'failed' | 'skipped';
  version_before?: string;
  version_after?: string;
  exit_code: number;
  duration_ms: number;
  reboot_required?: boolean;
  skipped_reason?: string;
  stderr?: string;
}

interface UpdateResult {
  status: 'completed' | 'completed_with_failures' | 'failed';
  manager: string;
  manager_version?: string;
  results: PerPackageResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    reboot_required: boolean;
  };
  pre_flight_error?: string;
}

interface UpdatePackageDialogProps {
  agentId: string;
  manager: string;        // e.g. 'dnf', 'apt', 'brew'
  packages: string[];     // [] = scope=all
  scope: 'all' | 'selected' | 'security_only';
  onClose: () => void;
}

export const UpdatePackageDialog: React.FC<UpdatePackageDialogProps> = ({
  agentId, manager, packages, scope, onClose,
}) => {
  const [state, setState] = useState<DialogState>({ kind: 'idle' });

  // Build a human preview of what's about to run. The actual CLI runs
  // on the device; this is just for the user's confirmation.
  const cliPreview = useMemo(() => {
    return previewCommand(manager, scope, packages);
  }, [manager, scope, packages]);

  // Subscribe to agent.command.completed once we're queued, so we
  // catch the result as soon as the agent reports it. Falls back to
  // polling /commands/list after 60s in case the websocket event
  // gets lost (page reload, dropped socket, server restart between
  // queue and result, etc.) — without it the user stares at the
  // spinner forever.
  useEffect(() => {
    if (state.kind !== 'queued') return;
    const targetId = state.commandId;

    // Translate the agent_commands.status text from the DB into the
    // dialog's terminal state machine. Tolerant of either the new
    // `completed_with_failures` value or the older `completed`/`failed`.
    const transition = (status: string, result: UpdateResult | undefined, error?: string) => {
      switch (status) {
        case 'completed':
          if (result) setState({ kind: 'completed', result });
          else setState({ kind: 'failed', error: error || 'Completed but result missing' });
          return;
        case 'completed_with_failures':
          if (result) setState({ kind: 'partial', result });
          else setState({ kind: 'failed', error: error || 'Partial completion without result' });
          return;
        case 'failed':
          setState({ kind: 'failed', error: error || 'Update failed', result });
          return;
        // pending / delivered / acknowledged → still in flight, keep waiting.
      }
    };

    // 1. Live websocket subscription — first to fire wins.
    const unsubscribe = websocketService.onAgentCommandCompleted((evt) => {
      if (evt.command_id !== targetId) return;
      transition(evt.status, evt.result || undefined, evt.error);
    });

    // 2. Fallback poll. Starts after a 60s grace period (so we don't
    //    hammer the API while the websocket would have delivered) and
    //    runs every 10s. Reads /commands/list, finds our id, and if
    //    its status is terminal we transition. The interval clears
    //    automatically when the modal unmounts or transitions out
    //    of "queued" (the useEffect re-runs).
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        try {
          const resp = await agentService.getAgentCommands(agentId);
          if (!resp.success || !resp.data) return;
          const row = resp.data.commands.find((c: any) => c.id === targetId);
          if (!row) return;
          if (['completed', 'completed_with_failures', 'failed'].includes(row.status)) {
            // The DB stores the agent's structured result JSON-stringified
            // in the stdout column (see backend/routes/agents.js:2630).
            let parsedResult: UpdateResult | undefined;
            if (row.stdout) {
              try { parsedResult = JSON.parse(row.stdout); } catch { /* leave undefined */ }
            }
            transition(row.status, parsedResult, row.error_message);
          }
        } catch {
          // Transient errors are fine — we'll try again on the next tick.
        }
      }, 10_000);
    };
    const pollDelay = setTimeout(startPoll, 60_000);

    return () => {
      unsubscribe();
      clearTimeout(pollDelay);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [state, agentId]);

  const onConfirm = async () => {
    setState({ kind: 'submitting' });
    try {
      const resp = await agentService.requestUpdatePackages(agentId, {
        manager, scope, packages,
      });
      if (resp.success && resp.data?.command_id) {
        setState({ kind: 'queued', commandId: resp.data.command_id });
      } else {
        setState({ kind: 'failed', error: resp.message || 'Failed to queue command' });
      }
    } catch (err: any) {
      setState({ kind: 'failed', error: err?.message || String(err) });
    }
  };

  const isClosable = state.kind === 'idle' || state.kind === 'completed' ||
                     state.kind === 'partial' || state.kind === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} w-full max-w-2xl rounded-lg`}>
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
          <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
            Update {manager} package{packages.length === 1 ? '' : 's'}
          </h2>
          {isClosable && (
            <button onClick={onClose} className={themeClasses.text.secondary} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3">
          {state.kind === 'idle' && (
            <ConfirmBody
              manager={manager} scope={scope} packages={packages} cliPreview={cliPreview}
              onConfirm={onConfirm} onCancel={onClose}
            />
          )}
          {state.kind === 'submitting' && <Status icon="spin" label="Queueing command…" />}
          {state.kind === 'queued' && (
            <Status icon="spin" label="Waiting for the agent to pick it up. Typically 10–60 seconds." />
          )}
          {state.kind === 'completed' && (
            <ResultBody status="completed" result={state.result} onClose={onClose} />
          )}
          {state.kind === 'partial' && (
            <ResultBody status="partial" result={state.result} onClose={onClose} />
          )}
          {state.kind === 'failed' && (
            <FailureBody error={state.error} result={state.result} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── helpers ────────────────────────────────────────────────────────────

function previewCommand(manager: string, scope: string, packages: string[]): string {
  const join = packages.length > 0 ? ' ' + packages.join(' ') : '';
  switch (manager) {
    case 'dnf':
    case 'yum':
      return `dnf upgrade -y${scope === 'security_only' ? ' --security' : ''}${join}`;
    case 'apt':
      return scope === 'all'
        ? 'apt-get upgrade -y'
        : `apt-get install --only-upgrade -y${join}`;
    case 'pacman':
      return scope === 'all' ? 'pacman -Syu --noconfirm' : `pacman -S --noconfirm${join}`;
    case 'zypper':
      return scope === 'security_only' ? `zypper -n patch --category security${join}` : `zypper -n update${join}`;
    case 'brew':
      return scope === 'all' ? 'brew upgrade' : `brew upgrade${join}`;
    case 'pip':
    case 'pip3':
      return `pip install --upgrade${join}`;
    case 'npm':
      return packages.map(p => `npm install -g ${p}@latest`).join(' && ');
    case 'gem':
      return scope === 'all' ? 'gem update' : `gem update${join}`;
    case 'snap':
      return scope === 'all' ? 'snap refresh' : `snap refresh${join}`;
    case 'flatpak':
      return scope === 'all' ? 'flatpak update -y' : `flatpak update -y${join}`;
    case 'winget':
      return scope === 'all' ? 'winget upgrade --all --silent' : `winget upgrade --silent${join}`;
    case 'choco':
      return scope === 'all' ? 'choco upgrade all -y' : `choco upgrade -y${join}`;
    default:
      return `${manager} update${join}`;
  }
}

const Status: React.FC<{ icon: 'spin' | 'check' | 'fail'; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-3 py-6 justify-center">
    {icon === 'spin' && <Loader2 className="w-6 h-6 animate-spin text-blue-500" />}
    {icon === 'check' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
    {icon === 'fail' && <AlertCircle className="w-6 h-6 text-red-500" />}
    <span className={themeClasses.text.primary}>{label}</span>
  </div>
);

const ConfirmBody: React.FC<{
  manager: string;
  scope: string;
  packages: string[];
  cliPreview: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ manager, scope, packages, cliPreview, onConfirm, onCancel }) => (
  <>
    <p className={themeClasses.text.secondary}>
      The agent will run the following command on the device:
    </p>
    <pre className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded p-3 text-xs overflow-x-auto font-mono">
      {cliPreview}
    </pre>
    {scope === 'all' && (
      <p className="text-xs text-yellow-600 dark:text-yellow-400">
        Scope: ALL outdated {manager} packages will be updated. There is no per-package
        opt-out at this scope. Use a per-package update to be selective.
      </p>
    )}
    {packages.length > 0 && packages.length <= 20 && (
      <ul className="text-xs space-y-1">
        {packages.map(p => (
          <li key={p} className={themeClasses.text.secondary}>• {p}</li>
        ))}
      </ul>
    )}
    <div className="flex justify-end gap-2 pt-2">
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
        Update
      </button>
    </div>
  </>
);

const ResultBody: React.FC<{
  status: 'completed' | 'partial';
  result: UpdateResult;
  onClose: () => void;
}> = ({ status, result, onClose }) => (
  <>
    <div className="flex items-center gap-2">
      {status === 'completed' ? (
        <CheckCircle2 className="w-5 h-5 text-green-500" />
      ) : (
        <AlertCircle className="w-5 h-5 text-yellow-500" />
      )}
      <span className={themeClasses.text.primary}>
        {result.summary.succeeded} succeeded · {result.summary.failed} failed · {result.summary.skipped} skipped
      </span>
      {result.summary.reboot_required && (
        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
          reboot required
        </span>
      )}
    </div>
    <div className="max-h-72 overflow-auto border border-gray-200 dark:border-gray-700 rounded">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr className="text-gray-900 dark:text-gray-100">
            <th className="text-left px-2 py-1">Package</th>
            <th className="text-left px-2 py-1">Outcome</th>
            <th className="text-left px-2 py-1">Before</th>
            <th className="text-left px-2 py-1">After</th>
          </tr>
        </thead>
        <tbody className="text-gray-900 dark:text-gray-100">
          {result.results.map(r => (
            <tr key={r.package} className="border-t border-gray-200 dark:border-gray-700">
              <td className="px-2 py-1 font-mono">{r.package}</td>
              <td className={`px-2 py-1 ${
                r.outcome === 'succeeded' ? 'text-green-600 dark:text-green-400' :
                r.outcome === 'failed' ? 'text-red-600 dark:text-red-400' :
                'text-gray-600 dark:text-gray-400'
              }`}>
                {r.outcome}{r.skipped_reason ? ` (${r.skipped_reason})` : ''}
              </td>
              <td className="px-2 py-1">{r.version_before || '-'}</td>
              <td className="px-2 py-1">{r.version_after || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="flex justify-end pt-2">
      <button onClick={onClose} className="px-4 py-2 rounded bg-blue-600 text-white">Close</button>
    </div>
  </>
);

const FailureBody: React.FC<{
  error: string;
  result?: UpdateResult;
  onClose: () => void;
}> = ({ error, result, onClose }) => (
  <>
    <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-medium">Update failed</p>
        <p className="text-sm">{error}</p>
        {result?.pre_flight_error && (
          <p className="text-xs">Pre-flight: {result.pre_flight_error}</p>
        )}
      </div>
    </div>
    <div className="flex justify-end pt-2">
      <button onClick={onClose} className="px-4 py-2 rounded bg-blue-600 text-white">Close</button>
    </div>
  </>
);

export default UpdatePackageDialog;
