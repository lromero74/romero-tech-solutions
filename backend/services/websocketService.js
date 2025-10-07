import { Server } from 'socket.io';
import { sessionService } from './sessionService.js';
import { query } from '../config/database.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // Map of userId -> socketId
    this.adminSockets = new Set(); // Set of admin socket IDs
    this.clientSockets = new Map(); // Map of clientId -> socketId for client users
    this.serviceRequestViewers = new Map(); // Map of serviceRequestId -> Set of { socketId, userId, userName, userType }
  }

  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://192.168.12.194:5173",
          "https://romerotechsolutions.com",
          "https://www.romerotechsolutions.com",
          "https://main.d3s921l1b6dx60.amplifyapp.com",
          /https:\/\/.*\.amplifyapp\.com$/
        ],
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log('🔌 WebSocket client connected:', socket.id);

      // Handle admin authentication
      socket.on('admin-authenticate', async (data) => {
        try {
          console.log('🔐 WebSocket admin authentication attempt:', data);
          const { sessionToken } = data;
          if (!sessionToken) {
            console.log('❌ No session token provided in WebSocket auth');
            socket.emit('auth-error', { message: 'No session token provided' });
            return;
          }

          // Validate session and get user info
          const session = await sessionService.validateSession(sessionToken);
          if (!session || !session.userEmail) {
            socket.emit('auth-error', { message: 'Invalid session' });
            return;
          }

          // Check if user has admin role
          const userResult = await query(
            'SELECT id, email, first_name, last_name FROM employees WHERE email = $1 AND is_active = true',
            [session.userEmail]
          );

          if (userResult.rows.length === 0) {
            socket.emit('auth-error', { message: 'User not found' });
            return;
          }

          const user = userResult.rows[0];

          // Check if user has any employee role (admin, executive, technician, sales)
          const roleResult = await query(`
            SELECT r.name
            FROM employee_roles er
            JOIN roles r ON er.role_id = r.id
            WHERE er.employee_id = $1
              AND r.name IN ('admin', 'executive', 'technician', 'sales')
              AND r.is_active = true
          `, [user.id]);

          if (roleResult.rows.length === 0) {
            socket.emit('auth-error', { message: 'Insufficient permissions' });
            return;
          }

          // Store employee socket
          this.adminSockets.add(socket.id);
          socket.userId = user.id;
          socket.userEmail = user.email;
          socket.userRole = roleResult.rows[0].name;

          console.log(`🔐 Employee authenticated: ${user.email} (${roleResult.rows[0].name}) (${socket.id})`);
          socket.emit('admin-authenticated', {
            message: 'Successfully authenticated',
            userId: user.id,
            email: user.email,
            role: roleResult.rows[0].name
          });

          // Send initial employee status data
          await this.sendEmployeeStatusToAdmin(socket);

        } catch (error) {
          console.error('❌ Admin authentication error:', error);
          socket.emit('auth-error', { message: 'Authentication failed' });
        }
      });

      // Handle client authentication
      socket.on('client-authenticate', async (data) => {
        try {
          console.log('🔐 WebSocket client authentication attempt');
          const { sessionToken } = data;
          if (!sessionToken) {
            console.log('❌ No session token provided in WebSocket auth');
            socket.emit('auth-error', { message: 'No session token provided' });
            return;
          }

          // Validate session and get user info
          const session = await sessionService.validateSession(sessionToken);
          if (!session || !session.userEmail) {
            socket.emit('auth-error', { message: 'Invalid session' });
            return;
          }

          // Check if user is a client
          const userResult = await query(
            'SELECT id, email, first_name, last_name FROM users WHERE email = $1 AND role = $2 AND soft_delete = false',
            [session.userEmail, 'client']
          );

          if (userResult.rows.length === 0) {
            socket.emit('auth-error', { message: 'User not found' });
            return;
          }

          const user = userResult.rows[0];

          // Store client socket
          this.clientSockets.set(user.id, socket.id);
          socket.clientId = user.id;
          socket.userId = user.id;  // Also set userId for consistency with admin sockets
          socket.userEmail = user.email;
          socket.userRole = 'client';

          console.log(`🔐 Client authenticated: ${user.email} (${user.id}) (${socket.id})`);
          socket.emit('client-authenticated', {
            message: 'Successfully authenticated',
            userId: user.id,
            email: user.email,
            role: 'client'
          });

        } catch (error) {
          console.error('❌ Client authentication error:', error);
          socket.emit('auth-error', { message: 'Authentication failed' });
        }
      });

      // Handle user login status tracking
      socket.on('user-login', (data) => {
        const { userId, email } = data;
        if (userId) {
          this.connectedUsers.set(userId, socket.id);
          socket.userId = userId;
          socket.userEmail = email;
          console.log(`👤 User logged in: ${email} (${userId})`);

          // Notify all admin clients about login status change
          this.broadcastLoginStatusChange(userId, true);
        }
      });

      // Handle start viewing service request
      socket.on('start-viewing-request', (data) => {
        const { serviceRequestId } = data;
        if (!serviceRequestId || !socket.userId || !socket.userEmail) {
          console.log('❌ Invalid start-viewing-request data');
          return;
        }

        // Determine user type and name
        const userType = socket.userRole || 'unknown';
        const userName = socket.userEmail;

        // Add viewer to tracking
        if (!this.serviceRequestViewers.has(serviceRequestId)) {
          this.serviceRequestViewers.set(serviceRequestId, new Set());
        }

        const viewer = {
          socketId: socket.id,
          userId: socket.userId,
          userName: userName,
          userType: userType
        };

        this.serviceRequestViewers.get(serviceRequestId).add(viewer);
        console.log(`👁️  ${userName} (${userType}) started viewing service request ${serviceRequestId}`);

        // Notify other viewers
        this.broadcastViewerUpdate(serviceRequestId);
      });

      // Handle stop viewing service request
      socket.on('stop-viewing-request', (data) => {
        const { serviceRequestId } = data;
        if (!serviceRequestId) {
          console.log('❌ Invalid stop-viewing-request data');
          return;
        }

        this.removeViewerFromRequest(socket.id, serviceRequestId);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);

        // Remove from admin sockets
        this.adminSockets.delete(socket.id);

        // Remove from client sockets
        if (socket.clientId) {
          this.clientSockets.delete(socket.clientId);
          console.log(`👤 Client disconnected: ${socket.userEmail} (${socket.clientId})`);
        }

        // Remove from all service request viewers
        this.removeViewerFromAllRequests(socket.id);

        // Handle user logout
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          console.log(`👤 User logged out: ${socket.userEmail} (${socket.userId})`);

          // Notify all admin clients about login status change
          this.broadcastLoginStatusChange(socket.userId, false);
        }
      });
    });

    console.log('✅ WebSocket service initialized');
  }

  async sendEmployeeStatusToAdmin(socket) {
    try {
      // Get lightweight employee data with login status
      const employeesResult = await query(`
        SELECT
          e.id,
          e.email,
          e.first_name,
          e.last_name,
          e.preferred_name,
          e.is_active,
          ws.status_name as working_status,
          ws.display_name as working_status_display,
          ws.color_code as working_status_color
        FROM employees e
        LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
        ORDER BY e.first_name, e.last_name
      `);

      const employees = employeesResult.rows;

      if (employees.length > 0) {
        const employeeIds = employees.map(emp => emp.id);
        const loginStatusMap = await sessionService.getUsersLoginStatus(employeeIds);

        // Combine employee data with login status
        const employeesWithStatus = employees.map(employee => ({
          ...employee,
          isLoggedIn: loginStatusMap[employee.id]?.isLoggedIn || false,
          lastActivity: loginStatusMap[employee.id]?.lastActivity || null,
          isRecentlyActive: loginStatusMap[employee.id]?.isRecentlyActive || false
        }));

        socket.emit('employee-status-update', {
          employees: employeesWithStatus,
          timestamp: new Date().toISOString()
        });

        console.log(`📊 Sent employee status to admin (${employees.length} employees)`);
      }
    } catch (error) {
      console.error('❌ Error sending employee status:', error);
      socket.emit('error', { message: 'Failed to fetch employee status' });
    }
  }

  async broadcastLoginStatusChange(userId, isLoggedIn) {
    if (this.adminSockets.size === 0) return;

    try {
      // Get user info
      const userResult = await query(
        'SELECT id, email, first_name, last_name, preferred_name FROM employees WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) return;

      const user = userResult.rows[0];
      const loginUpdate = {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        preferredName: user.preferred_name,
        isLoggedIn,
        lastActivity: isLoggedIn ? new Date().toISOString() : null,
        isRecentlyActive: isLoggedIn
      };

      // Broadcast to all admin clients
      this.adminSockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('employee-login-change', loginUpdate);
        }
      });

      console.log(`📡 Broadcasted login status change: ${user.email} = ${isLoggedIn}`);
    } catch (error) {
      console.error('❌ Error broadcasting login status change:', error);
    }
  }

  // Method to emit login status change from session service
  async emitLoginStatusChange(userId, isLoggedIn) {
    await this.broadcastLoginStatusChange(userId, isLoggedIn);
  }

  // Broadcast entity data change to all admin clients (generic for all entity types)
  broadcastEntityUpdate(entityType, entityId, action = 'updated', additionalData = {}) {
    if (this.adminSockets.size === 0) {
      console.log(`📡 No admin sockets connected, skipping ${entityType} update broadcast`);
      return;
    }

    console.log(`📡 Broadcasting ${entityType} ${action}: ${entityId} to ${this.adminSockets.size} admin(s)`);

    // Broadcast to all admin clients
    this.adminSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('entity-data-changed', {
          entityType, // 'employee', 'client', 'business', 'service', 'serviceRequest', 'serviceLocation'
          entityId,
          action, // 'created', 'updated', 'deleted', 'restored'
          timestamp: new Date().toISOString(),
          ...additionalData
        });
      }
    });
  }

  // Convenience methods for specific entity types
  broadcastEmployeeUpdate(employeeId, action = 'updated', additionalData = {}) {
    this.broadcastEntityUpdate('employee', employeeId, action, additionalData);
  }

  broadcastClientUpdate(clientId, action = 'updated', additionalData = {}) {
    this.broadcastEntityUpdate('client', clientId, action, additionalData);
  }

  broadcastBusinessUpdate(businessId, action = 'updated', additionalData = {}) {
    this.broadcastEntityUpdate('business', businessId, action, additionalData);
  }

  broadcastServiceUpdate(serviceId, action = 'updated', additionalData = {}) {
    this.broadcastEntityUpdate('service', serviceId, action, additionalData);
  }

  async broadcastServiceRequestUpdate(serviceRequestId, action = 'updated', additionalData = {}) {
    // Broadcast to all admins/employees
    this.broadcastEntityUpdate('serviceRequest', serviceRequestId, action, additionalData);

    // Also broadcast to the specific client who owns this service request
    try {
      const result = await query(
        'SELECT client_id FROM service_requests WHERE id = $1',
        [serviceRequestId]
      );

      if (result.rows.length > 0 && result.rows[0].client_id) {
        const clientId = result.rows[0].client_id;
        const clientSocketId = this.clientSockets.get(clientId);

        if (clientSocketId) {
          const socket = this.io.sockets.sockets.get(clientSocketId);
          if (socket) {
            socket.emit('entity-data-changed', {
              entityType: 'serviceRequest',
              entityId: serviceRequestId,
              action,
              timestamp: new Date().toISOString(),
              ...additionalData
            });
            console.log(`📡 Broadcasted service request ${action} to client ${clientId}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error broadcasting to client:', error);
    }
  }

  broadcastServiceLocationUpdate(serviceLocationId, action = 'updated', additionalData = {}) {
    this.broadcastEntityUpdate('serviceLocation', serviceLocationId, action, additionalData);
  }

  /**
   * Broadcast permission-related updates to all connected admin clients
   * Used when permissions or role assignments are updated
   */
  broadcastPermissionUpdate(permissionData) {
    if (this.adminSockets.size === 0) {
      console.log('📡 No admin sockets connected, skipping permission update broadcast');
      return;
    }

    console.log(`📡 Broadcasting permission update to ${this.adminSockets.size} admin(s)`);

    this.adminSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('permissionUpdated', permissionData);
      }
    });
  }

  /**
   * Broadcast role permission changes to all connected admin clients
   * Triggers permission cache refresh on frontend
   */
  broadcastRolePermissionsUpdated(roleData) {
    if (this.adminSockets.size === 0) {
      console.log('📡 No admin sockets connected, skipping role permissions update broadcast');
      return;
    }

    console.log(`📡 Broadcasting role permissions update to ${this.adminSockets.size} admin(s)`, {
      roleId: roleData.roleId,
      roleName: roleData.roleName
    });

    this.adminSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('rolePermissionsUpdated', roleData);
      }
    });
  }

  /**
   * Broadcast generic message to all admins
   * Used by permission management routes
   */
  broadcastToAdmins(message) {
    if (this.adminSockets.size === 0) {
      console.log('📡 No admin sockets connected, skipping broadcast');
      return;
    }

    console.log(`📡 Broadcasting to ${this.adminSockets.size} admin(s):`, message.type);

    this.adminSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(message.type, message.data);
      }
    });
  }

  // Get connected user count
  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  // Get admin socket count
  getAdminSocketCount() {
    return this.adminSockets.size;
  }

  /**
   * Remove a viewer from a specific service request and notify others
   */
  removeViewerFromRequest(socketId, serviceRequestId) {
    if (!this.serviceRequestViewers.has(serviceRequestId)) {
      return;
    }

    const viewers = this.serviceRequestViewers.get(serviceRequestId);
    const viewerToRemove = Array.from(viewers).find(v => v.socketId === socketId);

    if (viewerToRemove) {
      viewers.delete(viewerToRemove);
      console.log(`👁️  ${viewerToRemove.userName} (${viewerToRemove.userType}) stopped viewing service request ${serviceRequestId}`);

      // Clean up empty viewer sets
      if (viewers.size === 0) {
        this.serviceRequestViewers.delete(serviceRequestId);
      }

      // Notify other viewers
      this.broadcastViewerUpdate(serviceRequestId);
    }
  }

  /**
   * Remove a viewer from all service requests (used on disconnect)
   */
  removeViewerFromAllRequests(socketId) {
    for (const [serviceRequestId, viewers] of this.serviceRequestViewers.entries()) {
      const viewerToRemove = Array.from(viewers).find(v => v.socketId === socketId);
      if (viewerToRemove) {
        viewers.delete(viewerToRemove);
        console.log(`👁️  ${viewerToRemove.userName} stopped viewing service request ${serviceRequestId} (disconnect)`);

        // Clean up empty viewer sets
        if (viewers.size === 0) {
          this.serviceRequestViewers.delete(serviceRequestId);
        } else {
          // Notify remaining viewers
          this.broadcastViewerUpdate(serviceRequestId);
        }
      }
    }
  }

  /**
   * Broadcast current viewer list to all viewers of a service request
   */
  broadcastViewerUpdate(serviceRequestId) {
    const viewers = this.serviceRequestViewers.get(serviceRequestId);
    if (!viewers || viewers.size === 0) {
      return;
    }

    // Convert Set to Array for easier consumption
    const viewerList = Array.from(viewers).map(v => ({
      userId: v.userId,
      userName: v.userName,
      userType: v.userType
    }));

    console.log(`📡 Broadcasting viewer update for service request ${serviceRequestId}: ${viewerList.length} viewer(s)`);

    // Send to each viewer
    viewers.forEach(viewer => {
      const socket = this.io.sockets.sockets.get(viewer.socketId);
      if (socket) {
        // Send list of OTHER viewers (exclude self)
        const otherViewers = viewerList.filter(v => v.userId !== viewer.userId);
        socket.emit('service-request-viewers', {
          serviceRequestId,
          viewers: otherViewers
        });
      }
    });
  }

  /**
   * Check if a client is currently viewing a specific service request
   * @param {string} clientId - The client's user ID
   * @param {string} serviceRequestId - The service request ID
   * @returns {boolean} - True if the client is currently viewing the request
   */
  isClientViewingRequest(clientId, serviceRequestId) {
    const viewers = this.serviceRequestViewers.get(serviceRequestId);
    if (!viewers || viewers.size === 0) {
      return false;
    }

    // Check if any viewer matches the client ID and is a client type
    const isViewing = Array.from(viewers).some(
      viewer => viewer.userId === clientId && viewer.userType === 'client'
    );

    console.log(`👁️  Client ${clientId} ${isViewing ? 'IS' : 'is NOT'} viewing service request ${serviceRequestId}`);
    return isViewing;
  }

  /**
   * Check if an employee is currently viewing a specific service request
   * @param {string} employeeId - The employee's user ID
   * @param {string} serviceRequestId - The service request ID
   * @returns {boolean} - True if the employee is currently viewing the request
   */
  isEmployeeViewingRequest(employeeId, serviceRequestId) {
    const viewers = this.serviceRequestViewers.get(serviceRequestId);
    if (!viewers || viewers.size === 0) {
      return false;
    }

    // Check if any viewer matches the employee ID and is an employee type
    const isViewing = Array.from(viewers).some(
      viewer => viewer.userId === employeeId && viewer.userType === 'employee'
    );

    console.log(`👁️  Employee ${employeeId} ${isViewing ? 'IS' : 'is NOT'} viewing service request ${serviceRequestId}`);
    return isViewing;
  }

  /**
   * Notify a specific client about an invoice update
   * @param {string} clientId - The client's user ID
   * @param {Object} invoiceData - Invoice update data
   */
  notifyClientOfInvoiceUpdate(clientId, invoiceData) {
    const socketId = this.clientSockets.get(clientId);
    if (!socketId) {
      console.log(`📡 No active socket for client ${clientId}, skipping invoice notification`);
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      console.log(`📡 Sending invoice update to client ${clientId}:`, invoiceData);
      socket.emit('invoice-updated', invoiceData);
    }
  }

  /**
   * Broadcast invoice update to all admin sockets
   * @param {Object} invoiceData - Invoice update data
   */
  broadcastInvoiceUpdateToAdmins(invoiceData) {
    if (this.adminSockets.size === 0) {
      console.log('📡 No admin sockets connected, skipping invoice broadcast');
      return;
    }

    console.log(`📡 Broadcasting invoice update to ${this.adminSockets.size} admin(s)`);

    this.adminSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('invoice-updated', invoiceData);
      }
    });
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();