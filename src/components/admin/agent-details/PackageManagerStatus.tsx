import React, { useEffect, useMemo, useState } from 'react';
import { Download, Info, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { UpdatePackageDialog } from './UpdatePackageDialog';
import { ChangelogDialog } from './ChangelogDialog';

// Human-readable labels for the system-updater identifiers the agent
// reports on system-managed (vendor-owned) packages. Lets us render a
// single grouped row like "macOS Command Line Tools" instead of N
// individual pip entries that the user can't actually update via pip.
const systemUpdaterLabels: Record<string, string> = {
  macos_clt: 'macOS Command Line Tools',
  apt: 'Ubuntu/Debian (apt)',
  dnf: 'Fedora/RHEL (dnf)',
  pacman: 'Arch (pacman)',
  zypper: 'openSUSE (zypper)',
  linux_distro: 'Linux distribution',
};

// Maps package_manager values the agent reports (homebrew, npm, pip,
// apt, yum, dnf, snap, flatpak, mas, …) to the canonical key the
// agent's update_packages handler accepts.
const managerAlias: Record<string, string> = {
  homebrew: 'brew',
  brew: 'brew',
  npm: 'npm',
  pip: 'pip',
  pip3: 'pip',
  apt: 'apt',
  yum: 'dnf',
  dnf: 'dnf',
  pacman: 'pacman',
  zypper: 'zypper',
  gem: 'gem',
  cargo: 'cargo',
  snap: 'snap',
  flatpak: 'flatpak',
  winget: 'winget',
  choco: 'choco',
  // mas (Mac App Store) intentionally has no remote-update support yet.
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

export const PackageManagerStatus: React.FC<AgentDetailsComponentProps & { agentId?: string }> = ({ latestMetrics, agentId }) => {
  const { t } = useOptionalClientLanguage();
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [changelog, setChangelog] = useState<ChangelogTarget | null>(null);

  // Optimistic UI: when an Update succeeds we add the package's
  // (manager, name) to this set so the row vanishes immediately,
  // even though the underlying latestMetrics.outdated_packages_data
  // won't refresh until the next agent heartbeat. The set resets
  // whenever the underlying data changes (a fresh heartbeat will
  // already exclude the package, so no need to remember our local
  // hide).
  const [hiddenAfterUpdate, setHiddenAfterUpdate] = useState<Set<string>>(() => new Set());
  const outdatedRaw = latestMetrics?.outdated_packages_data;
  useEffect(() => {
    setHiddenAfterUpdate(new Set());
  }, [outdatedRaw]);

  // Build the visible list once per render so the table, the
  // "Update all <manager>" button group, AND the empty-state
  // collapse all use the same filtered data.
  const visibleOutdated = useMemo(() => {
    if (!Array.isArray(outdatedRaw)) return [];
    return outdatedRaw.filter((p: any) => !hiddenAfterUpdate.has(`${p.package_manager}|${p.name}`));
  }, [outdatedRaw, hiddenAfterUpdate]);

  // Split system-managed (vendor-owned) packages out of the actionable
  // list. They get rendered separately under their parent updater
  // because pip can't actually replace Apple's CLT-bundled Python
  // packages — the user has to install the pending CLT update for
  // those to move.
  const actionableOutdated = useMemo(
    () => visibleOutdated.filter((p: any) => !p.system_managed),
    [visibleOutdated]
  );
  const systemOutdatedByUpdater = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const p of visibleOutdated as any[]) {
      if (!p.system_managed) continue;
      const key = p.system_updater || 'linux_distro';
      const list = groups.get(key) || [];
      list.push(p);
      groups.set(key, list);
    }
    return groups;
  }, [visibleOutdated]);

  // Per-manager + total counts derived from actionableOutdated so the
  // "Total Outdated", "Homebrew", "npm", "pip", "mas" header cards
  // reflect what the user can actually do something about. The
  // system-managed group is reported separately below the table.
  const displayCounts = useMemo(() => {
    const counts = {
      total: latestMetrics?.package_managers_outdated ?? 0,
      homebrew: latestMetrics?.homebrew_outdated ?? 0,
      npm: latestMetrics?.npm_outdated ?? 0,
      pip: latestMetrics?.pip_outdated ?? 0,
      mas: latestMetrics?.mas_outdated ?? 0,
    };
    if (!Array.isArray(outdatedRaw)) return counts;
    const visible = actionableOutdated as any[];
    counts.total = visible.length;
    counts.homebrew = visible.filter(p => p.package_manager === 'homebrew').length;
    counts.npm = visible.filter(p => p.package_manager === 'npm').length;
    counts.pip = visible.filter(p => p.package_manager === 'pip' || p.package_manager === 'pip3').length;
    counts.mas = visible.filter(p => p.package_manager === 'mas').length;
    return counts;
  }, [outdatedRaw, actionableOutdated, latestMetrics]);

  // Collapsed by default — these aren't actionable, so they shouldn't
  // demand attention. Power users can expand to see the breakdown.
  const [systemPanelOpen, setSystemPanelOpen] = useState(false);
  const cltUpdateAvailable = Boolean(latestMetrics?.clt_update_available);

  // Render-or-bail check: if the agent hasn't reported any package-
  // manager data yet, the panel doesn't show at all. We probe the
  // raw metric (not displayCounts.total, which defaults to 0) so we
  // can distinguish "no data" from "data showing 0 outdated".
  if (!latestMetrics || latestMetrics.package_managers_outdated === undefined) return null;

  // Click handler — maps the manager alias and opens the modal.
  const requestUpdate = (manager: string, pkg: string | null) => {
    const mapped = managerAlias[manager.toLowerCase()];
    if (!mapped || !agentId) return;
    setDialog({
      manager: mapped,
      packages: pkg ? [pkg] : [],
      scope: pkg ? 'selected' : 'all',
    });
  };

  const canUpdate = (manager: string) => Boolean(agentId && managerAlias[manager.toLowerCase()]);

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Download className="w-5 h-5 mr-2" />
        {t('agentDetails.packageManagerStatus.title', undefined, 'Package Manager Status')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
        {/* Total Outdated */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.packageManagerStatus.totalOutdatedLabel', undefined, 'Total Outdated:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              displayCounts.total === 0 ? 'text-green-600 dark:text-green-400' :
              displayCounts.total > 10 ? 'text-red-600 dark:text-red-400' :
              'text-yellow-600 dark:text-yellow-400'
            }`}>
              {displayCounts.total}
            </span>
          </div>
          {displayCounts.total === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.packageManagerStatus.allUpToDate', undefined, 'All packages are up to date')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {displayCounts.total} {displayCounts.total === 1
                ? t('agentDetails.packageManagerStatus.packageOutdated', undefined, 'package outdated')
                : t('agentDetails.packageManagerStatus.packagesOutdated', undefined, 'packages outdated')}
            </p>
          )}
        </div>

        {/* Homebrew */}
        {latestMetrics.homebrew_outdated !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Homebrew:</span>
              </div>
              <span className={`text-lg font-bold ${
                displayCounts.homebrew === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {displayCounts.homebrew}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {displayCounts.homebrew === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${displayCounts.homebrew} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
            </p>
          </div>
        )}

        {/* npm */}
        {latestMetrics.npm_outdated !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>npm:</span>
              </div>
              <span className={`text-lg font-bold ${
                displayCounts.npm === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {displayCounts.npm}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {displayCounts.npm === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${displayCounts.npm} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
            </p>
          </div>
        )}

        {/* pip */}
        {latestMetrics.pip_outdated !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>pip:</span>
              </div>
              <span className={`text-lg font-bold ${
                displayCounts.pip === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {displayCounts.pip}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {displayCounts.pip === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${displayCounts.pip} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
            </p>
          </div>
        )}

        {/* mas (Mac App Store) */}
        {latestMetrics.mas_outdated !== undefined && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>mas:</span>
              </div>
              <span className={`text-lg font-bold ${
                displayCounts.mas === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {displayCounts.mas}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {displayCounts.mas === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${displayCounts.mas} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
            </p>
          </div>
        )}
      </div>

      {/* Warning for outdated packages */}
      {displayCounts.total > 0 && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className={`text-sm font-medium text-blue-800 dark:text-blue-200 mb-2`}>
                {displayCounts.total} {displayCounts.total === 1
                  ? t('agentDetails.packageManagerStatus.outdatedDetected', undefined, 'outdated package detected')
                  : t('agentDetails.packageManagerStatus.outdatedDetectedPlural', undefined, 'outdated packages detected')}
              </p>
              {actionableOutdated.length > 0 && (
                <div className="mt-2 max-h-72 overflow-y-auto">
                  {/* Per-manager "Update all" buttons, aggregated from
                      the actionable (post-optimistic-filter,
                      non-system-managed) set so we hide the button
                      when its manager has nothing left. */}
                  {agentId && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Array.from(new Set(actionableOutdated.map((p: any) => p.package_manager))).map((mgr: any) => (
                        canUpdate(mgr) ? (
                          <button
                            key={mgr}
                            onClick={() => requestUpdate(mgr, null)}
                            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                            Update all {mgr}
                          </button>
                        ) : null
                      ))}
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-blue-200 dark:border-blue-700">
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">{t('agentDetails.packageManagerStatus.tableHeaderPackage', undefined, 'Package')}</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">{t('agentDetails.packageManagerStatus.tableHeaderInstalled', undefined, 'Installed')}</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">{t('agentDetails.packageManagerStatus.tableHeaderLatest', undefined, 'Latest')}</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">{t('agentDetails.packageManagerStatus.tableHeaderManager', undefined, 'Manager')}</th>
                        {agentId && <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {actionableOutdated.slice(0, 50).map((pkg: any, idx: number) => (
                        <tr key={idx} className="border-b border-blue-100 dark:border-blue-800/50">
                          <td className="py-1 px-2 text-blue-800 dark:text-blue-200">{pkg.name}</td>
                          <td className="py-1 px-2 text-red-600 dark:text-red-400">{pkg.installed_version}</td>
                          <td className="py-1 px-2">
                            {/* Clicking the new version opens the
                                ChangelogDialog so users see what's been
                                patched / what CVEs are fixed before
                                running the update. */}
                            <button
                              onClick={() => setChangelog({
                                manager: pkg.package_manager,
                                packageName: pkg.name,
                                fromVersion: pkg.installed_version,
                                toVersion: pkg.latest_version,
                              })}
                              className="text-green-600 dark:text-green-400 hover:underline">
                              {pkg.latest_version}
                            </button>
                          </td>
                          <td className="py-1 px-2 text-blue-800 dark:text-blue-200">{pkg.package_manager}</td>
                          {agentId && (
                            <td className="py-1 px-2">
                              {canUpdate(pkg.package_manager) ? (
                                <button
                                  onClick={() => requestUpdate(pkg.package_manager, pkg.name)}
                                  className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                                  Update
                                </button>
                              ) : (
                                <span className="text-xs text-gray-500">n/a</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {actionableOutdated.length > 50 && (
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                      {t('agentDetails.packageManagerStatus.andMore', { count: String(actionableOutdated.length - 50) }, `...and ${actionableOutdated.length - 50} more`)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System-managed (vendor-owned) packages — collapsible. These
          can't be safely updated through the same package manager
          because they live in vendor-owned paths (Apple's
          CommandLineTools, distro dist-packages). The user gets an
          actionable signal only when the vendor pushes an update for
          the parent (e.g. Software Update offers a new CLT). */}
      {systemOutdatedByUpdater.size > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setSystemPanelOpen(o => !o)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.hover} text-left`}>
            <div className="flex items-center">
              <Lock className={`w-4 h-4 mr-2 ${themeClasses.text.secondary}`} />
              <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                {Array.from(systemOutdatedByUpdater.values()).reduce((n, l) => n + l.length, 0)} system-managed package(s)
              </span>
              <span className={`ml-2 text-xs ${themeClasses.text.muted}`}>
                — vendor-owned, not user-updatable
              </span>
            </div>
            {systemPanelOpen
              ? <ChevronDown className={`w-4 h-4 ${themeClasses.text.secondary}`} />
              : <ChevronRight className={`w-4 h-4 ${themeClasses.text.secondary}`} />}
          </button>
          {systemPanelOpen && (
            <div className="mt-2 space-y-3">
              {Array.from(systemOutdatedByUpdater.entries()).map(([updater, pkgs]) => {
                const label = systemUpdaterLabels[updater] || updater;
                const showCltBanner = updater === 'macos_clt';
                return (
                  <div key={updater} className={`p-3 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.secondary}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                        {label} ({pkgs.length})
                      </span>
                      {showCltBanner && (cltUpdateAvailable ? (
                        <a
                          href="x-apple.systempreferences:com.apple.preferences.softwareupdate"
                          className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">
                          Update available — open Software Update
                        </a>
                      ) : (
                        <span className={`text-xs italic ${themeClasses.text.muted}`}>
                          No vendor update pending
                        </span>
                      ))}
                    </div>
                    <p className={`text-xs ${themeClasses.text.secondary} mb-2`}>
                      {showCltBanner
                        ? 'These ship inside Apple\'s Command Line Tools. They refresh when you install a CLT update — pip can\'t replace them in /Library/Developer/CommandLineTools.'
                        : `These are managed by ${label}. They will refresh on the next distro upgrade.`}
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className={`border-b ${themeClasses.border.primary}`}>
                          <th className={`text-left py-1 px-2 font-semibold ${themeClasses.text.primary}`}>Package</th>
                          <th className={`text-left py-1 px-2 font-semibold ${themeClasses.text.primary}`}>Installed</th>
                          <th className={`text-left py-1 px-2 font-semibold ${themeClasses.text.primary}`}>Latest</th>
                          <th className={`text-left py-1 px-2 font-semibold ${themeClasses.text.primary}`}>Manager</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pkgs.slice(0, 50).map((pkg: any, idx: number) => (
                          <tr key={idx} className={`border-b ${themeClasses.border.primary}`}>
                            <td className={`py-1 px-2 ${themeClasses.text.secondary}`}>{pkg.name}</td>
                            <td className="py-1 px-2 text-red-500/70 dark:text-red-400/70">{pkg.installed_version}</td>
                            <td className="py-1 px-2">
                              {/* Even on vendor-managed packages the
                                  user wants to see what's in the new
                                  version. The button opens the same
                                  ChangelogDialog the actionable table
                                  uses — just no Update button next to
                                  it because pip can't replace these. */}
                              <button
                                onClick={() => setChangelog({
                                  manager: pkg.package_manager,
                                  packageName: pkg.name,
                                  fromVersion: pkg.installed_version,
                                  toVersion: pkg.latest_version,
                                })}
                                className="text-green-600 dark:text-green-400 hover:underline">
                                {pkg.latest_version}
                              </button>
                            </td>
                            <td className={`py-1 px-2 ${themeClasses.text.muted}`}>{pkg.package_manager}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {dialog && agentId && (
        <UpdatePackageDialog
          agentId={agentId}
          manager={dialog.manager}
          packages={dialog.packages}
          scope={dialog.scope}
          onClose={() => setDialog(null)}
          onResult={(succeeded) => {
            // Optimistic-hide each succeeded package so the row
            // disappears immediately. We key on the *displayed*
            // package_manager string (e.g. "homebrew", "pip") which
            // is what outdated_packages_data uses; the canonical
            // manager passed to the agent ("brew", "pip") may
            // differ, so we look up the original rows by name.
            if (succeeded.length === 0) return;
            const newSet = new Set(hiddenAfterUpdate);
            for (const name of succeeded) {
              if (Array.isArray(outdatedRaw)) {
                for (const row of outdatedRaw as any[]) {
                  if (row.name === name) {
                    newSet.add(`${row.package_manager}|${name}`);
                  }
                }
              }
            }
            setHiddenAfterUpdate(newSet);
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
