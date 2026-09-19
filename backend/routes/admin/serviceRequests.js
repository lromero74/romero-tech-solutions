import express from 'express';

import notesRoutes from './notes.js';
import queriesRoutes from './serviceRequests/queries.js';
import lifecycleRoutes, { detailsRoutes, rescheduleRoutes } from './serviceRequests/lifecycle.js';
import attachmentsRoutes from './serviceRequests/attachments.js';
import presetsRoutes from './serviceRequests/presets.js';
import uploadsRoutes from './serviceRequests/uploads.js';

const router = express.Router();


// Service-request read endpoints live in ./serviceRequests/queries.js;
// mounted here to preserve the original route registration order.
router.use(queriesRoutes);

// Note endpoints live in ./notes.js; mounted here to preserve the
// original route registration order.
router.use(notesRoutes);

// Lifecycle endpoints live in ./serviceRequests/lifecycle.js; mounted
// here to preserve the original route registration order.
router.use(lifecycleRoutes);

// Attachment endpoints live in ./serviceRequests/attachments.js; mounted
// here to preserve the original route registration order.
router.use(attachmentsRoutes);

// Details patch lives in ./serviceRequests/lifecycle.js; mounted here to
// preserve the original route registration order.
router.use(detailsRoutes);

// Filter-preset endpoints live in ./serviceRequests/presets.js; mounted
// here to preserve the original route registration order.
router.use(presetsRoutes);

// Upload endpoint lives in ./serviceRequests/uploads.js; mounted here to
// preserve the original route registration order.
router.use(uploadsRoutes);

// Reschedule patch lives in ./serviceRequests/lifecycle.js; mounted here
// to preserve the original route registration order.
router.use(rescheduleRoutes);


export default router;