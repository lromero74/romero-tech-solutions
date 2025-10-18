import React, { useState, useEffect } from 'react';
import { X, Package, Tag, Download, CheckCircle, Shield, AlertTriangle, Calendar, BarChart } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { deploymentService, SoftwarePackage, DeploymentHistory } from '../../../services/deploymentService';

interface PackageDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageId: string;
}

const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({ isOpen, onClose, packageId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<SoftwarePackage | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<DeploymentHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  useEffect(() => {
    if (isOpen && packageId) {
      loadPackageData();
    }
  }, [isOpen, packageId]);

  const loadPackageData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load package details and deployment history in parallel
      const [packageResponse, historyResponse] = await Promise.all([
        deploymentService.getPackage(packageId),
        deploymentService.getDeploymentHistory({ limit: 50 }),
      ]);

      if (packageResponse.success && packageResponse.data) {
        setPkg(packageResponse.data as SoftwarePackage);
      } else {
        setError(packageResponse.message || 'Failed to load package details');
      }

      if (historyResponse.success && historyResponse.data) {
        // Filter history for this package
        const pkgHistory = historyResponse.data.history.filter(h => h.package_id === packageId);
        setDeploymentHistory(pkgHistory);
      }
    } catch (err) {
      console.error('Error loading package data:', err);
      setError('An error occurred while loading package data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed':
        return { color: 'text-green-600', label: 'Completed' };
      case 'failed':
        return { color: 'text-red-600', label: 'Failed' };
      case 'downloading':
      case 'installing':
        return { color: 'text-blue-600', label: 'In Progress' };
      case 'pending':
        return { color: 'text-yellow-600', label: 'Pending' };
      case 'cancelled':
        return { color: 'text-gray-600', label: 'Cancelled' };
      default:
        return { color: 'text-gray-600', label: 'Unknown' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Package Details</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('details')}
              className={`${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Package className="w-4 h-4 mr-2" />
                Details
              </div>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <BarChart className="w-4 h-4 mr-2" />
                Deployment History ({deploymentHistory.length})
              </div>
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!loading && !error && pkg && (
            <>
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Package Header */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                        {pkg.package_name} {pkg.package_version && `v${pkg.package_version}`}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        pkg.is_approved
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                      }`}>
                        {pkg.is_approved ? 'Approved' : 'Pending Approval'}
                      </span>
                      {pkg.is_public && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                          Public
                        </span>
                      )}
                    </div>
                    {pkg.description && (
                      <p className={`${themeClasses.text.secondary}`}>{pkg.description}</p>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Package Type</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary} uppercase`}>{pkg.package_type}</p>
                    </div>

                    {pkg.publisher && (
                      <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-4 h-4 text-green-600" />
                          <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Publisher</span>
                        </div>
                        <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>{pkg.publisher}</p>
                      </div>
                    )}

                    {pkg.package_category && (
                      <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-4 h-4 text-purple-600" />
                          <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Category</span>
                        </div>
                        <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>{pkg.package_category}</p>
                      </div>
                    )}

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Download className="w-4 h-4 text-orange-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Source Type</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary} capitalize`}>{pkg.source_type}</p>
                    </div>
                  </div>

                  {/* Deployment Stats */}
                  <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                    <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-3`}>Deployment Statistics</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{pkg.deployment_count}</div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>Total Deployments</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-2xl font-bold text-green-600">{pkg.success_count}</span>
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>Successful</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">
                          {pkg.deployment_count - pkg.success_count}
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>Failed</div>
                      </div>
                    </div>
                    {pkg.deployment_count > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className={themeClasses.text.secondary}>Success Rate</span>
                          <span className={themeClasses.text.primary}>
                            {Math.round((pkg.success_count / pkg.deployment_count) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{
                              width: `${(pkg.success_count / pkg.deployment_count) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Platform Compatibility */}
                  <div>
                    <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Supported Platforms</h4>
                    <div className="flex flex-wrap gap-2">
                      {pkg.supported_os && pkg.supported_os.map((os) => (
                        <span
                          key={os}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 capitalize"
                        >
                          {os}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Source URL */}
                  {pkg.source_url && (
                    <div>
                      <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Source URL</h4>
                      <div className={`p-3 rounded-lg ${themeClasses.bg.secondary} break-all`}>
                        <code className={`text-sm ${themeClasses.text.primary}`}>{pkg.source_url}</code>
                      </div>
                    </div>
                  )}

                  {/* Checksum */}
                  {pkg.checksum_value && (
                    <div>
                      <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                        Checksum ({pkg.checksum_type.toUpperCase()})
                      </h4>
                      <div className={`p-3 rounded-lg ${themeClasses.bg.secondary} break-all`}>
                        <code className={`text-xs ${themeClasses.text.primary} font-mono`}>{pkg.checksum_value}</code>
                      </div>
                    </div>
                  )}

                  {/* Install Command */}
                  {pkg.install_command && (
                    <div>
                      <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Custom Install Command</h4>
                      <div className={`p-3 rounded-lg ${themeClasses.bg.secondary}`}>
                        <code className={`text-sm ${themeClasses.text.primary} font-mono`}>{pkg.install_command}</code>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {pkg.tags && pkg.tags.length > 0 && (
                    <div>
                      <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {pkg.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
                          >
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Configuration Flags */}
                  <div>
                    <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Configuration Flags</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className={`flex items-center gap-2 px-3 py-2 rounded ${pkg.requires_elevated ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <Shield className={`w-4 h-4 ${pkg.requires_elevated ? 'text-yellow-600' : 'text-gray-400'}`} />
                        <span className={`text-sm ${pkg.requires_elevated ? 'text-yellow-800 dark:text-yellow-200' : themeClasses.text.secondary}`}>
                          Requires Elevation
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded ${pkg.requires_reboot ? 'bg-orange-100 dark:bg-orange-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <AlertTriangle className={`w-4 h-4 ${pkg.requires_reboot ? 'text-orange-600' : 'text-gray-400'}`} />
                        <span className={`text-sm ${pkg.requires_reboot ? 'text-orange-800 dark:text-orange-200' : themeClasses.text.secondary}`}>
                          Requires Reboot
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Created Info */}
                  <div className={`text-sm ${themeClasses.text.secondary}`}>
                    Created {pkg.created_by_name && `by ${pkg.created_by_name}`} on {new Date(pkg.created_at).toLocaleString()}
                    {pkg.last_deployed_at && (
                      <div className="mt-1">
                        Last deployed: {new Date(pkg.last_deployed_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Deployment History</h3>

                  {deploymentHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className={themeClasses.bg.secondary}>
                          <tr>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Agent
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Status
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Started At
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Completed At
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                          {deploymentHistory.map((item) => {
                            const statusDisplay = getStatusDisplay(item.status);
                            return (
                              <tr key={item.id}>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                                  {item.agent_name || 'N/A'}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap`}>
                                  <span className={`text-sm font-medium ${statusDisplay.color}`}>
                                    {statusDisplay.label}
                                  </span>
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                  {new Date(item.started_at).toLocaleString()}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                  {item.completed_at ? new Date(item.completed_at).toLocaleString() : 'In Progress'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
                      No deployment history found for this package.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageDetailsModal;
