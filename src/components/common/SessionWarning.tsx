import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw, LogOut } from 'lucide-react';
import SessionManager from '../../utils/sessionManager';

interface SessionWarningProps {
  isVisible: boolean;
  timeLeft: number; // in minutes (initial value, but we'll use real-time data)
  onExtend: () => void;
  onLogout: () => void;
}

const SessionWarning: React.FC<SessionWarningProps> = React.memo(({
  isVisible,
  timeLeft,
  onExtend,
  onLogout
}) => {
  const [realTimeSeconds, setRealTimeSeconds] = useState(0);
  const sessionManager = SessionManager.getInstance();

  // Debug logging (only when visible to reduce noise)
  if (isVisible) {
    console.log(`🚨 SessionWarning component props:`, { isVisible, timeLeft });
  }

  useEffect(() => {
    if (!isVisible) return;

    // Get real-time remaining seconds
    const updateRealTime = () => {
      const remainingSeconds = sessionManager.getTimeUntilExpiryInSeconds();
      setRealTimeSeconds(remainingSeconds);

      // Auto-logout when time reaches 0
      if (remainingSeconds <= 0) {
        onLogout();
      }
    };

    // Update immediately
    updateRealTime();

    // Update every second
    const interval = setInterval(updateRealTime, 1000);

    return () => clearInterval(interval);
  }, [isVisible, sessionManager, onLogout]);

  if (!isVisible) return null;

  const minutes = Math.floor(realTimeSeconds / 60);
  const seconds = realTimeSeconds % 60;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              Session Expiring Soon
            </h3>
            <p className="text-sm text-gray-500">
              Your session will expire due to inactivity
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600 mb-2">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </div>
            <p className="text-gray-600">
              Time remaining before automatic logout
            </p>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onExtend}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Extend Session
          </button>
          <button
            onClick={onLogout}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout Now
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Click anywhere on the page or press any key to extend your session automatically
        </div>
      </div>
    </div>
  );
});

SessionWarning.displayName = 'SessionWarning';

export default SessionWarning;