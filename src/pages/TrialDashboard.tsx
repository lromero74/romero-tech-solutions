import React, { useState, useEffect } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import AgentDetails from '../components/admin/AgentDetails';
import AgentSelector from '../components/trial/AgentSelector';
import { agentService, AgentDevice } from '../services/agentService';
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

  // Multi-agent support
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // CRITICAL: Fallback to localStorage if authUser hasn't loaded yet
  let userDataForDashboard = authUser;
  if (!authUser) {
    try {
      const storedUser = localStorage.getItem('client_authUser');
      if (storedUser) {
        userDataForDashboard = JSON.parse(storedUser);
        console.log('📦 Using localStorage fallback for TrialDashboard');
      }
    } catch (e) {
      console.error('Failed to parse client_authUser from localStorage:', e);
    }
  }

  // Support both trial users and regular users accessing via agent magic-link
  const trialAgentId = (userDataForDashboard as any)?.trialAgentId;
  const trialId = (userDataForDashboard as any)?.trialId;
  const isTrial = (userDataForDashboard as any)?.isTrial || false;

  // CRITICAL: Check sessionStorage for pendingAgentId in case auth context hasn't updated yet
  // This handles the race condition where routing happens before React state updates
  const pendingAgentId = sessionStorage.getItem('pendingAgentId');
  const initialAgentId = (userDataForDashboard as any)?.agentId || trialAgentId || pendingAgentId;

  // Selected agent (can be different from the one opened via magic-link)
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
    // Check if there's a previously selected agent in localStorage
    const savedAgentId = localStorage.getItem('selectedAgentId');
    return savedAgentId || initialAgentId || '';
  });

  console.log('📊 TrialDashboard agentId resolution:', {
    authUserAgentId: (authUser as any)?.agentId,
    trialAgentId,
    pendingAgentId,
    initialAgentId,
    selectedAgentId,
    isTrial
  });

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

  // Fetch all agents for the user's business
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        console.log('📋 Fetching agents for user:', userDataForDashboard?.email, 'isTrial:', isTrial);
        setLoadingAgents(true);

        // Trial users: Skip API call, just use the trialAgentId directly
        if (isTrial && trialAgentId) {
          console.log('📋 Trial user detected, using trialAgentId directly:', trialAgentId);
          // Create a mock agent entry for the trial agent
          const trialAgent: AgentDevice = {
            id: trialAgentId,
            device_name: userDataForDashboard?.name || 'Trial Device',
            os_type: 'Unknown',
            is_trial: true
          } as AgentDevice;

          setAgents([trialAgent]);

          // Set the trial agent as selected
          if (!selectedAgentId || selectedAgentId !== trialAgentId) {
            console.log('📋 Setting trial agent as selected:', trialAgentId);
            setSelectedAgentId(trialAgentId);
            localStorage.setItem('selectedAgentId', trialAgentId);
          }

          setLoadingAgents(false);
          return;
        }

        // Non-trial users: Fetch from API
        const response = await agentService.listAgents();
        console.log('📋 Agent list response:', response);

        if (response.success && response.data) {
          console.log('📋 Found agents:', response.data.agents.length);
          setAgents(response.data.agents);

          // If we have agents and no selected agent, select the initial one
          if (response.data.agents.length > 0 && !selectedAgentId) {
            const firstAgentId = initialAgentId || response.data.agents[0].id;
            console.log('📋 Auto-selecting first agent:', firstAgentId);
            setSelectedAgentId(firstAgentId);
            localStorage.setItem('selectedAgentId', firstAgentId);
          }
        } else {
          console.warn('📋 Agent list fetch failed or returned no data:', response);
        }
      } catch (error) {
        console.error('❌ Error fetching agents:', error);
      } finally {
        console.log('📋 Setting loadingAgents to false');
        setLoadingAgents(false);
      }
    };

    console.log('📋 useEffect triggered - authUser:', authUser?.email);

    // Fetch agents unconditionally (API will handle auth)
    // This ensures we fetch even if authUser loads after component mount
    fetchAgents();
  }, [authUser, isTrial, trialAgentId]);

  // Handle agent selection
  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    localStorage.setItem('selectedAgentId', agentId);
    console.log('📊 Selected agent changed:', agentId);
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

  // Show loading state while fetching agents
  if (loadingAgents) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <HardDrive className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600 dark:text-gray-400">
            Loading your devices...
          </p>
        </div>
      </div>
    );
  }

  // Show error if no agents found
  if (agents.length === 0 && !selectedAgentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <HardDrive className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No agent devices found for your account.
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

        {/* Agent Selector (only show if user has multiple agents) */}
        <AgentSelector
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          isDarkMode={isDarkMode}
        />

        {/* Agent Details Component */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <ThemeProvider>
            <AgentDetails agentId={selectedAgentId} />
          </ThemeProvider>
        </div>
      </main>
    </div>
  );
};

export default TrialDashboard;
