- project root: /Users/louis/New/01_Projects/RomeroTechSolutions
- frontend root: /Users/louis/New/01_Projects/RomeroTechSolutions/src
- backend root: /Users/louis/New/01_Projects/RomeroTechSolutions/backend
- dev environment frontend: localhost
- dev environment backend: localhost
- script to restart dev environment: <project root>/restart-services.sh
- production environment front end: AWS Amplify
- production environment back end: AWS EC2 (accessible vi "ssh botmanager")
- dev an prod share database: Amazon RDS postgres
- aws cli is installed
- you have access to aws cli with my credentials stored in: /Users/louis/.aws
- AWS Secrets manager is used fo database connection
- Never commit without asking for permission
- Never push without asking for permission
- production app url is: https://romerotechsolutions.com
- employees log in via: https://romerotechsolutions.com/employees
- clients/users log in via: https://romerotechsolutions.com/clogin
- script exists to run SQL commands against database: /Users/louis/New/01_Projects/RomeroTechSolutions/scripts/table --sql
- always consider what a security analysis would expect when developing
- never commit secrets or sensitive data to files that are git tracked
- employees exist in the employees table.  clients/users are NOT employees and exist in the users table
- before making any commit, check "git diff" and verify that your changes won't break something dependent on the old behavior
- never make assumptions about the architecture, function names, or the lack of any tool, utility, or convention.  Assumptions lead to errors.
- form validators might be (I'm not sure) used for both employees (logging in via /employee) and clients (logging in vi /clogin) and their respective components and modals.  Always check before assuming changes or you may break something.
- note that strings for client dashboard have translation keys that are
- Sometimes user may need to run the following to see language updates:
  localStorage.removeItem('translations_es')
  localStorage.removeItem('translations_en')
  location.reload()
- Client Settings reset options:
  // In the browser console (F12):
  localStorage.clear()
  location.reload()

  Or just clear the specific auth keys:
  localStorage.removeItem('client_authUser')
  localStorage.removeItem('client_sessionToken')
  location.reload()
stored in the database
- for the customer/client/user flow (/clogin) and its dash, we need to maintain layout structures that work for desktop AND mobile
- always use the restart-services.sh script (and don't start worrying util about after a minute); we are doing a lot of environment config now when we restart our localhost/dev environment
- **WHENEVER** you are going to do anything to modify the schema, examine and thoroughly understand the existing schema before creating migration scripts!
- before running commands at the command line, make sure you are in the appropriate directory
- review this before performing any new task

## Role-Based Access Control (RBAC) Best Practices

**CRITICAL: Never hardcode role checks in components. Always use the permission system.**

When implementing role-based restrictions:

1. **Use Permissions, Not Role Checks**:
   - ❌ WRONG: `if (authUser.role === 'technician') { ... }`
   - ✅ CORRECT: `const canViewSoftDeleted = checkPermission('view.soft_deleted_businesses.enable')`

2. **Create Specific Permissions**:
   - Create granular permissions for each action/view capability
   - Example: `view.soft_deleted_businesses.enable`, `modify.businesses.enable`

3. **Grant Permissions via Database**:
   - Use SQL to grant permissions to roles
   - Example: `INSERT INTO role_permissions (role_id, permission_id, is_granted) ...`

4. **Use `usePermission` Hook in Components**:
   - Check permissions in component: `const { checkPermission } = usePermission()`
   - Conditional rendering: `{canModify && <EditButton />}`

5. **Why This Matters**:
   - Permissions can be changed via admin UI without code changes
   - Role definitions remain flexible and maintainable
   - No need to redeploy when adjusting role capabilities
   - Follows principle of configuration over code

**Example Pattern**:
```typescript
// In component
const { checkPermission } = usePermission();
const canViewSoftDeleted = checkPermission('view.soft_deleted_businesses.enable');
const canModify = checkPermission('modify.businesses.enable');

// In render
{canViewSoftDeleted && <ShowSoftDeletedToggle />}
{(canModify || canDelete) && <ActionButtons />}
```
- front end expects to be run ineractively (it waits at an input prompt for commands when you start it)
- never commit unless human says you can
- before you write code that relies on database queries, check the schema to make sure you are looking for the right things.
*** IMPORTANT! ** when committing bump src/hooks/useVersionCheck.ts, public/version.json and package.json version numbers
- no helper scripts you write shall include any secrets
- no committing unless I tell you to
- when you rebuild the agent binaries, bump their version number
- the user experience for all OS versions of the agent should be very similar
- for the rts-agent: when you build, build installers for all supported systems and when you code, code for user experience being the same for all supported systems
- rts-agent codebase is in /Users/louis/New/01_Projects/rts-monitoring-agent
- always check database schema to make sure any assumptions about table names, field names, and purpose are correct
- never assume you know what table names are or field names are in the database or what interfaces are.  check for each fresh context
- we don't do stubs