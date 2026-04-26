import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// ProgressTick mirrors the backend agent.command.progress payload's
// `progress` field. Surfaced on the running state so the UI can
// render a percent + phase + currently-installing item without
// having to re-fetch the command row on every websocket event.
interface ProgressTick {
  phase: string;
  percent: number;
  current_index: number;
  total: number;
  package: string;
  message: string;
  updated_at: string;
}

type DialogState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'queued'; commandId: string }
  | { kind: 'running'; commandId: string; progress?: ProgressTick }
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
  // Called whenever the agent reports a terminal status. The first
  // arg is package names whose outcome implies they're no longer
  // outdated (succeeded OR skipped-because-already-at-latest), so
  // the parent (PackageManagerStatus) can optimistically hide those
  // rows without waiting for the next agent heartbeat. Packages
  // that failed, or were skipped for non-currency reasons (running
  // snap app, missing pkg, etc.), are NOT in this array — they
  // stay visible because they still need attention.
  onResult?: (packagesNoLongerOutdated: string[], status: 'completed' | 'completed_with_failures' | 'failed') => void;
}

export const UpdatePackageDialog: React.FC<UpdatePackageDialogProps> = ({
  agentId, manager, packages, scope, onClose, onResult,
}) => {
  const [state, setState] = useState<DialogState>({ kind: 'idle' });

  // Stash the latest onResult in a ref so the WS-subscribe effect
  // below depends only on identifiers that actually change with
  // command lifecycle (commandId, agentId), not on the parent's
  // closure identity. The parent (OSPatchStatus) supplies onResult
  // as an inline arrow function so its identity changes every
  // render — without this ref, every parent re-render would clear
  // the effect's 5-second poll-fallback timer before it ever fired,
  // and the modal would be stuck at "Waiting for the agent to pick
  // it up" any time a websocket completion event was missed.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Build a human preview of what's about to run. The actual CLI runs
  // on the device; this is just for the user's confirmation.
  const cliPreview = useMemo(() => {
    return previewCommand(manager, scope, packages);
  }, [manager, scope, packages]);

  // Subscribe to websocket progress + completion events as soon as
  // we're queued. Polling /commands/list serves as a fallback in
  // case the websocket misses (page reload, dropped socket, etc.) —
  // it kicks in after 5s rather than 60s now that we have richer
  // state transitions to reach.
  // Pull commandId out so the effect's deps don't include the whole
  // `state` object — that would re-run the effect (and reset the 5s
  // poll-fallback delay) on every progress-tick state change.
  const inFlightCommandId =
    state.kind === 'queued' || state.kind === 'running' ? state.commandId : null;

  useEffect(() => {
    if (!inFlightCommandId) return;
    const targetId = inFlightCommandId;

    // Translate the agent_commands.status text from the DB into the
    // dialog's terminal state machine. Tolerant of either the new
    // `completed_with_failures` value or the older `completed`/`failed`.
    // Also notifies the parent of succeeded packages so it can
    // optimistically remove them from the outdated list.
    const transition = (status: string, result: UpdateResult | undefined, error?: string) => {
      const notify = (terminalStatus: 'completed' | 'completed_with_failures' | 'failed') => {
        const cb = onResultRef.current;
        if (!cb) return;
        // Hide rows whose per-package outcome was either:
        //   - succeeded: the agent actually upgraded it
        //   - skipped + already_at_latest: the package was already
        //     current (the cached outdated list was stale; no longer
        //     belongs in the "needs update" view)
        // Other skipped reasons (package_not_installed, snap_app_running,
        // etc.) stay visible since the package is still legitimately in
        // some sub-optimal state.
        const noLongerOutdated = (result?.results || [])
          .filter(r => r.outcome === 'succeeded'
            || (r.outcome === 'skipped' && r.skipped_reason === 'already_at_latest'))
          .map(r => r.package);
        cb(noLongerOutdated, terminalStatus);
      };
      switch (status) {
        case 'completed':
          if (result) {
            setState({ kind: 'completed', result });
            notify('completed');
          } else {
            setState({ kind: 'failed', error: error || 'Completed but result missing' });
            notify('failed');
          }
          return;
        case 'completed_with_failures':
          if (result) {
            setState({ kind: 'partial', result });
            notify('completed_with_failures');
          } else {
            setState({ kind: 'failed', error: error || 'Partial completion without result' });
            notify('failed');
          }
          return;
        case 'failed':
          setState({ kind: 'failed', error: error || 'Update failed', result });
          notify('failed');
          return;
        // pending / delivered / acknowledged → still in flight, keep waiting.
      }
    };

    // 1a. Progress event — agent picked the command up and started,
    //     OR is reporting a percent-complete tick mid-install.
    //     Flips us out of "queued" into "running" on the first
    //     event and updates the progress payload on subsequent
    //     ticks. Ignored after we've reached a terminal state.
    const unsubProgress = websocketService.onAgentCommandProgress((evt) => {
      if (evt.command_id !== targetId) return;
      setState(prev => {
        if (prev.kind === 'queued' || prev.kind === 'running') {
          return { kind: 'running', commandId: targetId, progress: evt.progress };
        }
        return prev;
      });
    });

    // 1b. Completion event — the result is in.
    const unsubComplete = websocketService.onAgentCommandCompleted((evt) => {
      if (evt.command_id !== targetId) return;
      transition(evt.status, evt.result || undefined, evt.error);
    });

    // 2. Fallback poll. Starts after a 5s grace period (down from 60s
    //    — websockets deliver instantly when they work, so 5s is
    //    plenty of room before we fall back to polling). Runs every
    //    5s. Reads /commands/list, finds our id, and transitions
    //    based on its status: `executing` → running stage, terminal
    //    statuses → final state. Cleared when the modal unmounts or
    //    transitions out of queued/running.
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
            // in the stdout column (see backend/routes/agents.js result handler).
            let parsedResult: UpdateResult | undefined;
            if (row.stdout) {
              try { parsedResult = JSON.parse(row.stdout); } catch { /* leave undefined */ }
            }
            transition(row.status, parsedResult, row.error_message);
          } else if (row.status === 'executing' || row.status === 'delivered') {
            // Carry over any progress payload the agent has posted to
            // result_payload.progress so a dashboard that mounted
            // mid-install picks up the current percent without
            // waiting for the next websocket tick.
            const rowProgress = row?.result_payload?.progress as ProgressTick | undefined;
            setState(prev => {
              if (prev.kind === 'queued' || prev.kind === 'running') {
                return { kind: 'running', commandId: targetId, progress: rowProgress };
              }
              return prev;
            });
          }
        } catch {
          // Transient errors are fine — we'll try again on the next tick.
        }
      }, 5_000);
    };
    const pollDelay = setTimeout(startPoll, 5_000);

    return () => {
      unsubProgress();
      unsubComplete();
      clearTimeout(pollDelay);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [inFlightCommandId, agentId]);

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
          {state.kind === 'running' && (
            <RunningBody progress={state.progress} />
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

// RunningBody renders the in-flight update status: spinner + label,
// plus a progress bar / current-update title when the agent has
// started reporting per-tick progress (Windows Update install
// surface; some Linux managers will follow). Falls back to the
// plain "running" message when no progress payload has been
// received yet.
const RunningBody: React.FC<{ progress?: ProgressTick }> = ({ progress }) => {
  if (!progress) {
    return <Status icon="spin" label="Agent is running the update on the device…" />;
  }
  const phaseLabel = progress.phase === 'download'
    ? 'Downloading'
    : progress.phase === 'install'
    ? 'Installing'
    : progress.phase === 'reboot'
    ? 'Rebooting'
    : 'Working';
  const pct = Math.max(0, Math.min(100, progress.percent || 0));
  const itemNote = progress.total > 0 && progress.current_index >= 0
    ? `update ${progress.current_index + 1} of ${progress.total}`
    : '';
  return (
    <div className="py-6 px-2">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500 flex-shrink-0" />
        <div className="flex-1">
          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
            {phaseLabel}{itemNote ? ` (${itemNote})` : ''}…
          </div>
          {progress.message && (
            <div className={`text-xs mt-0.5 truncate ${themeClasses.text.secondary}`}
                 title={progress.message}>
              {progress.message}
            </div>
          )}
        </div>
        <div className={`text-sm font-mono ${themeClasses.text.secondary}`}>{pct}%</div>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

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
