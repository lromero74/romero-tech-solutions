import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface SessionCountdownTimerProps {
  // Session timeout in milliseconds (default 15 minutes)
  sessionTimeoutMs?: number;
  // Warning threshold in milliseconds (default 2 minutes)
  warningThresholdMs?: number;
  // Callback when session expires
  onSessionExpired?: () => void;
  // Callback when warning threshold is reached - passes remaining seconds
  onWarningReached?: (remainingSeconds: number) => void;
}

const SessionCountdownTimer: React.FC<SessionCountdownTimerProps> = ({
  sessionTimeoutMs = 15 * 60 * 1000, // 15 minutes default
  warningThresholdMs = 2 * 60 * 1000, // 2 minutes default
  onSessionExpired,
  onWarningReached
}) => {
  const [isWarningActive, setIsWarningActive] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const [warningTriggered, setWarningTriggered] = useState(false);
  const [, forceUpdate] = useState(0); // Force re-render trigger

  // Use refs for state that needs to be checked in interval without causing re-runs
  const isWarningActiveRef = useRef(false);
  const warningTriggeredRef = useRef(false);

  // Use refs for callbacks to prevent useEffect re-runs when they change
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWarningReachedRef = useRef(onWarningReached);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
    onWarningReachedRef.current = onWarningReached;
  }, [onSessionExpired, onWarningReached]);

  // Calculate time remaining on every render
  const now = Date.now();
  const timeSinceLastActivity = now - lastActivityRef.current;
  const timeRemaining = Math.max(0, sessionTimeoutMs - timeSinceLastActivity);

  // Update lastActivity when sessionTimeoutMs changes
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [sessionTimeoutMs]);

  // Track user activity to reset timer
  useEffect(() => {
    const activityEvents = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      setIsWarningActive(false);
      setWarningTriggered(false);
      isWarningActiveRef.current = false;
      warningTriggeredRef.current = false;
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
          // Only update state flags, lastActivityRef already updated above
          setIsWarningActive(false);
          setWarningTriggered(false);
          isWarningActiveRef.current = false;
          warningTriggeredRef.current = false;
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

  // Main countdown timer - just force re-renders, calculation happens above
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(prev => prev + 1); // Force re-render every second to recalculate timeRemaining

      // Get current time remaining for threshold checks
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      const remaining = Math.max(0, sessionTimeoutMs - timeSinceLastActivity);

      // Check for warning threshold
      if (remaining <= warningThresholdMs && remaining > 0) {
        if (!isWarningActiveRef.current) {
          isWarningActiveRef.current = true;
          setIsWarningActive(true);
          if (!warningTriggeredRef.current && onWarningReachedRef.current) {
            warningTriggeredRef.current = true;
            setWarningTriggered(true);
            const remainingSeconds = Math.floor(remaining / 1000);
            onWarningReachedRef.current(remainingSeconds);
          }
        }
      } else if (remaining > warningThresholdMs) {
        if (isWarningActiveRef.current || warningTriggeredRef.current) {
          isWarningActiveRef.current = false;
          warningTriggeredRef.current = false;
          setIsWarningActive(false);
          setWarningTriggered(false);
        }
      }

      // Check for session expiration
      if (remaining <= 0 && onSessionExpiredRef.current) {
        onSessionExpiredRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionTimeoutMs, warningThresholdMs]);

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
      title={isWarningActive ? 'Session expires soon' : 'Time until session expires'}
    >
      <Clock className={`h-4 w-4 ${styles.icon}`} />
      <span className={`text-sm font-medium ${styles.text}`}>
        {formatTime(timeRemaining)}
      </span>
      {isWarningActive && (
        <span className="text-xs font-medium animate-pulse">
          Expires Soon
        </span>
      )}
    </div>
  );
};

export default SessionCountdownTimer;