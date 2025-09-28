import SessionManager from '../../utils/sessionManager';

// Mock authService to avoid actual imports
jest.mock('../../services/authService', () => ({
  authService: {
    sessionHeartbeat: jest.fn()
  }
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock document event listeners
const mockEventListeners: { [key: string]: { listener: EventListener; options?: boolean | AddEventListenerOptions }[] } = {};
const originalAddEventListener = document.addEventListener;
const originalRemoveEventListener = document.removeEventListener;

beforeAll(() => {
  document.addEventListener = jest.fn((event: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => {
    if (!mockEventListeners[event]) {
      mockEventListeners[event] = [];
    }
    mockEventListeners[event].push({ listener, options });
  });

  document.removeEventListener = jest.fn((event: string, listener: EventListener) => {
    if (mockEventListeners[event]) {
      mockEventListeners[event] = mockEventListeners[event].filter(
        item => item.listener !== listener
      );
    }
  });
});

afterAll(() => {
  document.addEventListener = originalAddEventListener;
  document.removeEventListener = originalRemoveEventListener;
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockOnSessionExpired: jest.Mock;
  let mockOnSessionWarning: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Spy on timer functions
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');

    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Clear event listeners
    Object.keys(mockEventListeners).forEach(key => {
      mockEventListeners[key] = [];
    });

    // Reset singleton instance
    (SessionManager as unknown as { instance: SessionManager | null }).instance = null;
    sessionManager = SessionManager.getInstance();

    // Setup mock callbacks
    mockOnSessionExpired = jest.fn();
    mockOnSessionWarning = jest.fn();

    sessionManager.onExpired(mockOnSessionExpired);
    sessionManager.onWarning(mockOnSessionWarning);

    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    sessionManager.cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = SessionManager.getInstance();
      const instance2 = SessionManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Session Initialization', () => {
    it('should initialize session with correct config', () => {
      const config = { timeout: 15, warningTime: 2 };

      sessionManager.initSession(config);

      expect(sessionManager.isSessionActive()).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sessionData',
        expect.stringContaining('"isActive":true')
      );
    });

    it('should setup activity listeners on initialization', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });

      const expectedEvents = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
      expectedEvents.forEach(event => {
        expect(mockEventListeners[event]).toBeDefined();
        expect(mockEventListeners[event].length).toBeGreaterThan(0);
      });
    });

    it('should schedule timeout and warning correctly', () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Verify timers are set
      expect(setTimeout).toHaveBeenCalledTimes(2); // warning + timeout
    });
  });

  describe('Activity Tracking', () => {
    beforeEach(() => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });
      jest.clearAllMocks();
    });

    it('should update activity when user is active', () => {
      // Fast-forward time to ensure activity threshold is met
      jest.advanceTimersByTime(6000); // 6 seconds

      sessionManager.updateActivity();

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should throttle activity updates', () => {
      // Multiple rapid calls should be throttled
      sessionManager.updateActivity();
      sessionManager.updateActivity();
      sessionManager.updateActivity();

      // Should not update localStorage for throttled calls
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should debounce server sync', () => {
      jest.advanceTimersByTime(6000); // Ensure activity threshold
      sessionManager.updateActivity();

      // Should have set a debounce timer
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
  });

  describe('Session Timeouts', () => {
    it('should trigger warning at correct time', () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Fast-forward to warning time (13 minutes)
      jest.advanceTimersByTime(13 * 60 * 1000);

      expect(mockOnSessionWarning).toHaveBeenCalledWith(2);
    });

    it('should trigger session expiry at correct time', async () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Mock server heartbeat to simulate expired session
      const { authService } = await import('../../services/authService');
      (authService.sessionHeartbeat as jest.Mock).mockResolvedValue({
        success: false,
        session: null
      });

      // Fast-forward to timeout (15 minutes)
      jest.advanceTimersByTime(15 * 60 * 1000);
      jest.runOnlyPendingTimers();

      // Wait for async operations to complete - multiple ticks for Promise chains
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockOnSessionExpired).toHaveBeenCalled();
    }, 10000);

    it('should not expire if server session is still active', async () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Mock server heartbeat BEFORE triggering timeout to simulate active session
      const { authService } = await import('../../services/authService');
      (authService.sessionHeartbeat as jest.Mock).mockResolvedValue({
        success: true,
        session: {
          isActive: true,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now to ensure significant difference
          lastActivity: Date.now(),
          config: { timeout: 15, warningTime: 2 }
        }
      });

      // Fast-forward to timeout
      jest.advanceTimersByTime(15 * 60 * 1000);
      jest.runOnlyPendingTimers();

      // Wait for async operations to complete - multiple ticks for Promise chains
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockOnSessionExpired).not.toHaveBeenCalled();
      expect(sessionManager.isSessionActive()).toBe(true);
    }, 10000);
  });

  describe('Session Management', () => {
    it('should extend session when requested', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });

      // Fast-forward time
      jest.advanceTimersByTime(6000);

      // Track original time for comparison
      sessionManager.getTimeUntilExpiry();
      sessionManager.extendSession();

      // Should have updated activity
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should end session properly', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });
      sessionManager.endSession();

      expect(sessionManager.isSessionActive()).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('sessionData');
    });

    it('should update config correctly', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });

      const newConfig = { timeout: 30 };
      sessionManager.updateConfig(newConfig);

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Time Calculations', () => {
    it('should calculate time until expiry correctly', () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      const timeUntilExpiry = sessionManager.getTimeUntilExpiry();
      expect(timeUntilExpiry).toBeCloseTo(15, 0); // Should be close to 15 minutes
    });

    it('should return 0 for expired session', () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Fast-forward past timeout
      jest.advanceTimersByTime(16 * 60 * 1000);

      const timeUntilExpiry = sessionManager.getTimeUntilExpiry();
      expect(timeUntilExpiry).toBe(0);
    });
  });

  describe('Session Persistence', () => {
    it('should save session data to localStorage', () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sessionData',
        expect.stringContaining('"isActive":true')
      );
    });

    it('should load session from localStorage', () => {
      const mockSessionData = {
        lastActivity: Date.now(),
        config: { timeout: 15, warningTime: 2 },
        isActive: true
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockSessionData));

      // Create new instance to trigger loadSession
      (SessionManager as unknown as { instance: SessionManager | null }).instance = null;
      const newSessionManager = SessionManager.getInstance();

      expect(newSessionManager.isSessionActive()).toBe(true);
    });

    it('should handle corrupted localStorage data', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      // Should not throw error
      expect(() => {
        (SessionManager as unknown as { instance: SessionManager | null }).instance = null;
        SessionManager.getInstance();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle server heartbeat errors gracefully', async () => {
      const config = { timeout: 15, warningTime: 2 };
      sessionManager.initSession(config);

      // Mock server heartbeat to throw error
      const { authService } = await import('../../services/authService');
      (authService.sessionHeartbeat as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Fast-forward to timeout
      jest.advanceTimersByTime(15 * 60 * 1000);
      jest.runOnlyPendingTimers();

      // Wait for async operations to complete - multiple ticks for Promise chains
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Should still expire the session on error
      expect(mockOnSessionExpired).toHaveBeenCalled();
    }, 10000);

    it('should not crash when callbacks are not set', () => {
      sessionManager.onExpired(null as (() => void) | null);
      sessionManager.onWarning(null as ((timeLeft: number) => void) | null);

      sessionManager.initSession({ timeout: 15, warningTime: 2 });

      // Fast-forward to warning and timeout
      jest.advanceTimersByTime(13 * 60 * 1000); // Warning
      jest.advanceTimersByTime(2 * 60 * 1000);  // Timeout

      // Should not throw errors
      expect(() => {
        jest.runOnlyPendingTimers();
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listeners on cleanup', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });

      const initialListenerCount = Object.values(mockEventListeners)
        .flat().length;

      sessionManager.cleanup();

      const finalListenerCount = Object.values(mockEventListeners)
        .flat().length;

      expect(finalListenerCount).toBeLessThan(initialListenerCount);
    });

    it('should clear all timers on cleanup', () => {
      sessionManager.initSession({ timeout: 15, warningTime: 2 });
      sessionManager.updateActivity(); // Creates debounce timer

      sessionManager.cleanup();

      // All timers should be cleared
      expect(clearTimeout).toHaveBeenCalled();
    });
  });
});