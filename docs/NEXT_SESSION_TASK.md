# Next Session Task: Optimize Admin Tab Loading Performance

## Context

**Problem:** Some admin tabs load slowly (3-6 seconds) while others are instant.

**Root Cause:**
- **Fast tabs** (Employees, Businesses, Clients, Service Locations) receive data as props from AdminDataContext (pre-fetched and cached)
- **Slow tabs** (Roles, Permissions, Service Types, Closure Reasons, Password Policy, Workflow Config, etc.) fetch their own data on every mount with `useEffect(() => { fetchData(); }, [])`

**Current Performance:**
- Fast tabs: Instant (<100ms)
- Slow tabs: 3-6 seconds per tab click

**Solution:** Extend AdminDataContext to include all data types, making ALL tabs instant.

## Implementation Plan

### Phase 1: Extend AdminDataContext (HIGHEST PRIORITY - 30 min)
**File: `src/contexts/AdminDataContext.tsx`**

#### 1.1 Add Type Imports (if needed)
Check if these types exist, otherwise define them:
```typescript
import { Role } from '../types/database';  // Check if exists
import { Permission } from '../services/permissionService';  // Check if exists

// If needed, define new types:
interface ServiceType {
  id: string;
  service_name: string;
  description?: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ClosureReason {
  id: string;
  reason_text: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special: boolean;
  // Add other fields as needed
}
```

#### 1.2 Update AdminDataContextType Interface (Lines 119-151)
Add after line 127 (after `serviceLocations: ServiceLocation[]`):
```typescript
  roles: Role[];
  permissions: Permission[];
  serviceTypes: ServiceType[];
  closureReasons: ClosureReason[];
  passwordPolicy: PasswordPolicy | null;
```

Add after line 142 (after `refreshOnlineStatus: () => Promise<void>;`):
```typescript
  refreshRoles: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  refreshServiceTypes: () => Promise<void>;
  refreshClosureReasons: () => Promise<void>;
  refreshPasswordPolicy: () => Promise<void>;
```

Add after line 150 (after `setServiceLocations: ...`):
```typescript
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  setPermissions: React.Dispatch<React.SetStateAction<Permission[]>>;
  setServiceTypes: React.Dispatch<React.SetStateAction<ServiceType[]>>;
  setClosureReasons: React.Dispatch<React.SetStateAction<ClosureReason[]>>;
  setPasswordPolicy: React.Dispatch<React.SetStateAction<PasswordPolicy | null>>;
```

#### 1.3 Add State Variables (After line 174)
```typescript
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>([]);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null);
```

#### 1.4 Add Refresh Functions (After line 292)
```typescript
  const refreshRoles = async () => {
    try {
      const data = await adminService.getRoles();
      setRoles(data || []);
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError('Failed to fetch roles');
    }
  };

  const refreshPermissions = async () => {
    try {
      const data = await permissionService.getAllPermissions();  // Or appropriate API call
      setPermissions(data || []);
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError('Failed to fetch permissions');
    }
  };

  const refreshServiceTypes = async () => {
    try {
      const response = await apiService.get('/admin/service-types');  // Check actual endpoint
      setServiceTypes(response.data || []);
    } catch (err) {
      console.error('Error fetching service types:', err);
      setError('Failed to fetch service types');
    }
  };

  const refreshClosureReasons = async () => {
    try {
      const response = await apiService.get('/admin/closure-reasons');  // Check actual endpoint
      setClosureReasons(response.data || []);
    } catch (err) {
      console.error('Error fetching closure reasons:', err);
      setError('Failed to fetch closure reasons');
    }
  };

  const refreshPasswordPolicy = async () => {
    try {
      const response = await apiService.get('/admin/password-policy');  // Check actual endpoint
      setPasswordPolicy(response.data || null);
    } catch (err) {
      console.error('Error fetching password policy:', err);
      setError('Failed to fetch password policy');
    }
  };
```

#### 1.5 Update refreshAllData Function (Find around line 293-320)
Add to the Promise.all array:
```typescript
  const refreshAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        refreshDashboardData(),
        refreshEmployees(),
        refreshClients(),
        refreshBusinesses(),
        refreshServices(),
        refreshServiceRequests(),
        refreshServiceLocations(),
        refreshRoles(),           // ADD THIS
        refreshPermissions(),     // ADD THIS
        refreshServiceTypes(),    // ADD THIS
        refreshClosureReasons(),  // ADD THIS
        refreshPasswordPolicy()   // ADD THIS
      ]);
    } catch (err) {
      console.error('Error refreshing all data:', err);
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };
```

#### 1.6 Add WebSocket Listeners for Real-Time Updates (Around line 554-616)
Add to the existing `websocketService.onEntityDataChange` handler:
```typescript
        // Handle role changes
        if (change.entityType === 'role') {
          if (change.action === 'deleted') {
            setRoles(prevRoles => prevRoles.filter(role => role.id !== change.entityId));
          } else if (change.action === 'created' || change.action === 'updated' || change.action === 'restored') {
            await refreshRoles();
          }
        }

        // Handle permission changes
        if (change.entityType === 'permission') {
          await refreshPermissions();
        }

        // Handle service type changes
        if (change.entityType === 'serviceType') {
          if (change.action === 'deleted') {
            setServiceTypes(prevTypes => prevTypes.filter(type => type.id !== change.entityId));
          } else {
            await refreshServiceTypes();
          }
        }

        // Handle closure reason changes
        if (change.entityType === 'closureReason') {
          if (change.action === 'deleted') {
            setClosureReasons(prevReasons => prevReasons.filter(reason => reason.id !== change.entityId));
          } else {
            await refreshClosureReasons();
          }
        }

        // Handle password policy changes
        if (change.entityType === 'passwordPolicy') {
          await refreshPasswordPolicy();
        }
```

#### 1.7 Update Context Value (Around line 645-677)
Add to the `value` object:
```typescript
  const value: AdminDataContextType = {
    // Data
    dashboardData,
    employees,
    clients,
    businesses,
    services,
    serviceRequests,
    serviceLocations,
    roles,              // ADD THIS
    permissions,        // ADD THIS
    serviceTypes,       // ADD THIS
    closureReasons,     // ADD THIS
    passwordPolicy,     // ADD THIS

    // Loading and error states
    loading,
    error,

    // Actions
    refreshAllData,
    refreshDashboardData,
    refreshEmployees,
    refreshClients,
    refreshBusinesses,
    refreshServices,
    refreshServiceRequests,
    refreshServiceLocations,
    refreshOnlineStatus,
    refreshRoles,           // ADD THIS
    refreshPermissions,     // ADD THIS
    refreshServiceTypes,    // ADD THIS
    refreshClosureReasons,  // ADD THIS
    refreshPasswordPolicy,  // ADD THIS

    // Data setters
    setEmployees,
    setClients,
    setBusinesses,
    setServices,
    setServiceRequests,
    setServiceLocations,
    setRoles,              // ADD THIS
    setPermissions,        // ADD THIS
    setServiceTypes,       // ADD THIS
    setClosureReasons,     // ADD THIS
    setPasswordPolicy      // ADD THIS
  };
```

### Phase 2: Update Backend to Emit WebSocket Events (15 min)

Check these backend route files and add `websocketService.broadcastEntityUpdate()` calls:

**Check these files:**
- `backend/routes/admin/roles.js` - Add `websocketService.broadcastEntityUpdate('role', roleId, 'updated')` after role changes
- `backend/routes/admin/permissions.js` - Add `websocketService.broadcastEntityUpdate('permission', permissionId, 'updated')` after permission changes
- Any route that modifies service types, closure reasons, or password policy

**Pattern to add:**
```javascript
// After successful update/create/delete
websocketService.broadcastEntityUpdate('role', roleId, 'updated');
websocketService.broadcastEntityUpdate('permission', permissionId, 'updated');
websocketService.broadcastEntityUpdate('serviceType', typeId, 'updated');
websocketService.broadcastEntityUpdate('closureReason', reasonId, 'updated');
websocketService.broadcastEntityUpdate('passwordPolicy', 'policy', 'updated');
```

### Phase 3: Update AdminDashboard to Pass Props (10 min)
**File: `src/pages/AdminDashboard.tsx`**

Update the `useAdminData()` destructuring (around line 19):
```typescript
  const {
    refreshAllData,
    serviceLocations,
    employees,
    roles,              // ADD THIS
    permissions,        // ADD THIS
    serviceTypes,       // ADD THIS
    closureReasons,     // ADD THIS
    passwordPolicy,     // ADD THIS
    refreshRoles,       // ADD THIS
    refreshPermissions, // ADD THIS
    setRoles,           // ADD THIS
    setPermissions      // ADD THIS
  } = useAdminData();
```

### Phase 4: Refactor Slow Components (20-30 min each)

#### 4.1 Find Roles Component
**Likely file: `src/components/admin/AdminRoles.tsx` or `src/components/admin/Roles.tsx`**

**Current pattern (SLOW):**
```typescript
const [roles, setRoles] = useState([]);
useEffect(() => {
  const fetchRoles = async () => {
    const data = await adminService.getRoles();
    setRoles(data);
  };
  fetchRoles();
}, []);
```

**Change to (FAST):**
```typescript
// Add props to component interface
interface AdminRolesProps {
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  refreshRoles: () => Promise<void>;
}

const AdminRoles: React.FC<AdminRolesProps> = ({ roles, setRoles, refreshRoles }) => {
  // Remove useState for roles
  // Remove useEffect that fetches roles
  // Use props.roles instead of local state
  // Call refreshRoles() after updates instead of local fetch
};
```

**Update AdminDashboard to pass props:**
```tsx
{currentView === 'roles' && (
  <AdminRoles
    roles={roles}
    setRoles={setRoles}
    refreshRoles={refreshRoles}
  />
)}
```

#### 4.2 Repeat for Other Slow Components
Apply the same pattern to:
- Permissions component
- Service Types component
- Closure Reasons component
- Password Policy component

### Expected Results

**Before:**
- Roles: 5-6 seconds per click
- Permissions: 4-5 seconds per click
- Service Types: 1-2 seconds per click
- Closure Reasons: 5-6 seconds per click
- Password Policy: 4-5 seconds per click

**After:**
- All tabs: <100ms (instant)
- Initial page load: +1-2 seconds (acceptable one-time cost)
- Real-time updates: <100ms (WebSocket push)

## Testing Checklist

- [ ] Initial page load shows all data
- [ ] Switching between tabs is instant
- [ ] Creating a new role updates all connected clients immediately
- [ ] Updating permissions reflects instantly
- [ ] Deleting items removes them from UI without refresh
- [ ] No console errors
- [ ] Network tab shows data fetched once on page load, not per tab

## Files to Modify

1. ✅ `src/contexts/AdminDataContext.tsx` - Core changes
2. ✅ `src/pages/AdminDashboard.tsx` - Pass props to components
3. ⚠️ Backend route files - Add WebSocket broadcasts (check which exist)
4. ⚠️ Find and refactor slow components:
   - AdminRoles.tsx (or Roles.tsx)
   - AdminPermissions.tsx (or Permissions.tsx)
   - ServiceTypes component
   - ClosureReasons component
   - PasswordPolicy component

## Notes

- This follows the exact same pattern already working for Employees, Businesses, Clients
- Look at how AdminEmployees receives props from AdminDashboard as a reference
- AdminDataContext lines 558-615 show the WebSocket update pattern for existing entities
- All API endpoint names might differ - check actual backend routes
