import React, { useState, useEffect } from 'react';
import { X, Code, Clock, CheckCircle, XCircle, Calendar, Tag, Shield } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService, AutomationScript } from '../../../services/automationService';

interface ScriptDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptId: string;
}

const ScriptDetailsModal: React.FC<ScriptDetailsModalProps> = ({ isOpen, onClose, scriptId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<AutomationScript | null>(null);

  useEffect(() => {
    if (isOpen && scriptId) {
      loadScriptDetails();
    }
  }, [isOpen, scriptId]);

  const loadScriptDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await automationService.getScript(scriptId);
      if (response.success && response.data) {
        setScript(response.data as AutomationScript);
      } else {
        setError(response.message || 'Failed to load script details');
      }
    } catch (err) {
      console.error('Error loading script details:', err);
      setError('An error occurred while loading script details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Script Details</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
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

          {!loading && !error && script && (
            <div className="space-y-6">
              {/* Script Header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className={`text-2xl font-bold ${themeClasses.text.primary}`}>{script.script_name}</h3>
                  {script.is_builtin && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200">
                      <Shield className="w-3 h-3 mr-1" />
                      Built-in
                    </span>
                  )}
                  {script.is_public && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                      Public
                    </span>
                  )}
                </div>
                {script.description && (
                  <p className={`${themeClasses.text.secondary}`}>{script.description}</p>
                )}
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Code className="w-4 h-4 text-blue-600" />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Script Type</span>
                  </div>
                  <p className={`text-lg font-semibold ${themeClasses.text.primary} capitalize`}>{script.script_type}</p>
                </div>

                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Category</span>
                  </div>
                  <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                    {script.category_name || 'Uncategorized'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-orange-600" />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Timeout</span>
                  </div>
                  <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>{script.timeout_seconds}s</p>
                </div>

                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Created</span>
                  </div>
                  <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                    {new Date(script.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Execution Stats */}
              <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-3`}>Execution Statistics</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{script.execution_count}</div>
                    <div className={`text-xs ${themeClasses.text.secondary}`}>Total Executions</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-2xl font-bold text-green-600">{script.success_count}</span>
                    </div>
                    <div className={`text-xs ${themeClasses.text.secondary}`}>Successful</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <span className="text-2xl font-bold text-red-600">
                        {script.execution_count - script.success_count}
                      </span>
                    </div>
                    <div className={`text-xs ${themeClasses.text.secondary}`}>Failed</div>
                  </div>
                </div>
                {script.execution_count > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className={themeClasses.text.secondary}>Success Rate</span>
                      <span className={themeClasses.text.primary}>
                        {Math.round((script.success_count / script.execution_count) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{
                          width: `${(script.success_count / script.execution_count) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Platform Compatibility */}
              <div>
                <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Platform Compatibility</h4>
                <div className="flex flex-wrap gap-2">
                  {script.supported_os && script.supported_os.map((os) => (
                    <span
                      key={os}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 capitalize"
                    >
                      {os}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tags */}
              {script.tags && script.tags.length > 0 && (
                <div>
                  <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {script.tags.map((tag) => (
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

              {/* Flags */}
              <div>
                <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Configuration Flags</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded ${script.requires_elevated ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <Shield className={`w-4 h-4 ${script.requires_elevated ? 'text-yellow-600' : 'text-gray-400'}`} />
                    <span className={`text-sm ${script.requires_elevated ? 'text-yellow-800 dark:text-yellow-200' : themeClasses.text.secondary}`}>
                      Requires Elevation
                    </span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded ${script.is_destructive ? 'bg-red-100 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <XCircle className={`w-4 h-4 ${script.is_destructive ? 'text-red-600' : 'text-gray-400'}`} />
                    <span className={`text-sm ${script.is_destructive ? 'text-red-800 dark:text-red-200' : themeClasses.text.secondary}`}>
                      Destructive
                    </span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded ${script.requires_approval ? 'bg-orange-100 dark:bg-orange-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <CheckCircle className={`w-4 h-4 ${script.requires_approval ? 'text-orange-600' : 'text-gray-400'}`} />
                    <span className={`text-sm ${script.requires_approval ? 'text-orange-800 dark:text-orange-200' : themeClasses.text.secondary}`}>
                      Requires Approval
                    </span>
                  </div>
                </div>
              </div>

              {/* Script Content */}
              <div>
                <h4 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Script Content</h4>
                <pre className={`p-4 rounded-lg ${themeClasses.bg.secondary} overflow-x-auto text-sm font-mono`}>
                  <code className={themeClasses.text.primary}>{script.script_content}</code>
                </pre>
              </div>

              {/* Created By */}
              {script.created_by_name && (
                <div className={`text-sm ${themeClasses.text.secondary}`}>
                  Created by {script.created_by_name} on {new Date(script.created_at).toLocaleString()}
                </div>
              )}
            </div>
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

export default ScriptDetailsModal;
