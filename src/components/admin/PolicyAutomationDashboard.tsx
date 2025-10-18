import React, { useState, useEffect, useCallback } from 'react';
import { Code, FileCode, Play, Clock, AlertTriangle, Activity, Plus, RefreshCw, Filter, X, Eye, CheckCircle, XCircle, Loader, UserPlus } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { automationService, AutomationScript, AutomationPolicy, PolicyExecutionHistory } from '../../services/automationService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';
import CreateScriptModal from './modals/CreateScriptModal';
import CreatePolicyModal from './modals/CreatePolicyModal';
import ScriptDetailsModal from './modals/ScriptDetailsModal';
import PolicyDetailsModal from './modals/PolicyDetailsModal';
import AssignPolicyModal from './modals/AssignPolicyModal';
import ExecutionDetailsModal from './modals/ExecutionDetailsModal';

interface PolicyAutomationDashboardProps {
  onViewScriptDetails?: (scriptId: string) => void;
  onViewPolicyDetails?: (policyId: string) => void;
}

const PolicyAutomationDashboard: React.FC<PolicyAutomationDashboardProps> = ({
  onViewScriptDetails,
  onViewPolicyDetails,
}) => {
  const [activeTab, setActiveTab] = useState<'scripts' | 'policies' | 'executions'>('scripts');
  const [scripts, setScripts] = useState<AutomationScript[]>([]);
  const [policies, setPolicies] = useState<AutomationPolicy[]>([]);
  const [executions, setExecutions] = useState<PolicyExecutionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scriptTypeFilter, setScriptTypeFilter] = useState<string>('all');
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
  const [showCreateScriptModal, setShowCreateScriptModal] = useState(false);
  const [showCreatePolicyModal, setShowCreatePolicyModal] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [showAssignPolicyModal, setShowAssignPolicyModal] = useState(false);
  const [policyToAssign, setPolicyToAssign] = useState<{ id: string; name: string } | null>(null);

  // Permission checks
  const { checkPermission, loading: permissionsLoading } = usePermission();
  const canViewScripts = checkPermission('view.automation_scripts.enable');
  const canManageScripts = checkPermission('manage.automation_scripts.enable');
  const canViewPolicies = checkPermission('view.automation_policies.enable');
  const canManagePolicies = checkPermission('manage.automation_policies.enable');
  const canViewExecutions = checkPermission('view.policy_executions.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load scripts
  const loadScripts = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewScripts) {
      setPermissionDenied({
        show: true,
        action: 'View Scripts',
        requiredPermission: 'view.automation_scripts.enable',
        message: 'You do not have permission to view automation scripts'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await automationService.listScripts();
      if (response.success && response.data) {
        setScripts(response.data.scripts);
      } else {
        setError(response.message || 'Failed to load scripts');
      }
    } catch (err) {
      console.error('Error loading scripts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, [canViewScripts, permissionsLoading]);

  // Load policies
  const loadPolicies = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewPolicies) {
      setPermissionDenied({
        show: true,
        action: 'View Policies',
        requiredPermission: 'view.automation_policies.enable',
        message: 'You do not have permission to view automation policies'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await automationService.listPolicies();
      if (response.success && response.data) {
        setPolicies(response.data.policies);
      } else {
        setError(response.message || 'Failed to load policies');
      }
    } catch (err) {
      console.error('Error loading policies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, [canViewPolicies, permissionsLoading]);

  // Load execution history
  const loadExecutions = useCallback(async () => {
    if (permissionsLoading) return;

    if (!canViewExecutions) {
      setPermissionDenied({
        show: true,
        action: 'View Executions',
        requiredPermission: 'view.policy_executions.enable',
        message: 'You do not have permission to view policy execution history'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await automationService.getExecutionHistory({ limit: 100 });
      if (response.success && response.data) {
        setExecutions(response.data.executions);
      } else {
        setError(response.message || 'Failed to load execution history');
      }
    } catch (err) {
      console.error('Error loading executions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, [canViewExecutions, permissionsLoading]);

  // Load all data on mount to populate tab counts
  useEffect(() => {
    if (!permissionsLoading) {
      // Load all data in parallel to show accurate counts in tabs
      Promise.all([
        loadScripts(),
        loadPolicies(),
        loadExecutions(),
      ]).catch(err => {
        console.error('Error loading initial data:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'scripts') {
      loadScripts();
    } else if (activeTab === 'policies') {
      loadPolicies();
    } else if (activeTab === 'executions') {
      loadExecutions();
    }
  }, [activeTab, loadScripts, loadPolicies, loadExecutions]);

  // Get script type icon
  const getScriptTypeIcon = (scriptType: string) => {
    switch (scriptType) {
      case 'bash':
        return <Code className="w-5 h-5" />;
      case 'powershell':
        return <FileCode className="w-5 h-5" />;
      case 'python':
        return <Code className="w-5 h-5" />;
      case 'node':
        return <FileCode className="w-5 h-5" />;
      default:
        return <Code className="w-5 h-5" />;
    }
  };

  // Get execution status display
  const getExecutionStatusDisplay = (status: string) => {
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
      case 'running':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          icon: <Loader className="w-3 h-3 animate-spin" />,
          label: 'Running'
        };
      case 'timeout':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <Clock className="w-3 h-3" />,
          label: 'Timeout'
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

  // Filter scripts
  const getFilteredScripts = (): AutomationScript[] => {
    let filtered = scripts;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(script =>
        script.script_name.toLowerCase().includes(search) ||
        script.description?.toLowerCase().includes(search)
      );
    }

    if (scriptTypeFilter !== 'all') {
      filtered = filtered.filter(script => script.script_type === scriptTypeFilter);
    }

    return filtered;
  };

  // Filter policies
  const getFilteredPolicies = (): AutomationPolicy[] => {
    let filtered = policies;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(policy =>
        policy.policy_name.toLowerCase().includes(search) ||
        policy.description?.toLowerCase().includes(search)
      );
    }

    if (policyTypeFilter !== 'all') {
      filtered = filtered.filter(policy => policy.policy_type === policyTypeFilter);
    }

    return filtered;
  };

  // Filter executions
  const getFilteredExecutions = (): PolicyExecutionHistory[] => {
    let filtered = executions;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(execution =>
        execution.policy_name?.toLowerCase().includes(search) ||
        execution.script_name?.toLowerCase().includes(search) ||
        execution.agent_name?.toLowerCase().includes(search)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(execution => execution.status === statusFilter);
    }

    return filtered;
  };

  const filteredScripts = getFilteredScripts();
  const filteredPolicies = getFilteredPolicies();
  const filteredExecutions = getFilteredExecutions();

  // Stats for scripts
  const scriptStats = {
    total: scripts.length,
    bash: scripts.filter(s => s.script_type === 'bash').length,
    powershell: scripts.filter(s => s.script_type === 'powershell').length,
    python: scripts.filter(s => s.script_type === 'python').length,
    builtin: scripts.filter(s => s.is_builtin).length,
  };

  // Stats for policies
  const policyStats = {
    total: policies.length,
    enabled: policies.filter(p => p.enabled).length,
    disabled: policies.filter(p => !p.enabled).length,
    scheduled: policies.filter(p => p.execution_mode === 'scheduled').length,
  };

  // Stats for executions
  const executionStats = {
    total: executions.length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'failed').length,
    running: executions.filter(e => e.status === 'running').length,
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Policy Automation</h1>
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
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Policy Automation</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              if (activeTab === 'scripts') loadScripts();
              else if (activeTab === 'policies') loadPolicies();
              else if (activeTab === 'executions') loadExecutions();
            }}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {activeTab === 'scripts' && canManageScripts && (
            <button
              onClick={() => setShowCreateScriptModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Script
            </button>
          )}
          {activeTab === 'policies' && canManagePolicies && (
            <button
              onClick={() => setShowCreatePolicyModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Policy
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={`${themeClasses.bg.card} rounded-lg ${themeClasses.shadow.md} border ${themeClasses.border.primary}`}>
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('scripts')}
              className={`${
                activeTab === 'scripts'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Code className="w-5 h-5 mr-2" />
                Scripts ({scriptStats.total})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('policies')}
              className={`${
                activeTab === 'policies'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <FileCode className="w-5 h-5 mr-2" />
                Policies ({policyStats.total})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('executions')}
              className={`${
                activeTab === 'executions'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Play className="w-5 h-5 mr-2" />
                Execution History ({executionStats.total})
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Summary Stats for Active Tab */}
      {activeTab === 'scripts' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Scripts</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{scriptStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Bash</div>
            <div className="text-2xl font-bold text-green-600">{scriptStats.bash}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>PowerShell</div>
            <div className="text-2xl font-bold text-blue-600">{scriptStats.powershell}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Python</div>
            <div className="text-2xl font-bold text-yellow-600">{scriptStats.python}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Built-in</div>
            <div className="text-2xl font-bold text-purple-600">{scriptStats.builtin}</div>
          </div>
        </div>
      )}

      {activeTab === 'policies' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Policies</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{policyStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Enabled</div>
            <div className="text-2xl font-bold text-green-600">{policyStats.enabled}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Disabled</div>
            <div className="text-2xl font-bold text-gray-600">{policyStats.disabled}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Scheduled</div>
            <div className="text-2xl font-bold text-blue-600">{policyStats.scheduled}</div>
          </div>
        </div>
      )}

      {activeTab === 'executions' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Executions</div>
            <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{executionStats.total}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Completed</div>
            <div className="text-2xl font-bold text-green-600">{executionStats.completed}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Failed</div>
            <div className="text-2xl font-bold text-red-600">{executionStats.failed}</div>
          </div>
          <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
            <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Running</div>
            <div className="text-2xl font-bold text-blue-600">{executionStats.running}</div>
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
          {activeTab === 'scripts' && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Script Type</label>
              <select
                value={scriptTypeFilter}
                onChange={(e) => setScriptTypeFilter(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
              >
                <option value="all">All Types</option>
                <option value="bash">Bash</option>
                <option value="powershell">PowerShell</option>
                <option value="python">Python</option>
                <option value="node">Node.js</option>
              </select>
            </div>
          )}
          {activeTab === 'policies' && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Policy Type</label>
              <select
                value={policyTypeFilter}
                onChange={(e) => setPolicyTypeFilter(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
              >
                <option value="all">All Types</option>
                <option value="script_execution">Script Execution</option>
                <option value="config_enforcement">Config Enforcement</option>
                <option value="compliance_check">Compliance Check</option>
                <option value="maintenance_task">Maintenance Task</option>
              </select>
            </div>
          )}
          {activeTab === 'executions' && (
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="timeout">Timeout</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setScriptTypeFilter('all');
                setPolicyTypeFilter('all');
                setStatusFilter('all');
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

      {/* Scripts Table */}
      {!loading && activeTab === 'scripts' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Script Name
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Category
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Executions
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Success Rate
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredScripts.map((script) => {
                  const successRate = script.execution_count > 0
                    ? Math.round((script.success_count / script.execution_count) * 100)
                    : 0;
                  return (
                    <tr key={script.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600`}>
                            {getScriptTypeIcon(script.script_type)}
                          </div>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {script.script_name}
                              {script.is_builtin && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                                  Built-in
                                </span>
                              )}
                            </div>
                            {script.description && (
                              <div className={`text-xs ${themeClasses.text.secondary}`}>{script.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200`}>
                          {script.script_type}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {script.category_name || 'Uncategorized'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                        {script.execution_count}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                        {script.execution_count > 0 ? `${successRate}%` : 'N/A'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <button
                          onClick={() => setSelectedScriptId(script.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View script details"
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
          {filteredScripts.length === 0 && (
            <div className="p-8 text-center">
              <Code className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No scripts found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Policies Table */}
      {!loading && activeTab === 'policies' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Policy Name
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Execution Mode
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
                {filteredPolicies.map((policy) => (
                  <tr key={policy.id} className={themeClasses.bg.hover}>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {policy.policy_name}
                      </div>
                      {policy.description && (
                        <div className={`text-xs ${themeClasses.text.secondary}`}>{policy.description}</div>
                      )}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200`}>
                        {policy.policy_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                      {policy.execution_mode}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        policy.enabled
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                      }`}>
                        {policy.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedPolicyId(policy.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View policy details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canManagePolicies && (
                          <button
                            onClick={() => {
                              setPolicyToAssign({ id: policy.id, name: policy.policy_name });
                              setShowAssignPolicyModal(true);
                            }}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                            title="Assign policy to agent or business"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {filteredPolicies.length === 0 && (
            <div className="p-8 text-center">
              <FileCode className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No policies found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Executions Table */}
      {!loading && activeTab === 'executions' && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Policy / Script
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Agent
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Duration
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Started At
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredExecutions.map((execution) => {
                  const statusDisplay = getExecutionStatusDisplay(execution.status);
                  return (
                    <tr key={execution.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                          {execution.policy_name || execution.script_name || 'N/A'}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {execution.agent_name || 'N/A'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                        {execution.execution_duration_seconds
                          ? `${execution.execution_duration_seconds}s`
                          : 'N/A'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                        {new Date(execution.started_at).toLocaleString()}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <button
                          onClick={() => setSelectedExecutionId(execution.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View execution details"
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
          {filteredExecutions.length === 0 && (
            <div className="p-8 text-center">
              <Play className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No executions found matching your filters.</p>
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

      {/* Create Script Modal */}
      <CreateScriptModal
        isOpen={showCreateScriptModal}
        onClose={() => setShowCreateScriptModal(false)}
        onSuccess={() => {
          loadScripts(); // Reload the scripts list
          setShowCreateScriptModal(false);
        }}
      />

      {/* Create Policy Modal */}
      <CreatePolicyModal
        isOpen={showCreatePolicyModal}
        onClose={() => setShowCreatePolicyModal(false)}
        onSuccess={() => {
          loadPolicies(); // Reload the policies list
          setShowCreatePolicyModal(false);
        }}
      />

      {/* Script Details Modal */}
      {selectedScriptId && (
        <ScriptDetailsModal
          isOpen={!!selectedScriptId}
          onClose={() => setSelectedScriptId(null)}
          scriptId={selectedScriptId}
        />
      )}

      {/* Policy Details Modal */}
      {selectedPolicyId && (
        <PolicyDetailsModal
          isOpen={!!selectedPolicyId}
          onClose={() => setSelectedPolicyId(null)}
          policyId={selectedPolicyId}
        />
      )}

      {/* Assign Policy Modal */}
      {policyToAssign && (
        <AssignPolicyModal
          isOpen={showAssignPolicyModal}
          onClose={() => {
            setShowAssignPolicyModal(false);
            setPolicyToAssign(null);
          }}
          policyId={policyToAssign.id}
          policyName={policyToAssign.name}
          onSuccess={() => {
            loadPolicies(); // Refresh policies list
            setShowAssignPolicyModal(false);
            setPolicyToAssign(null);
          }}
        />
      )}

      {/* Execution Details Modal */}
      {selectedExecutionId && (
        <ExecutionDetailsModal
          isOpen={!!selectedExecutionId}
          onClose={() => setSelectedExecutionId(null)}
          executionId={selectedExecutionId}
        />
      )}
    </div>
  );
};

export default PolicyAutomationDashboard;
