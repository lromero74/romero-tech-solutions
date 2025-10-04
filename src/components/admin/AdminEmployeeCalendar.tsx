import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  Eye,
  Filter,
  RefreshCw,
  Plane,
  XCircle
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';

interface EmployeeEngagement {
  serviceRequestId: string;
  requestNumber: string;
  title: string;
  scheduledDate: string | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  assignedAt: string;
  assignmentType: string;
  assignmentActive: boolean;
  requestStatus: string;
  serviceType: string;
  locationName: string;
  startDatetime: string | null;
  endDatetime: string | null;
  engagementStatus: 'available' | 'scheduled' | 'engaged' | 'completed' | 'pending';
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  workingStatus: string;
  photo?: string;
  photoPositionX?: number;
  photoPositionY?: number;
  photoScale?: number;
  photoBackgroundColor?: string;
  engagements: EmployeeEngagement[];
}

interface CalendarData {
  employees: Employee[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  view: string;
  totalEmployees: number;
  totalEngagements: number;
}

interface AvailabilityData {
  date: string;
  employees: {
    id: string;
    first_name: string;
    last_name: string;
    working_status: string;
    scheduled_requests: number;
    active_requests: number;
    availability_status: 'available' | 'scheduled' | 'engaged' | 'unavailable';
  }[];
  summary: {
    total: number;
    available: number;
    scheduled: number;
    engaged: number;
    unavailable: number;
  };
}

interface AdminEmployeeCalendarProps {
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void>;
}

const AdminEmployeeCalendar: React.FC<AdminEmployeeCalendarProps> = ({
  loading: externalLoading,
  error: externalError,
  onRefresh
}) => {
  const { isDark } = useTheme();
  const { sessionToken } = useEnhancedAuth();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());

  // Helper function to format working status labels
  const formatWorkingStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      'available': 'Available',
      'on_vacation': 'On Vacation',
      'out_sick': 'Out Sick',
      'on_other_leave': 'On Leave',
      'inactive': 'Inactive'
    };
    return statusMap[status] || status;
  };

  // Generate date range based on view and selected date
  const getDateRange = () => {
    const date = new Date(selectedDate);

    switch (view) {
      case 'day':
        return {
          startDate: date.toISOString().split('T')[0],
          endDate: date.toISOString().split('T')[0]
        };
      case 'week':
        const startOfWeek = new Date(date.setDate(date.getDate() - date.getDay()));
        const endOfWeek = new Date(date.setDate(date.getDate() + 6));
        return {
          startDate: startOfWeek.toISOString().split('T')[0],
          endDate: endOfWeek.toISOString().split('T')[0]
        };
      case 'month':
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return {
          startDate: startOfMonth.toISOString().split('T')[0],
          endDate: endOfMonth.toISOString().split('T')[0]
        };
      default:
        return {
          startDate: date.toISOString().split('T')[0],
          endDate: date.toISOString().split('T')[0]
        };
    }
  };

  // Fetch calendar data
  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!sessionToken) {
        throw new Error('No session token available');
      }

      const dateRange = getDateRange();
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        view,
        ...(selectedEmployee && { employeeId: selectedEmployee })
      });

      const response = await fetch(`${API_BASE_URL}/admin/employee-calendar?${params}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setCalendarData(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch calendar data');
      }
    } catch (err) {
      console.error('Error fetching calendar data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch availability data for today
  const fetchAvailabilityData = async () => {
    try {
      if (!sessionToken) {
        console.log('No session token available for availability data');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`${API_BASE_URL}/admin/employee-availability?date=${today}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setAvailabilityData(data.data);
      }
    } catch (err) {
      console.error('Error fetching availability data:', err);
    }
  };

  // Manual refresh handler (bypasses stale-time check)
  const handleManualRefresh = async () => {
    setLastFetchTime(0); // Reset to force fetch
    await fetchCalendarData();
    await fetchAvailabilityData();
    setLastFetchTime(Date.now());
  };

  useEffect(() => {
    if (sessionToken) {
      // Only refetch if data is stale (older than 30 seconds)
      const now = Date.now();
      const STALE_TIME = 30000; // 30 seconds

      if (now - lastFetchTime > STALE_TIME) {
        fetchCalendarData();
        fetchAvailabilityData();
        setLastFetchTime(now);
      }
    }
  }, [selectedDate, view, selectedEmployee, sessionToken]);

  // Navigation functions
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);

    switch (view) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        break;
    }

    setSelectedDate(newDate);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'scheduled':
        return 'bg-blue-500';
      case 'engaged':
        return 'bg-orange-500';
      case 'completed':
        return 'bg-purple-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'unavailable':
        return 'bg-gray-500';
      default:
        return 'bg-gray-300';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-4 h-4" />;
      case 'scheduled':
        return <Clock className="w-4 h-4" />;
      case 'engaged':
        return <Play className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending':
        return <Pause className="w-4 h-4" />;
      case 'unavailable':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  // Format date for display
  const formatDateForDisplay = () => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    switch (view) {
      case 'day':
        return selectedDate.toLocaleDateString(undefined, options);
      case 'week':
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        return `${startOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      case 'month':
        return selectedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      default:
        return selectedDate.toLocaleDateString(undefined, options);
    }
  };

  // Get time display for engagement
  const getTimeDisplay = (engagement: EmployeeEngagement) => {
    const startTime = engagement.scheduledTimeStart || engagement.requestedTimeStart;
    const endTime = engagement.scheduledTimeEnd || engagement.requestedTimeEnd;

    if (startTime && endTime) {
      return `${startTime.substring(0, 5)} - ${endTime.substring(0, 5)}`;
    } else if (startTime) {
      return `${startTime.substring(0, 5)}`;
    }
    return 'Time TBD';
  };

  // Filter employees based on status
  const filteredEmployees = calendarData?.employees.filter(employee => {
    if (statusFilter === 'all') return true;

    // Determine employee's current status based on their engagements
    const activeEngagements = employee.engagements.filter(eng =>
      eng.engagementStatus === statusFilter
    );

    return activeEngagements.length > 0 ||
           (statusFilter === 'available' && employee.engagements.length === 0);
  }) || [];

  if (loading && !calendarData) {
    return (
      <div className={`min-h-screen ${themeClasses.bg.primary} p-6`}>
        <div className="flex items-center justify-center h-64">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${themeClasses.border.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeClasses.bg.primary} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary} mb-2`}>
              Employee Calendar
            </h1>
            <p className={`${themeClasses.text.secondary}`}>
              Track employee schedules and service request engagements
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center px-4 py-2 rounded-lg ${themeClasses.bg.secondary} ${themeClasses.text.primary} ${themeClasses.border.primary} border transition-colors hover:${themeClasses.bg.hover}`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>

            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className={`flex items-center px-4 py-2 rounded-lg ${themeClasses.bg.accent} text-white transition-colors hover:opacity-90 disabled:opacity-50`}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Navigation and View Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateDate('prev')}
              className={`p-2 rounded-lg ${themeClasses.bg.secondary} ${themeClasses.text.primary} transition-colors hover:${themeClasses.bg.hover}`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <h2 className={`text-xl font-semibold ${themeClasses.text.primary} min-w-[200px] text-center`}>
              {formatDateForDisplay()}
            </h2>

            <button
              onClick={() => navigateDate('next')}
              className={`p-2 rounded-lg ${themeClasses.bg.secondary} ${themeClasses.text.primary} transition-colors hover:${themeClasses.bg.hover}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => setSelectedDate(new Date())}
              className={`px-4 py-2 rounded-lg ${themeClasses.bg.secondary} ${themeClasses.text.primary} transition-colors hover:${themeClasses.bg.hover}`}
            >
              Today
            </button>
          </div>

          {/* View Toggle */}
          <div className={`flex rounded-lg ${themeClasses.bg.secondary} p-1`}>
            {(['day', 'week', 'month'] as const).map((viewOption) => (
              <button
                key={viewOption}
                onClick={() => setView(viewOption)}
                className={`px-4 py-2 rounded-md capitalize transition-colors ${
                  view === viewOption
                    ? `${themeClasses.bg.accent} text-white`
                    : `${themeClasses.text.secondary} hover:${themeClasses.text.primary}`
                }`}
              >
                {viewOption}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className={`mt-4 p-4 rounded-lg ${themeClasses.bg.secondary} ${themeClasses.border.primary} border`}>
            <div className="flex items-center space-x-6">
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                  Status Filter
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`rounded-lg ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} border px-3 py-2`}
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="engaged">Engaged</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                  Employee
                </label>
                <select
                  value={selectedEmployee || ''}
                  onChange={(e) => setSelectedEmployee(e.target.value || null)}
                  className={`rounded-lg ${themeClasses.bg.primary} ${themeClasses.text.primary} ${themeClasses.border.primary} border px-3 py-2`}
                >
                  <option value="">All Employees</option>
                  {calendarData?.employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        {availabilityData && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} text-center`}>
              <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                {availabilityData.summary.total}
              </div>
              <div className={`text-sm ${themeClasses.text.secondary}`}>Total</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} text-center`}>
              <div className="text-2xl font-bold text-green-600">
                {availabilityData.summary.available}
              </div>
              <div className={`text-sm ${themeClasses.text.secondary}`}>Available</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} text-center`}>
              <div className="text-2xl font-bold text-blue-600">
                {availabilityData.summary.scheduled}
              </div>
              <div className={`text-sm ${themeClasses.text.secondary}`}>Scheduled</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} text-center`}>
              <div className="text-2xl font-bold text-orange-600">
                {availabilityData.summary.engaged}
              </div>
              <div className={`text-sm ${themeClasses.text.secondary}`}>Engaged</div>
            </div>
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} text-center`}>
              <div className="text-2xl font-bold text-gray-600">
                {availabilityData.summary.unavailable}
              </div>
              <div className={`text-sm ${themeClasses.text.secondary}`}>Unavailable</div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
            <span className="text-red-800 dark:text-red-200">{error}</span>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className={`${themeClasses.bg.secondary} rounded-lg ${themeClasses.shadow.md} overflow-hidden`}>
        {filteredEmployees.length === 0 ? (
          <div className="p-8 text-center">
            <User className={`w-12 h-12 ${themeClasses.text.muted} mx-auto mb-4`} />
            <p className={`${themeClasses.text.secondary} text-lg mb-2`}>No employees found</p>
            <p className={`${themeClasses.text.muted}`}>
              {selectedEmployee ? 'Try selecting a different employee' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredEmployees.map((employee) => (
              <div key={employee.id} className="p-6">
                {/* Employee Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0 mr-4">
                      {employee.photo && !imageLoadErrors.has(employee.id) ? (
                        <div
                          className="relative h-10 w-10 rounded-full overflow-hidden border-2 border-gray-300"
                          style={{ backgroundColor: employee.photoBackgroundColor || '#f9fafb' }}
                        >
                          <img
                            src={employee.photo}
                            alt={`${employee.firstName} ${employee.lastName}`}
                            className="w-full h-full object-cover"
                            style={{
                              transform: `scale(${(employee.photoScale || 100) / 100})`,
                              transformOrigin: `${employee.photoPositionX || 50}% ${employee.photoPositionY || 50}%`
                            }}
                            onError={() => {
                              setImageLoadErrors(prev => new Set([...prev, employee.id]));
                            }}
                          />
                        </div>
                      ) : (
                        <div className={`h-10 w-10 rounded-full ${themeClasses.bg.accent} flex items-center justify-center text-white font-semibold`}>
                          {employee.firstName[0]}{employee.lastName[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
                        {employee.firstName} {employee.lastName}
                      </h3>
                      <p className={`text-sm ${themeClasses.text.secondary}`}>
                        {employee.email} • {formatWorkingStatus(employee.workingStatus)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      employee.workingStatus === 'available'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : employee.workingStatus === 'on_vacation'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    }`}>
                      {formatWorkingStatus(employee.workingStatus)}
                    </span>
                    <span className={`text-sm ${themeClasses.text.muted}`}>
                      {employee.engagements.length} engagement{employee.engagements.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Engagement Timeline */}
                <div className="space-y-3">
                  {employee.engagements.length === 0 ? (
                    <div className={`p-4 rounded-lg ${themeClasses.bg.primary} border-2 border-dashed ${themeClasses.border.muted}`}>
                      <div className="flex items-center justify-center">
                        {employee.workingStatus === 'available' ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                            <span className={`${themeClasses.text.secondary}`}>Available - No scheduled engagements</span>
                          </>
                        ) : employee.workingStatus === 'on_vacation' ? (
                          <>
                            <Plane className="w-5 h-5 text-blue-500 mr-2" />
                            <span className={`${themeClasses.text.secondary}`}>On Vacation - No scheduled engagements</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-gray-500 mr-2" />
                            <span className={`${themeClasses.text.secondary}`}>
                              {employee.workingStatus === 'out_sick' ? 'Out Sick' :
                               employee.workingStatus === 'on_other_leave' ? 'On Leave' :
                               employee.workingStatus === 'inactive' ? 'Inactive' :
                               'Unavailable'} - No scheduled engagements
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    employee.engagements.map((engagement, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg ${themeClasses.bg.primary} ${themeClasses.border.primary} border-l-4 ${getStatusColor(engagement.engagementStatus)}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center mb-2">
                              <div className={`mr-3 ${getStatusColor(engagement.engagementStatus)} rounded-full p-1 text-white`}>
                                {getStatusIcon(engagement.engagementStatus)}
                              </div>
                              <div>
                                <h4 className={`font-semibold ${themeClasses.text.primary}`}>
                                  {engagement.requestNumber}: {engagement.title}
                                </h4>
                                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 space-x-4">
                                  <span className="flex items-center">
                                    <Clock className="w-4 h-4 mr-1" />
                                    {getTimeDisplay(engagement)}
                                  </span>
                                  <span className="flex items-center">
                                    <MapPin className="w-4 h-4 mr-1" />
                                    {engagement.locationName}
                                  </span>
                                  <span className="capitalize">{engagement.serviceType}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                                engagement.engagementStatus === 'available' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                engagement.engagementStatus === 'scheduled' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                engagement.engagementStatus === 'engaged' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                engagement.engagementStatus === 'completed' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                engagement.engagementStatus === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                              }`}>
                                {engagement.engagementStatus}
                              </span>

                              <span className={`text-xs ${themeClasses.text.muted}`}>
                                Assigned: {new Date(engagement.assignedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {calendarData && (
        <div className="mt-6 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            Showing {filteredEmployees.length} of {calendarData.totalEmployees} employees
          </span>
          <span>
            Total engagements: {calendarData.totalEngagements}
          </span>
        </div>
      )}
    </div>
  );
};

export default AdminEmployeeCalendar;