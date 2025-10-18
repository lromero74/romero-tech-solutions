# Trial Management UI - Testing Guide

**Status**: ✅ Ready for Testing
**Date**: 2025-10-18
**Components**: Frontend Admin Dashboard

---

## Test Environment Status

### Services Running
- ✅ Frontend: http://localhost:5173
- ✅ Backend: http://localhost:3001
- ✅ Database: romerotechsolutions (AWS RDS)

### Test Data Available
```sql
-- 2 active trial agents found in database:
-- 1. Test MacBook Pro (trial-1760804190)
--    - Start: Oct 18, 2025
--    - End: Nov 17, 2025
--    - Days remaining: ~30
--    - Status: Active
--
-- 2. Trial Conversion Test (trial-1760804299)
--    - Start: Oct 18, 2025
--    - End: Nov 17, 2025
--    - Days remaining: ~30
--    - Status: Active
```

---

## Manual Testing Checklist

### 1. Navigation & Access

**Test Steps:**
1. Open http://localhost:5173
2. Log in with employee credentials
3. Navigate to Admin Dashboard
4. Look for "Trial Agents" in the sidebar under "Monitoring & Alerts" section
5. Click on "Trial Agents"

**Expected Results:**
- ✅ "Trial Agents" menu item visible with TestTube icon
- ✅ Menu item appears under "Monitoring & Alerts" section
- ✅ Clicking navigates to trial agents dashboard
- ✅ URL changes to reflect trial-agents view

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 2. Trial Agents Dashboard Load

**Test Steps:**
1. Navigate to Trial Agents view
2. Wait for data to load
3. Observe the page structure

**Expected Results:**
- ✅ Page title shows "Trial Agents Management"
- ✅ Summary statistics section displays 6 cards:
  - Total Trial Agents
  - Active Trials
  - Expiring Soon
  - Expired
  - Converted
  - Conversion Rate
- ✅ Search bar visible
- ✅ Filter dropdown visible (All Status)
- ✅ Sort dropdown visible
- ✅ Table with trial agents loads
- ✅ No errors in browser console

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 3. Summary Statistics Display

**Test Steps:**
1. View the 6 summary cards at the top
2. Verify the numbers match expected data

**Expected Results:**
- ✅ Total Trial Agents: 2
- ✅ Active Trials: 2
- ✅ Expiring Soon: 0 (none within 3 days)
- ✅ Expired: 0
- ✅ Converted: 0
- ✅ Conversion Rate: 0%
- ✅ Each card has appropriate icon
- ✅ Numbers are clearly visible

**Actual Results:**
- Total: _____ (Expected: 2)
- Active: _____ (Expected: 2)
- Expiring Soon: _____ (Expected: 0)
- Expired: _____ (Expected: 0)
- Converted: _____ (Expected: 0)
- Conversion Rate: _____ (Expected: 0%)
- [ ] Pass / [ ] Fail

---

### 4. Trial Agents Table Display

**Test Steps:**
1. Scroll down to the table
2. Verify table columns and data

**Expected Results:**
- ✅ Table shows 7 columns:
  1. Device Name
  2. Trial ID
  3. OS Type
  4. Start Date
  5. End Date
  6. Status (with color badge)
  7. Actions
- ✅ 2 rows displayed (Test MacBook Pro, Trial Conversion Test)
- ✅ Status badges show "Active" in green
- ✅ Progress bars show ~0-10% used
- ✅ "Convert to Paid" button visible for each row
- ✅ "View Details" button visible for each row

**Actual Results:**
- Rows displayed: _____ (Expected: 2)
- [ ] All columns visible
- [ ] Status badges correct color
- [ ] Progress bars display
- [ ] Action buttons visible
- [ ] Pass / [ ] Fail

---

### 5. Search Functionality

**Test Steps:**
1. Type "MacBook" in the search bar
2. Observe filtered results
3. Clear search
4. Type "trial-1760804190" in search bar
5. Observe filtered results

**Expected Results:**
- ✅ Typing "MacBook" shows only "Test MacBook Pro"
- ✅ Search is case-insensitive
- ✅ Typing trial ID shows matching agent
- ✅ Clearing search shows all agents again
- ✅ No lag or errors

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 6. Filter by Status

**Test Steps:**
1. Click on "All Status" dropdown
2. Verify dropdown options
3. Select "Active"
4. Select "Expiring Soon"
5. Select "Expired"
6. Select "Converted"
7. Return to "All Status"

**Expected Results:**
- ✅ Dropdown shows options: All Status, Active, Expiring Soon, Expired, Converted
- ✅ Selecting "Active" shows 2 agents
- ✅ Selecting "Expiring Soon" shows 0 agents (empty state)
- ✅ Selecting "Expired" shows 0 agents (empty state)
- ✅ Selecting "Converted" shows 0 agents (empty state)
- ✅ Empty state message displays appropriately

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 7. Sort Functionality

**Test Steps:**
1. Click on "Sort by" dropdown
2. Verify sort options
3. Select "Days Remaining (Low to High)"
4. Select "Days Remaining (High to Low)"
5. Select "Start Date (Newest First)"
6. Select "Start Date (Oldest First)"

**Expected Results:**
- ✅ Dropdown shows all sort options
- ✅ Table re-sorts when option selected
- ✅ Sort order changes appropriately
- ✅ No errors during sorting

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 8. Status Badge Colors

**Test Steps:**
1. Observe status badges for active trials
2. Note the color coding

**Expected Results:**
- ✅ Active trials: Green badge with "30d left" (or similar)
- ✅ Badge text is readable
- ✅ Badge background color appropriate for theme (light/dark)

**Actual Results:**
- [ ] Pass / [ ] Fail
- Badge color: _____________________________

---

### 9. Progress Bar Display

**Test Steps:**
1. Observe progress bars in the table
2. Verify they reflect time elapsed

**Expected Results:**
- ✅ Progress bars visible for each trial
- ✅ Progress shows small percentage (trials just started)
- ✅ Progress bar color matches status (green for active)
- ✅ Percentage text visible

**Actual Results:**
- [ ] Pass / [ ] Fail
- Progress shown: _____ %

---

### 10. Convert to Paid Button

**Test Steps:**
1. Click "Convert to Paid" button on first trial agent
2. Observe modal behavior

**Expected Results:**
- ✅ Modal opens with title "Convert Trial Agent to Paid"
- ✅ Trial agent info displayed in modal
- ✅ Business selection dropdown loads
- ✅ "Preserve trial metrics and history" checkbox visible
- ✅ Cancel and "Convert to Paid" buttons visible

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 11. Trial Conversion Modal - Business Selection

**Test Steps:**
1. Open conversion modal
2. Click on business dropdown
3. Verify business list loads
4. Select a business
5. Toggle "Preserve trial metrics" checkbox

**Expected Results:**
- ✅ Dropdown shows loading spinner while fetching
- ✅ Businesses populate after loading
- ✅ Only active businesses shown
- ✅ Selected business shows in dropdown
- ✅ Checkbox toggles on/off
- ✅ "Convert to Paid" button disabled until business selected
- ✅ "Convert to Paid" button enabled after business selected

**Actual Results:**
- [ ] Pass / [ ] Fail
- Businesses loaded: _____ (count)

---

### 12. Trial Conversion - Success Flow

**Test Steps:**
1. Open conversion modal for "Test MacBook Pro"
2. Select a business from dropdown
3. Keep "Preserve trial metrics" checked
4. Click "Convert to Paid" button
5. Wait for conversion to complete

**Expected Results:**
- ✅ Modal shows "Converting trial agent..." loading state
- ✅ Loading spinner displays
- ✅ After 1-3 seconds, success screen appears
- ✅ Green checkmark icon displays
- ✅ "Conversion Successful!" message shows
- ✅ New agent ID displays (truncated)
- ✅ Device name, status shown
- ✅ "Done" button visible
- ✅ No errors in console

**Actual Results:**
- [ ] Pass / [ ] Fail
- New Agent ID: _____________________________
- Notes: _____________________________

---

### 13. Post-Conversion Navigation

**Test Steps:**
1. After successful conversion, click "Done"
2. Observe navigation behavior

**Expected Results:**
- ✅ Modal closes
- ✅ User navigates to new agent details page
- ✅ Agent details page shows the newly converted agent
- ✅ Agent details page shows correct agent ID

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 14. Trial Agents List After Conversion

**Test Steps:**
1. Navigate back to Trial Agents dashboard
2. Observe the list

**Expected Results:**
- ✅ Total Trial Agents still shows 2
- ✅ Active Trials shows 1 (one was converted)
- ✅ Converted shows 1
- ✅ Conversion Rate shows 50% (1 of 2 converted)
- ✅ Converted trial shows blue "Converted" badge
- ✅ Convert button disabled or hidden for converted trial

**Actual Results:**
- Total: _____ (Expected: 2)
- Active: _____ (Expected: 1)
- Converted: _____ (Expected: 1)
- Conversion Rate: _____ (Expected: 50%)
- [ ] Pass / [ ] Fail

---

### 15. View Details Button

**Test Steps:**
1. Click "View Details" button for a trial agent
2. Observe navigation

**Expected Results:**
- ✅ User navigates to agent details page
- ✅ Agent details page loads correctly
- ✅ Trial-specific information visible (if implemented)

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 16. Error Handling - Conversion Failure

**Test Steps:**
1. Stop the backend server: `pkill -f "node.*backend"`
2. Attempt to convert a trial agent
3. Restart backend: `cd backend && npm start`

**Expected Results:**
- ✅ Error screen displays with red X icon
- ✅ "Conversion Failed" message shows
- ✅ Error message explains what went wrong
- ✅ "Try Again" button visible
- ✅ "Close" button visible
- ✅ Clicking "Try Again" returns to business selection
- ✅ No unhandled promise rejections in console

**Actual Results:**
- [ ] Pass / [ ] Fail
- Error message shown: _____________________________

---

### 17. Theme Support (Dark/Light Mode)

**Test Steps:**
1. Toggle theme (if theme switcher available)
2. Observe trial agents dashboard in both themes

**Expected Results:**
- ✅ Dashboard renders correctly in light mode
- ✅ Dashboard renders correctly in dark mode
- ✅ Text is readable in both themes
- ✅ Status badge colors work in both themes
- ✅ Modal renders correctly in both themes

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 18. Responsive Design (Mobile/Desktop)

**Test Steps:**
1. Open browser dev tools
2. Test dashboard at different viewport sizes:
   - Desktop (1920x1080)
   - Tablet (768x1024)
   - Mobile (375x667)

**Expected Results:**
- ✅ Summary cards stack appropriately on mobile
- ✅ Table scrolls horizontally on mobile if needed
- ✅ Modal fits within viewport on all sizes
- ✅ Buttons remain accessible on mobile
- ✅ Text remains readable on all sizes

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 19. Permission-Based Access

**Test Steps:**
1. Log in with different employee roles (if available):
   - Admin
   - Technician
   - Viewer
2. Navigate to Trial Agents

**Expected Results:**
- ✅ Admin can access Trial Agents
- ✅ Roles with `view.agents.enable` permission can access
- ✅ Roles without permission see appropriate message or menu item hidden

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 20. Browser Compatibility

**Test Steps:**
1. Test in different browsers:
   - Chrome
   - Firefox
   - Safari
   - Edge

**Expected Results:**
- ✅ Dashboard works in all major browsers
- ✅ Modal works in all major browsers
- ✅ No visual glitches
- ✅ No console errors specific to browser

**Actual Results:**
- Chrome: [ ] Pass / [ ] Fail
- Firefox: [ ] Pass / [ ] Fail
- Safari: [ ] Pass / [ ] Fail
- Edge: [ ] Pass / [ ] Fail

---

## Database Verification Tests

### 21. Verify Trial Conversion in Database

**Test Steps:**
1. After converting a trial, run:
   ```bash
   ./scripts/table --sql "SELECT id, device_name, is_trial, trial_original_id, trial_converted_at, trial_converted_to_agent_id FROM agent_devices WHERE trial_original_id = 'trial-1760804190';"
   ```

**Expected Results:**
- ✅ `is_trial` still true (preserved for history)
- ✅ `trial_converted_at` has timestamp
- ✅ `trial_converted_to_agent_id` has new agent UUID

**Actual Results:**
- [ ] Pass / [ ] Fail
- SQL output: _____________________________

---

### 22. Verify New Registered Agent Created

**Test Steps:**
1. After conversion, run:
   ```bash
   ./scripts/table --sql "SELECT id, device_name, business_id, is_trial FROM agent_devices WHERE id = '<new_agent_id>';"
   ```

**Expected Results:**
- ✅ New agent exists
- ✅ `is_trial` is false
- ✅ `business_id` matches selected business
- ✅ `device_name` matches original trial

**Actual Results:**
- [ ] Pass / [ ] Fail
- SQL output: _____________________________

---

### 23. Verify Trial Metrics Preserved (if preserve_data = true)

**Test Steps:**
1. Before conversion, insert test metrics:
   ```bash
   ./scripts/table --sql "INSERT INTO agent_metrics (agent_id, cpu_usage, memory_usage, disk_usage, timestamp) VALUES ('314315c5-3f2c-5b2d-9ba5-7dc82202237b', 50.0, 60.0, 70.0, NOW());"
   ```
2. Convert trial with "Preserve trial metrics" checked
3. Verify metrics migrated:
   ```bash
   ./scripts/table --sql "SELECT agent_id, cpu_usage, memory_usage, disk_usage FROM agent_metrics WHERE agent_id = '<new_agent_id>' ORDER BY timestamp DESC LIMIT 1;"
   ```

**Expected Results:**
- ✅ Metrics exist for new agent
- ✅ Values match original trial metrics

**Actual Results:**
- [ ] Pass / [ ] Fail
- SQL output: _____________________________

---

## Performance Tests

### 24. Load Time with Many Trial Agents

**Test Steps:**
1. Insert 50+ trial agents in database (optional)
2. Navigate to Trial Agents dashboard
3. Measure load time

**Expected Results:**
- ✅ Dashboard loads in < 2 seconds
- ✅ No performance warnings in console
- ✅ Pagination or virtualization works (if implemented)

**Actual Results:**
- Load time: _____ ms
- [ ] Pass / [ ] Fail

---

### 25. Search Performance

**Test Steps:**
1. Type rapidly in search box
2. Observe filtering behavior

**Expected Results:**
- ✅ Search filters update smoothly (debounced)
- ✅ No lag or stuttering
- ✅ Results update within 300ms

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

## Security Tests

### 26. Permission Enforcement

**Test Steps:**
1. Attempt to access `/api/agents/trials` without authentication
2. Verify response

**Expected Results:**
- ✅ Returns 401 Unauthorized or similar
- ✅ Frontend handles gracefully

**Actual Results:**
- [ ] Pass / [ ] Fail
- Response: _____________________________

---

### 27. Input Validation

**Test Steps:**
1. Attempt to convert trial with invalid trial_id
2. Attempt to convert without selecting business
3. Verify error handling

**Expected Results:**
- ✅ Frontend validates business selection
- ✅ Backend validates trial_id format
- ✅ Error messages are user-friendly

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

## Accessibility Tests

### 28. Keyboard Navigation

**Test Steps:**
1. Navigate through dashboard using only Tab key
2. Attempt to open modal using keyboard
3. Navigate within modal using keyboard

**Expected Results:**
- ✅ All interactive elements focusable
- ✅ Focus visible (outline/highlight)
- ✅ Tab order logical
- ✅ Can close modal with Escape key

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

### 29. Screen Reader Support

**Test Steps:**
1. Enable VoiceOver (macOS) or NVDA (Windows)
2. Navigate through dashboard
3. Verify announcements make sense

**Expected Results:**
- ✅ Status badges announced with color context
- ✅ Progress bars announced with percentage
- ✅ Modal title announced when opened
- ✅ Form labels properly associated

**Actual Results:**
- [ ] Pass / [ ] Fail
- Notes: _____________________________

---

## Final Checklist

- [ ] All 29 tests completed
- [ ] Critical bugs documented: _____________________________
- [ ] Minor issues documented: _____________________________
- [ ] Performance acceptable
- [ ] Security validated
- [ ] Accessibility verified
- [ ] Ready for production: [ ] Yes / [ ] No

---

## Test Results Summary

**Tester**: _____________________________
**Date**: _____________________________
**Environment**: _____________________________
**Browser**: _____________________________
**Overall Status**: [ ] Pass / [ ] Fail

**Critical Issues**:
1. _____________________________
2. _____________________________

**Minor Issues**:
1. _____________________________
2. _____________________________

**Recommendations**:
1. _____________________________
2. _____________________________

---

## Quick Test URLs

- Frontend: http://localhost:5173
- Admin Login: http://localhost:5173/employee
- Trial Agents Dashboard: http://localhost:5173 (Navigate via sidebar)
- Backend API: http://localhost:3001/api

## Quick Database Queries

```bash
# List all trial agents
./scripts/table --sql "SELECT id, device_name, trial_original_id, trial_start_date, trial_end_date, trial_converted_at FROM agent_devices WHERE is_trial = true;"

# Count trial agents by status
./scripts/table --sql "SELECT
  COUNT(*) FILTER (WHERE trial_converted_at IS NULL) as active,
  COUNT(*) FILTER (WHERE trial_converted_at IS NOT NULL) as converted,
  COUNT(*) as total
FROM agent_devices WHERE is_trial = true;"

# View conversion rate
./scripts/table --sql "SELECT
  COUNT(*) FILTER (WHERE trial_converted_at IS NOT NULL)::float / NULLIF(COUNT(*), 0) * 100 as conversion_rate_percent
FROM agent_devices WHERE is_trial = true;"
```

---

**End of Testing Guide**
