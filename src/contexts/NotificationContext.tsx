import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface NotificationContextType {
  unseenServiceRequestChanges: number;
  hasNotifications: boolean;
  addServiceRequestChange: () => void;
  markServiceRequestChangesSeen: () => void;
  startViewTimer: () => void;
  clearViewTimer: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [unseenServiceRequestChanges, setUnseenServiceRequestChanges] = useState(0);
  const viewTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasNotifications = unseenServiceRequestChanges > 0;

  const addServiceRequestChange = useCallback(() => {
    setUnseenServiceRequestChanges(prev => prev + 1);
  }, []);

  const markServiceRequestChangesSeen = useCallback(() => {
    setUnseenServiceRequestChanges(0);
  }, []);

  const startViewTimer = useCallback(() => {
    // Clear any existing timer
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
    }

    // Start 4-second timer to auto-clear notifications
    const timer = setTimeout(() => {
      markServiceRequestChangesSeen();
      viewTimerRef.current = null;
    }, 4000);

    viewTimerRef.current = timer;
  }, [markServiceRequestChangesSeen]);

  const clearViewTimer = useCallback(() => {
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
      }
    };
  }, []);

  const contextValue: NotificationContextType = {
    unseenServiceRequestChanges,
    hasNotifications,
    addServiceRequestChange,
    markServiceRequestChangesSeen,
    startViewTimer,
    clearViewTimer
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};