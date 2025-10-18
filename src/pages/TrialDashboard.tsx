import React, { useState, useEffect } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import AgentDetails from '../components/admin/AgentDetails';
import { LogOut, Sun, Moon, HardDrive } from 'lucide-react';

interface TrialDashboardProps {
  onNavigate?: (page: string) => void;
}

const TrialDashboard: React.FC<TrialDashboardProps> = ({ onNavigate }) => {
  const { signOut, authUser } = useEnhancedAuth();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Support both trial users and regular users accessing via agent magic-link
  const trialAgentId = (authUser as any)?.trialAgentId;
  const trialId = (authUser as any)?.trialId;
  const agentId = (authUser as any)?.agentId || trialAgentId; // Use agentId or trialAgentId
  const isTrial = (authUser as any)?.isTrial || false;

  // Apply dark mode to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      if (onNavigate) {
        onNavigate('home');
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Logout error:', error);
      if (onNavigate) {
        onNavigate('home');
      } else {
        window.location.href = '/';
      }
    }
  };

  if (!agentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <HardDrive className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No agent device found for this account.
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side: Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white">
                  {isTrial ? 'RTS Agent Trial' : 'RTS Agent Monitoring'}
                </h1>
                <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
                  {isTrial ? '30-Day Trial Monitoring' : 'Device Monitoring Dashboard'}
                </p>
              </div>
            </div>

            {/* Right side: Actions */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Trial ID Badge */}
              {trialId && (
                <div className="hidden md:block px-3 py-1 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Trial: {trialId}
                  </p>
                </div>
              )}

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 text-yellow-500" />
                ) : (
                  <Moon className="h-5 w-5 text-gray-600" />
                )}
              </button>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Logout"
              >
                <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Trial Info Banner (only show for trial users) */}
        {isTrial && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <HardDrive className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-1">
                  Welcome to RTS Agent Trial!
                </h2>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  You have 30 days of full access to monitor your device. Track performance metrics, system health, and more.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Agent Details Component */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <AgentDetails agentId={agentId} />
        </div>
      </main>
    </div>
  );
};

export default TrialDashboard;
