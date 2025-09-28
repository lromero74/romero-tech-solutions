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
    <div className="min-h-screen bg-gray-50">
      <StructuredData pageType="about" />
      {/* Hero Section */}
      <section 
        className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white py-20 lg:py-32 overflow-hidden cursor-crosshair"
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
        
        {/* Wispy Liquid Background Elements */}
        <ParticleBackground />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
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
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
      </section>

      {/* Journey Section */}
      <section className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              {t('about.journey.title')}
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              {t('about.journey.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Timeline Story */}
            <div className="space-y-8">
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
                  <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-slate-100 flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{milestone.title}</h3>
                      <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        {milestone.year}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-blue-600 mb-2">{milestone.role}</p>
                    <p className="text-slate-600 text-sm leading-relaxed">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Why We're Different */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-3xl p-8 shadow-xl border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">
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
                    <div className="bg-blue-100 rounded-full p-2 mt-1 group-hover:scale-110 transition-transform duration-200">
                      <feature.icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors duration-200">
                        {feature.title}
                      </h4>
                      <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 lg:py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              {t('about.stats.title')}
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              {t('about.stats.subtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {achievements.map((achievement, index) => {
              const IconComponent = achievement.icon;
              return (
                <div key={index} className="text-center group">
                  <div className="bg-white rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border border-slate-100 shadow-lg">
                    <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full p-4 mx-auto w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                      <IconComponent className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-3xl md:text-4xl font-bold mb-2 text-slate-900 group-hover:text-blue-600 transition-colors duration-200">
                      {achievement.number}
                    </div>
                    <div className="text-slate-600 font-medium">{achievement.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              {t('about.values.title')}
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              {t('about.values.subtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => {
              const IconComponent = value.icon;
              return (
                <div key={index} className="text-center group">
                  <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border border-slate-100">
                    <div className={`bg-gradient-to-br ${getColorClasses(value.color)} rounded-xl p-4 mx-auto w-fit mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                      <IconComponent className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-4 group-hover:text-blue-600 transition-colors duration-200">
                      {value.title}
                    </h3>
                    <p className="text-slate-600 leading-relaxed">{value.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-32 bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-full p-4 mx-auto w-fit">
              <Heart className="h-12 w-12 text-pink-300" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            {t('about.finalCta.title')}
          </h2>
          <p className="text-xl text-slate-300 mb-12 leading-relaxed">
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
      </section>
    </div>
  );
};

export default About;