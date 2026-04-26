import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Download, RefreshCw, AlertTriangle, Rocket, ChevronDown, ChevronRight } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { UpdatePackageDialog } from './UpdatePackageDialog';
import { ChangelogDialog } from './ChangelogDialog';

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

export const OSPatchStatus: React.FC<AgentDetailsComponentProps & { agentId?: string }> = ({ latestMetrics, agentId }) => {
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

  if (!latestMetrics || latestMetrics.patches_available === undefined) return null;

  const hasList = visiblePatches.length > 0;
  const securityCount = latestMetrics.security_patches_available || 0;

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
                    const canUpdate = !!agentId && !!p.package_manager && !!managerAlias[p.package_manager];
                    return (
                      <tr key={idx} className="border-b border-blue-100 dark:border-blue-800/50">
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
                        <td className={`py-1 px-2 ${themeClasses.text.muted}`}>{p.source || '—'}</td>
                        <td className={`py-1 px-2 ${themeClasses.text.secondary}`}>{p.package_manager || '—'}</td>
                        {agentId && (
                          <td className="py-1 px-2">
                            {canUpdate ? (
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
