import { UserRole } from '../types/database';

/**
 * Role-based localStorage utility to prevent session conflicts between different user roles
 * (e.g., employee and client sessions in the same browser)
 */
export class RoleBasedStorage {
  /**
   * Determine the role from current context (stored user data first, then URL path)
   * CRITICAL: Check localStorage FIRST to find existing sessions before inferring from URL
   */
  private static getCurrentRole(): UserRole | string | undefined {
    // FIRST: Try to get role from any stored user data in localStorage
    // This ensures we find existing sessions even if user is on a generic path like /employee
    const possibleRoles: Array<UserRole | string> = ['admin', 'executive', 'employee', 'client', 'technician', 'sales'];
    for (const role of possibleRoles) {
      const storedUser = localStorage.getItem(`${role}_authUser`);
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed.role) {
            console.log(`🔑 [RoleBasedStorage] Found role from ${role}_authUser:`, parsed.role);
            return parsed.role;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    // SECOND: Check legacy non-namespaced key (for migration)
    const legacyUser = localStorage.getItem('authUser');
    if (legacyUser) {
      try {
        const parsed = JSON.parse(legacyUser);
        if (parsed.role) {
          console.log('🔑 [RoleBasedStorage] Found role from legacy authUser:', parsed.role);
          return parsed.role;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // LAST RESORT: Try to determine from URL path (only if no session found)
    const currentPath = window.location.pathname;
    if (currentPath.includes('/employee') || currentPath.includes('/technician') || currentPath.includes('/admin')) {
      console.log('🔑 [RoleBasedStorage] Determined role from URL path:', 'employee');
      return 'employee';
    } else if (currentPath.includes('/client') || currentPath.includes('/clogin')) {
      console.log('🔑 [RoleBasedStorage] Determined role from URL path:', 'client');
      return 'client';
    }

    console.log('⚠️ [RoleBasedStorage] Could not determine role from storage or URL path');
    return undefined;
  }

  /**
   * Get the namespaced storage key for a given base key and role
   */
  private static getStorageKey(baseKey: string, role?: UserRole | string): string {
    const resolvedRole = role || this.getCurrentRole();
    return resolvedRole ? `${resolvedRole}_${baseKey}` : baseKey;
  }

  /**
   * Set an item in localStorage with role-based namespacing
   */
  static setItem(key: string, value: string, role?: UserRole | string): void {
    localStorage.setItem(this.getStorageKey(key, role), value);
  }

  /**
   * Get an item from localStorage with role-based namespacing
   */
  static getItem(key: string, role?: UserRole | string): string | null {
    return localStorage.getItem(this.getStorageKey(key, role));
  }

  /**
   * Remove an item from localStorage with role-based namespacing
   */
  static removeItem(key: string, role?: UserRole | string): void {
    localStorage.removeItem(this.getStorageKey(key, role));
  }

  /**
   * Clear all role-specific storage items
   */
  static clearRoleStorage(role: UserRole | string): void {
    const keys = ['authUser', 'authTimestamp', 'sessionToken', 'mfaVerified', 'sessionConfig', 'user'];
    keys.forEach(key => {
      this.removeItem(key, role);
    });
  }

  /**
   * Migrate legacy non-namespaced data to role-based storage
   * Call this once on app initialization
   */
  static migrateLegacyData(): void {
    const legacyUser = localStorage.getItem('authUser');
    if (legacyUser) {
      try {
        const parsed = JSON.parse(legacyUser);
        if (parsed.role) {
          // Migrate all auth-related keys to role-based storage
          const role = parsed.role;
          const keysToMigrate = ['authUser', 'authTimestamp', 'sessionToken', 'mfaVerified', 'sessionConfig', 'user'];

          keysToMigrate.forEach(key => {
            const value = localStorage.getItem(key);
            if (value) {
              this.setItem(key, value, role);
              // Don't remove legacy keys yet to allow gradual migration
            }
          });

          console.log(`✅ Migrated legacy session data to ${role}-based storage`);
        }
      } catch (e) {
        console.warn('Could not migrate legacy session data:', e);
      }
    }
  }
}