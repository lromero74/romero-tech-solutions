import React, { useState, useEffect } from 'react';
import {
  FileText,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Loader,
  Eye,
  X,
} from 'lucide-react';
import { apiService } from '../../services/apiService';
import { InvoicePaymentModal } from './InvoicePaymentModal';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: string | number;
  payment_status: string;
  due_date: string;
  issue_date: string;
  payment_date?: string;
  work_description?: string;
  service_title?: string;
  request_number?: string;
  payment_method?: string;
}

interface InvoicesListProps {
  refreshTrigger?: number;
}

export const InvoicesList: React.FC<InvoicesListProps> = ({ refreshTrigger = 0 }) => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchInvoices = async () => {
    console.log('📋 [InvoicesList] Fetching invoices...');
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        sortBy: 'issue_date',
        sortOrder: 'DESC',
      });

      if (filterStatus && filterStatus !== 'all') {
        queryParams.append('paymentStatus', filterStatus);
      }

      console.log('📋 [InvoicesList] Calling API:', `/client/invoices?${queryParams.toString()}`);
      const response = await apiService.get<{
        success: boolean;
        data: {
          invoices: Invoice[];
        };
      }>(`/client/invoices?${queryParams.toString()}`);

      console.log('📋 [InvoicesList] Response:', response);

      if (response.success) {
        console.log('📋 [InvoicesList] Setting invoices:', response.data.invoices);
        setInvoices(response.data.invoices);
      }
    } catch (err) {
      console.error('❌ [InvoicesList] Error fetching invoices:', err);
      setError('Failed to load invoices. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [refreshTrigger, filterStatus]);

  const fetchInvoiceDetail = async (invoiceId: string) => {
    try {
      setLoadingDetail(true);
      const response = await apiService.get<{
        success: boolean;
        data: {
          invoice: any;
          companyInfo: any;
        };
      }>(`/client/invoices/${invoiceId}`);

      if (response.success) {
        setInvoiceDetail(response.data);
      }
    } catch (err) {
      console.error('❌ Error fetching invoice detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleViewDetails = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowDetailModal(true);
    fetchInvoiceDetail(invoiceId);
  };

  // Handle Escape key to close detail modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showDetailModal) {
        setShowDetailModal(false);
        setSelectedInvoiceId(null);
        setInvoiceDetail(null);
      }
    };

    if (showDetailModal) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [showDetailModal]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: {
        bgLight: 'bg-green-100',
        bgDark: 'dark:bg-green-900/30',
        textLight: 'text-green-800',
        textDark: 'dark:text-green-300',
        icon: CheckCircle,
        labelKey: 'invoices.status.paid',
      },
      due: {
        bgLight: 'bg-blue-100',
        bgDark: 'dark:bg-blue-900/30',
        textLight: 'text-blue-800',
        textDark: 'dark:text-blue-300',
        icon: Clock,
        labelKey: 'invoices.status.due',
      },
      pending: {
        bgLight: 'bg-yellow-100',
        bgDark: 'dark:bg-yellow-900/30',
        textLight: 'text-yellow-800',
        textDark: 'dark:text-yellow-300',
        icon: Clock,
        labelKey: 'invoices.status.pending',
      },
      failed: {
        bgLight: 'bg-red-100',
        bgDark: 'dark:bg-red-900/30',
        textLight: 'text-red-800',
        textDark: 'dark:text-red-300',
        icon: AlertCircle,
        labelKey: 'invoices.status.failed',
      },
      overdue: {
        bgLight: 'bg-orange-100',
        bgDark: 'dark:bg-orange-900/30',
        textLight: 'text-orange-800',
        textDark: 'dark:text-orange-300',
        icon: AlertCircle,
        labelKey: 'invoices.status.overdue',
      },
      comped: {
        bgLight: 'bg-purple-100',
        bgDark: 'dark:bg-purple-900/30',
        textLight: 'text-purple-800',
        textDark: 'dark:text-purple-300',
        icon: CheckCircle,
        labelKey: 'invoices.status.comped',
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.due;
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bgLight} ${config.bgDark} ${config.textLight} ${config.textDark}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {t(config.labelKey, status.charAt(0).toUpperCase() + status.slice(1))}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`border rounded-lg p-6 flex items-start gap-3 ${
        isDarkMode
          ? 'bg-red-900/20 border-red-800'
          : 'bg-red-50 border-red-200'
      }`}>
        <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
        <div>
          <p className={`font-medium ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>{t('invoices.errorLoading', 'Error loading invoices')}</p>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>{error}</p>
          <button
            onClick={fetchInvoices}
            className={`mt-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              isDarkMode
                ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            {t('invoices.tryAgain', 'Try Again')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className={`text-2xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          <FileText className={`w-7 h-7 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          {t('invoices.title', 'Invoices')}
        </h2>

        <div className="flex flex-wrap gap-2">
          {['all', 'due', 'paid', 'overdue', 'failed'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`invoices.filter.${status}`, status.charAt(0).toUpperCase() + status.slice(1))}
            </button>
          ))}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className={`border rounded-lg p-12 text-center ${
          isDarkMode
            ? 'bg-gray-800 border-gray-700'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <FileText className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <p className={`text-lg font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('invoices.noInvoices', 'No invoices found')}</p>
          <p className={`text-sm mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {filterStatus !== 'all'
              ? t('invoices.noFilteredInvoices', `No ${filterStatus} invoices at this time.`, { status: filterStatus })
              : t('invoices.noInvoicesYet', 'You have no invoices at this time.')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className={`border rounded-lg p-6 hover:shadow-md transition-shadow ${
                isDarkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Invoice #{invoice.invoice_number}
                    </h3>
                    {getStatusBadge(invoice.payment_status)}
                  </div>
                  {invoice.service_title && (
                    <p className={`text-sm flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <FileText className="w-4 h-4" />
                      {invoice.service_title}
                      {invoice.request_number && ` (${invoice.request_number})`}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatAmount(invoice.total_amount)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                <div className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <Calendar className="w-4 h-4" />
                  <span>{t('invoices.issued', 'Issued')}: {formatDate(invoice.issue_date)}</span>
                </div>
                <div className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <Calendar className="w-4 h-4" />
                  <span>{t('invoices.due', 'Due')}: {formatDate(invoice.due_date)}</span>
                </div>
                {invoice.payment_date && (
                  <div className={`flex items-center gap-2 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                    <CheckCircle className="w-4 h-4" />
                    <span>{t('invoices.paid', 'Paid')}: {formatDate(invoice.payment_date)}</span>
                  </div>
                )}
                {invoice.payment_method && (
                  <div className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <CreditCard className="w-4 h-4" />
                    <span>{t('invoices.method', 'Method')}: {invoice.payment_method}</span>
                  </div>
                )}
              </div>

              <div className={`flex gap-3 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <button
                  onClick={() => handleViewDetails(invoice.id)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium ${
                    isDarkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  {t('invoices.viewDetails', 'View Details')}
                </button>
                {invoice.payment_status !== 'paid' && invoice.payment_status !== 'comped' && (
                  <button
                    onClick={() => setSelectedInvoice(invoice)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <DollarSign className="w-4 h-4" />
                    {t('invoices.payNow', 'Pay Now')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoiceId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            {loadingDetail ? (
              <div className="p-8 text-center">
                <Loader className={`w-12 h-12 animate-spin mx-auto ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <p className={`mt-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Loading invoice details...</p>
              </div>
            ) : invoiceDetail ? (
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                  <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Invoice #{invoiceDetail.invoice.invoice_number}
                  </h2>
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setSelectedInvoiceId(null);
                      setInvoiceDetail(null);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      isDarkMode
                        ? 'hover:bg-gray-700 text-gray-400'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Invoice Details */}
                <div className="space-y-6">
                  {/* From and Bill To */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Company Info */}
                    {invoiceDetail.companyInfo && (
                      <div>
                        <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          From:
                        </h3>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          <p className="font-medium">{invoiceDetail.companyInfo.company_name}</p>
                          <p>{invoiceDetail.companyInfo.company_address}</p>
                          <p>{invoiceDetail.companyInfo.company_city}, {invoiceDetail.companyInfo.company_state} {invoiceDetail.companyInfo.company_zip}</p>
                          <p>{invoiceDetail.companyInfo.company_phone}</p>
                          <p>{invoiceDetail.companyInfo.company_email}</p>
                        </div>
                      </div>
                    )}

                    {/* Bill To */}
                    <div>
                      <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Bill To:
                      </h3>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceDetail.invoice.primary_contact_name && (
                          <p>{invoiceDetail.invoice.primary_contact_name}</p>
                        )}
                        {invoiceDetail.invoice.street_address_1 && (
                          <p>{invoiceDetail.invoice.street_address_1}</p>
                        )}
                        {invoiceDetail.invoice.street_address_2 && (
                          <p>{invoiceDetail.invoice.street_address_2}</p>
                        )}
                        {(invoiceDetail.invoice.city || invoiceDetail.invoice.state || invoiceDetail.invoice.zip_code) && (
                          <p>
                            {invoiceDetail.invoice.city}
                            {invoiceDetail.invoice.city && (invoiceDetail.invoice.state || invoiceDetail.invoice.zip_code) && ', '}
                            {invoiceDetail.invoice.state} {invoiceDetail.invoice.zip_code}
                          </p>
                        )}
                        {invoiceDetail.invoice.primary_contact_phone && (
                          <p className="mt-2">
                            {(() => {
                              const phone = invoiceDetail.invoice.primary_contact_phone.replace(/\D/g, '');
                              if (phone.length === 10) {
                                return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
                              }
                              return invoiceDetail.invoice.primary_contact_phone;
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>

                  {/* Service Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Service Request</p>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {invoiceDetail.invoice.request_number}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>SR Title</p>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {invoiceDetail.invoice.service_title}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Service Type</p>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {invoiceDetail.invoice.service_type || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Payment Status</p>
                      <div className="mt-1">
                        {(() => {
                          const status = invoiceDetail.invoice.payment_status;
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
                        })()}
                      </div>
                    </div>
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Issue Date</p>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {formatDate(invoiceDetail.invoice.issue_date)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Due Date</p>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {formatDate(invoiceDetail.invoice.due_date)}
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>

                  {/* Service Description */}
                  {invoiceDetail.invoice.service_description && (
                    <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Service Description
                      </h3>
                      <p className={`text-sm whitespace-pre-wrap ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceDetail.invoice.service_description}
                      </p>
                    </div>
                  )}

                  {/* Resolution Summary */}
                  {invoiceDetail.invoice.resolution_summary && (
                    <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Resolution Summary
                      </h3>
                      <p className={`text-sm whitespace-pre-wrap ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {invoiceDetail.invoice.resolution_summary}
                      </p>
                    </div>
                  )}

                  {/* Actual Hours Breakdown (Before Rounding) */}
                  {invoiceDetail.actualHoursBreakdown && (
                    <div className={`mt-6 p-4 rounded-lg border ${
                      isDarkMode
                        ? 'bg-blue-900/20 border-blue-800'
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                        True Hours Worked (Before Rounding)
                      </h3>

                      {/* Time Entries */}
                      {invoiceDetail.actualHoursBreakdown.timeEntries && invoiceDetail.actualHoursBreakdown.timeEntries.length > 0 && (
                        <div className={`mb-4 pb-4 border-b ${isDarkMode ? 'border-blue-700' : 'border-blue-300'}`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                            Work Sessions:
                          </h4>
                          <div className="space-y-1">
                            {invoiceDetail.actualHoursBreakdown.timeEntries.map((entry: any, idx: number) => {
                              const startDate = new Date(entry.startTime);
                              const endDate = new Date(entry.endTime);
                              const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
                              const hours = Math.floor(durationMinutes / 60);
                              const minutes = durationMinutes % 60;

                              return (
                                <div key={idx} className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                  <span className="font-medium">
                                    {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                  {' • '}
                                  <span>
                                    {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    {' - '}
                                    {endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                  <span className={`ml-2 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
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
                        {parseFloat(invoiceDetail.actualHoursBreakdown.standard?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                              Standard (1.0x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                {invoiceDetail.actualHoursBreakdown.standard.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Premium Hours */}
                        {parseFloat(invoiceDetail.actualHoursBreakdown.premium?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                              Premium (1.5x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                {invoiceDetail.actualHoursBreakdown.premium.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Emergency Hours */}
                        {parseFloat(invoiceDetail.actualHoursBreakdown.emergency?.actualHours || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                              Emergency (2.0x)
                            </span>
                            <div className="text-right">
                              <div className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                {invoiceDetail.actualHoursBreakdown.emergency.actualHours} hrs (worked)
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`text-xs mt-3 pt-2 border-t italic ${
                        isDarkMode ? 'text-blue-400 border-blue-700' : 'text-blue-600 border-blue-300'
                      }`}>
                        * All start/pause/resume times are actual. Final end time rounded up to nearest 15 minutes.
                      </div>
                    </div>
                  )}

                  {/* Original Schedule & Cost Estimate */}
                  {(invoiceDetail.invoice.requested_date || invoiceDetail.costEstimate) && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Scheduled Date & Time */}
                      {invoiceDetail.invoice.requested_date && invoiceDetail.invoice.requested_time_start && invoiceDetail.invoice.requested_time_end && (
                        <div className={`p-3 rounded-lg border ${
                          isDarkMode
                            ? 'bg-blue-900/20 border-blue-800'
                            : 'bg-blue-50 border-blue-200'
                        }`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                            Original Scheduled Date & Time
                          </h4>
                          <div className={`text-sm mb-1 ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                            {formatDate(invoiceDetail.invoice.requested_date)}
                          </div>
                          <div className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                            {invoiceDetail.invoice.requested_time_start.substring(0, 5)} - {invoiceDetail.invoice.requested_time_end.substring(0, 5)}
                            {invoiceDetail.costEstimate && ` (${invoiceDetail.costEstimate.durationHours}h)`}
                          </div>
                        </div>
                      )}

                      {/* Cost Estimate */}
                      {invoiceDetail.costEstimate && (
                        <div className={`p-3 rounded-lg border ${
                          isDarkMode
                            ? 'bg-green-900/20 border-green-800'
                            : 'bg-green-50 border-green-200'
                        }`}>
                          <h4 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-green-100' : 'text-green-900'}`}>
                            Original Cost Estimate
                          </h4>
                          <div className={`text-xs mb-1 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                            Base Rate ({invoiceDetail.costEstimate.rateCategoryName || 'Standard'}): ${invoiceDetail.costEstimate.baseRate}/hr
                          </div>
                          {/* Tier Breakdown */}
                          {invoiceDetail.costEstimate.breakdown && invoiceDetail.costEstimate.breakdown.map((block, idx) => (
                            <div key={idx} className={`text-xs ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                              {block.hours}h {block.tierName} @ {block.multiplier}x = ${block.cost.toFixed(2)}
                            </div>
                          ))}
                          {/* First Hour Discount */}
                          {invoiceDetail.costEstimate.firstHourDiscount && invoiceDetail.costEstimate.firstHourDiscount > 0 && (
                            <>
                              <div className={`text-xs mt-1 pt-1 border-t ${
                                isDarkMode ? 'text-green-300 border-green-700' : 'text-green-700 border-green-200'
                              }`}>
                                Subtotal: ${invoiceDetail.costEstimate.subtotal?.toFixed(2)}
                              </div>
                              <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                                🎁 First Hour Comp (New Client):
                              </div>
                              {invoiceDetail.costEstimate.firstHourCompBreakdown?.map((compBlock, idx) => (
                                <div key={idx} className={`text-xs ml-4 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                                  • {compBlock.hours}h {compBlock.tierName} @ {compBlock.multiplier}x = -${compBlock.discount.toFixed(2)}
                                </div>
                              ))}
                              {invoiceDetail.costEstimate.firstHourCompBreakdown && invoiceDetail.costEstimate.firstHourCompBreakdown.length > 1 && (
                                <div className={`text-xs font-medium ml-4 ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                                  Total Discount: -${invoiceDetail.costEstimate.firstHourDiscount.toFixed(2)}
                                </div>
                              )}
                            </>
                          )}
                          <div className={`mt-1 pt-1 border-t text-sm font-semibold ${
                            isDarkMode ? 'text-green-100 border-green-700' : 'text-green-900 border-green-200'
                          }`}>
                            Estimated Total*: ${invoiceDetail.costEstimate.total.toFixed(2)}
                          </div>
                          <div className={`text-xs mt-1 italic ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                            * Actual cost may vary based on time required to complete the service
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actual Billable Hours Summary */}
                  <div className={`mt-6 p-4 rounded-lg border ${
                    isDarkMode
                      ? 'bg-purple-900/20 border-purple-800'
                      : 'bg-purple-50 border-purple-200'
                  }`}>
                    <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-purple-100' : 'text-purple-900'}`}>
                      Actual Billable Hours
                    </h3>

                    {/* First-time Client Discount */}
                    {invoiceDetail.invoice.is_first_service_request && parseFloat(invoiceDetail.invoice.waived_hours || 0) > 0 && (
                      <div className={`mb-3 pb-3 border-b ${isDarkMode ? 'border-purple-700' : 'border-purple-300'}`}>
                        <p className={`text-xs mb-1 ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                          First Service Request Discount:
                        </p>
                        <p className={`text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          New Client Assessment - Waived: {parseFloat(invoiceDetail.invoice.waived_hours).toFixed(2)} hours
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className={`mb-1 ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>Standard</div>
                        <div className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceDetail.invoice.standard_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>1.0x rate</div>
                      </div>
                      <div className="text-center">
                        <div className={`mb-1 ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>Premium</div>
                        <div className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceDetail.invoice.premium_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>1.5x rate</div>
                      </div>
                      <div className="text-center">
                        <div className={`mb-1 ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>Emergency</div>
                        <div className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {parseFloat(invoiceDetail.invoice.emergency_hours || 0).toFixed(2)} hrs
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>2.0x rate</div>
                      </div>
                    </div>
                    <div className={`mt-2 pt-2 border-t text-center ${isDarkMode ? 'border-purple-700' : 'border-purple-300'}`}>
                      <span className={`text-xs ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>Total Billable: </span>
                      <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {(parseFloat(invoiceDetail.invoice.standard_hours || 0) +
                          parseFloat(invoiceDetail.invoice.premium_hours || 0) +
                          parseFloat(invoiceDetail.invoice.emergency_hours || 0)).toFixed(2)} hours
                      </span>
                    </div>
                  </div>

                  {/* Time & Cost Breakdown */}
                  <div className={`mt-6 p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Cost Breakdown by Rate Tier
                    </h3>

                    {/* Billable Hours Table */}
                    <div className={`overflow-hidden border rounded-lg ${
                      isDarkMode ? 'border-gray-600' : 'border-gray-200'
                    }`}>
                      <table className="w-full">
                        <thead className={isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                          <tr>
                            <th className={`px-4 py-3 text-left text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              Rate Tier
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              Hours
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              Rate
                            </th>
                            <th className={`px-4 py-3 text-right text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDarkMode ? 'divide-gray-600' : 'divide-gray-200'}`}>
                          {/* Standard Hours */}
                          {parseFloat(invoiceDetail.invoice.standard_hours || 0) > 0 && (
                            <tr className={isDarkMode ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                Standard (1.0x)
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Mon-Fri 8am-5pm
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceDetail.invoice.standard_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceDetail.invoice.standard_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceDetail.invoice.standard_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}

                          {/* Premium Hours */}
                          {parseFloat(invoiceDetail.invoice.premium_hours || 0) > 0 && (
                            <tr className={isDarkMode ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                Premium (1.5x)
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Weekends
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceDetail.invoice.premium_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceDetail.invoice.premium_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceDetail.invoice.premium_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}

                          {/* Emergency Hours */}
                          {parseFloat(invoiceDetail.invoice.emergency_hours || 0) > 0 && (
                            <tr className={isDarkMode ? 'bg-gray-800' : 'bg-white'}>
                              <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                Emergency (2.0x)
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Late night/overnight
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {parseFloat(invoiceDetail.invoice.emergency_hours).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                ${parseFloat(invoiceDetail.invoice.emergency_rate).toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                ${parseFloat(invoiceDetail.invoice.emergency_cost).toFixed(2)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className={`text-xs mt-2 italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      * Final end time rounded up to nearest 15 minutes. Exact hours billed per tier.
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="mb-6">
                    <div className="max-w-sm ml-auto space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Subtotal:</span>
                        <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          ${parseFloat(invoiceDetail.invoice.subtotal).toFixed(2)}
                        </span>
                      </div>
                      {invoiceDetail.invoice.tax_rate > 0 && (
                        <div className="flex justify-between">
                          <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                            Tax ({(invoiceDetail.invoice.tax_rate * 100).toFixed(2)}%):
                          </span>
                          <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            ${parseFloat(invoiceDetail.invoice.tax_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className={`flex justify-between pt-2 border-t-2 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                        <span className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Total Due:</span>
                        <span className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          ${parseFloat(invoiceDetail.invoice.total_amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className={`text-xs text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <p>Payment due within 30 days of invoice date.</p>
                    <p className="mt-1">Thank you for your business!</p>
                  </div>

                  {/* Payment Status - Bottom Left */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Payment Status:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          invoiceDetail.invoice.payment_status === 'paid' || invoiceDetail.invoice.payment_status === 'comped'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : invoiceDetail.invoice.payment_status === 'overdue' || invoiceDetail.invoice.payment_status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                        }`}
                      >
                        {invoiceDetail.invoice.payment_status.toUpperCase()}
                      </span>
                    </div>
                    {invoiceDetail.invoice.payment_date && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Payment Date:</span>
                        <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                          {formatDate(invoiceDetail.invoice.payment_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Failed to load invoice details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedInvoice && (
        <InvoicePaymentModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPaymentSuccess={() => {
            setSelectedInvoice(null);
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
};
