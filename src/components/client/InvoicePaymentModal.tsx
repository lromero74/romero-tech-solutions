import React, { useState, useEffect } from 'react';
import { X, Loader, AlertCircle } from 'lucide-react';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { StripePaymentForm } from './StripePaymentForm';
import { apiService } from '../../services/apiService';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

// Initialize Stripe
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
);

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: string | number;
  payment_status: string;
  due_date: string;
  issue_date: string;
  work_description?: string;
  service_title?: string;
  request_number?: string;
}

interface InvoicePaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const InvoicePaymentModal: React.FC<InvoicePaymentModalProps> = ({
  invoice,
  onClose,
  onPaymentSuccess,
}) => {
  const { t } = useClientLanguage();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await apiService.post<{
          success: boolean;
          clientSecret: string;
          paymentIntentId: string;
          error?: string;
        }>('/client/payments/create-intent', {
          invoiceId: invoice.id,
        });

        if (response.success && response.clientSecret) {
          setClientSecret(response.clientSecret);
        } else {
          setError(
            response.error || 'Failed to initialize payment. Please try again.'
          );
        }
      } catch (err: any) {
        console.error('Error creating payment intent:', err);
        setError(
          err.message || 'Unable to process payment at this time. Please try again later.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    createPaymentIntent();
  }, [invoice.id]);

  const stripeOptions: StripeElementsOptions = {
    clientSecret: clientSecret || undefined,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#2563eb',
      },
    },
  };

  const totalAmount =
    typeof invoice.total_amount === 'string'
      ? parseFloat(invoice.total_amount)
      : invoice.total_amount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Pay Invoice
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Invoice #{invoice.invoice_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={t('accessibility.close', undefined, 'Close')}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-gray-600">{t('payment.initializingPayment', undefined, 'Initializing secure payment...')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-600 text-center mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          ) : clientSecret ? (
            <Elements stripe={stripePromise} options={stripeOptions}>
              <StripePaymentForm
                amount={totalAmount}
                invoiceNumber={invoice.invoice_number}
                invoiceId={invoice.id}
                onSuccess={() => {
                  onPaymentSuccess();
                  onClose();
                }}
                onCancel={onClose}
              />
            </Elements>
          ) : null}
        </div>
      </div>
    </div>
  );
};
