import React, { useState, useEffect } from 'react';
import { X, FileCode, Calendar, Play, Settings, Target, Clock, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService, AutomationPolicy, PolicyAssignment, PolicyExecutionHistory } from '../../../services/automationService';

interface PolicyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyId: string;
}

const PolicyDetailsModal: React.FC<PolicyDetailsModalProps> = ({ isOpen, onClose, policyId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AutomationPolicy | null>(null);
  const [assignments, setAssignments] = useState<PolicyAssignment[]>([]);
  const [executions, setExecutions] = useState<PolicyExecutionHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'assignments' | 'history'>('details');
  const [removingAssignment, setRemovingAssignment] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && policyId) {
      loadPolicyData();
    }
  }, [isOpen, policyId]);

  const loadPolicyData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load policy details, assignments, and execution history in parallel
      const [policyResponse, assignmentsResponse, executionsResponse] = await Promise.all([
        automationService.getPolicy(policyId),
        automationService.getPolicyAssignments(policyId),
        automationService.getExecutionHistory({ policy_id: policyId, limit: 50 }),
      ]);

      if (policyResponse.success && policyResponse.data) {
        setPolicy(policyResponse.data as AutomationPolicy);
      } else {
        setError(policyResponse.message || 'Policy not found');
      }

      if (assignmentsResponse.success && assignmentsResponse.data) {
        setAssignments(assignmentsResponse.data.assignments);
      }

      if (executionsResponse.success && executionsResponse.data) {
        setExecutions(executionsResponse.data.executions);
      }
    } catch (err) {
      console.error('Error loading policy data:', err);
      setError('An error occurred while loading policy data');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this policy assignment?')) {
      return;
    }

    try {
      setRemovingAssignment(assignmentId);
      const response = await automationService.removePolicyAssignment(policyId, assignmentId);

      if (response.success) {
        // Remove from local state
        setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      } else {
        setError(response.message || 'Failed to remove assignment');
      }
    } catch (err) {
      console.error('Error removing assignment:', err);
      setError('An error occurred while removing the assignment');
    } finally {
      setRemovingAssignment(null);
    }
  };

  const getExecutionStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed':
        return { color: 'text-green-600', icon: <CheckCircle className="w-4 h-4" />, label: 'Completed' };
      case 'failed':
        return { color: 'text-red-600', icon: <XCircle className="w-4 h-4" />, label: 'Failed' };
      case 'running':
        return { color: 'text-blue-600', icon: <Play className="w-4 h-4 animate-pulse" />, label: 'Running' };
      case 'timeout':
        return { color: 'text-yellow-600', icon: <Clock className="w-4 h-4" />, label: 'Timeout' };
      default:
        return { color: 'text-gray-600', icon: <XCircle className="w-4 h-4" />, label: 'Unknown' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Policy Details</h2>
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
                <FileCode className="w-4 h-4 mr-2" />
                Details
              </div>
            </button>
            <button
              onClick={() => setActiveTab('assignments')}
              className={`${
                activeTab === 'assignments'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : `border-transparent ${themeClasses.text.secondary} hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <div className="flex items-center">
                <Target className="w-4 h-4 mr-2" />
                Assignments ({assignments.length})
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
                <Clock className="w-4 h-4 mr-2" />
                History ({executions.length})
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

          {!loading && !error && policy && (
            <>
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Policy Header */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-2xl font-bold ${themeClasses.text.primary}`}>{policy.policy_name}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        policy.enabled
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                      }`}>
                        {policy.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {policy.description && (
                      <p className={`${themeClasses.text.secondary}`}>{policy.description}</p>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <FileCode className="w-4 h-4 text-purple-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Policy Type</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary} capitalize`}>
                        {policy.policy_type.replace(/_/g, ' ')}
                      </p>
                    </div>

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-4 h-4 text-blue-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Execution Mode</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary} capitalize`}>
                        {policy.execution_mode}
                      </p>
                    </div>

                    {policy.schedule_cron && (
                      <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-orange-600" />
                          <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Schedule</span>
                        </div>
                        <p className={`text-lg font-semibold ${themeClasses.text.primary} font-mono text-sm`}>
                          {policy.schedule_cron}
                        </p>
                      </div>
                    )}

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-green-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Created</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        {new Date(policy.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Script Information */}
                  {policy.script_name && (
                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Associated Script</h4>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>{policy.script_name}</p>
                    </div>
                  )}

                  {/* Configuration Flags */}
                  <div>
                    <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className={`flex items-center gap-2 px-3 py-2 rounded ${policy.run_on_assignment ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <Play className={`w-4 h-4 ${policy.run_on_assignment ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`text-sm ${policy.run_on_assignment ? 'text-blue-800 dark:text-blue-200' : themeClasses.text.secondary}`}>
                          Run on Assignment
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded ${policy.enabled ? 'bg-green-100 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <CheckCircle className={`w-4 h-4 ${policy.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className={`text-sm ${policy.enabled ? 'text-green-800 dark:text-green-200' : themeClasses.text.secondary}`}>
                          Policy Enabled
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Created By */}
                  {policy.created_by_name && (
                    <div className={`text-sm ${themeClasses.text.secondary}`}>
                      Created by {policy.created_by_name} on {new Date(policy.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Assignments Tab */}
              {activeTab === 'assignments' && (
                <div className="space-y-4">
                  <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Policy Assignments</h3>

                  {assignments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className={themeClasses.bg.secondary}>
                          <tr>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Target
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Type
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Assigned By
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Assigned At
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                          {assignments.map((assignment) => (
                            <tr key={assignment.id}>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                                {assignment.agent_name || assignment.business_name || 'N/A'}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {assignment.agent_device_id ? 'Agent' : 'Business'}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {assignment.assigned_by_name || 'Unknown'}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {new Date(assignment.assigned_at).toLocaleString()}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                                <button
                                  onClick={() => handleRemoveAssignment(assignment.id)}
                                  disabled={removingAssignment === assignment.id}
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                  title="Remove assignment"
                                >
                                  {removingAssignment === assignment.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
                      No assignments found for this policy.
                    </div>
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Execution History</h3>

                  {executions.length > 0 ? (
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
                              Duration
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                              Started At
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                          {executions.map((execution) => {
                            const statusDisplay = getExecutionStatusDisplay(execution.status);
                            return (
                              <tr key={execution.id}>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                                  {execution.agent_name || 'N/A'}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap`}>
                                  <div className={`flex items-center gap-2 ${statusDisplay.color}`}>
                                    {statusDisplay.icon}
                                    <span className="text-sm font-medium">{statusDisplay.label}</span>
                                  </div>
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                  {execution.execution_duration_seconds ? `${execution.execution_duration_seconds}s` : 'N/A'}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                  {new Date(execution.started_at).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
                      No execution history found for this policy.
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

export default PolicyDetailsModal;
