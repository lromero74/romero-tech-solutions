import React, { useState, useEffect } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { apiService } from '../services/apiService';

interface AgentLoginProps {
  onSuccess: () => void;
}

const AgentLogin: React.FC<AgentLoginProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const { setUserFromTrustedDevice } = useEnhancedAuth();

  useEffect(() => {
    const performMagicLinkLogin = async () => {
      try {
        // Get token from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (!token) {
          setStatus('error');
          setMessage('Invalid magic link. No token provided.');
          return;
        }

        // Call the agent magic-link login endpoint
        // Note: App should NOT load existing auth when on agent-login page
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiBaseUrl}/auth/agent-magic-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (result.success && result.user) {
          // Debug: Log the COMPLETE user data to verify all fields are present
          console.log('🔍 Agent magic-link authentication result (FULL):', result.user);

          // Store businessId in sessionStorage for permission checks. This
          // is always safe — the user's business doesn't change based on
          // which dashboard view they're heading to.
          if (result.user.businessId) {
            sessionStorage.setItem('pendingBusinessId', result.user.businessId);
            console.log('💾 Stored businessId in sessionStorage for permissions:', result.user.businessId);
          }

          // pendingAgentId tells ClientDashboard to auto-open the
          // AgentDetails view for that specific agent. We ONLY want
          // that when the magic link's intent is "show me this
          // device" (no redirect, or a redirect that's about the
          // device itself). When the intent is to land on a tab —
          // e.g. /schedule-service — setting pendingAgentId
          // hijacks the render and the user sees AgentDetails with
          // a "Back to Dashboard" button instead of the tab they
          // asked for. That was the bug behind the user's report
          // of being dropped on "the Dashboard" with a back link
          // when clicking "Schedule Service Request" in the tray.
          const tokenRedirect = result.redirect || null;
          const skipAgentDetails = tokenRedirect === '/schedule-service';
          if (result.user.agentId && !skipAgentDetails) {
            sessionStorage.setItem('pendingAgentId', result.user.agentId);
            console.log('💾 Stored agentId in sessionStorage for routing:', result.user.agentId);
          } else if (result.user.agentId) {
            console.log('⏭ Skipping pendingAgentId because redirect=', tokenRedirect);
          }

          // Store user info in auth context using setUserFromTrustedDevice
          // This method properly handles authentication state for magic-link logins
          await setUserFromTrustedDevice(result.user, result.session?.sessionToken);

          // Extract redirect path from JWT token if present
          const redirect = result.redirect || null;
          console.log('🔀 Redirect path from token:', redirect);

          // Check profile completion if redirect requires it
          let finalRedirect = null;

          if (redirect === '/schedule-service') {
            // Always preserve the user's intent (?tab=schedule-service)
            // even if the profile-completion check fails. Previously
            // the catch fallback dropped the tab param and dropped
            // the user on the default dashboard pane, which is the
            // bug the user hit ("It just opens the dashboard").
            finalRedirect = '/dashboard?tab=schedule-service';
            try {
              const profileStatus = await apiService.get<{
                success: boolean;
                data: {
                  requiresOnboarding: boolean;
                  hasServiceLocation: boolean;
                };
              }>('/client/profile/completion-status');

              console.log('📋 Profile status:', profileStatus.data);

              if (profileStatus.success && profileStatus.data.requiresOnboarding) {
                // User needs onboarding first — onboarding's `next`
                // param ensures we still land on the schedule pane
                // once the profile is complete.
                setMessage('Setting up your profile...');
                setStatus('success');
                setTimeout(() => {
                  window.location.href = '/onboarding?next=schedule-service';
                }, 1000);
                return;
              }
              // Profile complete: finalRedirect already set above.
            } catch (error) {
              console.error('Error checking profile status (using direct schedule redirect):', error);
              // finalRedirect already includes the tab.
            }
          } else if (redirect) {
            finalRedirect = redirect;
          }

          setStatus('success');
          setMessage('Welcome! Opening your agent dashboard...');

          // Automatically redirect after 1 second
          setTimeout(() => {
            if (finalRedirect) {
              window.location.href = finalRedirect;
            } else {
              onSuccess();
            }
          }, 1000);
        } else {
          setStatus('error');
          setMessage(result.message || 'Login failed. Please try again.');
        }
      } catch (error: unknown) {
        console.error('Error during agent magic-link login:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
      }
    };

    performMagicLinkLogin();
  }, [setUserFromTrustedDevice, onSuccess]);

  const renderLoadingState = () => (
    <div className="text-center">
      <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">Logging You In</h2>
      <p className="text-blue-200">
        Please wait while we load your dashboard...
      </p>
    </div>
  );

  const renderSuccessState = () => (
    <div className="text-center">
      <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">Login Successful!</h2>
      <p className="text-blue-200 mb-6">
        {message}
      </p>
      <div className="mt-6 text-center">
        <p className="text-sm text-blue-200 mb-4">
          Redirecting to your agent dashboard...
        </p>
        <button
          onClick={onSuccess}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
        >
          <span>View Dashboard</span>
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
      <h2 className="text-2xl font-bold text-white mb-4">Login Failed</h2>
      <p className="text-blue-200 mb-6">
        {message}
      </p>

      <div className="bg-red-500/20 backdrop-blur-sm border border-red-300/30 rounded-lg p-6 mb-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-300 mt-0.5" />
          <div className="text-sm text-red-200 text-left">
            <p className="font-medium mb-2">Possible reasons:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>The magic link has expired (links expire after 10 minutes)</li>
              <li>The link has already been used</li>
              <li>Invalid or corrupted link</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-blue-200 text-sm">
          Please return to your RTS Agent system tray menu and click "Open Dashboard" again.
        </p>
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-blue-200 mb-2">
          Need help?
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

export default AgentLogin;
