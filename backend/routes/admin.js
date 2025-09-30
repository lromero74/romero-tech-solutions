import express from 'express';
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware.js';

// Import modular route handlers
import dashboardRoutes from './admin/dashboard.js';
import usersRoutes from './admin/users.js';
import employeesRoutes from './admin/employees.js';
import servicesRoutes from './admin/services.js';
import rolesRoutes from './admin/roles.js';
import businessesRoutes from './admin/businesses.js';
import serviceLocationsRoutes from './admin/serviceLocations.js';
import passwordComplexityRoutes from './admin/passwordComplexity.js';
import locationContactsRoutes from './admin/locationContacts.js';
import systemSettingsRoutes from './admin/systemSettings.js';
import serviceAreasRoutes from './admin/serviceAreas.js';
import locationTypesRoutes from './admin/locationTypes.js';
import closureReasonsRoutes from './admin/closureReasons.js';
import employeeCalendarRoutes from './admin/employeeCalendar.js';
import serviceRequestsRoutes from './admin/serviceRequests.js';
import permissionsRoutes from './admin/permissions.js';
import permissionAuditLogRoutes from './admin/permissionAuditLog.js';
import { getSignupStats } from '../middleware/signupRateLimiter.js';
import { getEmployeeLoginStats } from '../middleware/employeeLoginRateLimiter.js';

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);
router.use(requireAdmin);

// Mount modular routes
router.use('/', dashboardRoutes);
router.use('/', usersRoutes);
router.use('/', employeesRoutes);
router.use('/', servicesRoutes);
router.use('/', rolesRoutes);
router.use('/', businessesRoutes);
router.use('/', serviceLocationsRoutes);
router.use('/', passwordComplexityRoutes);
router.use('/', locationContactsRoutes);
router.use('/', systemSettingsRoutes);
router.use('/', serviceAreasRoutes);
router.use('/', locationTypesRoutes);
router.use('/closure-reasons', closureReasonsRoutes);
router.use('/', employeeCalendarRoutes);
router.use('/', serviceRequestsRoutes);
router.use('/', permissionsRoutes);
router.use('/permission-audit-log', permissionAuditLogRoutes);

// Security monitoring endpoints
router.get('/signup-stats', getSignupStats);
router.get('/employee-login-security', getEmployeeLoginStats);

export default router;