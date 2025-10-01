import React, { useState, useEffect, useRef } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Lock, Mail, Eye, EyeOff, User, ArrowRight, Shield, KeyRound } from 'lucide-react';
import SimplifiedClientRegistration from '../components/SimplifiedClientRegistration';
import TrustedDevicePrompt from '../components/TrustedDevicePrompt';
import { authService } from '../services/authService';
import { trustedDeviceService } from '../services/trustedDeviceService';

interface ClientLoginProps {
  onSuccess: () => void;
}

const ClientLogin: React.FC<ClientLoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const formClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const [showMfaVerification, setShowMfaVerification] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [showTrustedDevicePrompt, setShowTrustedDevicePrompt] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [emailError, setEmailError] = useState('');
  const { signIn, sendAdminMfaCode, verifyAdminMfaCode, verifyClientMfaCode, setUserFromTrustedDevice } = useEnhancedAuth();
  const { t } = useLanguage();
  const backgroundImageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMJA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80';

  // Cleanup timers on component unmount
  useEffect(() => {
    return () => {
      if (passwordTimerRef.current) {
        clearTimeout(passwordTimerRef.current);
      }
      if (formClearTimerRef.current) {
        clearTimeout(formClearTimerRef.current);
      }
    };
  }, []);

  // Start/restart form clear timer when user types
  const startFormClearTimer = () => {
    // Clear existing timer
    if (formClearTimerRef.current) {
      clearTimeout(formClearTimerRef.current);
    }

    // Set new 1-minute timer
    formClearTimerRef.current = setTimeout(() => {
      console.log('🧹 Auto-clearing form after 1 minute of inactivity');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setError('');
      // Clear password visibility timer if active
      if (passwordTimerRef.current) {
        clearTimeout(passwordTimerRef.current);
        passwordTimerRef.current = null;
      }
      formClearTimerRef.current = null;
    }, 60000); // 1 minute
  };

  // Validate email format
  const validateEmailFormat = (emailValue: string): boolean => {
    if (!emailValue) {
      setEmailError('');
      return true; // Don't show error for empty field (required attribute handles this)
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(emailValue);

    // Check length (RFC 5321 max is 254 characters)
    if (emailValue.length > 254) {
      setEmailError('Email is too long (max 254 characters)');
      return false;
    }

    if (!isValid) {
      setEmailError('Please enter a valid email address');
      return false;
    }

    setEmailError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('login.fillAllFields'));
      return;
    }

    // Clear form timer when user attempts to sign in
    if (formClearTimerRef.current) {
      clearTimeout(formClearTimerRef.current);
      formClearTimerRef.current = null;
    }

    setIsLoading(true);
    setError('');

    try {
      // Check if device is trusted before attempting login
      console.log('🔍 [Client] Checking if device is trusted for user:', email);
      const deviceTrustResult = await trustedDeviceService.checkPreAuthDeviceTrust(email);

      if (deviceTrustResult.success && deviceTrustResult.trusted) {
        console.log('✅ [Client] Device is trusted, attempting direct login...');

        // Device is trusted, try trusted device login
        const trustedLoginResult = await trustedDeviceService.loginWithTrustedDevice(email, password);

        if (trustedLoginResult.success && trustedLoginResult.user) {
          console.log('✅ [Client] Trusted device authentication completed successfully');
          console.log('🔄 [Client] Updating authentication context directly...');

          // Extract session token from nested session object
          const sessionToken = trustedLoginResult.session?.sessionToken;
          await setUserFromTrustedDevice(trustedLoginResult.user, sessionToken);
          console.log('✅ [Client] setUserFromTrustedDevice() completed');

          console.log('🔄 [Client] Calling onSuccess() to redirect to dashboard...');
          onSuccess();
          return;
        } else {
          console.log('⚠️ [Client] Trusted device login failed, falling back to normal flow');
        }
      } else {
        console.log('⚠️ [Client] Device is not trusted, using normal login flow');
      }

      // Normal login flow (device not trusted or trusted login failed)
      await signIn(email, password);

      // Show trusted device prompt after successful login (if device is not already trusted)
      if (!deviceTrustResult.trusted) {
        console.log('🔐 [Client] Showing trusted device prompt after successful login');
        setShowTrustedDevicePrompt(true);
      } else {
        onSuccess();
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'MFA_REQUIRED') {
        // Client user needs MFA verification (code already sent by backend)
        setMfaEmail(email);
        setMfaPassword(password);
        setShowMfaVerification(true);
        setIsLoading(false);
        setError(''); // Clear any previous errors
      } else {
        setError(error instanceof Error ? error.message : t('login.loginFailed'));
        setIsLoading(false);
      }
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode) {
      setError(t('login.mfa.enterCode'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await verifyClientMfaCode(mfaEmail, mfaCode);
      console.log('✅ [Client] MFA verification successful');

      // Handle trusted device registration if checkbox is checked
      if (rememberDevice) {
        console.log('🔐 [Client] User chose to register device as trusted during MFA verification');
        try {
          const registrationResult = await trustedDeviceService.registerCurrentDevice();
          if (registrationResult.success) {
            console.log('✅ [Client] Trusted device registered successfully during MFA verification');
          } else {
            console.error('❌ [Client] Failed to register trusted device during MFA verification:', registrationResult.message);
          }
        } catch (registrationError) {
          console.error('❌ [Client] Error registering trusted device during MFA verification:', registrationError);
        }
      }

      // Complete the login process
      console.log('🔄 [Client] Calling onSuccess() to redirect to client dashboard...');
      onSuccess();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('login.mfa.verificationFailed'));
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowMfaVerification(false);
    setMfaCode('');
    setMfaEmail('');
    setMfaPassword('');
    setError('');
  };

  const handleResendMfaCode = async () => {
    if (!mfaEmail) return;

    setIsLoading(true);
    setError('');

    try {
      // Use the dedicated client MFA resend endpoint
      await authService.resendClientMfaCode(mfaEmail);
      setError(t('login.mfa.codeSentSuccess'));
      setTimeout(() => setError(''), 3000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('login.mfa.codeResendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowRegistration = () => {
    setShowRegistration(true);
    setError('');
  };

  const handleHideRegistration = () => {
    setShowRegistration(false);
    setError('');
  };

  const handleRegistrationSuccess = async (credentials?: { email: string; password: string }) => {
    setShowRegistration(false);

    if (credentials) {
      // Auto-login after successful registration since account is already verified
      console.log('🚀 Auto-login after registration for:', credentials.email);

      // Set credentials in state for display
      setEmail(credentials.email);
      setPassword(credentials.password);

      // Automatically trigger login using credentials directly (not state)
      setIsLoading(true);
      setError('');

      try {
        // Check if device is trusted before attempting login
        console.log('🔍 [Client] Checking if device is trusted for user:', credentials.email);
        const deviceTrustResult = await trustedDeviceService.checkPreAuthDeviceTrust(credentials.email);

        if (deviceTrustResult.success && deviceTrustResult.trusted) {
          console.log('✅ [Client] Device is trusted, attempting direct login...');

          // Device is trusted, try trusted device login
          const trustedLoginResult = await trustedDeviceService.loginWithTrustedDevice(credentials.email, credentials.password);

          if (trustedLoginResult.success && trustedLoginResult.user) {
            console.log('✅ [Client] Trusted device authentication completed successfully');
            const sessionToken = trustedLoginResult.session?.sessionToken;
            await setUserFromTrustedDevice(trustedLoginResult.user, sessionToken);
            onSuccess();
            return;
          }
        }

        // Normal login flow
        await signIn(credentials.email, credentials.password);

        // Show trusted device prompt after successful login (if device is not already trusted)
        if (!deviceTrustResult.trusted) {
          console.log('🔐 [Client] Showing trusted device prompt after successful login');
          setShowTrustedDevicePrompt(true);
        } else {
          onSuccess();
        }
      } catch (error: unknown) {
        console.error('Auto-login after registration failed:', error);
        setError('Registration successful! Please log in with your credentials.');
        setIsLoading(false);
      }
    }
  };

  const handleTrustedDeviceRegister = async () => {
    console.log('👾 Client chose to register device as trusted');
    try {
      const response = await trustedDeviceService.registerCurrentDevice();
      if (response.success) {
        console.log('✅ Trusted device registered successfully for client');
      } else {
        console.error('❌ Failed to register trusted device:', response.message);
      }
    } catch (error) {
      console.error('❌ Error registering trusted device:', error);
    }
    onSuccess();
  };

  const handleTrustedDeviceSkip = () => {
    console.log('👾 Client chose to skip trusted device registration');
    onSuccess();
  };

  const handleTrustedDeviceClose = () => {
    setShowTrustedDevicePrompt(false);
  };

  // Show registration component if requested
  if (showRegistration) {
    return (
      <SimplifiedClientRegistration
        onSuccess={handleRegistrationSuccess}
        onCancel={handleHideRegistration}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen flex items-center justify-center overflow-hidden"
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
            backgroundImage: `url("${backgroundImageUrl}")`
          }}
        />

        <div className="relative z-10 max-w-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="mx-auto h-16 w-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center">
                {showMfaVerification ? (
                  <Shield className="h-8 w-8 text-white" />
                ) : (
                  <User className="h-8 w-8 text-white" />
                )}
              </div>
              <h2 className="mt-6 text-3xl font-extrabold text-white">
                {showMfaVerification ? t('login.mfa.title') : t('login.title')}
              </h2>
              <p className="mt-2 text-sm text-blue-100">
                {showMfaVerification
                  ? `${t('login.mfa.subtitle')} ${mfaEmail}`
                  : t('login.subtitle')
                }
              </p>
            </div>
            {showMfaVerification ? (
              <form className="space-y-6" onSubmit={handleMfaSubmit}>
                {error && (
                  <div className={`border rounded-md p-4 ${error.includes('successfully')
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                  }`}>
                    <p className={`text-sm ${error.includes('successfully')
                      ? 'text-green-800'
                      : 'text-red-800'
                    }`}>
                      {error}
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="mfaCode" className="block text-sm font-medium text-white">
                    {t('login.mfa.codeLabel')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="mfaCode"
                      name="mfaCode"
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      autoComplete="one-time-code"
                      required
                      value={mfaCode}
                      onChange={(e) => {
                        // Only allow numeric input, max 6 digits
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setMfaCode(value);
                      }}
                      className="appearance-none relative block w-full px-3 py-2 pl-10 border border-white/20 placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm text-center text-lg tracking-widest"
                      placeholder={t('login.mfa.codePlaceholder')}
                      maxLength={6}
                    />
                    <KeyRound className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                  </div>
                  <p className="mt-1 text-xs text-blue-200">
                    {t('login.mfa.codeHelper')}
                  </p>
                </div>

                {/* Trusted Device Checkbox */}
                <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">
                        Remember this device for 30 days
                      </span>
                      <p className="text-xs text-blue-200 mt-1">
                        Skip MFA verification on this device. Only select if this is your personal device.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <span>{t('login.mfa.verifyButton')}</span>
                        <Shield className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleResendMfaCode}
                    disabled={isLoading}
                    className="w-full text-sm text-blue-300 hover:text-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('login.mfa.resendCode')}
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="w-full text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {t('login.mfa.backToLogin')}
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <p className="text-sm text-green-800">{success}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white">
                    {t('login.email')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        startFormClearTimer();
                        // Clear error when user starts typing
                        if (emailError) {
                          setEmailError('');
                        }
                      }}
                      onBlur={(e) => validateEmailFormat(e.target.value)}
                      className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                        emailError ? 'border-red-400 ring-1 ring-red-400' : 'border-white/20'
                      } placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                      placeholder={t('login.emailPlaceholder')}
                      maxLength={254}
                    />
                    <Mail className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                  </div>
                  {emailError && (
                    <p className="mt-1 text-xs text-red-300">
                      {emailError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-white">
                    {t('login.password')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        startFormClearTimer();
                      }}
                      className="appearance-none relative block w-full px-3 py-2 pl-10 pr-10 border border-white/20 placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder={t('login.passwordPlaceholder')}
                    />
                    <Lock className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                    <button
                      type="button"
                      className="absolute right-3 top-2.5 text-gray-300 hover:text-white z-10 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('👁️ Password visibility toggle clicked, current state:', showPassword);

                        // Clear any existing timer
                        if (passwordTimerRef.current) {
                          clearTimeout(passwordTimerRef.current);
                          passwordTimerRef.current = null;
                        }

                        const newShowPassword = !showPassword;
                        setShowPassword(newShowPassword);

                        // If turning password visibility ON, set 10-second auto-hide timer
                        if (newShowPassword) {
                          console.log('🔒 Password visibility enabled - will auto-hide in 10 seconds');
                          passwordTimerRef.current = setTimeout(() => {
                            console.log('⏰ Auto-hiding password after 10 seconds');
                            setShowPassword(false);
                            passwordTimerRef.current = null;
                          }, 10000);
                        }
                      }}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <span>{t('login.signIn')}</span>
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={handleShowRegistration}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors shadow-lg"
                  >
                    {t('login.noAccount')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Trusted Device Prompt */}
      <TrustedDevicePrompt
        isOpen={showTrustedDevicePrompt}
        onClose={handleTrustedDeviceClose}
        onRegister={handleTrustedDeviceRegister}
        onSkip={handleTrustedDeviceSkip}
        userType="client"
      />
    </div>
  );
};

export default ClientLogin;