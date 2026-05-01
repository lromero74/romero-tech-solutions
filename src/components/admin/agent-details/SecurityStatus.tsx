import React, { useState } from 'react';
import { Shield, Circle, AlertTriangle, Loader2 } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';
import { agentService } from '../../../services/agentService';
import { usePermission } from '../../../hooks/usePermission';

type SecurityCapability = 'clamav' | 'native_av' | 'firewall';
type SecurityActionVerb = 'install' | 'uninstall' | 'enable' | 'disable';

// Detect ClamAV in the agent's reported security_data array. Matches both
// "ClamAV" (the daemon) and "ClamXav" (the macOS GUI wrapper).
function hasClamAV(securityData: unknown): boolean {
  if (!Array.isArray(securityData)) return false;
  return securityData.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const name = String((p as { name?: unknown }).name ?? '').toLowerCase();
    const vendor = String((p as { vendor?: unknown }).vendor ?? '').toLowerCase();
    return name.includes('clamav') || name.includes('clamxav') ||
           vendor.includes('clamav') || vendor.includes('clamxav');
  });
}

// macOS / Linux native AV is "not really controllable from CLI"; we hide the
// button there. Windows Defender is the only natively-controllable native AV.
function nativeAVControllable(osType: string | undefined): boolean {
  return (osType ?? '').toLowerCase() === 'windows';
}

export const SecurityStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics, agent }) => {
  const { t } = useOptionalClientLanguage();
  const { checkPermission } = usePermission();
  const canManage = checkPermission('manage.security_actions.enable');

  // Track in-flight requests by capability — prevents double-clicks and
  // shows a per-button spinner without a global loading state.
  const [inflight, setInflight] = useState<Set<SecurityCapability>>(new Set());
  const [lastResult, setLastResult] = useState<{
    capability: SecurityCapability;
    action: SecurityActionVerb;
    ok: boolean;
    message: string;
  } | null>(null);

  const runAction = async (capability: SecurityCapability, action: SecurityActionVerb) => {
    if (!agent?.id) return;
    setInflight(prev => new Set(prev).add(capability));
    setLastResult(null);
    try {
      const resp = await agentService.requestSecurityAction(agent.id, { capability, action });
      setLastResult({
        capability,
        action,
        ok: resp.success === true,
        message: resp.success === true
          ? `${capability} ${action} queued (command id ${resp.data?.command_id?.slice(0, 8) ?? '?'}). Result will appear within a minute.`
          : (resp.message ?? 'Failed to queue action.')
      });
    } catch (e) {
      setLastResult({
        capability, action, ok: false,
        message: e instanceof Error ? e.message : 'Network error issuing security action.'
      });
    } finally {
      setInflight(prev => {
        const next = new Set(prev);
        next.delete(capability);
        return next;
      });
    }
  };

  // Helper function to translate security error messages
  const translateErrorMessage = (errorMessage: string): string => {
    const errorMessageMap: Record<string, string> = {
      'Firewall is disabled': 'agentDetails.securityStatus.errors.firewallDisabled',
      'Installed but not running': 'agentDetails.securityStatus.errors.installedButNotRunning',
      'Installed but daemon not running': 'agentDetails.securityStatus.errors.installedButDaemonNotRunning',
      'No active firewall detected': 'agentDetails.securityStatus.errors.noActiveFirewall',
      'SELinux in permissive mode (not enforcing)': 'agentDetails.securityStatus.errors.selinuxPermissive',
      'SELinux is disabled': 'agentDetails.securityStatus.errors.selinuxDisabled',
      'Windows Firewall is disabled': 'agentDetails.securityStatus.errors.windowsFirewallDisabled',
      'Antivirus is disabled': 'agentDetails.securityStatus.errors.antivirusDisabled',
      'Definitions are out of date': 'agentDetails.securityStatus.errors.definitionsOutOfDate',
    };

    const translationKey = errorMessageMap[errorMessage];
    return translationKey ? t(translationKey, undefined, errorMessage) : errorMessage;
  };

  // Helper function to translate detection methods
  const translateDetectionMethod = (method: string): string => {
    const detectionMethodMap: Record<string, string> = {
      'command': 'agentDetails.securityStatus.detectionMethod.command',
      'filesystem': 'agentDetails.securityStatus.detectionMethod.filesystem',
      'system': 'agentDetails.securityStatus.detectionMethod.system',
      'wmi': 'agentDetails.securityStatus.detectionMethod.wmi',
    };

    const translationKey = detectionMethodMap[method];
    return translationKey ? t(translationKey, undefined, method) : method;
  };

  if (!latestMetrics || latestMetrics.security_products_count === null || latestMetrics.security_products_count === undefined || latestMetrics.security_products_count === 0) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Shield className="w-5 h-5 mr-2" />
        {t('agentDetails.securityStatus.title', undefined, 'Security & Antivirus Status')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
        {/* Antivirus Installed */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.securityStatus.antivirus', undefined, 'Antivirus:')}</span>
            <span className={`text-lg font-bold ${
              latestMetrics.antivirus_installed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.antivirus_installed
                ? t('agentDetails.securityStatus.antivirus.installed', undefined, 'Installed')
                : t('agentDetails.securityStatus.antivirus.missing', undefined, 'Missing')}
            </span>
          </div>
          {!latestMetrics.antivirus_installed && (
            <p className={`text-xs text-red-600`}>
              {t('agentDetails.securityStatus.antivirus.noDetected', undefined, 'No antivirus detected!')}
            </p>
          )}
        </div>

        {/* Antivirus Enabled */}
        {latestMetrics.antivirus_installed && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.securityStatus.avProtection', undefined, 'AV Protection:')}</span>
              <span className={`text-lg font-bold ${
                latestMetrics.antivirus_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {latestMetrics.antivirus_enabled
                  ? t('agentDetails.securityStatus.avProtection.active', undefined, 'Active')
                  : t('agentDetails.securityStatus.avProtection.disabled', undefined, 'Disabled')}
              </span>
            </div>
            {!latestMetrics.antivirus_enabled && (
              <p className={`text-xs text-red-600`}>
                {t('agentDetails.securityStatus.avProtection.notRunning', undefined, 'Antivirus is not running')}
              </p>
            )}
          </div>
        )}

        {/* Definitions Up to Date */}
        {latestMetrics.antivirus_enabled && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.securityStatus.definitions', undefined, 'Definitions:')}</span>
              <span className={`text-lg font-bold ${
                latestMetrics.antivirus_up_to_date ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {latestMetrics.antivirus_up_to_date
                  ? t('agentDetails.securityStatus.definitions.current', undefined, 'Current')
                  : t('agentDetails.securityStatus.definitions.outdated', undefined, 'Outdated')}
              </span>
            </div>
            {!latestMetrics.antivirus_up_to_date && (
              <p className={`text-xs text-red-600`}>
                {t('agentDetails.securityStatus.definitions.updateRequired', undefined, 'Update virus definitions')}
              </p>
            )}
          </div>
        )}

        {/* Firewall Status */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.securityStatus.firewall', undefined, 'Firewall:')}</span>
            <span className={`text-lg font-bold ${
              latestMetrics.firewall_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.firewall_enabled
                ? t('agentDetails.securityStatus.firewall.enabled', undefined, 'Enabled')
                : t('agentDetails.securityStatus.firewall.disabled', undefined, 'Disabled')}
            </span>
          </div>
          {!latestMetrics.firewall_enabled && (
            <p className={`text-xs text-red-600`}>
              {t('agentDetails.securityStatus.firewall.notActive', undefined, 'Firewall is not active')}
            </p>
          )}
        </div>
      </div>

      {/* Security Products List */}
      {latestMetrics.security_data && Array.isArray(latestMetrics.security_data) && latestMetrics.security_data.length > 0 && (
        <div className="space-y-2">
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            {t('agentDetails.securityStatus.detectedProducts', undefined, 'Detected Security Products')} ({latestMetrics.security_products_count})
          </h4>
          {latestMetrics.security_data.map((product, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                !product.is_enabled || product.error_message
                  ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                  : product.product_type === 'antivirus' && !product.definitions_up_to_date
                  ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800'
                  : `${themeClasses.border.primary} ${themeClasses.bg.hover}`
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <Circle className={`w-3 h-3 mr-2 ${
                    product.is_running && product.is_enabled ? 'text-green-600 dark:text-green-400 fill-current' :
                    product.is_enabled ? 'text-yellow-600 dark:text-yellow-400 fill-current' :
                    'text-red-600 dark:text-red-400 fill-current'
                  }`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {product.name}
                      {product.vendor && product.vendor !== product.name && (
                        <span className={`text-xs ${themeClasses.text.muted} ml-2`}>
                          ({product.vendor})
                        </span>
                      )}
                    </p>
                    <p className={`text-xs ${themeClasses.text.muted}`}>
                      {product.product_type}
                      {product.version && ` • v${product.version}`}
                      {product.detection_method && ` • ${translateDetectionMethod(product.detection_method)}`}
                    </p>
                    {product.error_message && (
                      <p className={`text-xs ${
                        !product.is_enabled ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                      } mt-1`}>
                        {translateErrorMessage(product.error_message)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {product.is_enabled && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                      {t('agentDetails.securityStatus.badge.enabled', undefined, 'Enabled')}
                    </span>
                  )}
                  {product.product_type === 'antivirus' && product.real_time_protection && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 rounded text-xs">
                      {t('agentDetails.securityStatus.badge.realTime', undefined, 'Real-Time')}
                    </span>
                  )}
                  {product.product_type === 'antivirus' && !product.definitions_up_to_date && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 rounded text-xs">
                      {t('agentDetails.securityStatus.badge.outdated', undefined, 'Outdated')}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    product.is_running ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                    product.is_enabled ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20' :
                    'bg-red-100 text-red-800 dark:bg-red-900/20'
                  }`}>
                    {product.is_running
                      ? t('agentDetails.securityStatus.badge.running', undefined, 'RUNNING')
                      : product.is_enabled
                        ? t('agentDetails.securityStatus.badge.stopped', undefined, 'STOPPED')
                        : t('agentDetails.securityStatus.badge.disabled', undefined, 'DISABLED')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stage 4 M4 — security action panel (operator-initiated remediation).
          Renders below the existing display for operators who hold
          manage.security_actions.enable. Buttons are conditional on the
          agent's reported state so we never show "install" when already
          installed. */}
      {canManage && agent?.id && (
        <div className={`mt-4 pt-4 border-t ${themeClasses.border.primary}`}>
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            {t('agentDetails.securityStatus.actions.title', undefined, 'Security Actions')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {/* ClamAV install / uninstall */}
            {hasClamAV(latestMetrics.security_data) ? (
              <button
                type="button"
                onClick={() => runAction('clamav', 'uninstall')}
                disabled={inflight.has('clamav')}
                className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {inflight.has('clamav') && <Loader2 className="w-3 h-3 animate-spin" />}
                {t('agentDetails.securityStatus.actions.uninstallClamAV', undefined, 'Uninstall ClamAV')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runAction('clamav', 'install')}
                disabled={inflight.has('clamav')}
                className="px-3 py-1.5 text-sm rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {inflight.has('clamav') && <Loader2 className="w-3 h-3 animate-spin" />}
                {t('agentDetails.securityStatus.actions.installClamAV', undefined, 'Install ClamAV')}
              </button>
            )}

            {/* Native AV (Windows Defender) — only shown on Windows where it's controllable */}
            {nativeAVControllable(agent.os_type) && (
              latestMetrics.antivirus_enabled ? (
                <button
                  type="button"
                  onClick={() => runAction('native_av', 'disable')}
                  disabled={inflight.has('native_av')}
                  className="px-3 py-1.5 text-sm rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-300 dark:hover:bg-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {inflight.has('native_av') && <Loader2 className="w-3 h-3 animate-spin" />}
                  {t('agentDetails.securityStatus.actions.disableDefender', undefined, 'Disable Windows Defender')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runAction('native_av', 'enable')}
                  disabled={inflight.has('native_av')}
                  className="px-3 py-1.5 text-sm rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {inflight.has('native_av') && <Loader2 className="w-3 h-3 animate-spin" />}
                  {t('agentDetails.securityStatus.actions.enableDefender', undefined, 'Enable Windows Defender')}
                </button>
              )
            )}

            {/* Firewall enable / disable */}
            {latestMetrics.firewall_enabled ? (
              <button
                type="button"
                onClick={() => runAction('firewall', 'disable')}
                disabled={inflight.has('firewall')}
                className="px-3 py-1.5 text-sm rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-300 dark:hover:bg-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {inflight.has('firewall') && <Loader2 className="w-3 h-3 animate-spin" />}
                {t('agentDetails.securityStatus.actions.disableFirewall', undefined, 'Disable Firewall')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runAction('firewall', 'enable')}
                disabled={inflight.has('firewall')}
                className="px-3 py-1.5 text-sm rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {inflight.has('firewall') && <Loader2 className="w-3 h-3 animate-spin" />}
                {t('agentDetails.securityStatus.actions.enableFirewall', undefined, 'Enable Firewall')}
              </button>
            )}
          </div>

          {lastResult && (
            <div
              className={`mt-3 p-2 text-xs rounded ${
                lastResult.ok
                  ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200'
                  : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'
              }`}
            >
              {lastResult.message}
            </div>
          )}
        </div>
      )}

      {/* Critical Security Warnings */}
      {latestMetrics.security_issues_count > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {t(
                  latestMetrics.security_issues_count !== 1
                    ? 'agentDetails.securityStatus.issues.detected.plural'
                    : 'agentDetails.securityStatus.issues.detected.singular',
                  undefined,
                  latestMetrics.security_issues_count !== 1
                    ? '{count} security issues detected'
                    : '{count} security issue detected'
                ).replace('{count}', latestMetrics.security_issues_count.toString())}
              </p>
              <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                {!latestMetrics.antivirus_installed && t('agentDetails.securityStatus.issues.noAntivirus', undefined, 'No antivirus software installed. ')}
                {latestMetrics.antivirus_installed && !latestMetrics.antivirus_enabled && t('agentDetails.securityStatus.issues.antivirusDisabled', undefined, 'Antivirus is disabled. ')}
                {latestMetrics.antivirus_enabled && !latestMetrics.antivirus_up_to_date && t('agentDetails.securityStatus.issues.definitionsOutdated', undefined, 'Antivirus definitions are out of date. ')}
                {!latestMetrics.firewall_enabled && t('agentDetails.securityStatus.issues.firewallDisabled', undefined, 'Firewall is disabled. ')}
                {t('agentDetails.securityStatus.issues.actionRequired', undefined, 'Address these security concerns immediately to protect the system.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
