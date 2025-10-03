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

  const fetchInvoices = async () => {
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

      const response = await apiService.get<{
        success: boolean;
        data: {
          invoices: Invoice[];
        };
      }>(`/client/invoices?${queryParams.toString()}`);

      if (response.data.success) {
        setInvoices(response.data.data.invoices);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to load invoices. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [refreshTrigger, filterStatus]);

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
                      {t('invoices.invoiceNumber', 'Invoice #{{number}}', { number: invoice.invoice_number })}
                    </h3>
                    {getStatusBadge(invoice.payment_status)}
                  </div>
                  {invoice.service_title && (
                    <p className={`text-sm flex items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <FileText className="w-4 h-4" />
                      {invoice.service_title}
                      {invoice.request_number && ` (SR-${invoice.request_number})`}
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
