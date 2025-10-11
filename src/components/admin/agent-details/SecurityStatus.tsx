import React from 'react';
import { Shield, Circle, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { AgentDetailsComponentProps } from './types';

export const SecurityStatus: React.FC<AgentDetailsComponentProps> = ({ latestMetrics }) => {
  if (!latestMetrics || latestMetrics.security_products_count === null || latestMetrics.security_products_count === undefined || latestMetrics.security_products_count === 0) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-4 flex items-center`}>
        <Shield className="w-5 h-5 mr-2" />
        Security & Antivirus Status
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
        {/* Antivirus Installed */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Antivirus:</span>
            <span className={`text-lg font-bold ${
              latestMetrics.antivirus_installed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.antivirus_installed ? 'Installed' : 'Missing'}
            </span>
          </div>
          {!latestMetrics.antivirus_installed && (
            <p className={`text-xs text-red-600`}>
              No antivirus detected!
            </p>
          )}
        </div>

        {/* Antivirus Enabled */}
        {latestMetrics.antivirus_installed && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>AV Protection:</span>
              <span className={`text-lg font-bold ${
                latestMetrics.antivirus_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {latestMetrics.antivirus_enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
            {!latestMetrics.antivirus_enabled && (
              <p className={`text-xs text-red-600`}>
                Antivirus is not running
              </p>
            )}
          </div>
        )}

        {/* Definitions Up to Date */}
        {latestMetrics.antivirus_enabled && (
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Definitions:</span>
              <span className={`text-lg font-bold ${
                latestMetrics.antivirus_up_to_date ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {latestMetrics.antivirus_up_to_date ? 'Current' : 'Outdated'}
              </span>
            </div>
            {!latestMetrics.antivirus_up_to_date && (
              <p className={`text-xs text-red-600`}>
                Update virus definitions
              </p>
            )}
          </div>
        )}

        {/* Firewall Status */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Firewall:</span>
            <span className={`text-lg font-bold ${
              latestMetrics.firewall_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {latestMetrics.firewall_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {!latestMetrics.firewall_enabled && (
            <p className={`text-xs text-red-600`}>
              Firewall is not active
            </p>
          )}
        </div>
      </div>

      {/* Security Products List */}
      {latestMetrics.security_data && Array.isArray(latestMetrics.security_data) && latestMetrics.security_data.length > 0 && (
        <div className="space-y-2">
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
            Detected Security Products ({latestMetrics.security_products_count})
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
                      {product.detection_method && ` • ${product.detection_method}`}
                    </p>
                    {product.error_message && (
                      <p className={`text-xs ${
                        !product.is_enabled ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                      } mt-1`}>
                        {product.error_message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {product.is_enabled && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 rounded text-xs">
                      Enabled
                    </span>
                  )}
                  {product.product_type === 'antivirus' && product.real_time_protection && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 rounded text-xs">
                      Real-Time
                    </span>
                  )}
                  {product.product_type === 'antivirus' && !product.definitions_up_to_date && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 rounded text-xs">
                      Outdated
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    product.is_running ? 'bg-green-100 text-green-800 dark:bg-green-900/20' :
                    product.is_enabled ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20' :
                    'bg-red-100 text-red-800 dark:bg-red-900/20'
                  }`}>
                    {product.is_running ? 'RUNNING' : product.is_enabled ? 'STOPPED' : 'DISABLED'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Critical Security Warnings */}
      {latestMetrics.security_issues_count > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {latestMetrics.security_issues_count} security issue{latestMetrics.security_issues_count !== 1 ? 's' : ''} detected
              </p>
              <p className="text-xs mt-1 text-red-700 dark:text-red-300">
                {!latestMetrics.antivirus_installed && 'No antivirus software installed. '}
                {latestMetrics.antivirus_installed && !latestMetrics.antivirus_enabled && 'Antivirus is disabled. '}
                {latestMetrics.antivirus_enabled && !latestMetrics.antivirus_up_to_date && 'Antivirus definitions are out of date. '}
                {!latestMetrics.firewall_enabled && 'Firewall is disabled. '}
                Address these security concerns immediately to protect the system.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
