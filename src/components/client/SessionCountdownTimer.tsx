import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

interface SessionCountdownTimerProps {
  // Session timeout in milliseconds (default 15 minutes)
  sessionTimeoutMs?: number;
  // Warning threshold in milliseconds (default 2 minutes)
  warningThresholdMs?: number;
  // Callback when session expires
  onSessionExpired?: () => void;
  // Callback when warning threshold is reached
  onWarningReached?: () => void;
}

const SessionCountdownTimer: React.FC<SessionCountdownTimerProps> = ({
  sessionTimeoutMs = 15 * 60 * 1000, // 15 minutes default
  warningThresholdMs = 2 * 60 * 1000, // 2 minutes default
  onSessionExpired,
  onWarningReached
}) => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
  const [timeRemaining, setTimeRemaining] = useState<number>(sessionTimeoutMs);
  const [isWarningActive, setIsWarningActive] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now()); // Use ref for immediate updates
  const [warningTriggered, setWarningTriggered] = useState(false);

  // Track user activity to reset timer
  useEffect(() => {
    const activityEvents = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetTimer = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      setLastActivity(now);
      setTimeRemaining(sessionTimeoutMs);
      setIsWarningActive(false);
      setWarningTriggered(false);
    };

    // Throttle activity detection to avoid excessive updates
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledReset = () => {
      // Update activity timestamp immediately (no throttle for time calculation)
      // This ensures timeRemaining always reflects current activity
      lastActivityRef.current = Date.now();

      // Throttle the state updates to avoid excessive re-renders
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          const now = Date.now();
          setLastActivity(now);
          setTimeRemaining(sessionTimeoutMs);
          setIsWarningActive(false);
          setWarningTriggered(false);
          throttleTimeout = null;
        }, 1000); // Throttle to once per second
      }
    };

    // Add activity listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, throttledReset, true);
    });

    return () => {
      if (throttleTimeout) clearTimeout(throttleTimeout);
      activityEvents.forEach(event => {
        document.removeEventListener(event, throttledReset, true);
      });
    };
  }, [sessionTimeoutMs]);

  // Main countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      // Use ref for immediate activity updates, avoiding throttle delay
      const timeSinceLastActivity = now - lastActivityRef.current;
      const remaining = Math.max(0, sessionTimeoutMs - timeSinceLastActivity);

      setTimeRemaining(remaining);

      // Check for warning threshold
      if (remaining <= warningThresholdMs && remaining > 0) {
        if (!isWarningActive) {
          setIsWarningActive(true);
          if (!warningTriggered && onWarningReached) {
            setWarningTriggered(true);
            onWarningReached();
          }
        }
      } else if (remaining > warningThresholdMs) {
        setIsWarningActive(false);
        setWarningTriggered(false);
      }

      // Check for session expiration
      if (remaining <= 0 && onSessionExpired) {
        onSessionExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivity, sessionTimeoutMs, warningThresholdMs, isWarningActive, warningTriggered, onSessionExpired, onWarningReached]);

  // Format time for display
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Don't show timer if session has expired
  if (timeRemaining <= 0) {
    return null;
  }

  // Determine styling based on warning state
  const getTimerStyles = () => {
    if (isWarningActive) {
      return {
        container: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
        icon: 'text-yellow-600 dark:text-yellow-400',
        text: 'text-yellow-800 dark:text-yellow-200'
      };
    }

    return {
      container: 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300',
      icon: 'text-gray-500 dark:text-gray-400',
      text: 'text-gray-600 dark:text-gray-300'
    };
  };

  const styles = getTimerStyles();

  return (
    <div
      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-all duration-300 ${styles.container}`}
      title={isWarningActive ? t('session.warningTooltip', 'Session expires soon') : t('session.timeTooltip', 'Time until session expires')}
    >
      <Clock className={`h-4 w-4 ${styles.icon}`} />
      <span className={`text-sm font-medium ${styles.text}`}>
        {formatTime(timeRemaining)}
      </span>
      {isWarningActive && (
        <span className="text-xs font-medium animate-pulse">
          {t('session.warning', 'Expires Soon')}
        </span>
      )}
    </div>
  );
};

export default SessionCountdownTimer;