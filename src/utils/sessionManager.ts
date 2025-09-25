interface SessionConfig {
  timeout: number; // in minutes
  warningTime: number; // in minutes before timeout to show warning
}

interface SessionData {
  lastActivity: number;
  config: SessionConfig;
  isActive: boolean;
}

class SessionManager {
  private static instance: SessionManager;
  private sessionData: SessionData | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private warningTimeoutId: NodeJS.Timeout | null = null;
  private onSessionExpired: (() => void) | null = null;
  private onSessionWarning: ((timeLeft: number) => void) | null = null;
  private activityListeners: (() => void)[] = [];

  // Server sync properties
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private lastServerSync: number = 0;
  private syncInProgress: boolean = false;
  private readonly SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes
  private readonly DEBOUNCE_DELAY = 5000; // 5 seconds
  private debounceTimeoutId: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadSession();
    this.setupActivityListeners();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  private setupActivityListeners() {
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetActivity = () => {
      this.updateActivity();
    };

    events.forEach(event => {
      document.addEventListener(event, resetActivity, true);
    });

    // Store the cleanup function
    this.activityListeners.push(() => {
      events.forEach(event => {
        document.removeEventListener(event, resetActivity, true);
      });
    });
  }

  initSession(config: SessionConfig) {
    const now = Date.now();
    console.log(`🚀 Initializing session with config:`, config);
    this.sessionData = {
      lastActivity: now,
      config,
      isActive: true
    };
    this.saveSession();
    this.scheduleTimeout();
    this.startHeartbeat();

    // Log the time until expiry after initialization
    const timeUntilExpiry = this.getTimeUntilExpiry();
    console.log(`🕒 Session initialized - expires in ${timeUntilExpiry} minutes`);
  }

  updateActivity() {
    if (!this.sessionData || !this.sessionData.isActive) return;

    const now = Date.now();
    const timeSinceLastActivity = now - this.sessionData.lastActivity;

    // Only update if it's been more than 30 seconds since last activity update
    // This prevents excessive timer resets from minor UI interactions
    if (timeSinceLastActivity < 30000) return; // 30 seconds throttle

    // Reduced logging for activity updates to prevent spam
    if (timeSinceLastActivity > 60000) { // Only log if more than 1 minute since last
      console.log(`🔄 Activity detected - updating session timer (${Math.round(timeSinceLastActivity/1000)}s since last update)`);
    }

    this.sessionData.lastActivity = now;
    this.saveSession();
    this.scheduleTimeout();

    // Debounce server sync to avoid excessive API calls
    this.debouncedServerSync();
  }

  private debouncedServerSync() {
    // Clear existing debounce timer
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
    }

    // Set new debounce timer
    this.debounceTimeoutId = setTimeout(() => {
      this.syncWithServer();
    }, this.DEBOUNCE_DELAY);
  }

  private scheduleTimeout() {
    if (!this.sessionData) return;

    // Clear existing timeouts
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);

    const { timeout, warningTime } = this.sessionData.config;
    const timeoutMs = timeout * 60 * 1000;
    const warningMs = warningTime * 60 * 1000;

    console.log(`🕒 Scheduling timeout: ${timeout} minutes, warning: ${warningTime} minutes before`);

    // Schedule warning
    if (warningMs < timeoutMs) {
      this.warningTimeoutId = setTimeout(() => {
        if (this.onSessionWarning) {
          // Fix: timeLeft should be the remaining time until session expires (warningTime minutes)
          const timeLeft = warningTime; // This is the time left when warning shows
          console.log(`⚠️ Session warning triggered - ${timeLeft} minutes remaining`);
          this.onSessionWarning(timeLeft);
        }
      }, timeoutMs - warningMs);
    }

    // Schedule timeout
    this.timeoutId = setTimeout(() => {
      console.log(`🔴 Session timeout triggered - expiring session`);
      this.expireSession();
    }, timeoutMs);
  }

  private expireSession() {
    console.log(`🔴 EXPIRE SESSION: Starting session expiration process`);

    if (this.sessionData) {
      console.log(`🔴 EXPIRE SESSION: Setting session to inactive`);
      this.sessionData.isActive = false;
      this.saveSession();
    }

    console.log(`🔴 EXPIRE SESSION: Calling onSessionExpired callback`);
    if (this.onSessionExpired) {
      this.onSessionExpired();
    } else {
      console.log(`🔴 EXPIRE SESSION: No onSessionExpired callback set!`);
    }
  }

  extendSession() {
    this.updateActivity();
  }

  endSession() {
    this.sessionData = null;
    localStorage.removeItem('sessionData');
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);
    if (this.debounceTimeoutId) clearTimeout(this.debounceTimeoutId);
    this.stopHeartbeat();
  }

  updateConfig(config: Partial<SessionConfig>) {
    if (!this.sessionData) return;

    console.log(`⚙️ Updating session config:`, {
      old: this.sessionData.config,
      new: { ...this.sessionData.config, ...config }
    });

    this.sessionData.config = { ...this.sessionData.config, ...config };
    this.saveSession();

    // Immediately reschedule timeouts with new config
    this.scheduleTimeout();

    console.log(`✅ Session config updated and timeouts rescheduled`);
  }

  getConfig(): SessionConfig | null {
    return this.sessionData?.config || null;
  }

  isSessionActive(): boolean {
    if (!this.sessionData) return false;

    const now = Date.now();
    const timeoutMs = this.sessionData.config.timeout * 60 * 1000;
    const elapsed = now - this.sessionData.lastActivity;

    if (elapsed >= timeoutMs) {
      this.expireSession();
      return false;
    }

    return this.sessionData.isActive;
  }

  getTimeUntilExpiry(): number {
    if (!this.sessionData) return 0;

    const now = Date.now();
    const timeoutMs = this.sessionData.config.timeout * 60 * 1000;
    const elapsed = now - this.sessionData.lastActivity;
    const remaining = timeoutMs - elapsed;

    return Math.max(0, Math.ceil(remaining / 60000)); // minutes
  }

  getTimeUntilExpiryInSeconds(): number {
    if (!this.sessionData) return 0;

    const now = Date.now();
    const timeoutMs = this.sessionData.config.timeout * 60 * 1000;
    const elapsed = now - this.sessionData.lastActivity;
    const remaining = timeoutMs - elapsed;

    return Math.max(0, Math.ceil(remaining / 1000)); // seconds
  }

  private saveSession() {
    if (this.sessionData) {
      localStorage.setItem('sessionData', JSON.stringify(this.sessionData));
    }
  }

  private loadSession() {
    try {
      const stored = localStorage.getItem('sessionData');
      if (stored) {
        this.sessionData = JSON.parse(stored);
        // Check if session is still valid
        if (this.sessionData && !this.isSessionActive()) {
          this.sessionData = null;
          localStorage.removeItem('sessionData');
        } else if (this.sessionData) {
          // Resume scheduling and heartbeat if session is valid
          this.scheduleTimeout();
          this.startHeartbeat();
        }
      }
    } catch (error) {
      console.error('Error loading session data:', error);
      localStorage.removeItem('sessionData');
    }
  }

  onExpired(callback: () => void) {
    this.onSessionExpired = callback;
  }

  onWarning(callback: (timeLeft: number) => void) {
    this.onSessionWarning = callback;
  }

  // Server sync methods
  private async syncWithServer() {
    if (this.syncInProgress || !this.sessionData?.isActive) return;

    const now = Date.now();
    // Don't sync too frequently
    if (now - this.lastServerSync < this.DEBOUNCE_DELAY) return;

    this.syncInProgress = true;
    this.lastServerSync = now;

    try {
      // Import authService dynamically to avoid circular dependencies
      const { authService } = await import('../services/authService');
      const result = await authService.sessionHeartbeat();

      if (result.success && result.session) {
        // Update local session data based on server response
        this.updateFromServerSession(result.session);
      } else {
        console.warn('⚠️ Server sync failed:', result.message);
      }
    } catch (error) {
      console.warn('⚠️ Server sync error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private updateFromServerSession(serverSession: any) {
    if (!this.sessionData) return;

    // Update expiry based on server response
    const serverExpiresAt = new Date(serverSession.expiresAt).getTime();
    const clientExpiresAt = this.sessionData.lastActivity + (this.sessionData.config.timeout * 60 * 1000);

    // Reduced server sync logging to prevent spam
    const difference = Math.abs(serverExpiresAt - clientExpiresAt) / 1000;
    if (difference > 30) { // Only log significant differences
      console.log('🔄 Server session sync - significant difference:', difference + 's');
    }

    // TEMPORARILY DISABLE server session adjustment to debug local timeout
    // The server heartbeat might be preventing local timeout from working
    if (false && Math.abs(serverExpiresAt - clientExpiresAt) > 30000) { // 30 second tolerance
      console.log('🔄 Adjusting client session based on server state');
      // Adjust the last activity time to match server expectations
      this.sessionData.lastActivity = serverExpiresAt - (this.sessionData.config.timeout * 60 * 1000);
      this.saveSession();
      this.scheduleTimeout(); // Re-schedule with adjusted time
    }
  }

  private startHeartbeat() {
    // Clear any existing heartbeat
    this.stopHeartbeat();

    // Start periodic heartbeat
    this.heartbeatIntervalId = setInterval(() => {
      this.syncWithServer();
    }, this.SYNC_INTERVAL);

  }

  private stopHeartbeat() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  cleanup() {
    this.activityListeners.forEach(cleanup => cleanup());
    this.activityListeners = [];
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);
    if (this.debounceTimeoutId) clearTimeout(this.debounceTimeoutId);
    this.stopHeartbeat();
  }
}

export default SessionManager;
export type { SessionConfig };