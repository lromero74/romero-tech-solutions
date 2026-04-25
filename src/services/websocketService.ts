import { io, Socket } from 'socket.io-client';

interface EmployeeStatusUpdate {
  employees: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    preferredName: string;
    isActive: boolean;
    workingStatus: string;
    workingStatusDisplay: string;
    workingStatusColor: string;
    isLoggedIn: boolean;
    lastActivity: string | null;
    isRecentlyActive: boolean;
  }>;
  timestamp: string;
}

interface EmployeeLoginChange {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  isLoggedIn: boolean;
  lastActivity: string | null;
  isRecentlyActive: boolean;
}

interface EntityDataChanged {
  entityType: 'employee' | 'client' | 'business' | 'service' | 'serviceRequest' | 'serviceLocation';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  timestamp: string;
}

interface ServiceRequestViewer {
  userId: string;
  userName: string;
  userType: string;
}

interface ServiceRequestViewersUpdate {
  serviceRequestId: string;
  viewers: ServiceRequestViewer[];
}

interface AgentStatusUpdate {
  agentId: string;
  status: 'online' | 'offline' | 'warning';
  lastHeartbeat: string;
  deviceName: string;
}

interface AgentMetricsUpdate {
  agentId: string;
  metrics: any; // Full metrics object
  timestamp: string;
}

// AgentCommandCompleted is emitted by the backend when an agent posts
// its result for a remote command (update_packages, ping, etc.). The
// frontend's UpdatePackageDialog subscribes to flip from "running" →
// "done" without polling.
interface AgentCommandCompleted {
  command_id: string;
  agent_id: string;
  command_type: string;
  status: 'completed' | 'completed_with_failures' | 'failed';
  result: any;       // command-type-specific (UpdateResult for update_packages)
  error?: string;
  completed_at: string;
}

type EmployeeStatusCallback = (update: EmployeeStatusUpdate) => void;
type EmployeeLoginCallback = (change: EmployeeLoginChange) => void;
type AuthErrorCallback = (error: { message: string }) => void;
type EntityDataChangedCallback = (change: EntityDataChanged) => void;
type ServiceRequestViewersCallback = (update: ServiceRequestViewersUpdate) => void;
type AgentStatusCallback = (update: AgentStatusUpdate) => void;
type AgentMetricsCallback = (update: AgentMetricsUpdate) => void;
type AgentCommandCompletedCallback = (update: AgentCommandCompleted) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private currentUrl: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;

  // Event callbacks
  private onEmployeeStatusUpdate: EmployeeStatusCallback | null = null;
  private onEmployeeLoginChange: EmployeeLoginCallback | null = null;
  private onAuthError: AuthErrorCallback | null = null;
  private onEntityDataChangedCallbacks: EntityDataChangedCallback[] = []; // Changed to array for multiple listeners
  private onServiceRequestViewers: ServiceRequestViewersCallback | null = null;
  private onAgentStatusCallbacks: AgentStatusCallback[] = [];
  private onAgentMetricsCallbacks: AgentMetricsCallback[] = [];
  private onAgentCommandCompletedCallbacks: AgentCommandCompletedCallback[] = [];

  connect(serverUrl: string = 'http://localhost:3001'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 🚀 OPTIMIZATION: Skip reconnection if already connected to same URL
        if (this.socket && this.isConnected && this.currentUrl === serverUrl) {
          console.log('✅ Already connected to', serverUrl, '- reusing existing connection');
          resolve();
          return;
        }

        // 🚀 OPTIMIZATION: Prevent concurrent connection attempts
        if (this.isConnecting) {
          console.log('⏳ Connection already in progress, waiting...');
          // Wait for existing connection attempt
          const checkInterval = setInterval(() => {
            if (!this.isConnecting) {
              clearInterval(checkInterval);
              if (this.isConnected && this.currentUrl === serverUrl) {
                resolve();
              } else {
                reject(new Error('Concurrent connection attempt failed'));
              }
            }
          }, 100);
          return;
        }

        // Only disconnect if connecting to a different URL
        if (this.socket && this.currentUrl !== serverUrl) {
          console.log('🔄 Switching WebSocket connection from', this.currentUrl, 'to', serverUrl);
          this.disconnect();
        }

        this.isConnecting = true;
        this.currentUrl = serverUrl;

        this.socket = io(serverUrl, {
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectInterval,
          timeout: 10000
        });

        this.socket.on('connect', () => {
          console.log('🔌 WebSocket connected to server');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 WebSocket disconnected:', reason);
          this.isConnected = false;
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ WebSocket connection error:', error);
          this.isConnected = false;
          this.isConnecting = false;
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });

        this.socket.on('admin-authenticated', (data) => {
          console.log('🔐 Admin WebSocket authenticated:', data.email);
        });

        this.socket.on('client-authenticated', (data) => {
          console.log('🔐 Client WebSocket authenticated:', data.email);
        });

        this.socket.on('auth-error', (error) => {
          console.error('❌ WebSocket auth error:', error);
          if (this.onAuthError) {
            this.onAuthError(error);
          }
        });

        this.socket.on('employee-status-update', (update: EmployeeStatusUpdate) => {
          console.log('📊 Received employee status update:', update.employees.length, 'employees');
          if (this.onEmployeeStatusUpdate) {
            this.onEmployeeStatusUpdate(update);
          }
        });

        this.socket.on('employee-login-change', (change: EmployeeLoginChange) => {
          console.log('👤 Employee login change:', change.email, '=', change.isLoggedIn);
          if (this.onEmployeeLoginChange) {
            this.onEmployeeLoginChange(change);
          }
        });

        this.socket.on('entity-data-changed', (change: EntityDataChanged) => {
          console.log(`📡 Entity ${change.entityType} ${change.action}:`, change.entityId);
          console.log('🔍 Full change data:', change);
          console.log('🔍 Registered callbacks count:', this.onEntityDataChangedCallbacks.length);
          if (this.onEntityDataChangedCallbacks.length > 0) {
            console.log(`✅ Calling ${this.onEntityDataChangedCallbacks.length} callback(s)...`);
            this.onEntityDataChangedCallbacks.forEach((callback, index) => {
              try {
                console.log(`⏳ Executing callback ${index + 1}/${this.onEntityDataChangedCallbacks.length}...`);
                callback(change);
                console.log(`✅ Callback ${index + 1} executed successfully`);
              } catch (error) {
                console.error(`❌ Error in callback ${index + 1}:`, error);
              }
            });
          } else {
            console.warn('⚠️ No callbacks registered for entity-data-changed!');
          }
        });

        this.socket.on('service-request-viewers', (update: ServiceRequestViewersUpdate) => {
          console.log(`👁️  Service request ${update.serviceRequestId} viewers:`, update.viewers.length);
          if (this.onServiceRequestViewers) {
            this.onServiceRequestViewers(update);
          }
        });

        this.socket.on('agent-status-update', (update: AgentStatusUpdate) => {
          console.log(`🤖 Agent status update: ${update.agentId} = ${update.status}`);
          this.onAgentStatusCallbacks.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              console.error('❌ Error in agent status callback:', error);
            }
          });
        });

        this.socket.on('agent-metrics-update', (update: AgentMetricsUpdate) => {
          console.log(`📊 Agent metrics update: ${update.agentId}`);
          this.onAgentMetricsCallbacks.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              console.error('❌ Error in agent metrics callback:', error);
            }
          });
        });

        // Emitted by backend when an agent posts the result of a remote
        // command (e.g. update_packages). Subscribers (currently the
        // package-update modal) get a real-time flip from running → done.
        this.socket.on('agent.command.completed', (update: AgentCommandCompleted) => {
          console.log(`🛠️  Agent command completed: ${update.command_type} (${update.status}) for ${update.agent_id}`);
          this.onAgentCommandCompletedCallbacks.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              console.error('❌ Error in agent command completed callback:', error);
            }
          });
        });

        this.socket.on('error', (error) => {
          console.error('❌ WebSocket error:', error);
        });

      } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error);
        reject(error);
      }
    });
  }

  authenticateAdmin(sessionToken: string): void {
    if (!this.socket || !this.isConnected) {
      console.error('❌ Cannot authenticate: WebSocket not connected');
      return;
    }

    console.log('🔐 Authenticating admin WebSocket connection...');
    this.socket.emit('admin-authenticate', { sessionToken });
  }

  authenticateClient(sessionToken: string): void {
    if (!this.socket || !this.isConnected) {
      console.error('❌ Cannot authenticate: WebSocket not connected');
      return;
    }

    console.log('🔐 Authenticating client WebSocket connection...');
    this.socket.emit('client-authenticate', { sessionToken });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.isConnecting = false;
      this.currentUrl = null;
    }
  }

  // Event listeners
  onEmployeeStatusChange(callback: EmployeeStatusCallback): void {
    this.onEmployeeStatusUpdate = callback;
  }

  onEmployeeLogin(callback: EmployeeLoginCallback): void {
    this.onEmployeeLoginChange = callback;
  }

  onEntityDataChange(callback: EntityDataChangedCallback): () => void {
    console.log('📝 Registering onEntityDataChange callback (total:', this.onEntityDataChangedCallbacks.length + 1, ')');
    this.onEntityDataChangedCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onEntityDataChangedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onEntityDataChangedCallbacks.splice(index, 1);
        console.log('🗑️ Unregistered onEntityDataChange callback (remaining:', this.onEntityDataChangedCallbacks.length, ')');
      }
    };
  }

  onAuthenticationError(callback: AuthErrorCallback): void {
    this.onAuthError = callback;
  }

  onServiceRequestViewersChange(callback: ServiceRequestViewersCallback): void {
    this.onServiceRequestViewers = callback;
  }

  onAgentStatusChange(callback: AgentStatusCallback): () => void {
    console.log('📝 Registering onAgentStatusChange callback');
    this.onAgentStatusCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onAgentStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.onAgentStatusCallbacks.splice(index, 1);
        console.log('🗑️ Unregistered onAgentStatusChange callback');
      }
    };
  }

  /**
   * Subscribe to agent.command.completed events. Multiple subscribers
   * are supported (e.g. several open update-package modals on different
   * tabs); each gets its own callback. Returns an unsubscribe fn.
   */
  onAgentCommandCompleted(callback: AgentCommandCompletedCallback): () => void {
    this.onAgentCommandCompletedCallbacks.push(callback);
    return () => {
      const index = this.onAgentCommandCompletedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onAgentCommandCompletedCallbacks.splice(index, 1);
      }
    };
  }

  onAgentMetricsChange(callback: AgentMetricsCallback): () => void {
    console.log('📝 Registering onAgentMetricsChange callback');
    this.onAgentMetricsCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.onAgentMetricsCallbacks.indexOf(callback);
      if (index > -1) {
        this.onAgentMetricsCallbacks.splice(index, 1);
        console.log('🗑️ Unregistered onAgentMetricsChange callback');
      }
    };
  }

  // Service request viewing events
  startViewingRequest(serviceRequestId: string): void {
    if (!this.socket || !this.isConnected) {
      console.error('❌ Cannot emit start-viewing-request: WebSocket not connected');
      return;
    }
    console.log(`👁️  Starting to view service request ${serviceRequestId}`);
    this.socket.emit('start-viewing-request', { serviceRequestId });
  }

  stopViewingRequest(serviceRequestId: string): void {
    if (!this.socket || !this.isConnected) {
      console.error('❌ Cannot emit stop-viewing-request: WebSocket not connected');
      return;
    }
    console.log(`👁️  Stopping viewing service request ${serviceRequestId}`);
    this.socket.emit('stop-viewing-request', { serviceRequestId });
  }

  // Status getters
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Generic event listener for custom events (like alert:created)
  on(eventName: string, callback: (data: any) => void): void {
    if (!this.socket) {
      console.error(`❌ Cannot register listener for '${eventName}': WebSocket not initialized`);
      return;
    }
    console.log(`📝 Registering custom event listener: ${eventName}`);
    this.socket.on(eventName, callback);
  }

  // Remove generic event listener
  off(eventName: string, callback?: (data: any) => void): void {
    if (!this.socket) {
      return;
    }
    console.log(`🗑️ Removing custom event listener: ${eventName}`);
    if (callback) {
      this.socket.off(eventName, callback);
    } else {
      this.socket.off(eventName);
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;