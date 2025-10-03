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

type EmployeeStatusCallback = (update: EmployeeStatusUpdate) => void;
type EmployeeLoginCallback = (change: EmployeeLoginChange) => void;
type AuthErrorCallback = (error: { message: string }) => void;
type EntityDataChangedCallback = (change: EntityDataChanged) => void;
type ServiceRequestViewersCallback = (update: ServiceRequestViewersUpdate) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;

  // Event callbacks
  private onEmployeeStatusUpdate: EmployeeStatusCallback | null = null;
  private onEmployeeLoginChange: EmployeeLoginCallback | null = null;
  private onAuthError: AuthErrorCallback | null = null;
  private onEntityDataChanged: EntityDataChangedCallback | null = null;
  private onServiceRequestViewers: ServiceRequestViewersCallback | null = null;

  connect(serverUrl: string = 'http://localhost:3001'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.socket) {
          this.disconnect();
        }

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
          if (this.onEntityDataChanged) {
            this.onEntityDataChanged(change);
          }
        });

        this.socket.on('service-request-viewers', (update: ServiceRequestViewersUpdate) => {
          console.log(`👁️  Service request ${update.serviceRequestId} viewers:`, update.viewers.length);
          if (this.onServiceRequestViewers) {
            this.onServiceRequestViewers(update);
          }
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
    }
  }

  // Event listeners
  onEmployeeStatusChange(callback: EmployeeStatusCallback): void {
    this.onEmployeeStatusUpdate = callback;
  }

  onEmployeeLogin(callback: EmployeeLoginCallback): void {
    this.onEmployeeLoginChange = callback;
  }

  onEntityDataChange(callback: EntityDataChangedCallback): void {
    this.onEntityDataChanged = callback;
  }

  onAuthenticationError(callback: AuthErrorCallback): void {
    this.onAuthError = callback;
  }

  onServiceRequestViewersChange(callback: ServiceRequestViewersCallback): void {
    this.onServiceRequestViewers = callback;
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
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;