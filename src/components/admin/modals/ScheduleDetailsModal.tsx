import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { deploymentService, MaintenanceWindow, DeploymentHistory } from '../../../services/deploymentService';

interface ScheduleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduleId: string;
}

const ScheduleDetailsModal: React.FC<ScheduleDetailsModalProps> = ({ isOpen, onClose, scheduleId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<MaintenanceWindow | null>(null);
  const [deployments, setDeployments] = useState<DeploymentHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'deployments'>('details');

  useEffect(() => {
    if (isOpen && scheduleId) {
      loadScheduleDetails();
    }
  }, [isOpen, scheduleId]);

  const loadScheduleDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load schedule details and deployment history in parallel
      const [scheduleResponse, historyResponse] = await Promise.all([
        deploymentService.getMaintenanceWindow(scheduleId),
        deploymentService.getDeploymentHistory({ limit: 100 }),
      ]);

      if (scheduleResponse.success && scheduleResponse.data) {
        setSchedule(scheduleResponse.data as MaintenanceWindow);
      } else {
        setError(scheduleResponse.message || 'Failed to load schedule details');
      }

      if (historyResponse.success && historyResponse.data) {
        // Filter deployments that use this maintenance window
        const scheduleDeployments = historyResponse.data.history.filter(
          (d) => d.maintenance_window_id === scheduleId
        );
        setDeployments(scheduleDeployments);
      }
    } catch (err) {
      console.error('Error loading schedule details:', err);
      setError('An error occurred while loading schedule details');
    } finally {
      setLoading(false);
    }
  };

  const formatScheduleType = (type: string): string => {
    const types: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      once: 'One-time',
    };
    return types[type] || type;
  };

  const formatDayOfWeek = (day: number): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  };

  const formatTime = (time: string): string => {
    // Format HH:MM:SS to more readable format
    const parts = time.split(':');
    if (parts.length >= 2) {
      const hour = parseInt(parts[0], 10);
      const minute = parts[1];
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minute} ${ampm}`;
    }
    return time;
  };

  const getDeploymentStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'in_progress':
        return 'text-blue-600';
      case 'pending':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getDeploymentStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Maintenance Window Details</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'details'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('deployments')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'deployments'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
            }`}
          >
            Deployments ({deployments.length})
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

          {!loading && !error && schedule && (
            <>
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Schedule Header */}
                  <div>
                    <h3 className={`text-2xl font-bold ${themeClasses.text.primary} mb-2`}>
                      {schedule.schedule_name}
                    </h3>
                    {schedule.description && (
                      <p className={`${themeClasses.text.secondary}`}>{schedule.description}</p>
                    )}
                  </div>

                  {/* Schedule Configuration */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Schedule Type</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        {formatScheduleType(schedule.schedule_type)}
                      </p>
                    </div>

                    {schedule.day_of_week !== null && schedule.day_of_week !== undefined && (
                      <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-purple-600" />
                          <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Day of Week</span>
                        </div>
                        <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                          {formatDayOfWeek(schedule.day_of_week)}
                        </p>
                      </div>
                    )}

                    {schedule.day_of_month !== null && schedule.day_of_month !== undefined && (
                      <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-green-600" />
                          <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Day of Month</span>
                        </div>
                        <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                          {schedule.day_of_month}
                        </p>
                      </div>
                    )}

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-orange-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Start Time</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        {formatTime(schedule.start_time)}
                      </p>
                    </div>

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-red-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Duration</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        {schedule.window_duration_minutes} minutes
                      </p>
                    </div>

                    <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>Status</span>
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.text.primary} capitalize`}>
                        {schedule.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200">
                            Inactive
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Created By */}
                  {schedule.created_by_name && (
                    <div className={`text-sm ${themeClasses.text.secondary}`}>
                      Created by {schedule.created_by_name} on {new Date(schedule.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Deployments Tab */}
              {activeTab === 'deployments' && (
                <div className="space-y-4">
                  <h4 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                    Deployments Using This Window
                  </h4>

                  {deployments.length === 0 ? (
                    <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
                      No deployments have been scheduled using this maintenance window yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className={themeClasses.bg.secondary}>
                          <tr>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                              Package
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                              Target
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                              Status
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                              Scheduled For
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                              Completed
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                          {deployments.map((deployment) => (
                            <tr key={deployment.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.primary}`}>
                                {deployment.package_name}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {deployment.business_name || deployment.agent_hostname || 'All Agents'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className={`flex items-center gap-2 ${getDeploymentStatusColor(deployment.deployment_status)}`}>
                                  {getDeploymentStatusIcon(deployment.deployment_status)}
                                  <span className="text-sm capitalize">{deployment.deployment_status}</span>
                                </div>
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {deployment.scheduled_for ? new Date(deployment.scheduled_for).toLocaleString() : '-'}
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                                {deployment.completed_at ? new Date(deployment.completed_at).toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

export default ScheduleDetailsModal;
