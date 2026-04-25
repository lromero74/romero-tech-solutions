-- 055_rate_tiers_pacific_wallclock.sql
--
-- Rate-tier semantics change: day_of_week / time_start / time_end now
-- represent Pacific wall-clock policy (e.g., "Mon-Fri 09:00-17:00 Pacific")
-- rather than UTC instants. The same wall-clock window applies year-round,
-- across DST boundaries. UTC math happens at lookup time (when an actual
-- service-request instant is being priced), not at storage time.
--
-- Existing rows were stored as UTC under the now-discarded mental model and
-- got there via a fixed PDT offset (see convert_rate_tiers_to_utc.sql),
-- which means they never represented the user's actual policy across DST.
-- Rather than fragile reverse-engineering, we deactivate them and the admin
-- repaints the schedule via the (now-fixed) Weekly Schedule Grid UI.
--
-- Companion code changes:
--   backend/utils/timezoneUtils.js          getBusinessDayAndTime → Pacific
--   backend/routes/client/invoices.js       fix dayOfWeek calc (UTC parse)
--   src/components/admin/AdminServiceHourRates.tsx   drop UTC math
--   src/components/client/ResourceTimeSlotScheduler.tsx   Pacific wall-clock
--
-- Run order: deploy code first, then this migration. After running, an
-- admin must visit Billing & Finance → Service Hour Rates and repaint.

BEGIN;

UPDATE service_hour_rate_tiers
SET is_active = false,
    description = COALESCE(description, '') ||
                  ' [deactivated 2026-04-25 for Pacific-wallclock migration]',
    updated_at = NOW()
WHERE is_active = true;

COMMIT;
