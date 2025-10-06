import React from 'react';
import { XCircle, Download } from 'lucide-react';
import { useTheme, themeClasses } from '../../../contexts/ThemeContext';
import { Invoice, CompanyInfo } from './types';

interface InvoiceViewerModalProps {
  show: boolean;
  selectedInvoiceId: string | null;
  invoiceData: { invoice: Invoice; companyInfo: CompanyInfo } | null;
  loadingInvoice: boolean;
  formatDate: (isoString: string | null) => string;
  onClose: () => void;
}

const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  show,
  selectedInvoiceId,
  invoiceData,
  loadingInvoice,
  formatDate,
  onClose
}) => {
  if (!show || !selectedInvoiceId) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
        {loadingInvoice ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading invoice...</p>
          </div>
        ) : invoiceData ? (
          <div className="p-8" id="invoice-content">
            {/* Header with Close Button */}
            <div className="flex justify-between items-start mb-6">
              <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Invoice</h2>
              <button
                onClick={onClose}
                className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Company Letterhead */}
            <div className="mb-8 pb-6 border-b-2 border-gray-300 dark:border-gray-600">
              <h1 className={`text-3xl font-bold ${themeClasses.text.primary} mb-2`}>
                {invoiceData.companyInfo.company_name}
              </h1>
              <div className={`text-sm ${themeClasses.text.secondary}`}>
                <p>{invoiceData.companyInfo.company_address_line1}</p>
                <p>{invoiceData.companyInfo.company_address_line2}</p>
                <p>
                  {invoiceData.companyInfo.company_city}, {invoiceData.companyInfo.company_state}{' '}
                  {invoiceData.companyInfo.company_zip}
                </p>
                <p className="mt-2">Phone: {invoiceData.companyInfo.company_phone}</p>
                <p>Email: {invoiceData.companyInfo.company_email}</p>
              </div>
            </div>

            {/* Invoice Details & Client Info Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Invoice Details */}
              <div>
                <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Invoice Details</h3>
                <div className={`space-y-2 text-sm ${themeClasses.text.secondary}`}>
                  <div className="flex justify-between">
                    <span className="font-medium">Invoice Number:</span>
                    <span className="font-mono">{invoiceData.invoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Issue Date:</span>
                    <span>{formatDate(invoiceData.invoice.issue_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Due Date:</span>
                    <span className="font-semibold">{formatDate(invoiceData.invoice.due_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Payment Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        invoiceData.invoice.payment_status === 'paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : invoiceData.invoice.payment_status === 'overdue'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                      }`}
                    >
                      {invoiceData.invoice.payment_status.toUpperCase()}
                    </span>
                  </div>
                  {invoiceData.invoice.payment_date && (
                    <div className="flex justify-between">
                      <span className="font-medium">Payment Date:</span>
                      <span>{formatDate(invoiceData.invoice.payment_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bill To */}
              <div>
                <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Bill To</h3>
                <div className={`text-sm ${themeClasses.text.secondary}`}>
                  <p className="font-semibold text-base">{invoiceData.invoice.business_name}</p>
                  <p className="mt-2">{invoiceData.invoice.primary_contact_name}</p>
                  <p>{invoiceData.invoice.street_address}</p>
                  <p>
                    {invoiceData.invoice.city}, {invoiceData.invoice.state} {invoiceData.invoice.zip_code}
                  </p>
                  <p className="mt-2">{invoiceData.invoice.primary_contact_phone}</p>
                  <p>{invoiceData.invoice.primary_contact_email}</p>
                </div>
              </div>
            </div>

            {/* Service Request Details */}
            <div className={`mb-6 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Service Request</h3>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-sm ${themeClasses.text.secondary}`}>
                <div>
                  <span className="font-medium">Request Number:</span>
                  <span className="ml-2 font-mono">{invoiceData.invoice.request_number}</span>
                </div>
                <div>
                  <span className="font-medium">Service:</span>
                  <span className="ml-2">{invoiceData.invoice.service_title}</span>
                </div>
                <div>
                  <span className="font-medium">Service Started:</span>
                  <span className="ml-2">{formatDate(invoiceData.invoice.service_created_at)}</span>
                </div>
                <div>
                  <span className="font-medium">Service Completed:</span>
                  <span className="ml-2">{formatDate(invoiceData.invoice.service_completed_at)}</span>
                </div>
              </div>
              {invoiceData.invoice.work_description && (
                <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                  <p className="font-medium text-sm mb-1">Work Description:</p>
                  <p className={`text-sm ${themeClasses.text.secondary} whitespace-pre-wrap`}>
                    {invoiceData.invoice.work_description}
                  </p>
                </div>
              )}
            </div>

            {/* Billable Hours Breakdown */}
            <div className="mb-6">
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-3`}>Time & Cost Breakdown</h3>

              {/* First-time Client Discount */}
              {invoiceData.invoice.is_first_service_request && invoiceData.invoice.waived_hours > 0 && (
                <div className={`mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-medium ${themeClasses.text.primary}`}>
                      New Client Assessment - Waived
                    </span>
                    <span className={`font-semibold text-green-600 dark:text-green-400`}>
                      {invoiceData.invoice.waived_hours.toFixed(2)} hours
                    </span>
                  </div>
                </div>
              )}

              {/* Billable Hours Table */}
              <div className={`overflow-hidden border ${themeClasses.border} rounded-lg`}>
                <table className="w-full">
                  <thead className={`${themeClasses.bg.secondary}`}>
                    <tr>
                      <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>
                        Rate Tier
                      </th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                        Hours
                      </th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                        Rate
                      </th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${themeClasses.border}`}>
                    {/* Standard Hours */}
                    {invoiceData.invoice.standard_hours > 0 && (
                      <tr>
                        <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                          Standard (1.0x)
                          <div className={`text-xs ${themeClasses.text.muted}`}>Mon-Fri 8am-5pm</div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          {invoiceData.invoice.standard_hours.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.standard_rate.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.standard_cost.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {/* Premium Hours */}
                    {invoiceData.invoice.premium_hours > 0 && (
                      <tr>
                        <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                          Premium (1.5x)
                          <div className={`text-xs ${themeClasses.text.muted}`}>Weekends</div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          {invoiceData.invoice.premium_hours.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.premium_rate.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.premium_cost.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {/* Emergency Hours */}
                    {invoiceData.invoice.emergency_hours > 0 && (
                      <tr>
                        <td className={`px-4 py-3 text-sm ${themeClasses.text.primary}`}>
                          Emergency (2.0x)
                          <div className={`text-xs ${themeClasses.text.muted}`}>Late night/overnight</div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          {invoiceData.invoice.emergency_hours.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.emergency_rate.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${themeClasses.text.primary}`}>
                          ${invoiceData.invoice.emergency_cost.toFixed(2)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={`text-xs ${themeClasses.text.muted} mt-2 italic`}>
                * Final end time rounded up to nearest 15 minutes. Exact hours billed per tier.
              </div>
            </div>

            {/* Totals */}
            <div className="mb-6">
              <div className={`max-w-sm ml-auto space-y-2 text-sm`}>
                <div className="flex justify-between">
                  <span className={`${themeClasses.text.secondary}`}>Subtotal:</span>
                  <span className={`${themeClasses.text.primary} font-semibold`}>
                    ${invoiceData.invoice.subtotal.toFixed(2)}
                  </span>
                </div>
                {invoiceData.invoice.tax_rate > 0 && (
                  <div className="flex justify-between">
                    <span className={`${themeClasses.text.secondary}`}>
                      Tax ({(invoiceData.invoice.tax_rate * 100).toFixed(2)}%):
                    </span>
                    <span className={`${themeClasses.text.primary} font-semibold`}>
                      ${invoiceData.invoice.tax_amount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className={`flex justify-between pt-2 border-t-2 border-gray-300 dark:border-gray-600`}>
                  <span className={`text-lg font-bold ${themeClasses.text.primary}`}>Total Due:</span>
                  <span className={`text-lg font-bold ${themeClasses.text.primary}`}>
                    ${invoiceData.invoice.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoiceData.invoice.notes && (
              <div className={`mb-6 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
                <h3 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>Notes</h3>
                <p className={`text-sm ${themeClasses.text.secondary} whitespace-pre-wrap`}>
                  {invoiceData.invoice.notes}
                </p>
              </div>
            )}

            {/* Payment Terms */}
            <div className={`text-xs ${themeClasses.text.muted} text-center`}>
              <p>Payment due within 30 days of invoice date.</p>
              <p className="mt-1">Thank you for your business!</p>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex justify-end space-x-3">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Print / Save PDF
              </button>
              <button
                onClick={onClose}
                className={`px-4 py-2 ${themeClasses.bg.secondary} rounded-lg hover:opacity-80`}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InvoiceViewerModal;
