import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Clock, Loader, Terminal, AlertTriangle, Copy, Download, Calendar, User, Settings } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService, PolicyExecutionHistory } from '../../../services/automationService';

interface ExecutionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string;
}

const ExecutionDetailsModal: React.FC<ExecutionDetailsModalProps> = ({
  isOpen,
  onClose,
  executionId,
}) => {
  const [execution, setExecution] = useState<PolicyExecutionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load execution details
  useEffect(() => {
    if (isOpen && executionId) {
      loadExecutionDetails();
    }
  }, [isOpen, executionId]);

  const loadExecutionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all executions and find the one we need
      const response = await automationService.getExecutionHistory({ limit: 1000 });
      if (response.success && response.data) {
        const found = response.data.executions.find(e => e.id === executionId);
        if (found) {
          setExecution(found);
        } else {
          setError('Execution not found');
        }
      } else {
        setError(response.message || 'Failed to load execution details');
      }
    } catch (err) {
      console.error('Error loading execution details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load execution details');
    } finally {
      setLoading(false);
    }
  };

  // Get status display
  const getStatusDisplay = (status: string, exitCode: number | null) => {
    switch (status) {
      case 'completed':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          borderColor: 'border-green-300 dark:border-green-700',
          icon: <CheckCircle className="w-5 h-5" />,
          label: 'Completed',
          detail: exitCode !== null ? `Exit Code: ${exitCode}` : ''
        };
      case 'failed':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          borderColor: 'border-red-300 dark:border-red-700',
          icon: <XCircle className="w-5 h-5" />,
          label: 'Failed',
          detail: exitCode !== null ? `Exit Code: ${exitCode}` : ''
        };
      case 'running':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900/20',
          borderColor: 'border-blue-300 dark:border-blue-700',
          icon: <Loader className="w-5 h-5 animate-spin" />,
          label: 'Running',
          detail: 'In progress...'
        };
      case 'timeout':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-300 dark:border-yellow-700',
          icon: <Clock className="w-5 h-5" />,
          label: 'Timeout',
          detail: 'Execution exceeded timeout limit'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          borderColor: 'border-gray-300 dark:border-gray-700',
          icon: <AlertTriangle className="w-5 h-5" />,
          label: 'Unknown',
          detail: ''
        };
    }
  };

  // Copy to clipboard
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Download output as file
  const handleDownload = () => {
    if (!execution) return;

    const content = `
=== Execution Details ===
Policy: ${execution.policy_name || 'N/A'}
Script: ${execution.script_name || 'N/A'}
Agent: ${execution.agent_name || 'N/A'}
Status: ${execution.status}
Exit Code: ${execution.exit_code !== null ? execution.exit_code : 'N/A'}
Duration: ${execution.execution_duration_seconds ? `${execution.execution_duration_seconds}s` : 'N/A'}
Started: ${new Date(execution.started_at).toLocaleString()}
Completed: ${execution.completed_at ? new Date(execution.completed_at).toLocaleString() : 'N/A'}
Triggered By: ${execution.triggered_by} ${execution.triggered_by_name ? `(${execution.triggered_by_name})` : ''}

=== Parameters ===
${execution.parameters_used ? JSON.stringify(execution.parameters_used, null, 2) : 'None'}

=== Standard Output ===
${execution.stdout_output || '(empty)'}

=== Error Output ===
${execution.stderr_output || '(empty)'}

=== Error Message ===
${execution.error_message || '(none)'}
`.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-${execution.id}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const statusDisplay = execution ? getStatusDisplay(execution.status, execution.exit_code) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Terminal className={`w-6 h-6 mr-3 ${themeClasses.text.primary}`} />
            <h3 className={`text-xl font-semibold ${themeClasses.text.primary}`}>
              Execution Details
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {execution && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                title="Download execution log"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download Log
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-2 rounded-lg ${themeClasses.text.muted} hover:${themeClasses.bg.hover} transition-colors`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <Loader className={`w-8 h-8 mx-auto mb-3 animate-spin ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>Loading execution details...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          ) : execution ? (
            <div className="space-y-6">
              {/* Status Banner */}
              {statusDisplay && (
                <div className={`p-4 rounded-lg border ${statusDisplay.borderColor} ${statusDisplay.bgColor}`}>
                  <div className="flex items-center">
                    <span className={statusDisplay.color}>{statusDisplay.icon}</span>
                    <div className="ml-3">
                      <h4 className={`text-lg font-semibold ${statusDisplay.color}`}>
                        {statusDisplay.label}
                      </h4>
                      {statusDisplay.detail && (
                        <p className={`text-sm ${statusDisplay.color} opacity-90`}>
                          {statusDisplay.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Metadata */}
              <div className={`${themeClasses.bg.secondary} rounded-lg p-4 border ${themeClasses.border.primary}`}>
                <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3 flex items-center`}>
                  <Settings className="w-4 h-4 mr-2" />
                  Execution Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Policy</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {execution.policy_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Script</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {execution.script_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Agent</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {execution.agent_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Triggered By</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary} capitalize`}>
                      {execution.triggered_by}
                      {execution.triggered_by_name && ` (${execution.triggered_by_name})`}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1 flex items-center`}>
                      <Calendar className="w-3 h-3 mr-1" />
                      Started At
                    </p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {new Date(execution.started_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1 flex items-center`}>
                      <Clock className="w-3 h-3 mr-1" />
                      Duration
                    </p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {execution.execution_duration_seconds
                        ? `${execution.execution_duration_seconds} seconds`
                        : execution.status === 'running'
                        ? 'Still running...'
                        : 'N/A'}
                    </p>
                  </div>
                  {execution.completed_at && (
                    <div>
                      <p className={`text-xs ${themeClasses.text.muted} mb-1 flex items-center`}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Completed At
                      </p>
                      <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {new Date(execution.completed_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Parameters */}
              {execution.parameters_used && Object.keys(execution.parameters_used).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                      Parameters
                    </h4>
                    <button
                      onClick={() => handleCopy(JSON.stringify(execution.parameters_used, null, 2), 'parameters')}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} rounded transition-colors`}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      {copiedField === 'parameters' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className={`${themeClasses.bg.secondary} rounded-lg p-3 border ${themeClasses.border.primary}`}>
                    <pre className={`text-xs ${themeClasses.text.primary} font-mono overflow-x-auto`}>
                      {JSON.stringify(execution.parameters_used, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Standard Output */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                    Standard Output
                  </h4>
                  {execution.stdout_output && (
                    <button
                      onClick={() => handleCopy(execution.stdout_output || '', 'stdout')}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} rounded transition-colors`}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      {copiedField === 'stdout' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className={`${themeClasses.bg.secondary} rounded-lg p-3 border ${themeClasses.border.primary} max-h-96 overflow-y-auto`}>
                  {execution.stdout_output ? (
                    <pre className={`text-xs ${themeClasses.text.primary} font-mono whitespace-pre-wrap`}>
                      {execution.stdout_output}
                    </pre>
                  ) : (
                    <p className={`text-sm ${themeClasses.text.muted} italic`}>(empty)</p>
                  )}
                </div>
              </div>

              {/* Error Output */}
              {(execution.stderr_output || execution.status === 'failed') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                      Error Output
                    </h4>
                    {execution.stderr_output && (
                      <button
                        onClick={() => handleCopy(execution.stderr_output || '', 'stderr')}
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} rounded transition-colors`}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        {copiedField === 'stderr' ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-3 border border-red-200 dark:border-red-800 max-h-96 overflow-y-auto">
                    {execution.stderr_output ? (
                      <pre className="text-xs text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap">
                        {execution.stderr_output}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">(empty)</p>
                    )}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {execution.error_message && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                        Error Message
                      </h4>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {execution.error_message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>Execution not found</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium ${themeClasses.text.secondary} hover:${themeClasses.bg.hover} rounded-lg transition-colors`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutionDetailsModal;
