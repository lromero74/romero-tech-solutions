import React, { useState, useEffect, useCallback } from 'react';
import { Package, Calendar, Rocket, Clock, AlertTriangle, Activity, Plus, RefreshCw, Filter, X, Eye, CheckCircle, XCircle, Loader } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { deploymentService, SoftwarePackage, DeploymentSchedule, PackageDeployment, DeploymentHistory } from '../../services/deploymentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import CreatePackageModal from './modals/CreatePackageModal';
import CreateScheduleModal from './modals/CreateScheduleModal';
import DeploymentWizard from './modals/DeploymentWizard';
import PackageDetailsModal from './modals/PackageDetailsModal';
import ScheduleDetailsModal from './modals/ScheduleDetailsModal';

interface SoftwareDeploymentDashboardProps {
  onViewPackageDetails?: (packageId: string) => void;
  onViewScheduleDetails?: (scheduleId: string) => void;
  onViewDeploymentDetails?: (deploymentId: string) => void;
}

const SoftwareDeploymentDashboard: React.FC<SoftwareDeploymentDashboardProps> = ({
  onViewPackageDetails,
  onViewScheduleDetails,
  onViewDeploymentDetails,
}) => {
  const [activeTab, setActiveTab] = useState<'packages' | 'schedules' | 'deployments' | 'history'>('packages');
  const [packages, setPackages] = useState<SoftwarePackage[]>([]);
  const [schedules, setSchedules] = useState<DeploymentSchedule[]>([]);
  const [deployments, setDeployments] = useState<PackageDeployment[]>([]);
  const [history, setHistory] = useState<DeploymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [packageTypeFilter, setPackageTypeFilter] = useState<string>('all');
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState<string>('all');

  // Modal states
  const [showCreatePackageModal, setShowCreatePackageModal] = useState(false);
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState(false);
  const [showCreateDeploymentModal, setShowCreateDeploymentModal] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  // Permission checks
  const { checkPermission, loading: permissionsLoading } = usePermission();
  const canViewPackages = checkPermission('view.software_packages.enable');
  const canManagePackages = checkPermission('manage.software_packages.enable');
  const canViewSchedules = checkPermission('view.deployment_schedules.enable');
  const canManageSchedules = checkPermission('manage.deployment_schedules.enable');
  const canViewDeployments = checkPermission('view.deployments.enable');
  const canManageDeployments = checkPermission('manage.deployments.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load packages
  const loadPackages = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewPackages) {
      setPermissionDenied({
        show: true,
        action: 'View Packages',
        requiredPermission: 'view.software_packages.enable',
        message: 'You do not have permission to view software packages'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await deploymentService.listPackages();
      if (response.success && response.data) {
        setPackages(response.data.packages);
      } else {
        setError(response.message || 'Failed to load packages');
      }
    } catch (err) {
      console.error('Error loading packages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [canViewPackages, permissionsLoading]);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewSchedules) {
      setPermissionDenied({
        show: true,
        action: 'View Schedules',
        requiredPermission: 'view.deployment_schedules.enable',
        message: 'You do not have permission to view deployment schedules'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await deploymentService.listSchedules();
      if (response.success && response.data) {
        setSchedules(response.data.schedules);
      } else {
        setError(response.message || 'Failed to load schedules');
      }
    } catch (err) {
      console.error('Error loading schedules:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [canViewSchedules, permissionsLoading]);

  // Load deployments
  const loadDeployments = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewDeployments) {
      setPermissionDenied({
        show: true,
        action: 'View Deployments',
        requiredPermission: 'view.deployments.enable',
        message: 'You do not have permission to view deployments'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await deploymentService.listDeployments({ limit: 100 });
      if (response.success && response.data) {
        setDeployments(response.data.deployments);
      } else {
        setError(response.message || 'Failed to load deployments');
      }
    } catch (err) {
      console.error('Error loading deployments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, [canViewDeployments, permissionsLoading]);

  // Load deployment history
  const loadHistory = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewDeployments) {
      setPermissionDenied({
        show: true,
        action: 'View History',
        requiredPermission: 'view.deployments.enable',
        message: 'You do not have permission to view deployment history'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await deploymentService.getDeploymentHistory({ limit: 100 });
      if (response.success && response.data) {
        setHistory(response.data.history);
      } else {
        setError(response.message || 'Failed to load history');
      }
    } catch (err) {
      console.error('Error loading history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [canViewDeployments, permissionsLoading]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'packages') {
      loadPackages();
    } else if (activeTab === 'schedules') {
      loadSchedules();
    } else if (activeTab === 'deployments') {
      loadDeployments();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadPackages, loadSchedules, loadDeployments, loadHistory]);

  // Get deployment status display
  const getDeploymentStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <CheckCircle className="w-3 h-3" />,
          label: 'Completed'
        };
      case 'failed':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <XCircle className="w-3 h-3" />,
          label: 'Failed'
        };
      case 'in_progress':
      case 'downloading':
      case 'installing':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          icon: <Loader className="w-3 h-3 animate-spin" />,
          label: 'In Progress'
        };
      case 'pending':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <Clock className="w-3 h-3" />,
          label: 'Pending'
        };
      case 'cancelled':
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <XCircle className="w-3 h-3" />,
          label: 'Cancelled'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <Activity className="w-3 h-3" />,
          label: 'Unknown'
        };
    }
  };

  // Filter packages
  const getFilteredPackages = (): SoftwarePackage[] => {
    let filtered = packages;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.package_name.toLowerCase().includes(search) ||
        pkg.publisher?.toLowerCase().includes(search) ||
        pkg.description?.toLowerCase().includes(search)
      );
    }

    if (packageTypeFilter !== 'all') {
      filtered = filtered.filter(pkg => pkg.package_type === packageTypeFilter);
    }

    return filtered;
  };

  // Filter schedules
  const getFilteredSchedules = (): DeploymentSchedule[] => {
    let filtered = schedules;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(schedule =>
        schedule.schedule_name.toLowerCase().includes(search) ||
        schedule.description?.toLowerCase().includes(search)
      );
    }

    return filtered;
  };

  // Filter deployments
  const getFilteredDeployments = (): PackageDeployment[] => {
    let filtered = deployments;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(deployment =>
        deployment.deployment_name?.toLowerCase().includes(search) ||
        deployment.package_name?.toLowerCase().includes(search) ||
        deployment.business_name?.toLowerCase().includes(search)
      );
    }

    if (deploymentStatusFilter !== 'all') {
      filtered = filtered.filter(deployment => deployment.deployment_status === deploymentStatusFilter);
    }

    return filtered;
  };

  // Filter history
  const getFilteredHistory = (): DeploymentHistory[] => {
    let filtered = history;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.package_name?.toLowerCase().includes(search) ||
        item.agent_name?.toLowerCase().includes(search)
      );
    }

    if (deploymentStatusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === deploymentStatusFilter);
    }

    return filtered;
  };

  const filteredPackages = getFilteredPackages();
  const filteredSchedules = getFilteredSchedules();
  const filteredDeployments = getFilteredDeployments();
  const filteredHistory = getFilteredHistory();

  // Stats for packages
  const packageStats = {
    total: packages.length,
    approved: packages.filter(p => p.is_approved).length,
    msi: packages.filter(p => p.package_type === 'msi').length,
    deb: packages.filter(p => p.package_type === 'deb').length,
    rpm: packages.filter(p => p.package_type === 'rpm').length,
  };

  // Stats for schedules
  const scheduleStats = {
    total: schedules.length,
    active: schedules.filter(s => s.is_active).length,
    daily: schedules.filter(s => s.schedule_type === 'daily').length,
    weekly: schedules.filter(s => s.schedule_type === 'weekly').length,
  };

  // Stats for deployments
  const deploymentStats = {
    total: deployments.length,
    completed: deployments.filter(d => d.deployment_status === 'completed').length,
    failed: deployments.filter(d => d.deployment_status === 'failed').length,
    in_progress: deployments.filter(d => d.deployment_status === 'in_progress').length,
    pending: deployments.filter(d => d.deployment_status === 'pending').length,
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Software Deployment</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Software Deployment</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              if (activeTab === 'packages') loadPackages();
              else if (activeTab === 'schedules') loadSchedules();
              else if (activeTab === 'deployments') loadDeployments();
              else if (activeTab === 'history') loadHistory();
            }}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {activeTab === 'packages' && canManagePackages && (
            <button
              onClick={() => setShowCreatePackageModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Package
            </button>
          )}
          {activeTab === 'schedules' && canManageSchedules && (
            <button
              onClick={() => setShowCreateScheduleModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Schedule
            </button>
          )}
          {activeTab === 'deployments' && canManageDeployments && (
            <button
              onClick={() => setShowCreateDeploymentModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Deployment
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={`${themeClasses.bg.card} rounded-lg ${themeClasses.shadow.md} border ${themeClasses.border.primary}`}>
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('packages')}
              className={`${
                activeTab === 'packages'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Package className="w-5 h-5 mr-2" />
                Packages ({packageStats.total})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`${
                activeTab === 'schedules'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Schedules ({scheduleStats.total})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
              className={`${
                activeTab === 'deployments'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Rocket className="w-5 h-5 mr-2" />
                Deployments ({deploymentStats.total})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`${
                activeTab === 'history'
                  ? 'border-gray-500 text-gray-600 dark:text-gray-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                History ({history.length})
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Summary Stats for Active Tab */}
      {activeTab === 'packages' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Packages</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{packageStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Approved</div>
            <div className="text-2xl font-bold text-green-600">{packageStats.approved}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>MSI</div>
            <div className="text-2xl font-bold text-blue-600">{packageStats.msi}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>DEB</div>
            <div className="text-2xl font-bold text-purple-600">{packageStats.deb}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>RPM</div>
            <div className="text-2xl font-bold text-orange-600">{packageStats.rpm}</div>
          </div>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Schedules</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{scheduleStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Active</div>
            <div className="text-2xl font-bold text-green-600">{scheduleStats.active}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Daily</div>
            <div className="text-2xl font-bold text-blue-600">{scheduleStats.daily}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Weekly</div>
            <div className="text-2xl font-bold text-purple-600">{scheduleStats.weekly}</div>
          </div>
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Deployments</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{deploymentStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Completed</div>
            <div className="text-2xl font-bold text-green-600">{deploymentStats.completed}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failed</div>
            <div className="text-2xl font-bold text-red-600">{deploymentStats.failed}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>In Progress</div>
            <div className="text-2xl font-bold text-blue-600">{deploymentStats.in_progress}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{deploymentStats.pending}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4 flex items-center`}>
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          {activeTab === 'packages' && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Package Type</label>
              <select
                value={packageTypeFilter}
                onChange={(e) => setPackageTypeFilter(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
              >
                <option value="all">All Types</option>
                <option value="msi">MSI</option>
                <option value="exe">EXE</option>
                <option value="deb">DEB</option>
                <option value="rpm">RPM</option>
                <option value="pkg">PKG</option>
                <option value="dmg">DMG</option>
              </select>
            </div>
          )}
          {(activeTab === 'deployments' || activeTab === 'history') && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Status</label>
              <select
                value={deploymentStatusFilter}
                onChange={(e) => setDeploymentStatusFilter(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setPackageTypeFilter('all');
                setDeploymentStatusFilter('all');
              }}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading data...</p>
        </div>
      )}

      {/* Packages Table */}
      {!loading && activeTab === 'packages' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Package Name
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Version
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Publisher
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Deployments
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredPackages.map((pkg) => (
                  <tr key={pkg.id} className={themeClasses.bg.hover}>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600`}>
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="ml-4">
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                            {pkg.package_name}
                          </div>
                          {pkg.description && (
                            <div className={`text-xs ${themeClasses.text.secondary}`}>{pkg.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                      {pkg.package_version || 'N/A'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200`}>
                        {pkg.package_type.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                      {pkg.publisher || 'N/A'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                      {pkg.deployment_count}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        pkg.is_approved
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                      }`}>
                        {pkg.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                      <button
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="View package details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {filteredPackages.length === 0 && (
            <div className="p-8 text-center">
              <Package className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No packages found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Schedules Table */}
      {!loading && activeTab === 'schedules' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Schedule Name
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Window
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Duration
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id} className={themeClasses.bg.hover}>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {schedule.schedule_name}
                      </div>
                      {schedule.description && (
                        <div className={`text-xs ${themeClasses.text.secondary}`}>{schedule.description}</div>
                      )}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200`}>
                        {schedule.schedule_type}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                      {schedule.start_time && schedule.end_time
                        ? `${schedule.start_time} - ${schedule.end_time}`
                        : 'N/A'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                      {schedule.window_duration_minutes} min
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        schedule.is_active
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                      }`}>
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                      <button
                        onClick={() => setSelectedScheduleId(schedule.id)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="View schedule details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {filteredSchedules.length === 0 && (
            <div className="p-8 text-center">
              <Calendar className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No schedules found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Deployments Table */}
      {!loading && activeTab === 'deployments' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Deployment
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Package
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Scope
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Progress
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredDeployments.map((deployment) => {
                  const statusDisplay = getDeploymentStatusDisplay(deployment.deployment_status);
                  return (
                    <tr key={deployment.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {deployment.deployment_name || 'Unnamed Deployment'}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {deployment.package_name} {deployment.package_version}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {deployment.deployment_scope.replace('_', ' ')}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                        {deployment.successful_installs + deployment.failed_installs}/{deployment.total_agents}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <button
                          onClick={() => onViewDeploymentDetails?.(deployment.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View deployment details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {filteredDeployments.length === 0 && (
            <div className="p-8 text-center">
              <Rocket className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No deployments found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* History Table */}
      {!loading && activeTab === 'history' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Package
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Agent
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Started
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredHistory.map((item) => {
                  const statusDisplay = getDeploymentStatusDisplay(item.status);
                  return (
                    <tr key={item.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {item.package_name} {item.package_version}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {item.agent_name || 'N/A'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
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

          {/* Empty state */}
          {filteredHistory.length === 0 && (
            <div className="p-8 text-center">
              <Clock className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No history found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />

      {/* Create Package Modal */}
      <CreatePackageModal
        isOpen={showCreatePackageModal}
        onClose={() => setShowCreatePackageModal(false)}
        onSuccess={() => {
          loadPackages(); // Reload the packages list
          setShowCreatePackageModal(false);
        }}
      />

      {/* Create Schedule Modal */}
      <CreateScheduleModal
        isOpen={showCreateScheduleModal}
        onClose={() => setShowCreateScheduleModal(false)}
        onSuccess={() => {
          loadSchedules(); // Reload the schedules list
          setShowCreateScheduleModal(false);
        }}
      />

      {/* Deployment Wizard */}
      <DeploymentWizard
        isOpen={showCreateDeploymentModal}
        onClose={() => setShowCreateDeploymentModal(false)}
        onSuccess={() => {
          loadDeployments(); // Reload the deployments list
          setShowCreateDeploymentModal(false);
        }}
      />

      {/* Package Details Modal */}
      {selectedPackageId && (
        <PackageDetailsModal
          isOpen={!!selectedPackageId}
          onClose={() => setSelectedPackageId(null)}
          packageId={selectedPackageId}
        />
      )}

      {/* Schedule Details Modal */}
      {selectedScheduleId && (
        <ScheduleDetailsModal
          isOpen={!!selectedScheduleId}
          onClose={() => setSelectedScheduleId(null)}
          scheduleId={selectedScheduleId}
        />
      )}
    </div>
  );
};

export default SoftwareDeploymentDashboard;
