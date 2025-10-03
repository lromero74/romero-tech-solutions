import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

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
import serviceHourRatesRoutes from './admin/serviceHourRates.js';
import hourlyRateCategoriesRoutes from './admin/hourlyRateCategories.js';
import { getSignupStats } from '../middleware/signupRateLimiter.js';
import { getEmployeeLoginStats } from '../middleware/employeeLoginRateLimiter.js';

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);

// Service requests routes - accessible by all employees with access.admin_routes.enable
router.use('/', requirePermission('access.admin_routes.enable'), serviceRequestsRoutes);

// Employees routes - accessible by all employees (with permission checks inside routes)
router.use('/', requirePermission('access.admin_routes.enable'), employeesRoutes);

// Employee Calendar routes - accessible by all employees
router.use('/', requirePermission('access.admin_routes.enable'), employeeCalendarRoutes);

// Businesses routes - accessible by all employees (with permission checks inside routes)
router.use('/', requirePermission('access.admin_routes.enable'), businessesRoutes);

// Permissions routes - user-permissions endpoint needs to be accessible by all employees
router.use('/', requirePermission('access.admin_routes.enable'), permissionsRoutes);

// Users (Clients) routes - accessible by all employees (with permission checks inside routes)
router.use('/', requirePermission('access.admin_routes.enable'), usersRoutes);

// Service Locations routes - accessible by all employees (with permission checks inside routes)
router.use('/', requirePermission('access.admin_routes.enable'), serviceLocationsRoutes);

// Location Contacts routes - accessible by all employees (needed for service locations table)
router.use('/', requirePermission('access.admin_routes.enable'), locationContactsRoutes);

// All other admin routes - require manage.security_sessions.enable
router.use(requirePermission('manage.security_sessions.enable'));

// Mount modular routes
router.use('/', dashboardRoutes);
router.use('/', servicesRoutes);
router.use('/', rolesRoutes);
router.use('/', passwordComplexityRoutes);
router.use('/', systemSettingsRoutes);
router.use('/', serviceAreasRoutes);
router.use('/', locationTypesRoutes);
router.use('/closure-reasons', closureReasonsRoutes);
router.use('/permission-audit-log', permissionAuditLogRoutes);
router.use('/service-hour-rates', serviceHourRatesRoutes);
router.use('/hourly-rate-categories', hourlyRateCategoriesRoutes);

// Security monitoring endpoints
router.get('/signup-stats', getSignupStats);
router.get('/employee-login-security', getEmployeeLoginStats);

export default router;