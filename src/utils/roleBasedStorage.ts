import { UserRole } from '../types/database';

/**
 * Role-based localStorage utility to prevent session conflicts between different user roles
 * (e.g., employee and client sessions in the same browser)
 */
export class RoleBasedStorage {
  /**
   * Determine the role from current context (URL path or stored user data)
   */
  private static getCurrentRole(): UserRole | string | undefined {
    // First try to determine from URL path
    const currentPath = window.location.pathname;
    if (currentPath.includes('/employee') || currentPath.includes('/technician') || currentPath.includes('/dashboard')) {
      return 'employee';
    } else if (currentPath.includes('/client') || currentPath === '/clogin') {
      return 'client';
    } else if (currentPath.includes('/admin')) {
      return 'admin';
    }

    // If URL doesn't help, try to get role from any stored user data
    // Check all possible role-prefixed keys
    const possibleRoles: Array<UserRole | string> = ['admin', 'executive', 'employee', 'client', 'technician', 'sales'];
    for (const role of possibleRoles) {
      const storedUser = localStorage.getItem(`${role}_authUser`);
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed.role) {
            return parsed.role;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    // Last resort: check legacy non-namespaced key
    const legacyUser = localStorage.getItem('authUser');
    if (legacyUser) {
      try {
        const parsed = JSON.parse(legacyUser);
        if (parsed.role) {
          return parsed.role;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

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