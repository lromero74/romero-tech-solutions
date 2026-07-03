-- Migration: ZenithGrid software licensing
-- Created: 2026-07-03
-- Description: First slice of Phase 3 of ZenithGrid's executable-licensing
-- PRP (zenith-grid repo, docs/PRPs/executable-licensing.md). RTS is the
-- integrated license server -- no separate licensing service.
--
-- Hybrid billing model: a license is either 'stripe' (self-serve
-- subscription, stripe_subscription_id set) or 'manual' (comp/reseller/
-- enterprise, issued by an admin). One device per license -- re-activating
-- on a new machine deactivates the previous activation, enforced here via
-- a partial unique index rather than only in application code.
--
-- Run with: psql -f 20260703_zenithgrid_licensing.sql

CREATE TABLE IF NOT EXISTS zenithgrid_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  license_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'manual')),
  stripe_subscription_id TEXT,
  plan_name TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenithgrid_licenses_user_id ON zenithgrid_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_zenithgrid_licenses_stripe_subscription_id
  ON zenithgrid_licenses(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS zenithgrid_license_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES zenithgrid_licenses(id),
  hardware_fingerprint TEXT NOT NULL,
  device_name TEXT,
  os_type TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zenithgrid_license_activations_license_id
  ON zenithgrid_license_activations(license_id);

-- At most one active (deactivated_at IS NULL) activation per license --
-- enforces "one device per license" at the DB level, not just in
-- application code.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_activation_per_license
  ON zenithgrid_license_activations(license_id)
  WHERE deactivated_at IS NULL;
