import React, { useState, useEffect } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { authService } from '../services/authService';
import { Shield, User, Mail, Lock, CheckCircle, AlertCircle, Key, ArrowLeft, KeyRound } from 'lucide-react';

interface AdminRegistrationProps {
  onSuccess: () => void;
}

const AdminRegistration: React.FC<AdminRegistrationProps> = ({ onSuccess }) => {
  const { signUpAdmin, signIn, sendAdminMfaCode, verifyAdminMfaCode, isLoading: authLoading } = useEnhancedAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [hasAdminUsers, setHasAdminUsers] = useState<boolean | null>(null);
  const [canConnectToBackend, setCanConnectToBackend] = useState<boolean>(true);
  const [isSignUp, setIsSignUp] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showMfaVerification, setShowMfaVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');

  useEffect(() => {
    checkAdminExists();
  }, []);

  const checkAdminExists = async () => {
    try {
      const result = await authService.hasAdminUsers();
      setHasAdminUsers(result.hasAdmins);
      setCanConnectToBackend(result.canConnect);
      // Only allow signup if we can connect AND there are no admins
      setIsSignUp(result.canConnect && !result.hasAdmins);
    } catch (error) {
      console.error('Error checking admin users:', error);
      setHasAdminUsers(false);
      setCanConnectToBackend(false);
      setIsSignUp(false); // Never show signup if we can't determine state
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setErrors({});
    setSuccess('');

    try {
      if (isSignUp) {
        const result = await signUpAdmin({
          name: formData.name,
          email: formData.email,
          password: formData.password
        });

        if (result.isFirstAdmin) {
          setSuccess('First admin account created successfully! You can now sign in.');
          setIsSignUp(false);
          setFormData({ name: '', email: formData.email, password: '', confirmPassword: '' });
        } else {
          setSuccess('Admin account created successfully! Please check your email for a verification code.');
          setPendingEmail(formData.email);
          setShowVerification(true);
          setFormData({ name: '', email: '', password: '', confirmPassword: '' });
        }
      } else {
        try {
          const user = await signIn(formData.email, formData.password);

          if (user.role === 'admin') {
            setSuccess('Signed in successfully! Redirecting to admin dashboard...');
            setTimeout(() => {
              onSuccess();
            }, 1500);
          } else {
            setErrors({ email: 'This account is not an administrator account.' });
          }
        } catch (signInError: any) {
          if (signInError.message === 'MFA_REQUIRED') {
            // Admin user needs MFA verification
            setMfaEmail(formData.email);
            setMfaPassword(formData.password);
            setShowMfaVerification(true);
            setIsLoading(false);

            // Automatically send MFA code
            try {
              await sendAdminMfaCode(formData.email, formData.password);
              setSuccess('Verification code sent to your email. Please check your email and enter the code below.');
              setErrors({});
            } catch (mfaError: any) {
              setErrors({ general: mfaError.message || 'Failed to send verification code' });
              setIsLoading(false);
            }
            return; // Exit early to prevent setting isLoading to false again
          } else {
            throw signInError; // Re-throw other errors to be handled by the outer catch
          }
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);

      if (error.name === 'UserNotConfirmedException') {
        setSuccess('Please check your email for a verification code to confirm your account.');
        setPendingEmail(formData.email);
        setShowVerification(true);
        setErrors({});
      } else if (error.name === 'NotAuthorizedException') {
        setErrors({ password: 'Invalid email or password.' });
      } else if (error.name === 'UsernameExistsException') {
        setErrors({ email: 'An account with this email already exists.' });
      } else {
        setErrors({ general: error.message || 'An error occurred. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationCode.trim()) {
      setErrors({ verificationCode: 'Verification code is required' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await authService.confirmSignUp(pendingEmail, verificationCode);
      setSuccess('Email verified successfully! You can now sign in.');
      setShowVerification(false);
      setIsSignUp(false);
      setFormData({ name: '', email: pendingEmail, password: '', confirmPassword: '' });
      setVerificationCode('');
      setPendingEmail('');
    } catch (error: any) {
      console.error('Verification error:', error);
      if (error.name === 'CodeMismatchException') {
        setErrors({ verificationCode: 'Invalid verification code. Please try again.' });
      } else if (error.name === 'ExpiredCodeException') {
        setErrors({ verificationCode: 'Verification code has expired. Please request a new one.' });
      } else {
        setErrors({ verificationCode: error.message || 'Verification failed. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setErrors({});

    try {
      await authService.resendConfirmationCode(pendingEmail);
      setSuccess('New verification code sent to your email.');
    } catch (error: any) {
      console.error('Resend code error:', error);
      setErrors({ verificationCode: error.message || 'Failed to resend code. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetEmail.trim()) {
      setErrors({ resetEmail: 'Email address is required' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await authService.forgotPassword(resetEmail);
      setSuccess('Password reset code sent to your email. Please check your inbox.');
      setShowForgotPassword(false);
      setShowResetPassword(true);
    } catch (error: any) {
      console.error('Forgot password error:', error);
      if (error.name === 'UserNotFoundException') {
        setErrors({ resetEmail: 'No account found with this email address.' });
      } else {
        setErrors({ resetEmail: error.message || 'Failed to send reset code. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetCode.trim()) {
      setErrors({ resetCode: 'Reset code is required' });
      return;
    }

    if (!newPassword.trim()) {
      setErrors({ newPassword: 'New password is required' });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrors({ confirmNewPassword: 'Passwords do not match' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await authService.confirmForgotPassword(resetEmail, resetCode, newPassword);
      setSuccess('Password reset successfully! You can now sign in with your new password.');
      setShowResetPassword(false);
      setIsSignUp(false);
      setFormData({ name: '', email: resetEmail, password: '', confirmPassword: '' });
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetEmail('');
    } catch (error: any) {
      console.error('Reset password error:', error);
      if (error.name === 'CodeMismatchException') {
        setErrors({ resetCode: 'Invalid reset code. Please try again.' });
      } else if (error.name === 'ExpiredCodeException') {
        setErrors({ resetCode: 'Reset code has expired. Please request a new one.' });
      } else if (error.name === 'InvalidPasswordException') {
        setErrors({ newPassword: 'Password does not meet requirements. Please choose a stronger password.' });
      } else {
        setErrors({ resetCode: error.message || 'Failed to reset password. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode) {
      setErrors({ mfaCode: 'Please enter the verification code' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await verifyAdminMfaCode(mfaEmail, mfaCode);
      setSuccess('Verification successful! Redirecting to admin dashboard...');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error: any) {
      setErrors({ mfaCode: error.message || 'Verification failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowMfaVerification(false);
    setMfaCode('');
    setMfaEmail('');
    setMfaPassword('');
    setErrors({});
  };

  const handleResendMfaCode = async () => {
    if (!mfaEmail || !mfaPassword) return;

    setIsLoading(true);
    setErrors({});

    try {
      await sendAdminMfaCode(mfaEmail, mfaPassword);
      setSuccess('Verification code sent successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setErrors({ mfaCode: error.message || 'Failed to resend verification code' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAllStates = () => {
    setShowVerification(false);
    setShowForgotPassword(false);
    setShowResetPassword(false);
    setShowMfaVerification(false);
    setVerificationCode('');
    setResetCode('');
    setMfaCode('');
    setMfaEmail('');
    setMfaPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPendingEmail('');
    setResetEmail('');
    setErrors({});
    setSuccess('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  if (authLoading || hasAdminUsers === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin portal...</p>
        </div>
      </div>
    );
  }

  // Show error if we cannot connect to backend
  if (!canConnectToBackend) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-red-600 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-white" />
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Connection Error
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Unable to connect to the backend server.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Please check your internet connection and try again.
            </p>
            <button
              onClick={checkAdminExists}
              disabled={isLoading}
              className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Retrying...' : 'Retry Connection'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {showMfaVerification
              ? 'Email Verification'
              : showVerification
              ? 'Verify Your Email'
              : showForgotPassword
              ? 'Reset Password'
              : showResetPassword
              ? 'Set New Password'
              : isSignUp
              ? 'Create Admin Account'
              : 'Admin Sign In'
            }
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {showMfaVerification
              ? `Enter the verification code sent to ${mfaEmail}`
              : showVerification
              ? `Enter the verification code sent to ${pendingEmail}`
              : showForgotPassword
              ? 'Enter your email address to receive a password reset code'
              : showResetPassword
              ? `Enter the reset code sent to ${resetEmail} and your new password`
              : isSignUp
              ? hasAdminUsers
                ? 'Create a new administrator account'
                : 'Create the first administrator account'
              : 'Sign in to the admin dashboard'
            }
          </p>
        </div>

        {/* Status Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-start">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-800">{errors.general}</p>
          </div>
        )}

        {/* Forgot Password Form */}
        {showForgotPassword ? (
          <form className="mt-8 space-y-6" onSubmit={handleForgotPassword}>
            <div>
              <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="mt-1 relative">
                <input
                  id="resetEmail"
                  name="resetEmail"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.resetEmail ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                  placeholder="Enter your admin email address"
                />
                <Mail className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.resetEmail && <p className="mt-1 text-sm text-red-600">{errors.resetEmail}</p>}
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
                    <Mail className="h-5 w-5 mr-2" />
                    Send Reset Code
                  </>
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={resetAllStates}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-500"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to sign in
              </button>
            </div>
          </form>
        ) : showResetPassword ? (
          <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
            <div>
              <label htmlFor="resetCode" className="block text-sm font-medium text-gray-700">
                Reset Code
              </label>
              <div className="mt-1 relative">
                <input
                  id="resetCode"
                  name="resetCode"
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.resetCode ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                  placeholder="Enter the reset code from your email"
                  maxLength={6}
                />
                <Key className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.resetCode && <p className="mt-1 text-sm text-red-600">{errors.resetCode}</p>}
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                New Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.newPassword ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                  placeholder="Enter your new password"
                />
                <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.newPassword && <p className="mt-1 text-sm text-red-600">{errors.newPassword}</p>}
            </div>

            <div>
              <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">
                Confirm New Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="confirmNewPassword"
                  name="confirmNewPassword"
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.confirmNewPassword ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                  placeholder="Confirm your new password"
                />
                <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.confirmNewPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmNewPassword}</p>}
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
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Reset Password
                  </>
                )}
              </button>
            </div>

            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false);
                  setShowForgotPassword(true);
                  setResetCode('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setErrors({});
                }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Resend reset code
              </button>
              <br />
              <button
                type="button"
                onClick={resetAllStates}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-500"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to sign in
              </button>
            </div>
          </form>
        ) : showMfaVerification ? (
          <form className="mt-8 space-y-6" onSubmit={handleMfaSubmit}>
            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700">
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
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.mfaCode ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm text-center text-lg tracking-widest`}
                  placeholder="000000"
                  maxLength={6}
                />
                <KeyRound className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.mfaCode && <p className="mt-1 text-sm text-red-600">{errors.mfaCode}</p>}
              <p className="mt-1 text-xs text-gray-500">
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
                    <Shield className="h-5 w-5 mr-2" />
                    Verify & Sign In
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResendMfaCode}
                disabled={isLoading}
                className="w-full text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Resend Code
              </button>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full text-sm text-gray-600 hover:text-gray-500"
              >
                ← Back to Login
              </button>
            </div>
          </form>
        ) : showVerification ? (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyCode}>
            <div>
              <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <div className="mt-1 relative">
                <input
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                    errors.verificationCode ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                  placeholder="Enter the 6-digit code"
                  maxLength={6}
                />
                <Key className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              {errors.verificationCode && <p className="mt-1 text-sm text-red-600">{errors.verificationCode}</p>}
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
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Verify Email
                  </>
                )}
              </button>
            </div>

            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50"
              >
                Resend verification code
              </button>
              <br />
              <button
                type="button"
                onClick={() => {
                  setShowVerification(false);
                  setVerificationCode('');
                  setPendingEmail('');
                  setErrors({});
                }}
                className="text-sm text-gray-600 hover:text-gray-500"
              >
                Back to sign in
              </button>
            </div>
          </form>
        ) : (
          /* Main Form */
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              {isSignUp && (
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required={isSignUp}
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                      placeholder="Enter your full name"
                    />
                    <User className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <div className="mt-1 relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                    placeholder="Enter your email"
                  />
                  <Mail className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                </div>
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                    placeholder="Enter your password"
                  />
                  <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                </div>
                {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
              </div>

              {isSignUp && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required={isSignUp}
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className={`appearance-none relative block w-full px-3 py-2 pl-10 border ${
                        errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                      placeholder="Confirm your password"
                    />
                    <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
                </div>
              )}
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
                    <Shield className="h-5 w-5 mr-2" />
                    {isSignUp ? 'Create Admin Account' : 'Sign In to Admin'}
                  </>
                )}
              </button>
            </div>

            {/* Forgot Password Link - only show on sign in */}
            {!isSignUp && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setErrors({});
                    setSuccess('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Forgot your password?
                </button>
              </div>
            )}

          </form>
        )}
      </div>
    </div>
  );
};

export default AdminRegistration;