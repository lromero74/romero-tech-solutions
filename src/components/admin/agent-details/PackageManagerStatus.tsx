import React, { useEffect, useMemo, useState } from 'react';
import { Download, Info } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { UpdatePackageDialog } from './UpdatePackageDialog';
import { ChangelogDialog } from './ChangelogDialog';

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
              latestMetrics.package_managers_outdated === 0 ? 'text-green-600 dark:text-green-400' :
              latestMetrics.package_managers_outdated > 10 ? 'text-red-600 dark:text-red-400' :
              'text-yellow-600 dark:text-yellow-400'
            }`}>
              {latestMetrics.package_managers_outdated}
            </span>
          </div>
          {latestMetrics.package_managers_outdated === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.packageManagerStatus.allUpToDate', undefined, 'All packages are up to date')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.package_managers_outdated} {latestMetrics.package_managers_outdated === 1
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
                latestMetrics.homebrew_outdated === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {latestMetrics.homebrew_outdated}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.homebrew_outdated === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${latestMetrics.homebrew_outdated} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
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
                latestMetrics.npm_outdated === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {latestMetrics.npm_outdated}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.npm_outdated === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${latestMetrics.npm_outdated} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
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
                latestMetrics.pip_outdated === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {latestMetrics.pip_outdated}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.pip_outdated === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${latestMetrics.pip_outdated} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
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
                latestMetrics.mas_outdated === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {latestMetrics.mas_outdated}
              </span>
            </div>
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.mas_outdated === 0
                ? t('agentDetails.packageManagerStatus.upToDate', undefined, 'Up to date')
                : `${latestMetrics.mas_outdated} ${t('agentDetails.packageManagerStatus.outdated', undefined, 'outdated')}`}
            </p>
          </div>
        )}
      </div>

      {/* Warning for outdated packages */}
      {latestMetrics.package_managers_outdated > 0 && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className={`text-sm font-medium text-blue-800 dark:text-blue-200 mb-2`}>
                {latestMetrics.package_managers_outdated} {latestMetrics.package_managers_outdated === 1
                  ? t('agentDetails.packageManagerStatus.outdatedDetected', undefined, 'outdated package detected')
                  : t('agentDetails.packageManagerStatus.outdatedDetectedPlural', undefined, 'outdated packages detected')}
              </p>
              {visibleOutdated.length > 0 && (
                <div className="mt-2 max-h-72 overflow-y-auto">
                  {/* Per-manager "Update all" buttons, aggregated from
                      the visible (post-optimistic-filter) set so we
                      hide the button when its manager has nothing left. */}
                  {agentId && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Array.from(new Set(visibleOutdated.map((p: any) => p.package_manager))).map((mgr: any) => (
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
                      {visibleOutdated.slice(0, 50).map((pkg: any, idx: number) => (
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
                  {visibleOutdated.length > 50 && (
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                      {t('agentDetails.packageManagerStatus.andMore', { count: String(visibleOutdated.length - 50) }, `...and ${visibleOutdated.length - 50} more`)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
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
