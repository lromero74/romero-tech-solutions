# Trial User Architecture Unification - Handoff Document

**Date Started:** 2025-10-19
**Status:** IN PROGRESS
**Goal:** Simplify trial user architecture so trial users work exactly like regular users with an `is_trial` flag

---

## 🎯 PROBLEM STATEMENT

Current architecture has too many special cases for trial users:
- Separate TrialDashboard component
- Complex routing logic with multiple fallbacks (localStorage, sessionStorage)
- Special API handling (mock data for trial users)
- Separate auth flows (TrialLogin vs ClientLogin)
- Race condition workarounds everywhere

**NEW APPROACH:** Trial users = Regular users + `is_trial` flag

---

## 📋 WORK PLAN

### Phase 1: Database Migration ✅
- [x] Run `backend/migrations/unify_trial_user_architecture.sql`
- [x] Verify migration results
- [x] Confirm all trial users have businesses
- [x] Confirm all trial agents have business_id (3 linked, 4 orphaned without email)

**Migration Details:**
- Adds `is_trial BOOLEAN` column to users table
- Adds `trial_expires_at TIMESTAMP` column to users table
- Creates businesses for existing trial users
- Links trial users to businesses
- Links trial agents to businesses

### Phase 2: Backend Updates ✅
- [x] Update auth endpoints to include `is_trial` and `trial_expires_at` in user data
  - Updated /api/auth/login (client SELECT and userData response)
  - Updated /api/auth/verify-client-mfa (SELECT and userData response)
  - Updated /api/auth/agent-magic-login (SELECT and userData response)
- [x] Added `business_id` to all user data responses
- [ ] Update agent endpoints to work with business-linked trial agents
- [ ] Remove any trial-specific endpoint logic (will do in cleanup phase)

### Phase 3: Frontend Auth Updates ✅
- [x] Update AuthUser interface in src/types/database.ts
  - Added `businessId?: string`
  - Added `businessName?: string`
  - Added `trialExpiresAt?: string`
  - Added `agentId?: string` (for magic-link access)
  - Marked `trialAgentId` and `trialId` as deprecated (legacy)
- [x] EnhancedAuthContext automatically uses updated AuthUser interface
- [x] Login flows will now receive `is_trial` flag from backend

### Phase 4: Dashboard Unification ✅
- [x] Simplified App.tsx routing - removed all trial-specific routing logic
  - Removed check for `trialAgentId` (deprecated)
  - Removed routing to TrialDashboard
  - All clients now route to ClientDashboard
- [x] Add trial UI to ClientDashboard (banner, trial expiry info)
  - Added trial banner showing trial status and expiration date
  - Banner displays when `authUser.isTrial` is true
  - Prominent blue gradient banner with call-to-action
- [x] ClientDashboard now handles all client types (trial, regular, magic-link)

### Phase 5: Cleanup ⏳
- [x] TrialDashboard component - DEPRECATED (import commented out in App.tsx)
  - No longer used for routing
  - Can be deleted or kept as reference
- [ ] TrialLogin component - KEEP FOR NOW
  - Still needed for /auth/trial-magic-login endpoint
  - Consider merging with AgentLogin in future
- [x] Simplified App.tsx routing (removed trial-specific logic)
- [ ] Review localStorage/sessionStorage usage for trial-specific code
- [ ] AgentSelector component - needs review (used in TrialDashboard)

### Phase 6: Testing ⏳
- [ ] Test trial user login
- [ ] Test trial user dashboard access
- [ ] Test trial agent visibility
- [ ] Test trial to paid conversion flow
- [ ] Test magic-link agent access

---

## 🔍 FILES TO MODIFY

### Database
- ✅ `backend/migrations/unify_trial_user_architecture.sql` (exists, ready to run)

### Backend
- `backend/routes/auth.js` - Include is_trial in user data
- `backend/routes/agents.js` - Ensure trial agents work with business_id
- `backend/services/authService.js` - Update user queries

### Frontend - Auth
- `src/contexts/EnhancedAuthContext.tsx` - Add is_trial to user interface
- `src/pages/ClientLogin.tsx` - Handle trial users
- `src/pages/AgentLogin.tsx` - Simplify agent magic-link flow

### Frontend - Dashboard
- `src/pages/ClientDashboard.tsx` - Add trial UI elements
- `src/App.tsx` - Simplify routing logic

### Frontend - Cleanup (DELETE)
- `src/pages/TrialDashboard.tsx` - DELETE (use ClientDashboard instead)
- `src/pages/TrialLogin.tsx` - DELETE or merge into ClientLogin
- `src/components/trial/AgentSelector.tsx` - DELETE if not needed

---

## 🚨 MIGRATION EXECUTION LOG

### Run 1: 2025-10-19 (Initial Migration)
```
Status: ✅ SUCCESS
Command: node backend/run-migration.js migrations/unify_trial_user_architecture.sql
Duration: 554ms

Results:
- Trial users found and marked: 1 user (louis_romero@hotmail.com)
- Trial users with businesses: 1
- Trial agents total: 7
- Trial agents with business_id: 3
- Trial agents without business_id (orphaned): 4

Orphaned agents note:
- 4 trial agents lack trial_email and trial_user_id fields
- These appear to be old test agents
- Can be manually linked later if needed

Migration Details:
- Added users.is_trial column (BOOLEAN, default false)
- Added users.trial_expires_at column (TIMESTAMP WITH TIME ZONE)
- Created businesses for trial users with trial_user_id
- Linked trial users to businesses
- Linked trial agents to businesses (where possible)

Issues: None
```

---

## ⚠️ ISSUES ENCOUNTERED

### Issue #1: Agent Heartbeat Endpoint Not Updated for Unified Architecture

**Status:** 🔴 CRITICAL - Needs Fixing

**Problem:**
The agent heartbeat endpoint `/api/agents/trial/heartbeat` in `backend/routes/agents.js` still uses the OLD trial architecture:
- Creates trial agents with `business_id = NULL` (line 371)
- Creates users with `business_id = null` (line 449)
- Uses `trial_users` table instead of unified `users` table

**Impact:**
- New trial agents won't be linked to businesses
- Trial users won't appear in unified `users` table with `is_trial` flag
- Agent will work but won't integrate with our new unified architecture

**What Needs To Be Fixed:**
The `/api/agents/trial/heartbeat` endpoint (lines 240-500 in `backend/routes/agents.js`) needs to:

1. **Create/get a real business** for the trial user (not NULL)
   - Business name: `Trial - {email}` or similar
   - Store business UUID

2. **Create user in `users` table** (not `trial_users`) with:
   - `is_trial = true`
   - `trial_expires_at = NOW() + 30 days`
   - `business_id = <real business UUID>`
   - `email_verified = true`

3. **Link agent to business**:
   - Set `business_id = <real business UUID>` (not NULL)

4. **Update `getOrCreateTrialUser` utility** in `backend/utils/trialEmailVerificationUtils.js`:
   - Should create/update users in `users` table with `is_trial` flag
   - Should create associated business
   - Remove dependency on `trial_users` table

**Agent Code:**
- ✅ Agent code in `/Users/louis/New/01_Projects/rts-monitoring-agent` is FINE - no changes needed
- Agent just sends `trial_email` to backend
- Backend needs to handle the unified architecture

**Priority:** HIGH - Should be fixed before next trial agent registration

**UPDATE: ✅ FIXED!**
- Updated `getOrCreateTrialUser()` in `backend/utils/trialEmailVerificationUtils.js`
  - Now creates users in `users` table with `is_trial = true`
  - Creates real businesses for trial users
  - Returns `{ userId, businessId, isVerified }`
- Updated `/api/agents/trial/heartbeat` in `backend/routes/agents.js`
  - Agents now linked to real businesses (not NULL)
  - Uses unified user records from `users` table
  - Removed old trial user creation logic with NULL business_id

**Files Modified:**
- `backend/utils/trialEmailVerificationUtils.js` - getOrCreateTrialUser() function
- `backend/routes/agents.js` - /api/agents/trial/heartbeat endpoint

---

### Issue #2: Trial Device Limit Enforcement

**Status:** ✅ COMPLETE

**Requirement:**
Trial users should be limited to 2 devices running agents. If they want to add a third device, they should be given a magic link to remove existing device(s).

**What's Been Done:**
✅ Backend enforcement in `/api/agents/trial/heartbeat`:
  - Checks agent count before accepting new trial agent
  - Returns `TRIAL_DEVICE_LIMIT_REACHED` error if limit exceeded
  - Provides management URL in error response

✅ Agent handling in `rts-monitoring-agent`:
  - Detects device limit error gracefully
  - Displays helpful message with management URL
  - Returns URL for potential browser opening

✅ Backend DELETE endpoint (`DELETE /api/agents/:agent_id`):
  - Allow users to deactivate their own agents
  - Proper RBAC checks (trial_user_id or business_id ownership)
  - Sets is_active = false (soft delete)
  - Employees can deactivate any agent; clients can only deactivate their own

✅ Trial Devices UI (`TrialDevicesManager` component):
  - Shows list of user's agents with status
  - Displays device limit (X/2 devices)
  - Allow removal/deactivation with confirmation dialog
  - Shows trial expiration date
  - Only visible in "My Devices" tab for trial users
  - Responsive design (mobile + desktop)

**How It Works:**
1. Trial user tries to install agent on 3rd device
2. Agent sends heartbeat → backend rejects with `TRIAL_DEVICE_LIMIT_REACHED`
3. Agent displays error with magic-link
4. User clicks link → logs into dashboard
5. Navigates to "My Devices" tab
6. Clicks remove button on unwanted device
7. Confirms removal → device deactivated
8. Can now install agent on new device

**Files Modified:**
- `backend/routes/agents.js` - Device limit check + DELETE endpoint
- `rts-monitoring-agent/internal/trial/trial.go` - Error handling
- `src/pages/ClientDashboard.tsx` - Added "My Devices" tab for trial users
- `src/components/client/TrialDevicesManager.tsx` - NEW component for device management

---

### Issue #3: Multi-Device Trial Registration

**Status:** ✅ COMPLETE

**Problem:**
When a trial user tried to install the agent on a second device using the same email address, the system rejected them saying "email already in use". This was confusing because trial users are allowed up to 2 devices.

**Solution:**
Updated the email verification flow to distinguish between:
1. **Trial users** (is_trial = true) → Allow adding additional devices
2. **Paid users** (is_trial = false) → Reject (they should use normal registration)
3. **New users** → Create new trial account

**What Was Changed:**

✅ Backend (`checkEmailNotRegistered` function):
- Now checks `is_trial` flag
- Trial users can reuse their email to add devices
- Paid users are still blocked from trial registration
- Clear messaging: "You are adding another device to your existing trial account"

✅ Backend (`/trial/send-verification` endpoint):
- Returns `isExistingTrialUser` flag in response
- Provides appropriate messaging for each case

✅ Agent (`EnableTrialMode` function):
- Displays special message when user is adding another device
- Shows: "Adding Another Device - You are adding this device to your existing trial account"
- User experience is clear and seamless

**How It Works Now:**

```
User on Device #1:
1. Enters email: user@example.com
2. Gets verification code
3. Verifies → Creates trial account
4. Agent registers with backend

User on Device #2 (same email):
1. Enters same email: user@example.com
2. System recognizes existing trial account
3. Shows: "Adding another device to existing trial account"
4. Gets verification code
5. Verifies → Links to existing trial account
6. Both devices now under same trial account!

User tries Device #3:
1. Agent sends heartbeat
2. Backend: "Device limit reached (2/2)"
3. Shows magic-link to manage devices
4. User removes one device → can add new one
```

**Files Modified:**
- `backend/utils/trialEmailVerificationUtils.js` - checkEmailNotRegistered updated
- `backend/routes/agents.js` - /trial/send-verification updated
- `rts-monitoring-agent/internal/trial/trial.go` - Multi-device messaging

---

### Issue #4: Verification Code Validation and Old Architecture Conflict

**Status:** ✅ FIXED

**Problem:**
Users were getting verification failures when trying to add additional trial devices. Two issues discovered:

1. **Verification Code Validation** - Codes were rejected even when correct (e.g., 224327)
2. **Old Architecture Conflict** - After code validation passed, endpoint failed with "Email already registered as full account"

**Root Causes:**

**Issue 4a - Code Validation:**
The backend validation function (`validateTrialEmailVerificationCode`) was using strict equality comparison (`!==`) without defensive trimming or type normalization.

**Issue 4b - Old Architecture:**
The `/api/agents/trial/verify-email` endpoint was still calling the OLD `confirmTrialEmailAndCreateUser` function which tried to create records in the deprecated `trial_users` table. This conflicted with the unified architecture where trial users exist in the main `users` table with `is_trial = true`.

**Error Message Seen:**
```
❌ Error confirming trial email and creating user: error: Email address louis_romero@hotmail.com is already registered as a full account.
    at check_trial_email_not_registered() line 7 at RAISE
```

**Solutions:**

**Fix 4a - Defensive Code Validation:**
Updated `backend/utils/trialEmailVerificationUtils.js`:
```javascript
// Before:
if (record.verification_code !== verificationCode) {
  return { valid: false, message: 'Invalid verification code' };
}

// After:
const storedCode = String(record.verification_code).trim();
const providedCode = String(verificationCode).trim();

console.log(`🔍 Comparing verification codes for ${email}:`);
console.log(`   Stored:   "${storedCode}" (length: ${storedCode.length})`);
console.log(`   Provided: "${providedCode}" (length: ${providedCode.length})`);

if (storedCode !== providedCode) {
  console.log(`❌ Code mismatch!`);
  return { valid: false, message: 'Invalid verification code' };
}
```

**Fix 4b - Unified Architecture Endpoint:**
Updated `/api/agents/trial/verify-email` in `backend/routes/agents.js`:
```javascript
// Before (OLD - tried to create trial_users records):
const { trialUserId } = await confirmTrialEmailAndCreateUser(email, {...});

// After (NEW - uses unified users table):
const { userId, businessId } = await getOrCreateTrialUser(email);

// Mark verification code as used
await query(`UPDATE trial_email_verifications SET used = TRUE WHERE email = $1`, [email]);

// Mark user's email as verified in main users table
await query(`UPDATE users SET email_verified = TRUE WHERE id = $1`, [userId]);

// Return both user_id and business_id
res.json({
  success: true,
  data: {
    trial_user_id: userId,  // Backward compat field name
    user_id: userId,
    business_id: businessId,
    verified: true
  }
});
```

**Files Modified:**
- `backend/utils/trialEmailVerificationUtils.js` - validateTrialEmailVerificationCode function
- `backend/routes/agents.js` - /api/agents/trial/verify-email endpoint (lines 119-187)

---

### Issue #5: Trial Magic-Link Missing businessId

**Status:** ✅ FIXED

**Problem:**
Trial users logging in via magic-link from their agent dashboard received "Permission Denied" error:
```
Permission Denied
This agent does not belong to your business

Action Attempted: View Agent Details
Required Permission: view agents
```

**Root Cause:**
The `/api/auth/trial-magic-login` endpoint was still querying the deprecated `trial_users` table and NOT including `businessId` in the userData response. The frontend permission check in `AgentDetails.tsx` compares:
```javascript
const canAccess = canViewAgents || (isClient && agentResponse.data.business_id === userBusinessId);
```

Since `userBusinessId` was undefined (no businessId in authUser), the check failed even though the user and agent had matching business_ids in the database.

**Database Evidence:**
```
User:  { id: be4707de-..., business_id: 44849565-... }
Agent: { id: f71fb666-..., business_id: 44849565-... } // SAME!
```

Backend logs showed successful authentication but frontend couldn't verify ownership.

**Solution:**
Updated `/api/auth/trial-magic-login` endpoint to use unified architecture:

**Before (OLD - queried trial_users):**
```javascript
const agentResult = await query(`
  SELECT ad.id as agent_id, ad.trial_access_code, ad.trial_user_id,
         tu.id as user_id, tu.email, tu.contact_name, tu.email_verified
  FROM agent_devices ad
  INNER JOIN trial_users tu ON tu.id = ad.trial_user_id
  WHERE ad.id = $1 AND ad.is_trial = true
`, [trialUUID]);

const userData = {
  businessName: null,  // ❌ Missing businessId!
  isTrial: true,
  // ...
};
```

**After (NEW - queries unified users):**
```javascript
const agentResult = await query(`
  SELECT ad.id as agent_id, ad.trial_access_code, ad.business_id,
         u.id as user_id, u.email, u.first_name, u.last_name,
         u.email_verified, u.is_trial, u.trial_expires_at,
         b.business_name
  FROM agent_devices ad
  LEFT JOIN users u ON u.business_id = ad.business_id AND u.is_trial = true
  LEFT JOIN businesses b ON ad.business_id = b.id
  WHERE ad.id = $1 AND ad.is_trial = true AND ad.is_active = true
`, [trialUUID]);

const userData = {
  businessId: user.business_id,      // ✅ Now included!
  businessName: user.business_name,  // ✅ Now included!
  isTrial: user.is_trial || true,
  trialExpiresAt: user.trial_expires_at,
  agentId: agent.agent_id,
  // ...
};
```

**Testing:**
After deployment, trial magic-link login now includes businessId, allowing frontend permission checks to pass.

**Files Modified:**
- `backend/routes/auth.js` - /api/auth/trial-magic-login endpoint (lines 2428-2533)

**Version:** v1.101.28

---

## ✅ TESTING CHECKLIST

- [ ] Trial user can log in via ClientLogin
- [ ] Trial user sees trial banner in dashboard
- [ ] Trial user can see their agent
- [ ] Trial user agent displays metrics correctly
- [ ] Magic-link access works for trial agents
- [ ] Trial expiry date displays correctly
- [ ] Trial to paid conversion works
- [ ] No console errors
- [ ] No broken routes

---

## 📝 NOTES

- Keep this file updated as work progresses
- Log any issues encountered
- Document any deviations from the plan
- Update status emojis: ⏳ (in progress), ✅ (done), ❌ (blocked)

---

## 🔄 ROLLBACK PLAN

If something breaks:
1. The migration can be rolled back (it's wrapped in BEGIN/COMMIT)
2. Git revert any frontend changes
3. Restart services: `./restart-services.sh`
4. Check this handoff file for what was changed

**Migration Rollback SQL:**
```sql
BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS is_trial;
ALTER TABLE users DROP COLUMN IF EXISTS trial_expires_at;
-- Note: Businesses and links created by migration would need manual cleanup
COMMIT;
```

---

## 🎉 ACCOMPLISHMENTS SUMMARY

### What Changed:
**BEFORE:** Trial users had special routing, separate dashboard, mock API data, complex localStorage hacks

**AFTER:** Trial users are just regular users with `is_trial = true` flag

### Key Improvements:
1. **Database Schema** - Added `is_trial` and `trial_expires_at` to users table
2. **Business Association** - All trial users now have businesses (like regular users)
3. **Unified Auth** - Backend returns trial flags in all login endpoints
4. **Simplified Routing** - Removed 50+ lines of complex trial routing logic
5. **Single Dashboard** - ClientDashboard handles trial, regular, and magic-link users
6. **Trial UI** - Beautiful banner shows trial status and expiration
7. **Type Safety** - Updated AuthUser interface with trial fields
8. **Device Limit Enforcement** - Trial users limited to 2 devices with management UI
9. **Multi-Device Support** - Trial users can seamlessly add devices using same email
10. **Robust Validation** - Defensive code validation with detailed logging for debugging

### Code Removed/Simplified:
- ❌ Removed: Complex trial routing in App.tsx (~50 lines)
- ❌ Removed: localStorage fallback hacks for trial users
- ❌ Removed: sessionStorage pendingAgentId logic
- ❌ Deprecated: TrialDashboard component (no longer routed to)
- ❌ Deprecated: `trialAgentId` and `trialId` fields

### Files Modified:
**Backend:**
- `backend/migrations/unify_trial_user_architecture.sql` (NEW - migration script)
- `backend/routes/auth.js` (4 login endpoints: client, verify-mfa, trial-magic-link, agent-magic-link)
- `backend/routes/agents.js` (heartbeat, verify-email, device limit, DELETE endpoint)
- `backend/utils/trialEmailVerificationUtils.js` (getOrCreateTrialUser, validation fixes)

**Frontend:**
- `src/types/database.ts` (AuthUser interface updated)
- `src/App.tsx` (routing simplified - removed ~50 lines)
- `src/pages/ClientDashboard.tsx` (trial banner + devices tab)
- `src/components/client/TrialDevicesManager.tsx` (NEW - device management UI)

**Agent:**
- `rts-monitoring-agent/internal/trial/trial.go` (device limit error handling)

**Documentation:**
- `TRIAL_USER_UNIFICATION_HANDOFF.md` (NEW - complete handoff documentation)

### Migration to Paid:
When trial user converts to paid:
```sql
UPDATE users
SET is_trial = false,
    trial_expires_at = NULL
WHERE id = 'user-id';
```
That's it! No complex data migration needed.

---

**Last Updated:** 2025-10-19 [ALL ISSUES RESOLVED - v1.101.28]

**Status:** Ready for production testing
**Latest Fix:** Trial magic-link now includes businessId (Issue #5)
