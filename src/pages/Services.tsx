import React from 'react';
import { Monitor, Printer, Wifi, Shield, HardDrive, Settings, Phone, Mail, Star, CheckCircle, Clock, Award, ArrowRight, Zap } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ParticleBackground from '../components/common/ParticleBackground';
import StructuredData from '../components/seo/StructuredData';

const Services: React.FC = () => {
  const { t } = useLanguage();

  const services = [
    {
      icon: Monitor,
      title: t('services.computerRepair'),
      description: t('services.computerRepairDesc'),
      features: t('services.computerRepairFeatures').split(','),
      color: 'blue'
    },
    {
      icon: Printer,
      title: t('services.printerSetup'),
      description: t('services.printerSetupDesc'),
      features: t('services.printerSetupFeatures').split(','),
      color: 'teal'
    },
    {
      icon: Wifi,
      title: t('services.networkConfig'),
      description: t('services.networkConfigDesc'),
      features: t('services.networkConfigFeatures').split(','),
      color: 'cyan'
    },
    {
      icon: Shield,
      title: t('services.virusRemoval'),
      description: t('services.virusRemovalDesc'),
      features: t('services.virusRemovalFeatures').split(','),
      color: 'indigo'
    },
    {
      icon: HardDrive,
      title: t('services.dataRecovery'),
      description: t('services.dataRecoveryDesc'),
      features: t('services.dataRecoveryFeatures').split(','),
      color: 'emerald'
    },
    {
      icon: Settings,
      title: t('services.systemOptimization'),
      description: t('services.systemOptimizationDesc'),
      features: t('services.systemOptimizationFeatures').split(','),
      color: 'purple'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'from-blue-500 to-blue-600',
      teal: 'from-teal-500 to-teal-600',
      cyan: 'from-cyan-500 to-cyan-600',
      indigo: 'from-indigo-500 to-indigo-600',
      emerald: 'from-emerald-500 to-emerald-600',
      purple: 'from-purple-500 to-purple-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen">
      <StructuredData pageType="services" />

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
                <Star className="h-4 w-4 text-yellow-400 mr-2" />
                <span className="text-sm font-medium">{t('services.hero.badge')}</span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                {t('services.hero.title')}
                <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  {t('services.hero.titleHighlight')}
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
                {t('services.hero.subtitle')}
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

            {/* Services Grid */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('services.main.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-12">
                {t('services.main.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                {services.map((service, index) => {
                  const IconComponent = service.icon;
                  return (
                    <div key={index} className="group">
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2 border border-white/20 hover:bg-white/20">
                        <div className={`bg-gradient-to-br ${getColorClasses(service.color)} rounded-xl p-4 w-fit mb-6 group-hover:scale-110 transition-transform duration-300`}>
                          <IconComponent className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-4 group-hover:text-blue-300 transition-colors duration-200">
                          {service.title}
                        </h3>
                        <p className="text-blue-200 mb-6 leading-relaxed">{service.description}</p>
                        <ul className="space-y-2">
                          {service.features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-center text-sm text-blue-100">
                              <CheckCircle className="w-4 h-4 text-emerald-400 mr-3 flex-shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Process Section */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('services.process.title')}
              </h2>
              <p className="text-lg text-blue-200 max-w-2xl mx-auto mb-12">
                {t('services.process.subtitle')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-16">
                {[
                  { step: '1', title: t('services.process.contact'), desc: t('services.process.contactDesc'), color: 'from-blue-500 to-blue-600', icon: Phone },
                  { step: '2', title: t('services.process.diagnosis'), desc: t('services.process.diagnosisDesc'), color: 'from-teal-500 to-teal-600', icon: Zap },
                  { step: '3', title: t('services.process.repair'), desc: t('services.process.repairDesc'), color: 'from-purple-500 to-purple-600', icon: Settings },
                  { step: '4', title: t('services.process.results'), desc: t('services.process.resultsDesc'), color: 'from-emerald-500 to-emerald-600', icon: CheckCircle }
                ].map((process, index) => (
                  <div key={index} className="text-center group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2 border border-white/20 hover:bg-white/20">
                      <div className={`bg-gradient-to-br ${process.color} rounded-full p-6 mx-auto w-fit mb-6 group-hover:scale-110 transition-all duration-300 shadow-lg`}>
                        <process.icon className="h-8 w-8 text-white" />
                      </div>
                      <div className="text-2xl font-bold text-white mb-2">{process.step}</div>
                      <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-cyan-300 transition-colors duration-200">
                        {process.title}
                      </h3>
                      <p className="text-blue-200 text-sm leading-relaxed">{process.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
                {t('home.finalCta.title')}
              </h2>
              <p className="text-xl text-slate-300 mb-12 leading-relaxed max-w-2xl mx-auto">
                {t('home.finalCta.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <a
                  href="tel:+16199405550"
                  className="inline-flex items-center justify-center px-10 py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg"
                >
                  <Phone className="h-6 w-6 mr-3" />
                  {t('home.finalCta.callButton')}
                </a>
                <a
                  href="mailto:info@romerotechsolutions.com"
                  className="inline-flex items-center justify-center px-10 py-5 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold rounded-xl border border-white/30 transition-all duration-300 hover:scale-105 text-lg"
                >
                  <Mail className="h-6 w-6 mr-2" />
                  {t('home.finalCta.quoteButton')}
                </a>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-8 text-slate-400">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>{t('home.finalCta.sameDay')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award className="h-5 w-5" />
                  <span>{t('home.finalCta.trusted')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5" />
                  <span>{t('home.finalCta.satisfaction')}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
};

export default Services;