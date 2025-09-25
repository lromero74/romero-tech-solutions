import React, { useState } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Lock, Mail, Eye, EyeOff, User, ArrowRight, Shield, KeyRound } from 'lucide-react';
import ClientRegistration from '../components/ClientRegistration';
import ImageBasedSection from '../components/common/ImageBasedSection';

interface ClientLoginProps {
  onSuccess: () => void;
}

const ClientLogin: React.FC<ClientLoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const [showMfaVerification, setShowMfaVerification] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const { signIn, sendAdminMfaCode, verifyAdminMfaCode } = useEnhancedAuth();
  const { t } = useLanguage();
  const backgroundImageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&ixid=M3wxMJA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2344&q=80';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('login.fillAllFields'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await signIn(email, password);
      onSuccess();
    } catch (error: any) {
      if (error.message === 'MFA_REQUIRED') {
        // Admin user needs MFA verification
        setMfaEmail(email);
        setMfaPassword(password);
        setShowMfaVerification(true);
        setIsLoading(false);

        // Automatically send MFA code
        try {
          await sendAdminMfaCode(email, password);
          setError('');
        } catch (mfaError: any) {
          setError(mfaError.message || 'Failed to send verification code');
          setIsLoading(false);
        }
      } else {
        setError(error.message || t('login.loginFailed'));
        setIsLoading(false);
      }
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode) {
      setError('Please enter the verification code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await verifyAdminMfaCode(mfaEmail, mfaCode);
      onSuccess();
    } catch (error: any) {
      setError(error.message || 'Verification failed');
    } finally {
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
    if (!mfaEmail || !mfaPassword) return;

    setIsLoading(true);
    setError('');

    try {
      await sendAdminMfaCode(mfaEmail, mfaPassword);
      setError('');
      // Show success message briefly
      setError('Verification code sent successfully');
      setTimeout(() => setError(''), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to resend verification code');
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

  const handleRegistrationSuccess = () => {
    setShowRegistration(false);
    // User will receive email confirmation, so we don't automatically log them in
  };

  // Show registration component if requested
  if (showRegistration) {
    return (
      <ClientRegistration
        onSuccess={handleRegistrationSuccess}
        onCancel={handleHideRegistration}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <ImageBasedSection imageUrl={backgroundImageUrl}>
        <div className="max-w-md w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center">
              {showMfaVerification ? (
                <Shield className="h-8 w-8 text-white" />
              ) : (
                <User className="h-8 w-8 text-white" />
              )}
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-white">
              {showMfaVerification ? 'Email Verification' : t('login.title')}
            </h2>
            <p className="mt-2 text-sm text-blue-100">
              {showMfaVerification
                ? `Enter the verification code sent to ${mfaEmail}`
                : t('login.subtitle')
              }
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
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
                    Verification Code
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="mfaCode"
                      name="mfaCode"
                      type="text"
                      autoComplete="one-time-code"
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-2 pl-10 border border-white/20 placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm text-center text-lg tracking-widest"
                      placeholder="000000"
                      maxLength={6}
                    />
                    <KeyRound className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                  </div>
                  <p className="mt-1 text-xs text-blue-200">
                    Enter the 6-digit code sent to your email
                  </p>
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
                        <span>Verify & Sign In</span>
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
                    Resend Code
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="w-full text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    ← Back to Login
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
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-2 pl-10 border border-white/20 placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder={t('login.emailPlaceholder')}
                    />
                    <Mail className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                  </div>
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
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none relative block w-full px-3 py-2 pl-10 pr-10 border border-white/20 placeholder-gray-400 text-white bg-white/10 backdrop-blur-sm rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder={t('login.passwordPlaceholder')}
                    />
                    <Lock className="h-5 w-5 text-gray-300 absolute left-3 top-2.5" />
                    <button
                      type="button"
                      className="absolute right-3 top-2.5 text-gray-300 hover:text-white"
                      onClick={() => setShowPassword(!showPassword)}
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
                    className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
                  >
                    {t('login.noAccount')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </ImageBasedSection>
    </div>
  );
};

export default ClientLogin;