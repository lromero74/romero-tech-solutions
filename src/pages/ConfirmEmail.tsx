import React, { useState, useEffect } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { CheckCircle, AlertCircle, Mail, ArrowRight, RefreshCw } from 'lucide-react';

interface ConfirmEmailProps {
  onSuccess: () => void;
}

const ConfirmEmail: React.FC<ConfirmEmailProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [isResending, setIsResending] = useState(false);
  const { confirmClientEmail, resendConfirmationEmail } = useEnhancedAuth();

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Get token and email from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        const urlEmail = urlParams.get('email');

        if (!urlToken || !urlEmail) {
          setStatus('error');
          setMessage('Invalid confirmation link. Please check your email and try again.');
          return;
        }

        setToken(urlToken);
        setEmail(urlEmail);

        // Confirm email with backend
        const result = await confirmClientEmail(urlToken, urlEmail);

        if (result.success) {
          setStatus('success');
          setMessage(result.message);
          // Automatically redirect to dashboard after 3 seconds
          setTimeout(() => {
            onSuccess();
          }, 3000);
        } else {
          setStatus('error');
          setMessage(result.message || 'Email confirmation failed');
        }
      } catch (error: any) {
        console.error('Error confirming email:', error);
        setStatus('error');
        setMessage(error.message || 'An unexpected error occurred');
      }
    };

    confirmEmail();
  }, [confirmClientEmail, onSuccess]);

  const handleResendEmail = async () => {
    if (!email) return;

    setIsResending(true);
    try {
      const result = await resendConfirmationEmail(email);
      if (result.success) {
        setMessage('Confirmation email resent successfully! Please check your inbox.');
      } else {
        setMessage(result.message || 'Failed to resend email');
      }
    } catch (error: any) {
      setMessage(error.message || 'Failed to resend confirmation email');
    } finally {
      setIsResending(false);
    }
  };

  const renderLoadingState = () => (
    <div className="text-center">
      <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">Confirming Your Email</h2>
      <p className="text-blue-200">
        Please wait while we verify your email address...
      </p>
    </div>
  );

  const renderSuccessState = () => (
    <div className="text-center">
      <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">Email Confirmed!</h2>
      <p className="text-blue-200 mb-6">
        {message}
      </p>
      <div className="bg-green-500/20 backdrop-blur-sm border border-green-300/30 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <CheckCircle className="h-5 w-5 text-green-300 mt-0.5" />
          <div className="text-sm text-green-200">
            <p className="font-medium mb-2">Welcome to Romero Tech Solutions!</p>
            <p className="mb-4">Your business account is now active. You can:</p>
            <ul className="list-disc list-inside space-y-1 text-left">
              <li>Submit service requests</li>
              <li>Track ongoing projects</li>
              <li>Manage your service locations</li>
              <li>View service history and invoices</li>
              <li>Communicate directly with technicians</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-6 text-center">
        <p className="text-sm text-blue-200 mb-4">
          Redirecting to your dashboard in a few seconds...
        </p>
        <button
          onClick={onSuccess}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
        >
          <span>Access Your Dashboard</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderErrorState = () => (
    <div className="text-center">
      <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">Confirmation Failed</h2>
      <p className="text-blue-200 mb-6">
        {message}
      </p>

      {email && (
        <div className="bg-red-500/20 backdrop-blur-sm border border-red-300/30 rounded-lg p-6 mb-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-300 mt-0.5" />
            <div className="text-sm text-red-200 text-left">
              <p className="font-medium mb-2">Possible reasons:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The confirmation link has expired</li>
                <li>The link has already been used</li>
                <li>The link was corrupted in your email</li>
                <li>There was a temporary server issue</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {email && (
          <button
            onClick={handleResendEmail}
            disabled={isResending}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Resend Confirmation Email</span>
              </>
            )}
          </button>
        )}

        <button
          onClick={() => window.location.href = '/login'}
          className="w-full px-6 py-3 border border-white/30 text-white hover:bg-white/10 rounded-lg transition-colors duration-200"
        >
          Back to Login
        </button>
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-blue-200 mb-2">
          Still having trouble?
        </p>
        <div className="space-y-1">
          <p className="text-sm">
            📞 Call us: <a href="tel:+16199405550" className="text-white hover:text-blue-200">(619) 940-5550</a>
          </p>
          <p className="text-sm">
            ✉️ Email: <a href="mailto:info@romerotechsolutions.com" className="text-white hover:text-blue-200">info@romerotechsolutions.com</a>
          </p>
        </div>
      </div>
    </div>
  );

  const renderCurrentState = () => {
    switch (status) {
      case 'loading':
        return renderLoadingState();
      case 'success':
        return renderSuccessState();
      case 'error':
      case 'expired':
        return renderErrorState();
      default:
        return renderLoadingState();
    }
  };

  return (
    <div className="min-h-screen">
      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen flex items-center justify-center overflow-hidden cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const particleEvent = new CustomEvent('generateParticles', {
            detail: { x: clickX, y: clickY }
          });
          window.dispatchEvent(particleEvent);
        }}
      >
        {/* Background elements */}
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80")'
          }}
        />

        <div className="relative z-10 max-w-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
            {renderCurrentState()}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ConfirmEmail;