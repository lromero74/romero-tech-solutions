import { shouldPromptMfaForRole } from '../../contexts/EnhancedAuthContext';

describe('shouldPromptMfaForRole', () => {
  it('prompts every employee role when MFA is enabled', () => {
    for (const role of ['admin', 'technician', 'sales', 'manager', 'executive']) {
      expect(shouldPromptMfaForRole(role, true)).toBe(true);
    }
  });

  it('never prompts clients (separate authentication flow)', () => {
    expect(shouldPromptMfaForRole('client', true)).toBe(false);
    expect(shouldPromptMfaForRole('client', false)).toBe(false);
  });

  it('prompts nobody when MFA is disabled', () => {
    for (const role of ['admin', 'technician', 'sales', 'manager', 'executive']) {
      expect(shouldPromptMfaForRole(role, false)).toBe(false);
    }
  });

  it('fails closed on unknown roles', () => {
    expect(shouldPromptMfaForRole('superadmin', true)).toBe(true);
    expect(shouldPromptMfaForRole(undefined, true)).toBe(true);
  });
});
