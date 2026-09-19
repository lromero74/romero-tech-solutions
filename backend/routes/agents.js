import express from 'express';
import trialRoutes from './agents/trial.js';
import registrationRoutes from './agents/registration.js';
import devicesRoutes from './agents/devices.js';
import monitoringRoutes from './agents/monitoring.js';
import commandsRoutes from './agents/commands.js';
import inventoryRoutes from './agents/inventory.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// TRIAL AGENT ENDPOINTS (No Authentication Required)
// Lives in ./agents/trial.js; mounted first to preserve route precedence.
// ═══════════════════════════════════════════════════════════════════════════
router.use(trialRoutes);


// ═══════════════════════════════════════════════════════════════════════════
// REGULAR AGENT ENDPOINTS (Require Authentication)
// ═══════════════════════════════════════════════════════════════════════════


// Agent registration/lifecycle endpoints live in ./agents/registration.js;
// mounted here to preserve the original route registration order.
router.use(registrationRoutes);

// Agent inventory endpoints live in ./agents/inventory.js; mounted here
// to preserve the original route registration order.
router.use(inventoryRoutes);

// Agent remote-command endpoints live in ./agents/commands.js; mounted here
// to preserve the original route registration order.
router.use(commandsRoutes);

// Device management endpoints live in ./agents/devices.js; mounted here
// to preserve the original route registration order.
router.use(devicesRoutes);

// Health-check / trend / aggregation endpoints live in
// ./agents/monitoring.js; mounted here to preserve the original route
// registration order.
router.use(monitoringRoutes);


export default router;
