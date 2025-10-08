import React, { useState, useEffect } from 'react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import {
  FileText,
  Download,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  Shield,
  CheckCircle,
  XCircle
} from 'lucide-react';
import PermissionDeniedModal from './shared/PermissionDeniedModal';

interface AuditLogEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_email: string;
  permission_key: string;
  result: 'granted' | 'denied';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface Filters {
  employeeId: string;
  permissionKey: string;
  result: '' | 'granted' | 'denied';
  startDate: string;
  endDate: string;
}

const AdminPermissionAuditLog: React.FC = () => {
  const { checkPermission } = usePermission();
  const canView = checkPermission('view.permission_audit_log.enable');

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(50);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    employeeId: '',
    permissionKey: '',
    result: '',
    startDate: '',
    endDate: ''
  });

  // Permission Denied Modal
  const [permissionDenied, setPermissionDenied] = useState({
    show: false,
    action: undefined as string | undefined,
    requiredPermission: undefined as string | undefined,
    message: undefined as string | undefined
  });

  // Check permission on mount
  useEffect(() => {
    if (!canView) {
      setPermissionDenied({
        show: true,
        action: 'View Permission Audit Log',
        requiredPermission: 'view.permission_audit_log.enable',
        message: 'Only Executive role can access permission audit logs'
      });
      setLoading(false);
    } else {
      fetchAuditLogs();
    }
  }, [canView]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/permission-audit-log', {
        headers: {
          'Authorization': `Bearer ${RoleBasedStorage.getItem('sessionToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setAuditLogs(data.auditLogs || []);
      setFilteredLogs(data.auditLogs || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    let filtered = [...auditLogs];

    // Filter by employee ID
    if (filters.employeeId) {
      filtered = filtered.filter(log =>
        log.employee_id.toString().includes(filters.employeeId) ||
        log.employee_name.toLowerCase().includes(filters.employeeId.toLowerCase()) ||
        log.employee_email.toLowerCase().includes(filters.employeeId.toLowerCase())
      );
    }

    // Filter by permission key
    if (filters.permissionKey) {
      filtered = filtered.filter(log =>
        log.permission_key.toLowerCase().includes(filters.permissionKey.toLowerCase())
      );
    }

    // Filter by result
    if (filters.result) {
      filtered = filtered.filter(log => log.result === filters.result);
    }

    // Filter by date range
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filtered = filtered.filter(log => new Date(log.created_at) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
      filtered = filtered.filter(log => new Date(log.created_at) <= endDate);
    }

    setFilteredLogs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [filters, auditLogs]);

  // Pagination
  const indexOfLastEntry = currentPage * entriesPerPage;
  const indexOfFirstEntry = indexOfLastEntry - entriesPerPage;
  const currentEntries = filteredLogs.slice(indexOfFirstEntry, indexOfLastEntry);
  const totalPages = Math.ceil(filteredLogs.length / entriesPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleClearFilters = () => {
    setFilters({
      employeeId: '',
      permissionKey: '',
      result: '',
      startDate: '',
      endDate: ''
    });
  };

  const handleExportToCSV = () => {
    if (!canView) {
      setPermissionDenied({
        show: true,
        action: 'Export Audit Logs',
        requiredPermission: 'view.permission_audit_log.enable',
        message: 'Only Executive role can export audit logs'
      });
      return;
    }

    // Create CSV content
    const headers = ['ID', 'Employee Name', 'Employee Email', 'Permission Key', 'Result', 'IP Address', 'User Agent', 'Timestamp'];
    const rows = filteredLogs.map(log => [
      log.id,
      log.employee_name,
      log.employee_email,
      log.permission_key,
      log.result,
      log.ip_address || 'N/A',
      log.user_agent || 'N/A',
      new Date(log.created_at).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `permission-audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (!canView) {
    return (
      <div className={`p-6 ${themeClasses.bg.primary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className={`text-2xl font-bold mb-2 ${themeClasses.text.primary}`}>Access Denied</h2>
            <p className={themeClasses.text.secondary}>Only Executive role can access permission audit logs.</p>
          </div>
        </div>

        <PermissionDeniedModal
          isOpen={permissionDenied.show}
          onClose={() => setPermissionDenied({ show: false })}
          action={permissionDenied.action}
          requiredPermission={permissionDenied.requiredPermission}
          message={permissionDenied.message}
        />
      </div>
    );
  }

  return (
    <div className={`p-6 ${themeClasses.bg.primary}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-500" />
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Permission Audit Log</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 ${themeClasses.bg.secondary} ${themeClasses.text.primary} rounded-lg hover:${themeClasses.bg.hover} transition-colors border ${themeClasses.border.primary}`}
            >
              <Filter className="w-4 h-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button
              onClick={handleExportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className={`p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Total Entries</p>
                <p className={`text-2xl font-bold ${themeClasses.text.primary}`}>{filteredLogs.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className={`p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Granted</p>
                <p className={`text-2xl font-bold text-green-600`}>
                  {filteredLogs.filter(log => log.result === 'granted').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className={`p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>Denied</p>
                <p className={`text-2xl font-bold text-red-600`}>
                  {filteredLogs.filter(log => log.result === 'denied').length}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className={`p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary} mb-4`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  <User className="w-4 h-4 inline mr-1" />
                  Employee
                </label>
                <input
                  type="text"
                  value={filters.employeeId}
                  onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}
                  placeholder="Name or email..."
                  className={`w-full px-3 py-2 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-lg`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  <Shield className="w-4 h-4 inline mr-1" />
                  Permission Key
                </label>
                <input
                  type="text"
                  value={filters.permissionKey}
                  onChange={(e) => setFilters({ ...filters, permissionKey: e.target.value })}
                  placeholder="e.g. modify.users.enable"
                  className={`w-full px-3 py-2 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-lg`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Result
                </label>
                <select
                  value={filters.result}
                  onChange={(e) => setFilters({ ...filters, result: e.target.value as '' | 'granted' | 'denied' })}
                  className={`w-full px-3 py-2 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-lg`}
                >
                  <option value="">All</option>
                  <option value="granted">Granted</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className={`w-full px-3 py-2 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-lg`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  <Calendar className="w-4 h-4 inline mr-1" />
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className={`w-full px-3 py-2 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary} rounded-lg`}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleClearFilters}
                  className={`w-full px-4 py-2 ${themeClasses.bg.hover} ${themeClasses.text.primary} rounded-lg hover:opacity-80 transition-opacity border ${themeClasses.border.primary}`}
                >
                  <X className="w-4 h-4 inline mr-1" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className={themeClasses.text.secondary}>Loading audit logs...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong className="font-bold">Error: </strong>
          <span>{error}</span>
        </div>
      )}

      {/* Audit Log Table */}
      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${themeClasses.bg.secondary} sticky top-0 z-10`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    ID
                  </th>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    Employee
                  </th>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    Permission Key
                  </th>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    Result
                  </th>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    IP Address
                  </th>
                  <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary} border-b ${themeClasses.border.primary}`}>
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <p className={themeClasses.text.secondary}>No audit log entries found</p>
                    </td>
                  </tr>
                ) : (
                  currentEntries.map((log) => (
                    <tr
                      key={log.id}
                      className={`${themeClasses.bg.primary} hover:${themeClasses.bg.hover} transition-colors border-b ${themeClasses.border.primary}`}
                    >
                      <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                        {log.id}
                      </td>
                      <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                        <div>
                          <p className="font-medium">{log.employee_name}</p>
                          <p className={`text-xs ${themeClasses.text.secondary}`}>{log.employee_email}</p>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                        <code className={`px-2 py-1 ${themeClasses.bg.secondary} rounded text-xs`}>
                          {log.permission_key}
                        </code>
                      </td>
                      <td className={`px-4 py-3 text-sm`}>
                        {log.result === 'granted' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Granted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3 mr-1" />
                            Denied
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                        {log.ip_address || 'N/A'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                        {formatTimestamp(log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={`flex items-center justify-between mt-4 px-4 py-3 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
              <div className={`text-sm ${themeClasses.text.secondary}`}>
                Showing {indexOfFirstEntry + 1} to {Math.min(indexOfLastEntry, filteredLogs.length)} of {filteredLogs.length} entries
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg border ${themeClasses.border.primary} disabled:opacity-50 disabled:cursor-not-allowed hover:${themeClasses.bg.hover} transition-colors`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className={`px-4 py-1 ${themeClasses.text.primary}`}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg border ${themeClasses.border.primary} disabled:opacity-50 disabled:cursor-not-allowed hover:${themeClasses.bg.hover} transition-colors`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />
    </div>
  );
};

export default AdminPermissionAuditLog;