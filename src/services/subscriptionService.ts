// Client subscription upgrades via Stripe hosted Checkout.
// The backend computes the graduated monthly cost and returns a checkout
// URL; the browser leaves for Stripe and returns to /clogin afterwards.
export type SubscriptionTier = 'subscribed' | 'enterprise';

interface StartUpgradeArgs {
  apiBaseUrl: string;
  sessionToken: string;
  targetTier: SubscriptionTier;
  additionalDevices?: number;
  /** Injectable for tests (jsdom location is non-configurable). */
  redirect?: (url: string) => void;
}

export async function startSubscriptionUpgrade({
  apiBaseUrl,
  sessionToken,
  targetTier,
  additionalDevices,
  redirect = (url: string) => window.location.assign(url),
}: StartUpgradeArgs): Promise<{ checkoutUrl: string; sessionId: string }> {
  const body: { target_tier: SubscriptionTier; additional_devices?: number } = {
    target_tier: targetTier,
  };
  if (additionalDevices !== undefined) {
    body.additional_devices = additionalDevices;
  }
  const response = await fetch(`${apiBaseUrl}/subscription/upgrade`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.success || !data.checkout_url) {
    throw new Error(data.message || 'Failed to start subscription checkout');
  }
  redirect(data.checkout_url);
  return { checkoutUrl: data.checkout_url, sessionId: data.session_id };
}
