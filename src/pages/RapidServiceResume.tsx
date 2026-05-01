import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';

const RapidServiceResume: React.FC = () => {
  const { isAuthenticated, isClient, authUser } = useEnhancedAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing your service request...');
  const [error, setError] = useState<string | null>(null);
  const [ticketResult, setTicketResult] = useState<{ requestNumber: string } | null>(null);

  useEffect(() => {
    const submitPendingRequest = async () => {
      if (!isAuthenticated || !isClient) return;

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const issueTitle = urlParams.get('issueTitle');
        const issueDescription = urlParams.get('issueDescription');
        const urgency = urlParams.get('urgency');

        if (!issueTitle || !issueDescription) {
          setStatus('error');
          setError('Missing request details. Please try again from the agent menu.');
          return;
        }

        // Call client-authenticated endpoint to create service request
        // Since the user is now logged in, we can use the regular SR creation logic
        // but we need to ensure the guest agent is linked (handled by auth/agent-magic-login).
        
        const response = await fetch('/api/client/service-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: issueTitle,
            description: issueDescription,
            urgencyLevel: urgency || 'Normal',
            serviceLocationId: null // Backend should default to HQ if null
          })
        });

        const result = await response.json();

        if (result.success) {
          setStatus('success');
          setTicketResult({ requestNumber: result.data.requestNumber });
          setMessage('Service request created successfully!');
        } else {
          setStatus('error');
          setError(result.message || 'Failed to create service request');
        }
      } catch (err) {
        setStatus('error');
        setError('A network error occurred.');
      }
    };

    submitPendingRequest();
  }, [isAuthenticated, isClient]);

  if (!isAuthenticated || !isClient) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-blue-100">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 pt-20">
      <div className="max-w-md w-full bg-slate-800 border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
        {status === 'loading' && (
          <div className="space-y-6">
            <Loader2 className="h-16 w-16 text-blue-500 animate-spin mx-auto" />
            <h2 className="text-2xl font-bold text-white">One Moment</h2>
            <p className="text-blue-100">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h2 className="text-3xl font-bold text-white">All Set!</h2>
            <p className="text-blue-100">
              Your service request <strong>{ticketResult?.requestNumber}</strong> has been created.
            </p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center space-x-2"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <AlertCircle className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-white">Oops!</h2>
            <p className="text-red-200">{error}</p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RapidServiceResume;