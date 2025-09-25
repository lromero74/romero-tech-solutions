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

export default router;