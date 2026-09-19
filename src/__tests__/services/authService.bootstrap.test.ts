// First-admin bootstrap must create a real backend employees row (DB auth is
// authoritative) — never a Cognito-only account that can never sign in.
import { authService } from '../../services/authService';

describe('authService.signUpAdmin', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, user: { id: 'emp-1', email: 'root@example.com' } }),
    } as any);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('POSTs name/email/password to /auth/bootstrap-admin', async () => {
    await authService.signUpAdmin({
      name: 'Root Admin',
      email: 'root@example.com',
      password: 'Str0ng!Passw0rd',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/bootstrap-admin$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      name: 'Root Admin',
      email: 'root@example.com',
      password: 'Str0ng!Passw0rd',
    });
  });

  it('surfaces bootstrap failures instead of fake success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ success: false, message: 'An admin already exists' }),
    } as any);
    await expect(
      authService.signUpAdmin({ name: 'X', email: 'x@example.com', password: 'Str0ng!Passw0rd' })
    ).rejects.toThrow(/already exists/);
  });
});
