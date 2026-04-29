import React, { useState, useEffect } from 'react';
import { DollarSign, Clock, Gift, CheckCircle, Info, Phone, Mail, ArrowRight, Zap, Shield, UserPlus, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ParticleBackground from '../components/common/ParticleBackground';
import StructuredData from '../components/seo/StructuredData';
import apiService from '../services/apiService';

interface RateCategory {
  id: string;
  name: string;
  baseRate: number;
  description: string;
  isDefault: boolean;
  displayOrder: number;
}

interface RateTier {
  name: string;
  level: number;
  multiplier: number;
  colorCode: string;
  description: string;
}

interface ScheduleSlot {
  tierName: string;
  tierLevel: number;
  dayOfWeek: number;
  timeStart: string;
  timeEnd: string;
  multiplier: number;
}

interface PricingData {
  categories: RateCategory[];
  tiers: RateTier[];
  schedule: ScheduleSlot[];
  policies: {
    minimumHours: number;
    roundingMinutes: number;
    newClientFirstHourFree: boolean;
  };
}

// Service-hour tiers are stored as Pacific wall-clock values. Do not convert
// these through Date/browser timezone APIs or the pricing page will drift.
const generateScheduleFromSummary = (schedule: ScheduleSlot[], tierName: string, t: (key: string) => string): string => {
  const tierSlots = schedule.filter(slot => slot.tierName === tierName);
  if (tierSlots.length === 0) return '';

  const dayNames = [
    t('common.days.sun'),
    t('common.days.mon'),
    t('common.days.tue'),
    t('common.days.wed'),
    t('common.days.thu'),
    t('common.days.fri'),
    t('common.days.sat')
  ];

  interface ScheduleBlock {
    day: number;
    startTime: string;
    endTime: string;
  }

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
    return `${displayHours}${displayMinutes}${period}`;
  };

  const blocks = tierSlots.map(slot => ({
    day: slot.dayOfWeek,
    startTime: slot.timeStart,
    endTime: slot.timeEnd
  }));

  const byDay: Record<number, ScheduleBlock[]> = {};
  blocks.forEach(block => {
    if (!byDay[block.day]) byDay[block.day] = [];
    byDay[block.day].push(block);
  });

  const mergedByDay: Record<number, ScheduleBlock[]> = {};
  Object.entries(byDay).forEach(([day, dayBlocks]) => {
    const sorted = [...dayBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const merged: ScheduleBlock[] = [];

    sorted.forEach(block => {
      const previous = merged[merged.length - 1];
      if (previous && timeToMinutes(block.startTime) <= timeToMinutes(previous.endTime)) {
        previous.endTime = block.endTime;
      } else {
        merged.push({ ...block });
      }
    });

    mergedByDay[Number(day)] = merged;
  });

  const timeRangeGroups: { [key: string]: number[] } = {};
  const formatted: string[] = [];

  Object.entries(mergedByDay).forEach(([dayStr, dayBlocks]) => {
    dayBlocks.forEach(block => {
      const key = `${formatTime(block.startTime)}-${formatTime(block.endTime)}`;
      if (!timeRangeGroups[key]) {
        timeRangeGroups[key] = [];
      }
      const day = Number(dayStr);
      if (!timeRangeGroups[key].includes(day)) {
        timeRangeGroups[key].push(day);
      }
    });
  });

  Object.entries(timeRangeGroups).forEach(([timeRange, days]) => {
    days.sort((a, b) => a - b);

    const dayRanges: Array<{ startDay: number; endDay: number }> = [];
    let currentRange = { startDay: days[0], endDay: days[0] };

    for (let i = 1; i < days.length; i++) {
      if (days[i] === currentRange.endDay + 1) {
        currentRange.endDay = days[i];
      } else {
        dayRanges.push({ ...currentRange });
        currentRange = { startDay: days[i], endDay: days[i] };
      }
    }
    dayRanges.push(currentRange);

    dayRanges.forEach(range => {
      const dayStr = range.startDay === range.endDay
        ? dayNames[range.startDay]
        : `${dayNames[range.startDay]}-${dayNames[range.endDay]}`;
      formatted.push(`${dayStr}: ${timeRange}`);
    });
  });

  return `${formatted.join(' | ')} ${t('pricing.tiers.pacificTime')}`;
};

interface PricingProps {
  setCurrentPage: (page: string) => void;
}

const Pricing: React.FC<PricingProps> = ({ setCurrentPage }) => {
  const { t } = useLanguage();
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response: any = await apiService.get('/public/pricing');
        if (response.success) {
          setPricingData(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch pricing data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPricing();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-xl">{t('common.loading')}</div>
      </div>
    );
  }

  const defaultCategory = pricingData?.categories.find(cat => cat.isDefault) || pricingData?.categories[0];
  const nonprofitCategory = pricingData?.categories.find(cat => cat.name === 'Non-Profit');
  const standardTier = pricingData?.tiers.find(tier => tier.name === 'Standard');
  const premiumTier = pricingData?.tiers.find(tier => tier.name === 'Premium');
  const emergencyTier = pricingData?.tiers.find(tier => tier.name === 'Emergency');

  // Generate schedule descriptions for each tier
  const standardSchedule = pricingData?.schedule ? generateScheduleFromSummary(pricingData.schedule, 'Standard', t) : '';
  const premiumSchedule = pricingData?.schedule ? generateScheduleFromSummary(pricingData.schedule, 'Premium', t) : '';
  // Emergency is just "all other times" - no need to show specific schedule
  const emergencySchedule = t('pricing.tiers.emergency.allOtherTimes');
  const managedPlans = [
    {
      name: t('pricing.managed.essentials.title'),
      subtitle: t('pricing.managed.essentials.subtitle'),
      price: '$125',
      unit: t('pricing.managed.perUser'),
      minimum: t('pricing.managed.essentials.minimum'),
      features: t('pricing.managed.essentials.features').split('|'),
      accent: 'from-cyan-500 to-blue-600',
      border: 'border-cyan-400/50 hover:border-cyan-400'
    },
    {
      name: t('pricing.managed.managed.title'),
      subtitle: t('pricing.managed.managed.subtitle'),
      price: '$175',
      unit: t('pricing.managed.perUser'),
      minimum: t('pricing.managed.managed.minimum'),
      features: t('pricing.managed.managed.features').split('|'),
      accent: 'from-emerald-500 to-green-600',
      border: 'border-emerald-400/60 hover:border-emerald-400',
      featured: true
    },
    {
      name: t('pricing.managed.secure.title'),
      subtitle: t('pricing.managed.secure.subtitle'),
      price: '$225',
      unit: t('pricing.managed.perUser'),
      minimum: t('pricing.managed.secure.minimum'),
      features: t('pricing.managed.secure.features').split('|'),
      accent: 'from-purple-500 to-indigo-600',
      border: 'border-purple-400/50 hover:border-purple-400'
    }
  ];

  return (
    <div className="min-h-screen">
      <StructuredData pageType="pricing" />

      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen overflow-hidden cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const particleEvent = new CustomEvent('generateParticles', {
            detail: { x: clickX, y: clickY }
          });
          window.dispatchEvent(particleEvent);
        }}
      >
        {/* Background elements */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-5"
          style={{
            backgroundImage: `url('https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop')`
          }}
        ></div>

        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}></div>
        </div>

        {/* Particle Background */}
        <div className="absolute inset-0 w-full h-full">
          <ParticleBackground boundaries={{
            left: 0,
            top: 0,
            right: typeof window !== 'undefined' ? window.innerWidth : 1920,
            bottom: typeof window !== 'undefined' ? Math.max(window.innerHeight, document.documentElement.scrollHeight) : 2000
          }} />
        </div>

        {/* Main Content Container */}
        <div className="relative z-10 w-full py-12 px-3 sm:px-4 lg:px-6">
          <div className="max-w-[1400px] mx-auto space-y-16">

            {/* Hero Section */}
            <div className="text-center">
              <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-6 py-2 mb-8 border border-white/20">
                <DollarSign className="h-4 w-4 text-green-400 mr-2" />
                <span className="text-sm font-medium">{t('pricing.hero.badge')}</span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                {t('pricing.hero.title')}
                <span className="block bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  {t('pricing.hero.titleHighlight')}
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
                {t('pricing.hero.subtitle')}
              </p>

              {/* New Client Special Offer Banner */}
              {pricingData?.policies.newClientFirstHourFree && (
                <div className="mb-12">
                  <div className="inline-flex items-center bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl px-8 py-6 border-2 border-green-400/50 shadow-xl">
                    <Gift className="h-8 w-8 text-green-400 mr-4 flex-shrink-0" />
                    <div className="text-left">
                      <h3 className="text-2xl font-bold text-green-300 mb-1">{t('pricing.newClientOffer.title')}</h3>
                      <p className="text-lg text-green-100">{t('pricing.newClientOffer.description')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Managed Services Section */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('pricing.managed.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('pricing.managed.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                {managedPlans.map((plan) => (
                  <div key={plan.name} className="group relative">
                    {plan.featured && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                        <span className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
                          {t('pricing.managed.recommended')}
                        </span>
                      </div>
                    )}
                    <div className={`h-full bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 ${plan.border}`}>
                      <div className={`bg-gradient-to-br ${plan.accent} rounded-xl p-4 w-fit mb-6 mx-auto`}>
                        <Users className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                      <p className="text-sm text-blue-200 mb-6 min-h-[40px]">{plan.subtitle}</p>
                      <div className="mb-2">
                        <span className="text-4xl font-bold text-white">{plan.price}</span>
                        <span className="text-blue-200 ml-2">{plan.unit}</span>
                      </div>
                      <p className="text-sm text-cyan-200 font-semibold mb-6">{plan.minimum}</p>
                      <ul className="space-y-3 text-left">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start text-sm text-blue-100">
                            <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 max-w-4xl mx-auto text-left">
                <div className="flex items-start">
                  <Gift className="h-6 w-6 text-green-400 mr-4 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('pricing.managed.nonprofit.title')}</h3>
                    <p className="text-blue-200">{t('pricing.managed.nonprofit.description')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Standard Pricing Section */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('pricing.standard.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('pricing.tiers.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                {/* Standard Rate */}
                {standardTier && defaultCategory && (
                  <div className="group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-green-400/50 hover:border-green-400">
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                        <Clock className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.standard.title')}</h3>
                      <div className="text-4xl font-bold text-green-300 mb-2">
                        ${defaultCategory.baseRate}/hr*
                      </div>
                      <p className="text-sm text-green-200 mb-6" dangerouslySetInnerHTML={{ __html: standardSchedule || t('pricing.tiers.standard.time') }} />
                    </div>
                  </div>
                )}

                {/* Premium Rate */}
                {premiumTier && defaultCategory && (
                  <div className="group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-yellow-400/50 hover:border-yellow-400">
                      <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                        <Zap className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.premium.title')}</h3>
                      <div className="text-4xl font-bold text-yellow-300 mb-2">
                        ${(defaultCategory.baseRate * premiumTier.multiplier).toFixed(0)}/hr*
                      </div>
                      <p className="text-sm text-yellow-200 mb-6" dangerouslySetInnerHTML={{ __html: premiumSchedule || t('pricing.tiers.premium.time') }} />
                    </div>
                  </div>
                )}

                {/* Emergency Rate */}
                {emergencyTier && defaultCategory && (
                  <div className="group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-red-400/50 hover:border-red-400">
                      <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                        <Shield className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.emergency.title')}</h3>
                      <div className="text-4xl font-bold text-red-300 mb-2">
                        ${(defaultCategory.baseRate * emergencyTier.multiplier).toFixed(0)}/hr*
                      </div>
                      <p className="text-sm text-red-200 mb-6" dangerouslySetInnerHTML={{ __html: emergencySchedule || t('pricing.tiers.emergency.time') }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="text-center mt-6">
                <p className="text-sm text-blue-300/80">
                  {t('pricing.disclaimer')}
                </p>
              </div>
            </div>

            {/* Non-Profit Pricing Section */}
            {nonprofitCategory && (
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  {t('pricing.nonprofit.title')}
                </h2>
                <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                  {t('pricing.nonprofit.subtitle')}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                  {/* Non-Profit Standard Rate */}
                  {standardTier && (
                    <div className="group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-green-400/50 hover:border-green-400">
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                          <Clock className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.standard.title')}</h3>
                        <div className="text-4xl font-bold text-green-300 mb-2">
                          ${nonprofitCategory.baseRate}/hr*
                        </div>
                        <p className="text-sm text-green-200 mb-6" dangerouslySetInnerHTML={{ __html: standardSchedule || t('pricing.tiers.standard.time') }} />
                      </div>
                    </div>
                  )}

                  {/* Non-Profit Premium Rate */}
                  {premiumTier && (
                    <div className="group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-yellow-400/50 hover:border-yellow-400">
                        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                          <Zap className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.premium.title')}</h3>
                        <div className="text-4xl font-bold text-yellow-300 mb-2">
                          ${(nonprofitCategory.baseRate * premiumTier.multiplier).toFixed(0)}/hr*
                        </div>
                        <p className="text-sm text-yellow-200 mb-6" dangerouslySetInnerHTML={{ __html: premiumSchedule || t('pricing.tiers.premium.time') }} />
                      </div>
                    </div>
                  )}

                  {/* Non-Profit Emergency Rate */}
                  {emergencyTier && (
                    <div className="group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:-translate-y-2 border-2 border-red-400/50 hover:border-red-400">
                        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 w-fit mb-6 mx-auto">
                          <Shield className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{t('pricing.tiers.emergency.title')}</h3>
                        <div className="text-4xl font-bold text-red-300 mb-2">
                          ${(nonprofitCategory.baseRate * emergencyTier.multiplier).toFixed(0)}/hr*
                        </div>
                        <p className="text-sm text-red-200 mb-6" dangerouslySetInnerHTML={{ __html: emergencySchedule || t('pricing.tiers.emergency.time') }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="text-center mt-6">
                  <p className="text-sm text-blue-300/80">
                    {t('pricing.disclaimer')}
                  </p>
                </div>
              </div>
            )}

            {/* Billing Policies */}
            {pricingData?.policies && (
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-4xl mx-auto">
                <div className="flex items-center mb-6">
                  <Info className="h-6 w-6 text-blue-400 mr-3" />
                  <h3 className="text-2xl font-bold text-white">{t('pricing.policies.title')}</h3>
                </div>
                <ul className="space-y-4">
                  {pricingData.policies.newClientFirstHourFree && (
                    <li className="flex items-start">
                      <Gift className="w-6 h-6 text-green-400 mr-4 flex-shrink-0 mt-1" />
                      <div>
                        <strong className="text-white">{t('pricing.policies.newClient.title')}:</strong>
                        <span className="text-blue-200 ml-2">{t('pricing.policies.newClient.description')}</span>
                      </div>
                    </li>
                  )}
                  <li className="flex items-start">
                    <CheckCircle className="w-6 h-6 text-green-400 mr-4 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">{t('pricing.policies.minimum.title')}:</strong>
                      <span className="text-blue-200 ml-2">{t('pricing.policies.minimum.description', { hours: pricingData.policies.minimumHours })}</span>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-6 h-6 text-green-400 mr-4 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">{t('pricing.policies.rounding.title')}:</strong>
                      <span className="text-blue-200 ml-2">{t('pricing.policies.rounding.description', { minutes: pricingData.policies.roundingMinutes })}</span>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-6 h-6 text-green-400 mr-4 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">{t('pricing.policies.transparent.title')}:</strong>
                      <span className="text-blue-200 ml-2">{t('pricing.policies.transparent.description')}</span>
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {/* CTA Section */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                {t('pricing.cta.title')}
              </h2>
              <p className="text-lg text-blue-200 mb-8 max-w-2xl mx-auto">
                {t('pricing.cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => setCurrentPage('clogin')}
                  className="group inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <UserPlus className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform duration-300" />
                  {t('pricing.cta.signupButton')}
                </button>
                <a
                  href="tel:+16199405550"
                  className="group inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <Phone className="h-5 w-5 mr-2 group-hover:rotate-12 transition-transform duration-300" />
                  {t('home.hero.callButton')}
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="group inline-flex items-center justify-center px-8 py-4 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold rounded-xl border border-white/30 transition-all duration-300 hover:scale-105"
                >
                  <Mail className="h-5 w-5 mr-2" />
                  {t('home.hero.quoteButton')}
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
