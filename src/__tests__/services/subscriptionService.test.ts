// Trial upgrade must POST the computed tier to /subscription/upgrade and
// hand the browser to Stripe's hosted checkout — never an alert box.
import { startSubscriptionUpgrade } from '../../services/subscriptionService';

describe('subscriptionService.startSubscriptionUpgrade', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('POSTs the target tier and redirects to the checkout URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, checkout_url: 'https://checkout.stripe.com/pay/cs_1' }),
    } as any);
    const redirect = jest.fn();
    await startSubscriptionUpgrade({
      apiBaseUrl: 'http://localhost:3001/api',
      sessionToken: 'tok',
      targetTier: 'subscribed',
      redirect,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/subscription/upgrade',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ target_tier: 'subscribed' });
    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.com/pay/cs_1');
  });

  it('surfaces upgrade errors instead of redirecting', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, message: 'Profile incomplete' }),
    } as any);
    const redirect = jest.fn();
    await expect(
      startSubscriptionUpgrade({
        apiBaseUrl: 'http://x/api',
        sessionToken: 't',
        targetTier: 'subscribed',
        redirect,
      })
    ).rejects.toThrow(/Profile incomplete/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
