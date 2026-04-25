-- 056_rate_tiers_unique_active.sql
--
-- The Weekly Schedule Grid UI lets the admin paint a cell and round-trip
-- to /api/admin/service-hour-rates POST. If two clicks happen faster than
-- the React state can update, both POSTs get through with no row to
-- match against and we end up with two identical active rows for the
-- same cell. (Observed during the 2026-04-25 repaint: 8 such duplicate
-- pairs out of 168 cells.)
--
-- Companion change: backend/routes/admin/serviceHourRates.js POST handler
-- now uses INSERT ... ON CONFLICT DO UPDATE against this index, so a
-- second click while the first is in flight upserts instead of inserts.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_hour_rate_tiers_active_cell
  ON service_hour_rate_tiers (day_of_week, time_start, time_end)
  WHERE is_active = true;

COMMIT;
