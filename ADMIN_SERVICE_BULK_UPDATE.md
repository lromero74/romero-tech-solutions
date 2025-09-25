# AdminService Bulk Update Plan

## Methods Requiring Updates (by category)

### Business Methods
- [x] updateBusiness (line ~216) - DONE
- [x] deleteBusiness (line ~240) - DONE
- [x] getAuthorizedDomains (line ~566) - DONE
- [ ] updateAuthorizedDomains (line ~588)
- [ ] getBusinessesByEmailDomain (line ~607)
- [ ] softDeleteBusiness (line ~629)
- [ ] createBusiness (line ~685)

### User Methods
- [ ] updateUser (line ~306)
- [ ] changeUserPassword (line ~339)
- [ ] softDeleteUser (line ~359)
- [ ] createUser (line ~392)

### Service Methods
- [ ] createService (line ~421)

### Role Methods
- [ ] getRoles (line ~481)
- [ ] createRole (line ~511)
- [ ] updateRole (line ~544)
- [ ] deleteRole (line ~568)

### Service Location Methods
- [ ] softDeleteServiceLocation (line ~719)
- [ ] toggleServiceLocationStatus (line ~739)
- [ ] updateServiceLocation (line ~762)
- [ ] createServiceLocation (line ~820)

### Location Contact Methods
- [x] getLocationContacts - DONE
- [x] hasLocationContacts - DONE
- [x] createLocationContact - DONE
- [ ] deleteLocationContact (line ~842)

## Update Pattern

### Before:
```typescript
const response = await fetch(`${this.baseUrl}/endpoint`, {
  method: 'GET/POST/PUT/DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
});

if (!response.ok) {
  throw new Error('Failed to...');
}

const result = await response.json();
return result.data || result;
```

### After:
```typescript
const apiService = await this.getApiService();
const result = await apiService.get|post|put|delete('/admin/endpoint', data);
return result.data || result;
```

## Bulk Update Strategy

Instead of updating each method individually, we can:
1. Create a list of all remaining fetch patterns
2. Use systematic find/replace operations
3. Test critical functionality afterward

## Priority Order
1. **High Priority**: Methods called on page load (already done)
2. **Medium Priority**: CRUD operations (create, update, delete)
3. **Low Priority**: Admin-only operations used occasionally

## Next Steps
1. Identify the 10-15 most critical remaining methods
2. Update them systematically
3. Test key admin functionality
4. Update remaining methods as time permits