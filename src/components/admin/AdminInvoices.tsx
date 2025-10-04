import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  XCircle,
  Download,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import { usePermissionContext } from '../../contexts/PermissionContext';
import apiService from '../../services/apiService';

interface InvoiceSummary {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  payment_status: string;
  total_amount: number;
  is_first_service_request: boolean;
  business_name: string;
  request_number: string;
  service_title: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  payment_status: string;
  base_hourly_rate: number;
  standard_hours: number;
  standard_rate: number;
  standard_cost: number;
  premium_hours: number;
  premium_rate: number;
  premium_cost: number;
  emergency_hours: number;
  emergency_rate: number;
  emergency_cost: number;
  waived_hours: number;
  is_first_service_request: boolean;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  work_description: string | null;
  notes: string | null;
  business_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  request_number: string;
  service_title: string;
  service_created_at: string;
  service_completed_at: string;
}

interface CompanyInfo {
  company_name: string;
  company_address_line1: string;
  company_address_line2: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  company_phone: string;
  company_email: string;
}

interface Filters {
  search: string;
  paymentStatus: string;
  dueDateFrom: string;
  dueDateTo: string;
  paymentDateFrom: string;
  paymentDateTo: string;
}

const AdminInvoices: React.FC = () => {
  const { isDark } = useTheme();
  const { hasPermission, loading: permissionsLoading } = usePermissionContext();

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    paymentStatus: 'all',
    dueDateFrom: '',
    dueDateTo: '',
    paymentDateFrom: '',
    paymentDateTo: ''
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const [sortBy, setSortBy] = useState('issue_date');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Invoice viewer state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState<{ invoice: Invoice; companyInfo: CompanyInfo } | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Payment status update state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSummary | null>(null);
  const [newPaymentStatus, setNewPaymentStatus] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [updatingPayment, setUpdatingPayment] = useState(false);

  // Fetch invoices (must be defined before useEffect)
  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder
      };

      if (filters.paymentStatus !== 'all') params.paymentStatus = filters.paymentStatus;
      if (filters.dueDateFrom) params.dueDateFrom = filters.dueDateFrom;
      if (filters.dueDateTo) params.dueDateTo = filters.dueDateTo;
      if (filters.paymentDateFrom) params.paymentDateFrom = filters.paymentDateFrom;
      if (filters.paymentDateTo) params.paymentDateTo = filters.paymentDateTo;

      const queryString = new URLSearchParams(params).toString();
      const response = await apiService.get(`/admin/invoices?${queryString}`);

      if (response.success && response.data) {
        setInvoices(response.data.invoices);
        setPagination(prev => ({
          ...prev,
          ...response.data.pagination
        }));
      } else {
        throw new Error(response.message || 'Failed to fetch invoices');
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  // useEffect must be called before any conditional returns
  // Fetch invoices when permissions are loaded and user has permission
  useEffect(() => {
    if (!permissionsLoading && hasPermission('view.invoices.enable')) {
      fetchInvoices();
    }
  }, [pagination.page, sortBy, sortOrder, filters.paymentStatus, filters.dueDateFrom, filters.dueDateTo, filters.paymentDateFrom, filters.paymentDateTo, permissionsLoading]);

  // Handle Escape key to close invoice modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showInvoiceModal) {
        setShowInvoiceModal(false);
        setSelectedInvoiceId(null);
        setInvoiceData(null);
      }
    };

    if (showInvoiceModal) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [showInvoiceModal]);

  // Permission check (AFTER all hooks)
  // Wait for permissions to load before checking
  if (permissionsLoading) {
    return (
      <div className={`p-8 ${themeClasses.bg.primary}`}>
        <div className={`${themeClasses.bg.secondary} rounded-lg p-6 text-center`}>
          <div className={`text-lg ${themeClasses.text.secondary}`}>Loading permissions...</div>
        </div>
      </div>
    );
  }

  const canViewInvoices = hasPermission('view.invoices.enable');

  if (!canViewInvoices) {
    return (
      <div className={`p-8 ${themeClasses.bg.primary}`}>
        <div className={`${themeClasses.bg.secondary} rounded-lg p-6 text-center`}>
          <AlertCircle className={`w-12 h-12 ${themeClasses.text.warning} mx-auto mb-4`} />
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2`}>
            Access Denied
          </h3>
          <p className={themeClasses.text.secondary}>
            You do not have permission to view invoices.
          </p>
        </div>
      </div>
    );
  }

  // Fetch invoice details
  const fetchInvoice = async (invoiceId: string) => {
    try {
      setLoadingInvoice(true);
      const response = await apiService.get(`/admin/invoices/${invoiceId}`);

      if (response.success && response.data) {
        setInvoiceData(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch invoice');
      }
    } catch (err) {
      console.error('Error fetching invoice:', err);
      alert('Failed to load invoice. Please try again.');
      setShowInvoiceModal(false);
    } finally {
      setLoadingInvoice(false);
    }
  };

  // Handle view invoice
  const handleViewInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowInvoiceModal(true);
    fetchInvoice(invoiceId);
  };

  // Handle update payment status
  const handleUpdatePaymentStatus = async () => {
    if (!selectedInvoice || !newPaymentStatus) return;

    try {
      setUpdatingPayment(true);

      const payload: any = {
        paymentStatus: newPaymentStatus
      };

      if (paymentDate) payload.paymentDate = paymentDate;
      if (paymentNotes) payload.notes = paymentNotes;

      const response = await apiService.patch(
        `/admin/invoices/${selectedInvoice.id}/payment-status`,
        payload
      );

      if (response.success) {
        // Refresh invoices list
        await fetchInvoices();
        setShowPaymentModal(false);
        setSelectedInvoice(null);
        setNewPaymentStatus('');
        setPaymentDate('');
        setPaymentNotes('');
      } else {
        throw new Error(response.message || 'Failed to update payment status');
      }
    } catch (err) {
      console.error('Error updating payment status:', err);
      alert('Failed to update payment status. Please try again.');
    } finally {
      setUpdatingPayment(false);
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  // Filter invoices locally by search term
  const filteredInvoices = invoices.filter(invoice => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(searchLower) ||
      invoice.business_name.toLowerCase().includes(searchLower) ||
      invoice.request_number.toLowerCase().includes(searchLower)
    );
  });

  // Get payment status badge
  const getPaymentStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'paid' || statusLower === 'comped') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          {status}
        </span>
      );
    } else if (statusLower === 'overdue') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <AlertCircle className="h-3 w-3 mr-1" />
          {status}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          <Clock className="h-3 w-3 mr-1" />
          {status}
        </span>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <FileText className={`h-8 w-8 ${themeClasses.text.primary}`} />
          <div>
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Invoices</h1>
            <p className={`text-sm ${themeClasses.text.muted}`}>
              {pagination.total} total invoices
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${themeClasses.bg.hover} transition-colors`}
        >
          <Filter className="h-5 w-5" />
          <span>Filters</span>
          {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Search
              </label>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${themeClasses.text.muted}`} />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Invoice #, business, request #..."
                  className={`w-full pl-10 pr-4 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
                />
              </div>
            </div>

            {/* Payment Status */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Payment Status
              </label>
              <select
                value={filters.paymentStatus}
                onChange={(e) => setFilters(prev => ({ ...prev, paymentStatus: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              >
                <option value="all">All Statuses</option>
                <option value="due">Due</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
                <option value="comped">Comped</option>
              </select>
            </div>

            {/* Due Date From */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Due Date From
              </label>
              <input
                type="date"
                value={filters.dueDateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dueDateFrom: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              />
            </div>

            {/* Due Date To */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Due Date To
              </label>
              <input
                type="date"
                value={filters.dueDateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dueDateTo: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              />
            </div>

            {/* Payment Date From */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Payment Date From
              </label>
              <input
                type="date"
                value={filters.paymentDateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, paymentDateFrom: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              />
            </div>

            {/* Payment Date To */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Payment Date To
              </label>
              <input
                type="date"
                value={filters.paymentDateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, paymentDateTo: e.target.value }))}
                className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-lg ${themeClasses.bg.input}`}
              />
            </div>
          </div>

          {/* Clear Filters */}
          {(filters.search || filters.paymentStatus !== 'all' || filters.dueDateFrom || filters.dueDateTo || filters.paymentDateFrom || filters.paymentDateTo) && (
            <div className="mt-4">
              <button
                onClick={() => setFilters({
                  search: '',
                  paymentStatus: 'all',
                  dueDateFrom: '',
                  dueDateTo: '',
                  paymentDateFrom: '',
                  paymentDateTo: ''
                })}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invoices Table */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading invoices...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={fetchInvoices}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className={`h-12 w-12 ${themeClasses.text.muted} mx-auto mb-4`} />
            <p className={`${themeClasses.text.secondary}`}>No invoices found</p>
            <p className={`text-sm ${themeClasses.text.muted} mt-2`}>
              {filters.search || filters.paymentStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Invoices will appear here once service requests are completed'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themeClasses.bg.secondary} border-b ${themeClasses.border.primary}`}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('invoice_number')}>
                      Invoice #
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Business
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Service Request
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('issue_date')}>
                      Issue Date
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider cursor-pointer`}
                        onClick={() => handleSort('due_date')}>
                      Due Date
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Amount
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.secondary} uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className={`${themeClasses.bg.hover} transition-colors cursor-pointer`}
                      onClick={() => handleViewInvoice(invoice.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`font-mono text-sm ${themeClasses.text.primary}`}>
                          {invoice.invoice_number}
                        </span>
                        {invoice.is_first_service_request && (
                          <div className="text-xs text-green-600 dark:text-green-400">First Service</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {invoice.business_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm font-mono ${themeClasses.text.primary}`}>
                          {invoice.request_number}
                        </div>
                        <div className={`text-xs ${themeClasses.text.muted}`}>
                          {invoice.service_title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {formatDate(invoice.issue_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {formatDate(invoice.due_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                          ${parseFloat(invoice.total_amount).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getPaymentStatusBadge(invoice.payment_status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewInvoice(invoice.id);
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInvoice(invoice);
                              setNewPaymentStatus(invoice.payment_status);
                              setPaymentDate(invoice.payment_date || '');
                              setShowPaymentModal(true);
                            }}
                            className="text-green-600 dark:text-green-400 hover:underline"
                          >
                            Update Status
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex items-center justify-between`}>
                <div className={`text-sm ${themeClasses.text.secondary}`}>
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} invoices
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className={`px-3 py-1 rounded ${pagination.page === 1 ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className={`px-3 py-1 rounded ${pagination.page === pagination.totalPages ? 'opacity-50 cursor-not-allowed' : themeClasses.bg.hover}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Status Update Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-md w-full p-6`}>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
              Update Payment Status
            </h2>

            <p className={`text-sm ${themeClasses.text.secondary} mb-4`}>
              Invoice: <span className="font-mono">{selectedInvoice.invoice_number}</span>
            </p>

            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Payment Status
              </label>
              <select
                value={newPaymentStatus}
                onChange={(e) => setNewPaymentStatus(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              >
                <option value="due">Due</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
                <option value="comped">Comped</option>
              </select>
            </div>

            <div className="mb-4">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Payment Date (Optional)
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
              />
            </div>

            <div className="mb-6">
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Notes (Optional)
              </label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Add notes about this payment..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg ${themeClasses.input} resize-none`}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleUpdatePaymentStatus}
                disabled={updatingPayment}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingPayment ? 'Updating...' : 'Update Status'}
              </button>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedInvoice(null);
                  setNewPaymentStatus('');
                  setPaymentDate('');
                  setPaymentNotes('');
                }}
                disabled={updatingPayment}
                className={`flex-1 px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80 disabled:opacity-50`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Viewer Modal */}
      {showInvoiceModal && selectedInvoiceId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
            {loadingInvoice ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading invoice...</p>
              </div>
            ) : invoiceData ? (
              <div className="p-6">
                {/* Header with Close Button */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                  <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Invoice #{invoiceData.invoice.invoice_number}
                  </h2>
                  <button
                    onClick={() => {
                      setShowInvoiceModal(false);
                      setSelectedInvoiceId(null);
                      setInvoiceData(null);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      isDark
                        ? 'hover:bg-gray-700 text-gray-400'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                {/* Invoice Details */}
                <div className="space-y-6">
                  {/* From and Bill To */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Company Info */}
                    {invoiceData.companyInfo && (
                      <div>
                        <h3 className={`font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          From:
                        </h3>
                        <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          <p className="font-medium">{invoiceData.companyInfo.company_name}</p>
                          <p>{invoiceData.companyInfo.company_address}</p>
                          <p>{invoiceData.companyInfo.company_city}, {invoiceData.companyInfo.company_state} {invoiceData.companyInfo.company_zip}</p>
                          <p>{invoiceData.companyInfo.company_phone}</p>
                          <p>{invoiceData.companyInfo.company_email}</p>
                        </div>
                      </div>
                    )}

                    {/* Bill To */}
                    <div>
                      <h3 className={`font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Bill To:
                      </h3>
                      <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceData.invoice.primary_contact_name && (
                          <p>{invoiceData.invoice.primary_contact_name}</p>
                        )}
                        {invoiceData.invoice.street_address && (
                          <p>{invoiceData.invoice.street_address}</p>
                        )}
                        {(invoiceData.invoice.city || invoiceData.invoice.state || invoiceData.invoice.zip_code) && (
                          <p>
                            {invoiceData.invoice.city}
                            {invoiceData.invoice.city && (invoiceData.invoice.state || invoiceData.invoice.zip_code) && ', '}
                            {invoiceData.invoice.state} {invoiceData.invoice.zip_code}
                          </p>
                        )}
                        {invoiceData.invoice.primary_contact_phone && (
                          <p className="mt-2">
                            {(() => {
                              const phone = invoiceData.invoice.primary_contact_phone.replace(/\D/g, '');
                              if (phone.length === 10) {
                                return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
                              }
                              return invoiceData.invoice.primary_contact_phone;
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}></div>

                  {/* Service Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Service Request</p>
                      <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {invoiceData.invoice.request_number}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>SR Title</p>
                      <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {invoiceData.invoice.service_title}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Service Type</p>
                      <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        N/A
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Payment Status</p>
                      <div className="mt-1">
                        {getPaymentStatusBadge(invoiceData.invoice.payment_status)}
                      </div>
                    </div>
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Issue Date</p>
                      <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {formatDate(invoiceData.invoice.issue_date)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Due Date</p>
                      <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {formatDate(invoiceData.invoice.due_date)}
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}></div>

                  {/* Service Description */}
                  {invoiceData.invoice.service_description && (
                    <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Service Description
                      </h3>
                      <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceData.invoice.service_description}
                      </p>
                    </div>
                  )}

                  {/* Resolution Summary */}
                  {invoiceData.invoice.resolution_summary && (
                    <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Resolution Summary
                      </h3>
                      <p className={`text-sm whitespace-pre-wrap ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceData.invoice.resolution_summary}
                      </p>
                    </div>
                  )}

                  {/* Actual Hours Breakdown (Before Rounding) */}
                  {(invoiceData as any).actualHoursBreakdown && (
                    <div className={`mt-6 p-4 rounded-lg border ${
                      isDark
                        ? 'bg-blue-900/20 border-blue-800'
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                        True Hours Worked (Before Rounding)
                      </h3>

                      {/* Time Entries */}
                      {(invoiceData as any).actualHoursBreakdown.timeEntries && (invoiceData as any).actualHoursBreakdown.timeEntries.length > 0 && (
                        <div className={`mb-4 pb-4 border-b ${isDark ? 'border-blue-700' : 'border-blue-300'}`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                            Work Sessions:
                          </h4>
                          <div className="space-y-1">
                            {(invoiceData as any).actualHoursBreakdown.timeEntries.map((entry: any, idx: number) => {
                              const startDate = new Date(entry.startTime);
                              const endDate = new Date(entry.endTime);
                              const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                              const hours = Math.floor(durationMinutes / 60);
                              const minutes = durationMinutes % 60;

                              return (
                                <div key={idx} className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                  <span className="font-medium">
                                    {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                  {' • '}
                                  <span>
                                    {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    {' - '}
                                    {endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                  <span className={`ml-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                    ({hours > 0 ? `${hours}h ` : ''}{minutes}m)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {/* Standard Hours */}
                        {parseFloat((invoiceData as any).actualHoursBreakdown.standard?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                              Standard (1.0x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                {(invoiceData as any).actualHoursBreakdown.standard.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Premium Hours */}
                        {parseFloat((invoiceData as any).actualHoursBreakdown.premium?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                              Premium (1.5x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                {(invoiceData as any).actualHoursBreakdown.premium.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Emergency Hours */}
                        {parseFloat((invoiceData as any).actualHoursBreakdown.emergency?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                              Emergency (2.0x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                {(invoiceData as any).actualHoursBreakdown.emergency.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`text-xs mt-3 pt-2 border-t italic ${
                        isDark ? 'text-blue-400 border-blue-700' : 'text-blue-600 border-blue-300'
                      }`}>
                        * All start/pause/resume times are actual. Final end time rounded up to nearest 15 minutes.
                      </div>
                    </div>
                  )}

                  {/* Original Schedule & Cost Estimate */}
                  {(invoiceData.invoice.requested_date || (invoiceData as any).costEstimate) && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Scheduled Date & Time */}
                      {invoiceData.invoice.requested_date && invoiceData.invoice.requested_time_start && invoiceData.invoice.requested_time_end && (
                        <div className={`p-3 rounded-lg border ${
                          isDark
                            ? 'bg-blue-900/20 border-blue-800'
                            : 'bg-blue-50 border-blue-200'
                        }`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                            Original Scheduled Date & Time
                          </h4>
                          <div className={`text-sm mb-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                            {formatDate(invoiceData.invoice.requested_date)}
                          </div>
                          <div className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                            {invoiceData.invoice.requested_time_start.substring(0, 5)} - {invoiceData.invoice.requested_time_end.substring(0, 5)}
                            {(invoiceData as any).costEstimate && ` (${(invoiceData as any).costEstimate.durationHours}h)`}
                          </div>
                        </div>
                      )}

                      {/* Cost Estimate */}
                      {(invoiceData as any).costEstimate && (
                        <div className={`p-3 rounded-lg border ${
                          isDark
                            ? 'bg-green-900/20 border-green-800'
                            : 'bg-green-50 border-green-200'
                        }`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-green-100' : 'text-green-900'}`}>
                            Original Cost Estimate
                          </h4>
                          <div className={`text-xs mb-1 ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                            Base Rate ({(invoiceData as any).costEstimate.rateCategoryName || 'Standard'}): ${(invoiceData as any).costEstimate.baseRate}/hr
                          </div>
                          {/* Tier Breakdown */}
                          {(invoiceData as any).costEstimate.breakdown && (invoiceData as any).costEstimate.breakdown.map((block: any, idx: number) => (
                            <div key={idx} className={`text-xs ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                              {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                            </div>
                          ))}
                          {/* First Hour Discount */}
                          {(invoiceData as any).costEstimate.firstHourDiscount && (invoiceData as any).costEstimate.firstHourDiscount > 0 && (
                            <>
                              <div className={`text-xs mt-1 pt-1 border-t ${
                                isDark ? 'text-green-300 border-green-700' : 'text-green-700 border-green-200'
                              }`}>
                                Subtotal: ${(invoiceData as any).costEstimate.subtotal?.toFixed(2)}
                              </div>
                              <div className={`text-xs font-medium mb-1 ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                                🎁 First Hour Comp (New Client):
                              </div>
                              {(invoiceData as any).costEstimate.firstHourCompBreakdown?.map((compBlock: any, idx: number) => (
                                <div key={idx} className={`text-xs ml-4 ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                                  • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                                </div>
                              ))}
                              {(invoiceData as any).costEstimate.firstHourCompBreakdown && (invoiceData as any).costEstimate.firstHourCompBreakdown.length > 1 && (
                                <div className={`text-xs font-medium ml-4 ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                                  Total Discount: -${(invoiceData as any).costEstimate.firstHourDiscount.toFixed(2)}
                                </div>
                              )}
                            </>
                          )}
                          <div className={`mt-1 pt-1 border-t text-sm font-semibold ${
                            isDark ? 'text-green-100 border-green-700' : 'text-green-900 border-green-200'
                          }`}>
                            Estimated Total*: ${(invoiceData as any).costEstimate.total.toFixed(2)}
                          </div>
                          <div className={`text-xs mt-1 italic ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            * Actual cost may vary based on time required to complete the service
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actual Billable Hours Summary */}
                  <div className={`mt-6 p-4 rounded-lg border ${
                    isDark
                      ? 'bg-purple-900/20 border-purple-800'
                      : 'bg-purple-50 border-purple-200'
                  }`}>
                    <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-purple-100' : 'text-purple-900'}`}>
                      Actual Billable Hours
                    </h3>

                    {/* First-time Client Discount */}
                    {invoiceData.invoice.is_first_service_request && parseFloat(invoiceData.invoice.waived_hours || 0) > 0 && (
                      <div className={`mb-3 pb-3 border-b ${isDark ? 'border-purple-700' : 'border-purple-300'}`}>
                        <p className={`text-xs mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                          First Service Request Discount:
                        </p>
                        <p className={`text-sm font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          New Client Assessment - Waived: {parseFloat(invoiceData.invoice.waived_hours).toFixed(2)} hours
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className={`mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Standard</div>
                        <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceData.invoice.standard_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>1.0x rate</div>
                      </div>
                      <div className="text-center">
                        <div className={`mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Premium</div>
                        <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceData.invoice.premium_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>1.5x rate</div>
                      </div>
                      <div className="text-center">
                        <div className={`mb-1 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Emergency</div>
                        <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceData.invoice.emergency_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>2.0x rate</div>
                      </div>
                    </div>
                    <div className={`mt-2 pt-2 border-t text-center ${isDark ? 'border-purple-700' : 'border-purple-300'}`}>
                      <span className={`text-xs ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Total Billable: </span>
                      <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {(parseFloat(invoiceData.invoice.standard_hours || 0) +
                          parseFloat(invoiceData.invoice.premium_hours || 0) +
                          parseFloat(invoiceData.invoice.emergency_hours || 0)).toFixed(2)} hours
                      </span>
                    </div>
                  </div>

                  {/* Time & Cost Breakdown */}
                  <div className={`mt-6 p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Cost Breakdown by Rate Tier
                    </h3>

                    {/* Billable Hours Table */}
                    <div className={`overflow-hidden border rounded-lg ${
                      isDark ? 'border-gray-600' : 'border-gray-200'
                    }`}>
                      <table className="w-full">
                        <thead className={isDark ? 'bg-gray-700' : 'bg-gray-100'}>
                          <tr>
                            <th className={`px-4 py-3 text-left text-sm font-semibold ${
                              isDark ? 'text-white' : 'text-gray-900'
                            }`}>
                              Rate Tier
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDark ? 'text-white' : 'text-gray-900'
                            }`}>
                              Hours
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDark ? 'text-white' : 'text-gray-900'
                            }`}>
                              Rate
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDark ? 'text-white' : 'text-gray-900'
                            }`}>
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-gray-600' : 'divide-gray-200'}`}>
                          {/* Standard Hours */}
                          {parseFloat(invoiceData.invoice.standard_hours || 0) > 0 && (
                            <tr className={isDark ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                Standard (1.0x)
                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Mon-Fri 8am-5pm
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceData.invoice.standard_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceData.invoice.standard_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDark ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceData.invoice.standard_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}

                          {/* Premium Hours */}
                          {parseFloat(invoiceData.invoice.premium_hours || 0) > 0 && (
                            <tr className={isDark ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                Premium (1.5x)
                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Weekends
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceData.invoice.premium_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceData.invoice.premium_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDark ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceData.invoice.premium_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}

                          {/* Emergency Hours */}
                          {parseFloat(invoiceData.invoice.emergency_hours || 0) > 0 && (
                            <tr className={isDark ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                Emergency (2.0x)
                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Late night/overnight
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceData.invoice.emergency_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceData.invoice.emergency_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDark ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceData.invoice.emergency_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className={`text-xs mt-2 italic ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      * Final end time rounded up to nearest 15 minutes. Exact hours billed per tier.
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="mb-6">
                    <div className="max-w-sm ml-auto space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Subtotal:</span>
                        <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          ${parseFloat(invoiceData.invoice.subtotal).toFixed(2)}
                        </span>
                      </div>
                      {invoiceData.invoice.tax_rate > 0 && (
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                            Tax ({(invoiceData.invoice.tax_rate * 100).toFixed(2)}%):
                          </span>
                          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            ${parseFloat(invoiceData.invoice.tax_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className={`flex justify-between pt-2 border-t-2 ${isDark ? 'border-gray-600' : 'border-gray-300'}`}>
                        <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Total Due:</span>
                        <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          ${parseFloat(invoiceData.invoice.total_amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className={`text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <p>Payment due within 30 days of invoice date.</p>
                    <p className="mt-1">Thank you for your business!</p>
                  </div>

                  {/* Payment Status - Bottom Left */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Payment Status:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          invoiceData.invoice.payment_status === 'paid' || invoiceData.invoice.payment_status === 'comped'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : invoiceData.invoice.payment_status === 'overdue' || invoiceData.invoice.payment_status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                        }`}
                      >
                        {invoiceData.invoice.payment_status.toUpperCase()}
                      </span>
                    </div>
                    {invoiceData.invoice.payment_date && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Payment Date:</span>
                        <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                          {formatDate(invoiceData.invoice.payment_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInvoices;
