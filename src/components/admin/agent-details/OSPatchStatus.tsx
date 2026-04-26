import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Download, RefreshCw, AlertTriangle, Rocket, ChevronDown, ChevronRight } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { UpdatePackageDialog } from './UpdatePackageDialog';
import { ChangelogDialog } from './ChangelogDialog';
import { agentService } from '../../../services/agentService';

// Maps the agent's package_manager values to the canonical key the
// agent's update_packages handler accepts. Only Linux distro
// managers fire actionable buttons in this panel; macOS
// softwareupdate links to System Settings instead.
const managerAlias: Record<string, string> = {
  apt: 'apt',
  dnf: 'dnf',
  yum: 'dnf',
  pacman: 'pacman',
  zypper: 'zypper',
  winupdate: 'winupdate',
};

interface DialogTarget {
  manager: string;
  packages: string[];
  scope: 'all' | 'selected';
}

interface ChangelogTarget {
  manager: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
}

export const OSPatchStatus: React.FC<AgentDetailsComponentProps & { agentId?: string }> = ({ latestMetrics, agentId, agent, commands }) => {
  const { t } = useOptionalClientLanguage();
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [changelog, setChangelog] = useState<ChangelogTarget | null>(null);
  const [tableOpen, setTableOpen] = useState(true);

  // Optimistic-hide: same pattern as PackageManagerStatus. When an
  // update succeeds the affected package's row vanishes immediately
  // even though the underlying patches list won't refresh until the
  // next agent metric. Reset the hide-set whenever fresh data lands.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const patchesRaw = latestMetrics?.os_patches_data;
  useEffect(() => {
    setHidden(new Set());
  }, [patchesRaw]);

  const visiblePatches = useMemo(() => {
    if (!Array.isArray(patchesRaw)) return [];
    return patchesRaw.filter((p: any) => !hidden.has(`${p.package_manager}|${p.name}`));
  }, [patchesRaw, hidden]);

  const distroUpgrade = latestMetrics?.distro_upgrade;
  // Track Reboot button state up here (before any early returns) so
  // the React hook order stays stable across render passes.
  const [rebootRequested, setRebootRequested] = useState(false);
  const [rebootMinutes, setRebootMinutes] = useState(1);
  // Tick state forces a re-render once a second while a reboot is
  // in progress, so the "Rebooting since X:XX" elapsed counter
  // stays current without needing a websocket event for every
  // second.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!latestMetrics || latestMetrics.patches_available === undefined) return null;

  const hasList = visiblePatches.length > 0;
  const securityCount = latestMetrics.security_patches_available || 0;
  const pendingRebootPatches = visiblePatches.filter((p: any) => p.package_manager === 'winupdate-reboot');

  // Detect "the agent is rebooting because we asked it to" by
  // correlating the most recent reboot_host command with the
  // agent's last_heartbeat. If the command completed AFTER the
  // last heartbeat AND we're still inside a reasonable window
  // (15 minutes — well past any realistic reboot duration),
  // treat the agent as Rebooting rather than just Offline.
  // Rendering this distinction is the difference between a planned
  // restart that you asked for vs an unplanned outage.
  const rebootInfo = (() => {
    if (!Array.isArray(commands) || commands.length === 0) return null;
    const recent = commands
      .filter(c => c.command_type === 'reboot_host')
      .filter(c => c.status === 'completed' && c.executed_at)
      .sort((a, b) => new Date(b.executed_at as string).getTime() - new Date(a.executed_at as string).getTime())[0];
    if (!recent || !recent.executed_at) return null;
    const completedAt = new Date(recent.executed_at).getTime();
    const lastHb = agent?.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
    if (lastHb > completedAt) return null; // agent already came back
    const elapsedMs = Date.now() - completedAt;
    if (elapsedMs > 15 * 60 * 1000) return null; // give up after 15 min
    return { startedAt: completedAt, elapsedMs };
  })();

  const handleRebootHost = async () => {
    if (!agentId) return;
    const minutes = Math.max(1, Math.min(60, rebootMinutes || 1));
    if (!confirm(`Reboot this device in ${minutes} minute${minutes === 1 ? '' : 's'}?\n\nAny installed-but-pending Windows updates will take effect after the restart.`)) return;
    setRebootRequested(true);
    try {
      await agentService.requestRebootHost(agentId, { delay_seconds: minutes * 60 });
    } catch {
      // The dashboard will surface failures via the standard
      // command-history flow; nothing meaningful to do here.
    } finally {
      setTimeout(() => setRebootRequested(false), 5000);
    }
  };

  // Group visible patches by package_manager so we can render a
  // single "Update all <manager>" button per family.
  const managers = Array.from(new Set(visiblePatches.map((p: any) => p.package_manager).filter(Boolean)));
  const updatableManagers = managers.filter(m => m && managerAlias[m as string]);

  const requestUpdate = (manager: string, pkg: string | null) => {
    const mapped = managerAlias[manager];
    if (!mapped || !agentId) return;
    setDialog({
      manager: mapped,
      packages: pkg ? [pkg] : [],
      scope: pkg ? 'selected' : 'all',
    });
  };

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Shield className="w-5 h-5 mr-2" />
        {t('agentDetails.osPatchStatus.title', undefined, 'OS Patch Status')}
      </h3>

      {/* Distro release upgrade banner — surfaced first because it's
          the highest-impact action available on this panel. */}
      {distroUpgrade && (
        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Rocket className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">
                Major OS upgrade available: {distroUpgrade.current_release} → {distroUpgrade.available_release}
              </p>
              <p className="text-xs text-purple-800 dark:text-purple-300 mb-2">
                A new {distroUpgrade.distro || 'Linux'} release is available. This is a multi-thousand-package upgrade
                and typically requires a reboot. Per-package updates below will not bring the system to the new
                release on their own.
              </p>
              {distroUpgrade.upgrade_command && (
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 text-xs rounded bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 break-all">
                    {distroUpgrade.upgrade_command}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(distroUpgrade.upgrade_command!).catch(() => {});
                    }}
                    className="px-2 py-1 text-xs font-medium rounded bg-purple-600 text-white hover:bg-purple-700 flex-shrink-0">
                    Copy
                  </button>
                </div>
              )}
              <p className="text-xs text-purple-700 dark:text-purple-400 mt-2 italic">
                Run this on the agent host as root. Auto-execution is intentionally disabled — release
                upgrades benefit from human-in-the-loop monitoring.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reboot-in-progress banner: agent picked up a reboot_host
          command and we're inside the post-command window where it
          should be coming back up. Distinct from "Offline" so the
          user can see this is an expected outage they triggered. */}
      {rebootInfo && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                Rebooting since {formatElapsed(rebootInfo.elapsedMs)}…
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                The agent will reconnect automatically once the host comes back up.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reboot-required banner: shown when there are installed
          updates waiting for a system restart, OR when the agent
          set patches_require_reboot=true (meaning a pending update
          will require a reboot once installed). Hidden while a
          reboot is already in progress (rebootInfo above takes
          over). The form lets the user pick a delay in minutes
          (default 1) before clicking; the agent's shutdown
          command fires after that delay so the user has time to
          save work / close apps. */}
      {agentId && !rebootInfo && (pendingRebootPatches.length > 0 || latestMetrics.patches_require_reboot) && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                {pendingRebootPatches.length > 0
                  ? `${pendingRebootPatches.length} update${pendingRebootPatches.length === 1 ? '' : 's'} installed and waiting for restart`
                  : 'A reboot is required to complete pending updates'}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mb-2">
                Restarting will close any open applications on the device. The agent reconnects automatically once the host comes back up.
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-amber-900 dark:text-amber-200">
                  Restart in
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={rebootMinutes}
                  onChange={(e) => setRebootMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                  className="w-16 px-2 py-1 text-xs rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  disabled={rebootRequested}
                />
                <span className="text-xs text-amber-900 dark:text-amber-200">
                  minute{rebootMinutes === 1 ? '' : 's'}
                </span>
                <button
                  onClick={handleRebootHost}
                  disabled={rebootRequested}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {rebootRequested ? 'Reboot scheduled…' : 'Restart device now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.updatesAvailable', undefined, 'Updates Available:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              latestMetrics.patches_available === 0 ? 'text-green-600 dark:text-green-400' :
              securityCount > 0 ? 'text-red-600 dark:text-red-400' :
              'text-yellow-600 dark:text-yellow-400'
            }`}>
              {visiblePatches.length || latestMetrics.patches_available}
            </span>
          </div>
          {latestMetrics.patches_available === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.systemUpToDate', undefined, 'System is up to date')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {visiblePatches.length || latestMetrics.patches_available} {(visiblePatches.length || latestMetrics.patches_available) !== 1 ? 'updates available' : 'update available'}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.securityUpdates', undefined, 'Security Updates:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              securityCount === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {securityCount}
            </span>
          </div>
          {securityCount === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.noSecurityUpdates', undefined, 'No security updates pending')}</p>
          ) : (
            <p className="text-xs text-red-600 dark:text-red-400">
              {securityCount} {securityCount !== 1 ? 'security updates required' : 'security update required'}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.rebootStatus', undefined, 'Reboot Status:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              latestMetrics.patches_require_reboot ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}>
              {latestMetrics.patches_require_reboot ? 'Required' : 'Not Required'}
            </span>
          </div>
          {latestMetrics.patches_require_reboot ? (
            <p className="text-xs text-red-600 dark:text-red-400">{t('agentDetails.osPatchStatus.restartNeeded', undefined, 'System restart needed for updates')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.noRestartNeeded', undefined, 'No restart needed')}</p>
          )}
        </div>
      </div>

      {/* Combined warning: security + reboot, when no detailed list. */}
      {!hasList && (securityCount > 0 || latestMetrics.patches_require_reboot) && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {securityCount > 0 && latestMetrics.patches_require_reboot
                ? 'Security updates available and system reboot required'
                : securityCount > 0
                ? 'Security updates available — please install as soon as possible'
                : 'System reboot required to complete updates'}
            </p>
          </div>
        </div>
      )}

      {/* Per-update browsable table — clickable Latest opens
          ChangelogDialog (CVE viewer). Update buttons fire the
          existing update_packages command flow when the package's
          manager (apt/dnf/pacman) is supported. softwareupdate
          entries on macOS are read-only; the user is directed to
          Software Update via the CLT banner elsewhere. */}
      {hasList && (
        <div className="mt-4 border border-blue-200 dark:border-blue-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setTableOpen(o => !o)}
            className={`w-full flex items-center justify-between p-3 ${themeClasses.bg.hover} text-left`}>
            <div className="flex items-center">
              {tableOpen
                ? <ChevronDown className={`w-4 h-4 mr-2 ${themeClasses.text.secondary}`} />
                : <ChevronRight className={`w-4 h-4 mr-2 ${themeClasses.text.secondary}`} />}
              <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                {visiblePatches.length} pending update{visiblePatches.length !== 1 ? 's' : ''}
              </span>
              {securityCount > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                  {securityCount} security
                </span>
              )}
            </div>
            <span className={`text-xs ${themeClasses.text.muted}`}>
              click any version to view changelog/CVEs
            </span>
          </button>
          {tableOpen && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 max-h-96 overflow-y-auto">
              {agentId && updatableManagers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {updatableManagers.map(mgr => (
                    <button
                      key={mgr}
                      onClick={() => requestUpdate(mgr as string, null)}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                      Update all {mgr}
                    </button>
                  ))}
                </div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-blue-200 dark:border-blue-700">
                    <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Package</th>
                    <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Installed</th>
                    <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Available</th>
                    <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Source</th>
                    <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Manager</th>
                    {agentId && <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {visiblePatches.slice(0, 200).map((p: any, idx: number) => {
                    const isPendingReboot = p.package_manager === 'winupdate-reboot';
                    const canUpdate = !!agentId && !!p.package_manager && !!managerAlias[p.package_manager];
                    return (
                      <tr key={idx} className={`border-b border-blue-100 dark:border-blue-800/50 ${isPendingReboot ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                        <td className="py-1 px-2 text-blue-800 dark:text-blue-200">
                          <span className="flex items-center gap-1">
                            {p.security && <Shield className="w-3 h-3 text-red-500" />}
                            {p.name}
                          </span>
                        </td>
                        <td className="py-1 px-2 text-red-600 dark:text-red-400">{p.current_version || '—'}</td>
                        <td className="py-1 px-2">
                          {p.available_version ? (
                            <button
                              onClick={() => setChangelog({
                                manager: p.package_manager || 'os',
                                packageName: p.name,
                                fromVersion: p.current_version || '',
                                toVersion: p.available_version,
                              })}
                              className="text-green-600 dark:text-green-400 hover:underline">
                              {p.available_version}
                            </button>
                          ) : (
                            <span className={themeClasses.text.muted}>—</span>
                          )}
                        </td>
                        <td className={`py-1 px-2 ${isPendingReboot ? 'text-amber-700 dark:text-amber-300 font-medium' : themeClasses.text.muted}`}>
                          {p.source || '—'}
                        </td>
                        <td className={`py-1 px-2 ${themeClasses.text.secondary}`}>{p.package_manager || '—'}</td>
                        {agentId && (
                          <td className="py-1 px-2">
                            {isPendingReboot ? (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                                Restart to complete
                              </span>
                            ) : canUpdate ? (
                              <button
                                onClick={() => requestUpdate(p.package_manager, p.name)}
                                className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                                Update
                              </button>
                            ) : (
                              <span className={`text-xs ${themeClasses.text.muted}`}>n/a</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visiblePatches.length > 200 && (
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                  …and {visiblePatches.length - 200} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {dialog && agentId && dialog.manager !== 'shell' && (
        <UpdatePackageDialog
          agentId={agentId}
          manager={dialog.manager}
          packages={dialog.packages}
          scope={dialog.scope}
          onClose={() => setDialog(null)}
          onResult={(succeeded) => {
            if (succeeded.length === 0) return;
            const next = new Set(hidden);
            for (const name of succeeded) {
              if (Array.isArray(patchesRaw)) {
                for (const row of patchesRaw as any[]) {
                  if (row.name === name) {
                    next.add(`${row.package_manager}|${name}`);
                  }
                }
              }
            }
            setHidden(next);
          }}
        />
      )}
      {changelog && (
        <ChangelogDialog
          packageName={changelog.packageName}
          manager={changelog.manager}
          fromVersion={changelog.fromVersion}
          toVersion={changelog.toVersion}
          onClose={() => setChangelog(null)}
        />
      )}
    </div>
  );
};

// formatElapsed renders a milliseconds duration as a "Mm Ss" or
// "Hh Mm" stamp for the rebooting-since banner. Used to give the
// user a sense of how long the host has been down so they know
// when something is taking unusually long.
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
