# Plan: Remove Redundant JSONB roles Column

## Current State Analysis ✅
- **✅ employee_roles table**: Properly normalized junction table with role_id references
- **❌ employees.roles column**: Redundant JSONB column that duplicates the same data
- **❌ Dual maintenance**: Code updates both places when roles change (admin.js:62)
- **❌ Potential inconsistency**: Two sources of truth for the same data

## Issues Found:
1. `updateEmployeeRoles()` function updates junction table (admin.js:57)
2. Then JSONB column is also updated (admin.js:62)
3. Dashboard queries use JSONB column for role counts (admin.js:108)
4. Employee listings may use JSONB for filtering/display

## Migration Plan:

### Phase 1: Update Backend to Use Normalized Table
- [ ] Update employee listings to JOIN with employee_roles instead of reading JSONB
- [ ] Update dashboard role counts to use employee_roles table
- [ ] Update filtering/search to use employee_roles table
- [ ] Remove dual maintenance code (admin.js:62)
- [ ] Test all role-related functionality

### Phase 2: Update Frontend (if needed)
- [ ] Ensure frontend expects roles as array from JOIN, not JSONB
- [ ] Update any role filtering/display logic
- [ ] Test all employee role displays

### Phase 3: Database Migration
- [ ] Create migration script to drop employees.roles column
- [ ] Update any remaining queries that reference the column
- [ ] Clean up old migration scripts that reference the column

## Benefits:
- ✅ Single source of truth for roles
- ✅ No data duplication
- ✅ No risk of inconsistency
- ✅ Proper normalized database design
- ✅ Easier to maintain role assignments
- ✅ Better referential integrity

## Current Usage to Replace:
1. **admin.js:108**: Dashboard role counts query
2. **admin.js:515**: JSONB roles update in employee updates
3. **admin.js:62**: Redundant JSONB update in updateEmployeeRoles
4. **Any frontend expecting roles as JSONB array**