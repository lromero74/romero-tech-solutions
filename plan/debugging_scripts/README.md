# Debugging Scripts

This folder contains development and debugging utility scripts that are **NOT used by the running application**. These scripts were moved here to separate them from production backend scripts.

## Scripts Overview

### User Management & Testing
- `checkUserActive.js` - Check user account status (email verification, active status, tokens)
- `checkEmailStatus.js` - Check email verification status for debugging
- `getToken.js` - Utility to retrieve authentication tokens for testing
- `deleteUser.js` - Admin utility to delete test users during development

### Database Administration
- `update_user_role.js` - Script to update user roles in the database
- `update_employee_numbers.js` - One-time migration script to update employee number formats
- `unconfirmEmail.js` - Testing utility to reset email confirmation status
- `recreate_employee_roles_table.js` - Database migration script for employee roles

## Usage

These scripts can be run directly from this directory for debugging purposes:

```bash
cd plan/debugging_scripts
node checkUserActive.js
node getToken.js
# etc.
```

## Note

These scripts are separate from the main application and contain hardcoded email references that were used during development. They are preserved here for debugging purposes but do not affect the running application in any way.

The actual application uses scripts in `backend/scripts/` for legitimate operations like database backups, migrations, and other production tasks.