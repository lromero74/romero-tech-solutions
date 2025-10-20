import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Users, HardDrive, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import apiService from '../../services/apiService';

interface PricingTier {
  id: string;
  tier: 'free' | 'subscribed' | 'enterprise';
  base_devices: number;
  default_devices_allowed: number;
  price_per_additional_device: string;
  currency: string;
  billing_period: string;
  is_active: boolean;
}

interface Analytics {
  tierCounts: Array<{ subscription_tier: string; user_count: string }>;
  deviceStats: Array<{ subscription_tier: string; total_devices: string; avg_active_ratio: string }>;
  totals: { total_users: string; total_devices: string; active_devices: string };
}

const SubscriptionPricing: React.FC = () => {
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [pricingData, analyticsData] = await Promise.all([
        apiService.get('/admin/subscription/pricing'),
        apiService.get('/admin/subscription/analytics')
      ]);

      if (pricingData.success) setPricing(pricingData.pricing);
      if (analyticsData.success) setAnalytics(analyticsData.analytics);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Force CSRF token refresh when component mounts (fixes localhost Safari cookie issues)
    const initPage = async () => {
      console.log('🔄 Refreshing CSRF token for subscription pricing page...');
      await apiService.refreshCsrfToken();
      await fetchData();
    };
    initPage();
  }, []);

  const handleSave = async (tier: PricingTier) => {
    try {
      setSaving(tier.tier);
      setMessage(null);

      const result = await apiService.put(`/admin/subscription/pricing/${tier.tier}`, {
        base_devices: tier.base_devices,
        default_devices_allowed: tier.default_devices_allowed,
        price_per_additional_device: parseFloat(tier.price_per_additional_device),
        currency: tier.currency,
        billing_period: tier.billing_period,
        is_active: tier.is_active
      });

      if (result.success) {
        setMessage({ type: 'success', text: `${tier.tier} tier updated successfully` });
        fetchData();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update pricing' });
    } finally {
      setSaving(null);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'blue';
      case 'subscribed': return 'green';
      case 'enterprise': return 'purple';
      default: return 'gray';
    }
  };

  const getTierBorderClasses = (tier: string, isActive: boolean) => {
    if (!isActive) return 'border-gray-300 dark:border-gray-600 opacity-60';
    switch (tier) {
      case 'free': return 'border-blue-300 dark:border-blue-600';
      case 'subscribed': return 'border-green-300 dark:border-green-600';
      case 'enterprise': return 'border-purple-300 dark:border-purple-600';
      default: return 'border-gray-300 dark:border-gray-600';
    }
  };

  const getTierTextClasses = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-blue-600 dark:text-blue-400';
      case 'subscribed': return 'text-green-600 dark:text-green-400';
      case 'enterprise': return 'text-purple-600 dark:text-purple-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getTierButtonClasses = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-blue-600 hover:bg-blue-700';
      case 'subscribed': return 'bg-green-600 hover:bg-green-700';
      case 'enterprise': return 'bg-purple-600 hover:bg-purple-700';
      default: return 'bg-gray-600 hover:bg-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Subscription Management
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Configure pricing tiers and view subscription analytics
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <p className={message.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
              {message.text}
            </p>
          </div>
        </div>
      )}

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics.totals.total_users || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <HardDrive className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active Devices</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics.totals.active_devices || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {analytics.tierCounts.length > 0
                    ? Math.round((analytics.tierCounts.filter(t => t.subscription_tier !== 'free').reduce((acc, t) => acc + parseInt(t.user_count), 0) /
                        analytics.tierCounts.reduce((acc, t) => acc + parseInt(t.user_count), 0)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {pricing.map((tier) => {
          const userCount = analytics?.tierCounts.find(t => t.subscription_tier === tier.tier)?.user_count || '0';

          return (
            <div
              key={tier.id}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 ${getTierBorderClasses(tier.tier, tier.is_active)} p-6`}
            >
              <div className="mb-4">
                <h3 className={`text-xl font-bold capitalize ${getTierTextClasses(tier.tier)} mb-1`}>
                  {tier.tier === 'subscribed' ? 'Pro' : tier.tier} Plan
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{userCount} users</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Base Devices
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tier.base_devices}
                    onChange={(e) => setPricing(pricing.map(p =>
                      p.id === tier.id ? { ...p, base_devices: parseInt(e.target.value) } : p
                    ))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Devices included in base price (before additional charges)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Default Devices Allowed
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tier.default_devices_allowed}
                    onChange={(e) => setPricing(pricing.map(p =>
                      p.id === tier.id ? { ...p, default_devices_allowed: parseInt(e.target.value) } : p
                    ))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Device limit for new users of this tier
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Price per Additional Device ({tier.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tier.price_per_additional_device}
                    onChange={(e) => setPricing(pricing.map(p =>
                      p.id === tier.id ? { ...p, price_per_additional_device: e.target.value } : p
                    ))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Monthly cost for each device beyond base devices
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`active-${tier.id}`}
                    checked={tier.is_active}
                    onChange={(e) => setPricing(pricing.map(p =>
                      p.id === tier.id ? { ...p, is_active: e.target.checked } : p
                    ))}
                    className="rounded"
                  />
                  <label htmlFor={`active-${tier.id}`} className="text-sm text-gray-700 dark:text-gray-300">
                    Active
                  </label>
                </div>

                <button
                  onClick={() => handleSave(tier)}
                  disabled={saving === tier.tier}
                  className={`w-full px-4 py-2 ${getTierButtonClasses(tier.tier)} text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {saving === tier.tier ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPricing;
