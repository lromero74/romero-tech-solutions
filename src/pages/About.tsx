import React from 'react';
import { Award, Clock, Users, MapPin, Phone, Mail, Star, CheckCircle, Shield, Zap, Target, Heart, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ParticleBackground from '../components/common/ParticleBackground';
import StructuredData from '../components/seo/StructuredData';

const About: React.FC = () => {
  const { t } = useLanguage();

  const achievements = [
    { number: t('about.stats.experience'), label: t('about.stats.experienceLabel'), icon: Award },
    { number: t('about.stats.customers'), label: t('about.stats.customersLabel'), icon: Users },
    { number: t('about.stats.support'), label: t('about.stats.supportLabel'), icon: Clock },
    { number: t('about.stats.satisfaction'), label: t('about.stats.satisfactionLabel'), icon: Star }
  ];

  const values = [
    {
      icon: Award,
      title: t('about.values.battleTested'),
      description: t('about.values.battleTestedDesc'),
      color: 'blue'
    },
    {
      icon: Clock,
      title: t('about.values.lightning'),
      description: t('about.values.lightningDesc'),
      color: 'teal'
    },
    {
      icon: Users,
      title: t('about.values.personal'),
      description: t('about.values.personalDesc'),
      color: 'purple'
    },
    {
      icon: CheckCircle,
      title: t('about.values.guaranteed'),
      description: t('about.values.guaranteedDesc'),
      color: 'emerald'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'from-blue-500 to-blue-600',
      teal: 'from-teal-500 to-teal-600',
      purple: 'from-purple-500 to-purple-600',
      emerald: 'from-emerald-500 to-emerald-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen">
      <StructuredData pageType="about" />

      <section
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white min-h-screen overflow-hidden cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          // Create a custom event to trigger particle generation
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
            backgroundImage: `url('https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop')`,
            backgroundBlendMode: 'multiply'
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
                <Shield className="h-4 w-4 text-yellow-400 mr-2" />
                <span className="text-sm font-medium">{t('about.hero.badge')}</span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                {t('about.hero.title')}
                <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  {t('about.hero.titleHighlight')}
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
                {t('about.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
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

            {/* Journey & Different Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
              {/* Timeline Story */}
              <div className="space-y-8">
                <div className="text-center lg:text-left mb-12">
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                    {t('about.journey.title')}
                  </h2>
                  <p className="text-lg text-blue-200">
                    {t('about.journey.subtitle')}
                  </p>
                </div>

                {[
                  {
                    year: '1994-1998',
                    title: t('about.journey.airForce'),
                    role: t('about.journey.airForceRole'),
                    description: t('about.journey.airForceDesc'),
                    color: 'from-blue-500 to-blue-600'
                  },
                  {
                    year: '2002-2004',
                    title: t('about.journey.army'),
                    role: t('about.journey.armyRole'),
                    description: t('about.journey.armyDesc'),
                    color: 'from-emerald-500 to-emerald-600'
                  },
                  {
                    year: '1998-2025',
                    title: t('about.journey.fortune500'),
                    role: t('about.journey.fortune500Role'),
                    description: t('about.journey.fortune500Desc'),
                    color: 'from-purple-500 to-purple-600'
                  },
                  {
                    year: 'Now',
                    title: t('about.journey.now'),
                    role: t('about.journey.nowRole'),
                    description: t('about.journey.nowDesc'),
                    color: 'from-cyan-500 to-teal-600'
                  }
                ].map((milestone, index) => (
                  <div key={index} className="flex items-start space-x-4 group">
                    <div className={`bg-gradient-to-br ${milestone.color} rounded-full p-3 flex-shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                      <span className="text-white font-bold text-sm">{index + 1}</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-1 border border-white/20 hover:bg-white/20 flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-white">{milestone.title}</h3>
                        <span className="text-sm font-medium text-blue-200 bg-white/10 px-3 py-1 rounded-full border border-white/20">
                          {milestone.year}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-cyan-300 mb-2">{milestone.role}</p>
                      <p className="text-blue-200 text-sm leading-relaxed">{milestone.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Why We're Different */}
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/20 hover:bg-white/20 transition-all duration-300">
                <h3 className="text-2xl font-bold text-white mb-6 text-center lg:text-left">
                  {t('about.different.title')}
                </h3>
                <div className="space-y-6">
                  {[
                    { icon: Target, title: t('about.different.battleTested'), desc: t('about.different.battleTestedDesc') },
                    { icon: Heart, title: t('about.different.localHeroes'), desc: t('about.different.localHeroesDesc') },
                    { icon: Zap, title: t('about.different.lightningSpeed'), desc: t('about.different.lightningSpeedDesc') },
                    { icon: Shield, title: t('about.different.fortKnox'), desc: t('about.different.fortKnoxDesc') }
                  ].map((feature, index) => (
                    <div key={index} className="flex items-start space-x-3 group">
                      <div className="bg-blue-500/20 backdrop-blur-sm rounded-full p-2 mt-1 group-hover:scale-110 transition-transform duration-200 border border-blue-400/30">
                        <feature.icon className="h-4 w-4 text-blue-300" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white group-hover:text-cyan-300 transition-colors duration-200">
                          {feature.title}
                        </h4>
                        <p className="text-blue-200 text-sm leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('about.stats.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-2xl mx-auto mb-12">
                {t('about.stats.subtitle')}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
                {achievements.map((achievement, index) => {
                  const IconComponent = achievement.icon;
                  return (
                    <div key={index} className="text-center group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-white/20 shadow-xl hover:bg-white/20">
                        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full p-4 mx-auto w-fit mb-4 group-hover:scale-110 transition-transform duration-200 shadow-lg">
                          <IconComponent className="h-8 w-8 text-white" />
                        </div>
                        <div className="text-3xl md:text-4xl font-bold mb-2 text-white group-hover:text-cyan-300 transition-colors duration-200">
                          {achievement.number}
                        </div>
                        <div className="text-blue-200 font-medium">{achievement.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Values Section */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('about.values.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('about.values.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
                {values.map((value, index) => {
                  const IconComponent = value.icon;
                  return (
                    <div key={index} className="text-center group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2 border border-white/20 hover:bg-white/20">
                        <div className={`bg-gradient-to-br ${getColorClasses(value.color)} rounded-xl p-4 mx-auto w-fit mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                          <IconComponent className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-4 group-hover:text-cyan-300 transition-colors duration-200">
                          {value.title}
                        </h3>
                        <p className="text-blue-200 leading-relaxed">{value.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center">
              <div className="mb-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-full p-4 mx-auto w-fit">
                  <Heart className="h-12 w-12 text-pink-300" />
                </div>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
                {t('about.finalCta.title')}
              </h2>
              <p className="text-xl text-slate-300 mb-12 leading-relaxed max-w-2xl mx-auto">
                {t('about.finalCta.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <a
                  href="tel:+16199405550"
                  className="inline-flex items-center justify-center px-10 py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg"
                >
                  <Phone className="h-6 w-6 mr-3" />
                  {t('about.finalCta.callButton')}
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="inline-flex items-center justify-center px-10 py-5 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold rounded-xl border border-white/30 transition-all duration-300 hover:scale-105 text-lg"
                >
                  <Mail className="h-6 w-6 mr-2" />
                  {t('about.finalCta.consultButton')}
                </a>
              </div>

              <div className="flex items-center justify-center space-x-3 text-slate-400">
                <MapPin className="h-5 w-5 text-yellow-300" />
                <span className="font-medium">{t('about.finalCta.location')}</span>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
};

export default About;