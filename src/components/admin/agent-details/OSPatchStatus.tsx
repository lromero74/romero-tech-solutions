import React from 'react';
import { Shield, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';
import { useOptionalClientLanguage } from '../../../contexts/ClientLanguageContext';

export const OSPatchStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  const { t } = useOptionalClientLanguage();
  if (!latestMetrics || latestMetrics.patches_available === undefined) return null;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Shield className="w-5 h-5 mr-2" />
        {t('agentDetails.osPatchStatus.title', undefined, 'OS Patch Status')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Total Patches */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.updatesAvailable', undefined, 'Updates Available:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              latestMetrics.patches_available === 0 ? 'text-green-600 dark:text-green-400' :
              (latestMetrics.security_patches_available || 0) > 0 ? 'text-red-600 dark:text-red-400' :
              'text-yellow-600 dark:text-yellow-400'
            }`}>
              {latestMetrics.patches_available}
            </span>
          </div>
          {latestMetrics.patches_available === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.systemUpToDate', undefined, 'System is up to date')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.patches_available} {latestMetrics.patches_available !== 1 ? t('agentDetails.osPatchStatus.updatesAvailablePlural', undefined, 'updates available') : t('agentDetails.osPatchStatus.updateAvailable', undefined, 'update available')}
            </p>
          )}
        </div>

        {/* Security Patches */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.securityUpdates', undefined, 'Security Updates:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              (latestMetrics.security_patches_available || 0) === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.security_patches_available || 0}
            </span>
          </div>
          {(latestMetrics.security_patches_available || 0) === 0 ? (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.noSecurityUpdates', undefined, 'No security updates pending')}</p>
          ) : (
            <p className={`text-xs text-red-600 dark:text-red-400`}>
              {latestMetrics.security_patches_available} {latestMetrics.security_patches_available !== 1 ? t('agentDetails.osPatchStatus.securityUpdatesRequired', undefined, 'security updates required') : t('agentDetails.osPatchStatus.securityUpdateRequired', undefined, 'security update required')}
            </p>
          )}
        </div>

        {/* Reboot Required */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>{t('agentDetails.osPatchStatus.rebootStatus', undefined, 'Reboot Status:')}</span>
            </div>
            <span className={`text-lg font-bold ${
              latestMetrics.patches_require_reboot ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}>
              {latestMetrics.patches_require_reboot ? t('agentDetails.osPatchStatus.required', undefined, 'Required') : t('agentDetails.osPatchStatus.notRequired', undefined, 'Not Required')}
            </span>
          </div>
          {latestMetrics.patches_require_reboot ? (
            <p className={`text-xs text-red-600 dark:text-red-400`}>{t('agentDetails.osPatchStatus.restartNeeded', undefined, 'System restart needed for updates')}</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>{t('agentDetails.osPatchStatus.noRestartNeeded', undefined, 'No restart needed')}</p>
          )}
        </div>
      </div>

      {/* Warning for security patches or reboot */}
      {((latestMetrics.security_patches_available || 0) > 0 || latestMetrics.patches_require_reboot) && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className={`text-sm font-medium text-yellow-800 dark:text-yellow-200`}>
                {(latestMetrics.security_patches_available || 0) > 0 && latestMetrics.patches_require_reboot
                  ? t('agentDetails.osPatchStatus.securityAndReboot', undefined, 'Security updates available and system reboot required')
                  : (latestMetrics.security_patches_available || 0) > 0
                  ? t('agentDetails.osPatchStatus.securityAvailable', undefined, 'Security updates available - please install as soon as possible')
                  : t('agentDetails.osPatchStatus.rebootRequired', undefined, 'System reboot required to complete updates')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
