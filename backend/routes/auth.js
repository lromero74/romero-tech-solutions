import express from 'express';

import passwordRoutes from './auth/password.js';
import mfaRoutes, { mfaVerifyRouter } from './auth/mfa.js';
import sessionRoutes from './auth/session.js';
import magicLinkRoutes from './auth/magicLink.js';

const router = express.Router();

// Session endpoints live in ./auth/session.js; mounted here to preserve
// the original route registration order.
router.use(sessionRoutes);

// MFA verify endpoints live in ./auth/mfa.js; mounted here to preserve
// the original route registration order (before the password routes).
router.use(mfaVerifyRouter);

// Password endpoints live in ./auth/password.js; mounted here to preserve
// the original route registration order.
router.use(passwordRoutes);

// Remaining MFA endpoints live in ./auth/mfa.js; mounted here to preserve
// the original route registration order (after the password routes).
router.use(mfaRoutes);

// Login endpoints live in ./auth/magicLink.js; mounted here to preserve
// the original route registration order.
router.use(magicLinkRoutes);


export default router;
