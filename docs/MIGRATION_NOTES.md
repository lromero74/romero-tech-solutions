# Database Migration Notes for Phase 1

**Date:** 2025-10-17

## Schema Corrections Made

### Alert-to-Ticket Integration (042)

**Issue:** Original migration assumed service_requests had simpler column names
- Assumed: `service_type_id`, `priority`, `assigned_to`, `status`
- Actual: Complex schema with `status_id`, `priority_level_id`, `assigned_technician_id`

**Fix Applied:**
- Simplified INSERT to only use `description`, `assigned_technician_id`, `source_alert_id`
- Left status and priority handling to application layer
- Used existing `service_request_created` column in `agent_alert_history`

### Column Name Corrections

| Table | Assumed Column | Actual Column |
|-------|---------------|---------------|
| service_requests | priority | priority_level_id |
| service_requests | status | status_id |
| service_requests | assigned_to | assigned_technician_id |
| service_requests | service_type_id | (needs lookup) |
| service_requests | issue_description | description |
| agent_alert_history | service_request_id | service_request_created |

## Migration Execution Order

Run in this exact order:

```bash
cd /Users/louis/New/01_Projects/RomeroTechSolutions

# 1. Asset Management (creates all asset tables)
./scripts/table --sql "$(cat backend/migrations/041_asset_management_system.sql)"

# 2. Alert-Ticket Integration (extends existing tables)
./scripts/table --sql "$(cat backend/migrations/042_alert_ticket_integration.sql)"

# 3. Policy Automation (creates policy and script tables)
./scripts/table --sql "$(cat backend/migrations/043_policy_based_automation.sql)"

# 4. Software Deployment (creates deployment tables)
./scripts/table --sql "$(cat backend/migrations/044_software_deployment.sql)"
```

## Post-Migration Verification

```sql
-- Verify asset tables
SELECT COUNT(*) as asset_hw FROM asset_hardware_inventory;
SELECT COUNT(*) as asset_sw FROM asset_software_inventory;
SELECT COUNT(*) as licenses FROM asset_licenses;

-- Verify policy tables
SELECT COUNT(*) as scripts FROM automation_scripts;
SELECT COUNT(*) as policies FROM automation_policies;
SELECT COUNT(*) as categories FROM script_categories;

-- Verify deployment tables
SELECT COUNT(*) as packages FROM software_packages;
SELECT COUNT(*) as deployments FROM package_deployments;

-- Verify alert-ticket tables
SELECT COUNT(*) as rules FROM alert_ticket_rules;

-- Check added columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'service_requests' AND column_name = 'source_alert_id';
```

## Known Issues

1. **service_requests complexity** - The table has a complex status/priority system
   - Solution: Application layer should handle lookups for status_id, priority_level_id
   - Migration simplified to use minimal required columns

2. **Trigger function compatibility** - Auto-create ticket trigger may need refinement
   - Current: Creates basic service request with description only
   - Future: Add status/priority ID lookups in trigger

## Rollback Procedure

If migrations need to be rolled back:

```sql
-- Run in reverse order
\i backend/migrations/rollback/044_software_deployment_rollback.sql
\i backend/migrations/rollback/043_policy_automation_rollback.sql
\i backend/migrations/rollback/042_alert_ticket_rollback.sql
\i backend/migrations/rollback/041_asset_management_rollback.sql
```

Or manual rollback (see HANDOFF_PHASE1.md)
