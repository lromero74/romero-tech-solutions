// =============================================================================
// stage4FeatureGate — env-var hard gate for the Stage 4 Action Layer
//
// Stage 4 routes (patch deployment, software install, script execution, WoL,
// remote config viewer) carry high blast radius — an authenticated admin
// with the right RBAC perm can still cause material harm if the underlying
// code has a regression. Until we're confident in the action layer, every
// Stage 4 route is gated behind STAGE_4_ENABLED=true.
//
// This is intentionally separate from RBAC: RBAC says "who can do this",
// the gate says "is this whole feature class turned on at all".
//
// Usage:
//   import { stage4FeatureGate } from '../middleware/stage4FeatureGate.js';
//   router.post('/api/patch-approvals/:id/approve',
//     stage4FeatureGate,
//     authMiddleware,
//     requirePermission('manage.patch_approvals.enable'),
//     async (req, res) => { ... }
//   );
// =============================================================================

const TRUTHY = new Set(['true', '1', 'yes']);

/**
 * Pure helper — reads STAGE_4_ENABLED at call time and normalizes.
 * Truthy: 'true', '1', 'yes' (case-insensitive). Everything else: false.
 */
export function isStage4Enabled() {
  const raw = process.env.STAGE_4_ENABLED;
  if (typeof raw !== 'string') return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Express middleware. Short-circuits with 503 if Stage 4 is disabled.
 */
export function stage4FeatureGate(req, res, next) {
  if (!isStage4Enabled()) {
    return res.status(503).json({
      success: false,
      code: 'STAGE_4_DISABLED',
      message: 'Action Layer (Stage 4) is currently disabled. Set STAGE_4_ENABLED=true in the backend environment to enable.'
    });
  }
  return next();
}
