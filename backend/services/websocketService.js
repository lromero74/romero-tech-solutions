import { Server } from 'socket.io';
import { sessionService } from './sessionService.js';
import { query } from '../config/database.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // Map of userId -> socketId
    this.adminSockets = new Set(); // Set of admin socket IDs
  }

  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:5174",
          "https://romerotechsolutions.com",
          "https://main.d3s921l1b6dx60.amplifyapp.com",
          "https://prod.romerotechsolutions.com",
          "https://www.romerotechsolutions.com",
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

          // Check admin role
          const roleResult = await query(`
            SELECT r.name
            FROM employee_roles er
            JOIN roles r ON er.role_id = r.id
            WHERE er.employee_id = $1 AND r.name = 'admin' AND r.is_active = true
          `, [user.id]);

          if (roleResult.rows.length === 0) {
            socket.emit('auth-error', { message: 'Insufficient permissions' });
            return;
          }

          // Store admin socket
          this.adminSockets.add(socket.id);
          socket.userId = user.id;
          socket.userEmail = user.email;

          console.log(`🔐 Admin authenticated: ${user.email} (${socket.id})`);
          socket.emit('admin-authenticated', {
            message: 'Successfully authenticated as admin',
            userId: user.id,
            email: user.email
          });

          // Send initial employee status data
          await this.sendEmployeeStatusToAdmin(socket);

        } catch (error) {
          console.error('❌ Admin authentication error:', error);
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

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);

        // Remove from admin sockets
        this.adminSockets.delete(socket.id);

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

  // Get connected user count
  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  // Get admin socket count
  getAdminSocketCount() {
    return this.adminSockets.size;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();