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
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: CheckCircle,
        label: 'Paid',
      },
      due: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        icon: Clock,
        label: 'Due',
      },
      pending: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        icon: Clock,
        label: 'Pending',
      },
      failed: {
        bg: 'bg-red-100',
        text: 'text-red-800',
        icon: AlertCircle,
        label: 'Failed',
      },
      overdue: {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        icon: AlertCircle,
        label: 'Overdue',
      },
      comped: {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        icon: CheckCircle,
        label: 'Comped',
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.due;
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {config.label}
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
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-800 font-medium">Error loading invoices</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
          <button
            onClick={fetchInvoices}
            className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-7 h-7 text-blue-600" />
          Invoices
        </h2>

        <div className="flex gap-2">
          {['all', 'due', 'paid', 'overdue', 'failed'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">No invoices found</p>
          <p className="text-gray-500 text-sm mt-2">
            {filterStatus !== 'all'
              ? `No ${filterStatus} invoices at this time.`
              : 'You have no invoices at this time.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Invoice #{invoice.invoice_number}
                    </h3>
                    {getStatusBadge(invoice.payment_status)}
                  </div>
                  {invoice.service_title && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      {invoice.service_title}
                      {invoice.request_number && ` (SR-${invoice.request_number})`}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatAmount(invoice.total_amount)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Issued: {formatDate(invoice.issue_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Due: {formatDate(invoice.due_date)}</span>
                </div>
                {invoice.payment_date && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Paid: {formatDate(invoice.payment_date)}</span>
                  </div>
                )}
                {invoice.payment_method && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <CreditCard className="w-4 h-4" />
                    <span>Method: {invoice.payment_method}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                {invoice.payment_status !== 'paid' && (
                  <button
                    onClick={() => setSelectedInvoice(invoice)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <DollarSign className="w-4 h-4" />
                    Pay Now
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
