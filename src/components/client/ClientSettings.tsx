import React, { useState, useEffect } from 'react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import AlertModal from '../shared/AlertModal';
import TrustedDeviceManagement from '../shared/TrustedDeviceManagement';
import { apiService } from '../../services/apiService';
import {
  User,
  Lock,
  Mail,
  Phone,
  Shield,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  RefreshCw,
  Smartphone
} from 'lucide-react';

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface MFASettings {
  isEnabled: boolean;
  email: string;
  backupCodes: string[];
}

interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

const ClientSettings: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Contact Info State
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [originalContactInfo, setOriginalContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });

  // Password State
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordRequirements, setPasswordRequirements] = useState<PasswordRequirements>({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecialChar: false
  });

  // MFA State
  const [mfaSettings, setMfaSettings] = useState<MFASettings>({
    isEnabled: false,
    email: '',
    backupCodes: []
  });
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showSpamFolderAlert, setShowSpamFolderAlert] = useState(false);

  const themeClasses = {
    container: isDarkMode
      ? 'bg-gray-800 border-gray-700'
      : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    input: isDarkMode
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
    button: isDarkMode
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode
      ? 'bg-gray-600 hover:bg-gray-700 text-white'
      : 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    tab: isDarkMode
      ? 'border-gray-700 text-gray-300 hover:text-white'
      : 'border-gray-200 text-gray-600 hover:text-gray-900',
    tabActive: isDarkMode
      ? 'border-blue-500 text-blue-400'
      : 'border-blue-500 text-blue-600',
    card: isDarkMode
      ? 'bg-gray-750 border-gray-600'
      : 'bg-gray-50 border-gray-200'
  };

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    validatePassword(passwordData.newPassword);
  }, [passwordData.newPassword]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');

      // Load contact info
      const contactData = await apiService.get('/client/profile');
      const info = {
        firstName: contactData.data.firstName || '',
        lastName: contactData.data.lastName || '',
        email: contactData.data.email || authUser.email || '',
        phone: contactData.data.phone || ''
      };
      setContactInfo(info);
      setOriginalContactInfo(info);

      // Load MFA settings
      const mfaData = await apiService.get('/client/mfa/settings');
      setMfaSettings({
        isEnabled: mfaData.data.isEnabled || false,
        email: mfaData.data.email || contactInfo.email,
        backupCodes: mfaData.data.backupCodes || []
      });
    } catch (error) {
      console.error('Failed to load user data:', error);
      setMessage({ type: 'error', text: t('settings.errors.loadFailed') });
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password: string) => {
    setPasswordRequirements({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
    });
  };

  const isPasswordValid = () => {
    return Object.values(passwordRequirements).every(req => req);
  };

  const handleContactInfoSave = async () => {
    setLoading(true);
    try {
      await apiService.put('/client/profile', contactInfo);
      setOriginalContactInfo(contactInfo);
      setMessage({ type: 'success', text: t('settings.profile.updateSuccess') });
    } catch (error: any) {
      console.error('Failed to update contact info:', error);
      setMessage({ type: 'error', text: error.message || t('settings.profile.updateFailed') });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!isPasswordValid()) {
      setMessage({ type: 'error', text: t('settings.password.requirementsFailed') });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: t('settings.password.noMatch') });
      return;
    }

    setLoading(true);
    try {
      await apiService.post('/client/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: t('settings.password.changeSuccess') });
    } catch (error: any) {
      console.error('Failed to change password:', error);
      setMessage({ type: 'error', text: error.message || t('settings.password.changeFailed') });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaToggle = async () => {
    if (mfaSettings.isEnabled) {
      // Disable MFA
      setLoading(true);
      try {
        await apiService.post('/client/mfa/disable');
        setMfaSettings(prev => ({ ...prev, isEnabled: false, backupCodes: [] }));
        setMessage({ type: 'success', text: t('settings.security.mfaDisabled') });
      } catch (error: any) {
        console.error('Failed to disable MFA:', error);
        setMessage({ type: 'error', text: error.message || t('settings.security.mfaDisableFailed') });
      } finally {
        setLoading(false);
      }
    } else {
      // Start MFA setup
      setShowMfaSetup(true);
      await sendMfaCode();
    }
  };

  const sendMfaCode = async () => {
    setLoading(true);
    try {
      await apiService.post('/client/mfa/send-code', {
        email: contactInfo.email
      });
      setMessage({ type: 'info', text: t('settings.mfaSection.codeSent', { email: contactInfo.email }) });
      setShowSpamFolderAlert(true);
    } catch (error: any) {
      console.error('Failed to send MFA code:', error);
      setMessage({ type: 'error', text: error.message || t('settings.security.sendCodeFailed') });
    } finally {
      setLoading(false);
    }
  };

  const verifyMfaCode = async () => {
    setLoading(true);
    try {
      const data = await apiService.post('/client/mfa/verify-setup', {
        code: mfaVerificationCode,
        email: contactInfo.email
      });
      setMfaSettings({
        isEnabled: true,
        email: contactInfo.email,
        backupCodes: data.data.backupCodes || []
      });
      setShowMfaSetup(false);
      setShowBackupCodes(true);
      setMfaVerificationCode('');
      setMessage({ type: 'success', text: t('settings.security.mfaEnabled') });
    } catch (error: any) {
      console.error('Failed to verify MFA code:', error);
      setMessage({ type: 'error', text: error.message || t('settings.security.verifyFailed') });
    } finally {
      setLoading(false);
    }
  };

  const hasContactChanges = () => {
    return JSON.stringify(contactInfo) !== JSON.stringify(originalContactInfo);
  };

  const clearMessage = () => {
    setMessage(null);
  };

  if (loading && activeTab === 'profile' && !contactInfo.email) {
    return (
      <div className={`rounded-lg border p-6 ${themeClasses.container} ${themeClasses.text}`}>
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p>{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-lg border p-6 ${themeClasses.container}`}>
        <h2 className={`text-xl font-semibold mb-6 ${themeClasses.text}`}>{t('settings.title')}</h2>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-md border ${
            message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            message.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {message.type === 'success' && <CheckCircle className="h-5 w-5 mr-2" />}
                {message.type === 'error' && <XCircle className="h-5 w-5 mr-2" />}
                {message.type === 'info' && <AlertTriangle className="h-5 w-5 mr-2" />}
                <span>{message.text}</span>
              </div>
              <button onClick={clearMessage} className="text-gray-500 hover:text-gray-700">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'profile', label: t('settings.tabs.profile'), icon: User },
              { id: 'password', label: t('settings.tabs.password'), icon: Lock },
              { id: 'security', label: t('settings.tabs.security'), icon: Shield },
              { id: 'devices', label: t('settings.tabs.trustedDevices'), icon: Smartphone }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? `${themeClasses.tabActive} border-blue-500`
                    : `${themeClasses.tab} border-transparent`
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  {t('settings.profile.firstName')}
                </label>
                <input
                  type="text"
                  value={contactInfo.firstName}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, firstName: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md ${themeClasses.input}`}
                  placeholder={t('settings.profile.firstNamePlaceholder')}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  {t('settings.profile.lastName')}
                </label>
                <input
                  type="text"
                  value={contactInfo.lastName}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, lastName: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md ${themeClasses.input}`}
                  placeholder={t('settings.profile.lastNamePlaceholder')}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  <Mail className="h-4 w-4 inline mr-1" />
                  {t('settings.profile.email')}
                </label>
                <input
                  type="email"
                  value={contactInfo.email}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, email: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md ${themeClasses.input}`}
                  placeholder={t('settings.profile.emailPlaceholder')}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  <Phone className="h-4 w-4 inline mr-1" />
                  {t('settings.profile.phone')}
                </label>
                <input
                  type="tel"
                  value={contactInfo.phone}
                  onChange={(e) => setContactInfo(prev => ({ ...prev, phone: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md ${themeClasses.input}`}
                  placeholder={t('settings.profile.phonePlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleContactInfoSave}
                disabled={!hasContactChanges() || loading}
                className={`flex items-center px-4 py-2 rounded-md ${
                  hasContactChanges() && !loading
                    ? themeClasses.button
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('settings.profile.saveChanges')}
              </button>
            </div>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  {t('settings.password.current')}
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-md pr-10 ${themeClasses.input}`}
                    placeholder={t('settings.password.currentPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPasswords.current ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  {t('settings.password.new')}
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-md pr-10 ${themeClasses.input}`}
                    placeholder={t('settings.password.newPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPasswords.new ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                  {t('settings.password.confirm')}
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-md pr-10 ${themeClasses.input}`}
                    placeholder={t('settings.password.confirmPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Requirements */}
            {passwordData.newPassword && (
              <div className={`p-4 rounded-md border ${themeClasses.card}`}>
                <h4 className={`text-sm font-medium mb-3 ${themeClasses.text}`}>{t('settings.password.requirements')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { key: 'minLength', label: t('settings.password.req.minLength') },
                    { key: 'hasUppercase', label: t('settings.password.req.uppercase') },
                    { key: 'hasLowercase', label: t('settings.password.req.lowercase') },
                    { key: 'hasNumber', label: t('settings.password.req.number') },
                    { key: 'hasSpecialChar', label: t('settings.password.req.special') }
                  ].map(req => (
                    <div key={req.key} className="flex items-center">
                      {passwordRequirements[req.key as keyof PasswordRequirements] ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mr-2" />
                      )}
                      <span className={`text-sm ${themeClasses.textSecondary}`}>{req.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handlePasswordChange}
                disabled={!passwordData.currentPassword || !isPasswordValid() || passwordData.newPassword !== passwordData.confirmPassword || loading}
                className={`flex items-center px-4 py-2 rounded-md ${
                  passwordData.currentPassword && isPasswordValid() && passwordData.newPassword === passwordData.confirmPassword && !loading
                    ? themeClasses.button
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                {t('settings.password.changeButton')}
              </button>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className={`p-4 rounded-md border ${themeClasses.card}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>
                    {t('settings.security.mfaTitle')}
                  </h3>
                  <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
                    {t('settings.security.mfaDescription')}
                  </p>
                  {mfaSettings.isEnabled && (
                    <p className={`text-sm text-green-600 mt-2`}>
                      {t('settings.security.mfaEnabledFor', { email: mfaSettings.email })}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleMfaToggle}
                  disabled={loading}
                  className={`px-4 py-2 rounded-md flex items-center ${
                    mfaSettings.isEnabled
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : themeClasses.button
                  }`}
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      {mfaSettings.isEnabled ? t('settings.security.disableMfa') : t('settings.security.enableMfa')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* MFA Setup Modal */}
            {showMfaSetup && (
              <div className={`p-4 rounded-md border ${themeClasses.card}`}>
                <h4 className={`text-lg font-medium mb-4 ${themeClasses.text}`}>{t('settings.security.setupMfa')}</h4>
                <p className={`text-sm ${themeClasses.textSecondary} mb-4`}>
                  {t('settings.security.enterCode', { email: contactInfo.email })}
                </p>
                <div className="flex space-x-4">
                  <input
                    type="text"
                    value={mfaVerificationCode}
                    onChange={(e) => setMfaVerificationCode(e.target.value)}
                    placeholder={t('settings.security.codePlaceholder')}
                    maxLength={6}
                    className={`flex-1 px-3 py-2 border rounded-md ${themeClasses.input}`}
                  />
                  <button
                    onClick={verifyMfaCode}
                    disabled={mfaVerificationCode.length !== 6 || loading}
                    className={`px-4 py-2 rounded-md ${
                      mfaVerificationCode.length === 6 && !loading
                        ? themeClasses.button
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {t('settings.security.verifyButton')}
                  </button>
                </div>
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={sendMfaCode}
                    disabled={loading}
                    className={`text-sm ${themeClasses.buttonSecondary} px-3 py-1 rounded`}
                  >
                    {t('settings.security.resendCode')}
                  </button>
                  <button
                    onClick={() => {
                      setShowMfaSetup(false);
                      setMfaVerificationCode('');
                    }}
                    className={`text-sm ${themeClasses.buttonSecondary} px-3 py-1 rounded`}
                  >
                    {t('general.cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Backup Codes Display */}
            {showBackupCodes && mfaSettings.backupCodes.length > 0 && (
              <div className={`p-4 rounded-md border border-yellow-300 bg-yellow-50`}>
                <h4 className="text-lg font-medium mb-2 text-yellow-800">{t('settings.security.backupCodes')}</h4>
                <p className="text-sm text-yellow-700 mb-4">
                  {t('settings.security.backupCodesDesc')}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {mfaSettings.backupCodes.map((code, index) => (
                    <div key={index} className="font-mono text-sm bg-white p-2 rounded border">
                      {code}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowBackupCodes(false)}
                  className={`${themeClasses.button} px-4 py-2 rounded-md`}
                >
                  {t('settings.security.savedCodes')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Trusted Devices Tab */}
        {activeTab === 'devices' && (
          <TrustedDeviceManagement isDarkMode={isDarkMode} />
        )}
      </div>

      {/* Spam Folder Alert Modal */}
      <AlertModal
        isOpen={showSpamFolderAlert}
        onClose={() => setShowSpamFolderAlert(false)}
        type="info"
        title={t('settings.mfaSection.spamFolderAlert.title')}
        message={t('settings.mfaSection.spamFolderAlert.message', { email: contactInfo.email })}
      />
    </div>
  );
};

export default ClientSettings;