import React from 'react';
import { Download, Info } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

export const PackageManagerStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || latestMetrics.package_managers_outdated === undefined) return null;

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Download className="w-5 h-5 mr-2" />
        Package Manager Status
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {/* Total Outdated */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Download className={`w-4 h-4 ${themeClasses.text.muted}`} />
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Outdated:</span>
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
            <p className={`text-xs ${themeClasses.text.muted}`}>All packages are up to date</p>
          ) : (
            <p className={`text-xs ${themeClasses.text.muted}`}>
              {latestMetrics.package_managers_outdated} package{latestMetrics.package_managers_outdated !== 1 ? 's' : ''} outdated
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
              {latestMetrics.homebrew_outdated === 0 ? 'Up to date' : `${latestMetrics.homebrew_outdated} outdated`}
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
              {latestMetrics.npm_outdated === 0 ? 'Up to date' : `${latestMetrics.npm_outdated} outdated`}
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
              {latestMetrics.pip_outdated === 0 ? 'Up to date' : `${latestMetrics.pip_outdated} outdated`}
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
                {latestMetrics.package_managers_outdated} outdated package{latestMetrics.package_managers_outdated !== 1 ? 's' : ''} detected
              </p>
              {latestMetrics.outdated_packages_data && Array.isArray(latestMetrics.outdated_packages_data) && latestMetrics.outdated_packages_data.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-blue-200 dark:border-blue-700">
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Package</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Installed</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Latest</th>
                        <th className="text-left py-1 px-2 font-semibold text-blue-900 dark:text-blue-100">Manager</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestMetrics.outdated_packages_data.slice(0, 10).map((pkg: any, idx: number) => (
                        <tr key={idx} className="border-b border-blue-100 dark:border-blue-800/50">
                          <td className="py-1 px-2 text-blue-800 dark:text-blue-200">{pkg.name}</td>
                          <td className="py-1 px-2 text-red-600 dark:text-red-400">{pkg.installed_version}</td>
                          <td className="py-1 px-2 text-green-600 dark:text-green-400">{pkg.latest_version}</td>
                          <td className="py-1 px-2 text-blue-800 dark:text-blue-200">{pkg.package_manager}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {latestMetrics.outdated_packages_data.length > 10 && (
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                      ...and {latestMetrics.outdated_packages_data.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
